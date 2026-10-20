import { describe, expect, it } from 'vitest';
import { buildParams, modeValue, networkMode, parseMode, readSides } from './params';

describe('mode', () => {
  it('text-comparison の数字を名前に直す', () => {
    expect(parseMode('0')).toBe('image');
    expect(parseMode('1')).toBe('diff');
    expect(parseMode('2')).toBe('diff');
    expect(parseMode(null)).toBe('diff');
    expect(parseMode('image')).toBe('image');
    expect(parseMode('???')).toBe('diff');
  });
  it('2 はネットワーク図として見分けられる', () => {
    expect(networkMode('2')).toBe(true);
    expect(networkMode('1')).toBe(false);
  });
  it('URL には数字で書く', () => {
    expect(modeValue('image')).toBe('0');
    expect(modeValue('diff')).toBe('1');
  });
});

describe('readSides / buildParams', () => {
  const q = (s: string) => new URLSearchParams(s);
  it('どちらかのマニフェストが無ければ null', () => {
    expect(readSides(q('manifest1=a'))).toBeNull();
    expect(readSides(q(''))).toBeNull();
  });
  it('左右の引数を読む', () => {
    expect(readSides(q('manifest1=a&manifest2=b&canvas2=c&label1=L'))).toEqual([
      { manifest: 'a', canvas: '', label: 'L' },
      { manifest: 'b', canvas: 'c', label: '' },
    ]);
  });
  it('空の canvas・label は書かない', () => {
    const p = buildParams([{ manifest: 'a', canvas: '', label: '' }, { manifest: 'b', canvas: 'c', label: 'R' }], 'diff', true);
    expect(p.toString()).toBe('manifest1=a&manifest2=b&canvas2=c&label2=R&mode=1&embed=1');
  });
});
