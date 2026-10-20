import { describe, expect, it } from 'vitest';
import { appId, foldSigla, levenshtein, readingFor, silentWitnesses, witIds, witnessDistances } from './apparatus';

describe('witIds', () => {
  it('# を外して略号を並べる（koui の見本）', () => {
    expect(witIds('#校異 #靑池  #河')).toEqual(['校異', '靑池', '河']);
  });
  it('ファイル名付きの参照も # の後を取る', () => {
    expect(witIds('wits.xml#A B')).toEqual(['A', 'B']);
  });
  it('空なら空', () => {
    expect(witIds(null)).toEqual([]);
    expect(witIds(' ')).toEqual([]);
  });
});

describe('silentWitnesses', () => {
  it('どの読みにも名前の無い伝本を、一覧の順で返す', () => {
    expect(silentWitnesses(['校異', '靑池', '河', '別'], ['河', '校異'])).toEqual(['靑池', '別']);
  });
});

describe('appId', () => {
  it('番号から id を作る', () => {
    expect(appId(12)).toBe('awase-app-12');
  });
});

describe('foldSigla', () => {
  it('limit を超えたら、残りを hidden に回す', () => {
    expect(foldSigla(['a', 'b', 'c', 'd', 'e'], 2)).toEqual({ shown: ['a', 'b'], hidden: ['c', 'd', 'e'] });
  });
  it('畳んでも 1 本しか減らないなら、畳まない', () => {
    expect(foldSigla(['a', 'b', 'c'], 2)).toEqual({ shown: ['a', 'b', 'c'], hidden: [] });
  });
});

describe('readingFor', () => {
  const readings = [
    { kind: 'lem' as const, wits: ['底', '甲'] },
    { kind: 'rdg' as const, wits: ['乙'] },
  ];
  it('@wit に名前のある読みを選ぶ', () => {
    expect(readingFor(readings, '乙')).toBe(1);
    expect(readingFor(readings, '甲')).toBe(0);
  });
  it('名前の無い伝本は lem', () => {
    expect(readingFor(readings, '丙')).toBe(0);
  });
  it('lem が無く、名前も無ければ -1', () => {
    expect(readingFor([{ kind: 'rdg', wits: ['乙'] }], '丙')).toBe(-1);
  });
});

describe('levenshtein', () => {
  it('挿入・削除・置換を 1 と数える', () => {
    expect(levenshtein('ありけり', 'おはしけり')).toBe(3);
    expect(levenshtein('給ける', 'たまふ')).toBe(3);
    expect(levenshtein('', 'ありけり')).toBe(4);
    expect(levenshtein('同じ', '同じ')).toBe(0);
  });
  it('サロゲートペアの字も 1 字', () => {
    expect(levenshtein('𠮟る', '叱る')).toBe(1);
  });
});

describe('witnessDistances', () => {
  // 読みの要素は子の文字だけを使うので、文字の子を 1 つ持つ代役で足りる（入れ子の app は e2e で見る）
  const r = (kind: 'lem' | 'rdg', wit: string, text: string) => ({
    kind,
    wits: witIds(wit),
    el: { childNodes: [{ nodeType: 3, nodeValue: text }] } as unknown as Element,
  });
  const entries = [
    { readings: [r('lem', '#底 #甲', '給ける'), r('rdg', '#乙', 'たまふ')] },
    // 甲の読みは <del>おはし</del>けり。del の中の字も数える
    { readings: [r('lem', '#底', 'あり けり'), r('rdg', '#甲', 'おはしけり'), r('rdg', '#乙', '')] },
    { readings: [r('rdg', '#甲', 'lem の無い箇所')] },
  ];
  it('lem との編集距離を伝本ごとに足す。名前の無い伝本は lem と同じ', () => {
    const d = witnessDistances(entries, ['底', '甲', '乙', '丙']);
    expect(d.get('底')).toEqual({ distance: 0, places: 0 });
    expect(d.get('甲')).toEqual({ distance: 3, places: 1 });
    expect(d.get('乙')).toEqual({ distance: 7, places: 2 });
    expect(d.get('丙')).toEqual({ distance: 0, places: 0 });
  });
});
