import { describe, expect, it } from 'vitest';
import { diffChars, similarity } from './diff';
import { levenshtein } from '@/lib/tei/apparatus';

// 差分をたどって元の 2 つの文章を作り直す
const rebuild = (ops: ReturnType<typeof diffChars>) => ({
  a: ops.filter((o) => o.type !== 'insert').map((o) => o.text).join(''),
  b: ops.filter((o) => o.type !== 'delete').map((o) => o.text).join(''),
});

describe('diffChars', () => {
  it('同じ文章は 1 つの equal', () => {
    expect(diffChars('いろは', 'いろは')).toEqual([{ type: 'equal', text: 'いろは' }]);
  });
  it('両方空なら何も無い', () => {
    expect(diffChars('', '')).toEqual([]);
  });
  it('片方が空なら全部 delete か insert', () => {
    expect(diffChars('あい', '')).toEqual([{ type: 'delete', text: 'あい' }]);
    expect(diffChars('', 'あい')).toEqual([{ type: 'insert', text: 'あい' }]);
  });
  it('真ん中の置き換え', () => {
    expect(diffChars('いろはに', 'いるはに')).toEqual([
      { type: 'equal', text: 'い' },
      { type: 'delete', text: 'ろ' },
      { type: 'insert', text: 'る' },
      { type: 'equal', text: 'はに' },
    ]);
  });
  it('挿入と削除', () => {
    expect(diffChars('abcdef', 'abXcdf')).toEqual([
      { type: 'equal', text: 'ab' },
      { type: 'insert', text: 'X' },
      { type: 'equal', text: 'cd' },
      { type: 'delete', text: 'e' },
      { type: 'equal', text: 'f' },
    ]);
  });
  it('サロゲートペアの字を割らない', () => {
    const ops = diffChars('𠮷a', '𠮷b');
    expect(ops[0]).toEqual({ type: 'equal', text: '𠮷' });
  });
  it('どんな組でも、たどると元の 2 つに戻る', () => {
    const pairs = [['すかきりあらむ', 'すかきりあらん'], ['abcabba', 'cbabac'], ['', 'x'], ['ああ', 'あ']];
    for (const [a, b] of pairs) expect(rebuild(diffChars(a, b))).toEqual({ a, b });
  });
  it('大きすぎるときは全部入れ替え', () => {
    const a = 'a'.repeat(4001) + 'x';
    const b = 'b'.repeat(4001) + 'y';
    expect(diffChars(a, b).map((o) => o.type)).toEqual(['delete', 'insert']);
  });
});

describe('similarity', () => {
  it('編集距離から割合を出す', () => {
    const [a, b] = ['いろはに', 'いるはに'];
    expect(similarity(levenshtein(a, b), a, b)).toBeCloseTo(0.75);
  });
  it('両方空なら 1', () => {
    expect(similarity(0, '', '')).toBe(1);
  });
});
