import { describe, expect, it } from 'vitest';
import { getSources, paneShown, togglePane } from './viewerParams';

describe('getSources', () => {
  it('u と tei を書いた順に集める', () => {
    expect(getSources(new URLSearchParams('u=a&dir=v&tei=b&u=c'))).toEqual(['a', 'b', 'c']);
  });

  it('config も同じ並びに入れる', () => {
    expect(getSources(new URLSearchParams('config=x&u=a'))).toEqual(['x', 'a']);
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

describe('paneShown', () => {
  it('panes を書かなければ全部出す', () => {
    expect(paneShown(null, 'image')).toBe(true);
    expect(paneShown(null, 'apparatus')).toBe(true);
  });
  it('書いたら、含むものだけ出す（koui の互換 panes=text,apparatus）', () => {
    expect(paneShown('text,apparatus', 'apparatus')).toBe(true);
    expect(paneShown('text,apparatus', 'image')).toBe(false);
  });
});

describe('togglePane', () => {
  it('全部出ているところから 1 つ消す', () => {
    expect(togglePane(null, 'image')).toBe('text,apparatus');
  });
  it('消したものを戻して全部そろえば書かない', () => {
    expect(togglePane('text,apparatus', 'image')).toBeNull();
  });
  it('両方消す', () => {
    expect(togglePane('text,apparatus', 'apparatus')).toBe('text');
  });
});
