import { describe, expect, it } from 'vitest';
import { appId, foldSigla, readingFor, silentWitnesses, witIds } from './apparatus';

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
