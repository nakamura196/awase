import { describe, expect, it } from 'vitest';
import { getSources } from './viewerParams';

describe('getSources', () => {
  it('u と tei を書いた順に集める', () => {
    expect(getSources(new URLSearchParams('u=a&dir=v&tei=b&u=c'))).toEqual(['a', 'b', 'c']);
  });
  it('空の値は飛ばす', () => {
    expect(getSources(new URLSearchParams('u=&u=%20&u=a'))).toEqual(['a']);
  });
  it('同じ URL を 2 度書けば 2 つ並べる', () => {
    expect(getSources(new URLSearchParams('u=a&u=a'))).toEqual(['a', 'a']);
  });
  it('無ければ空', () => {
    expect(getSources(new URLSearchParams('dir=v'))).toEqual([]);
  });
});
