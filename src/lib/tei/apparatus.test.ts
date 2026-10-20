import { describe, expect, it } from 'vitest';
import { appId, silentWitnesses, witIds } from './apparatus';

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
