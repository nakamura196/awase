import { describe, expect, it } from 'vitest';
import { firstIndex, indexOfId, langPrefix, nextIndex, pickVoice, prevIndex, resolveLang } from './reader';

// Node 環境（DOMParser 無し）で使う最小の TEI 文書
function doc(rootLang?: string, textLang?: string | null): Document {
  const el = (lang?: string, kids: unknown[] = []) => ({
    getAttribute: (n: string) => (n === 'xml:lang' ? (lang ?? null) : null),
    getAttributeNS: () => null,
    getElementsByTagNameNS: (_ns: string, name: string) => (name === 'text' ? kids : []),
  });
  const text = textLang === null ? [] : [el(textLang)];
  return { documentElement: el(rootLang, text) } as unknown as Document;
}

describe('langPrefix', () => {
  it('地域を落として小文字にする', () => {
    expect(langPrefix('ja-JP')).toBe('ja');
    expect(langPrefix('en_US')).toBe('en');
    expect(langPrefix(null)).toBe('');
  });
});

describe('resolveLang', () => {
  it('text の xml:lang を優先する', () => {
    const tei = doc('en', 'ja');
    expect(resolveLang(tei, 'en')).toBe('ja');
  });
  it('text に無ければルート', () => {
    const tei = doc('fr');
    expect(resolveLang(tei, 'ja')).toBe('fr');
  });
  it('どちらも無ければ画面の言語', () => {
    const tei = doc();
    expect(resolveLang(tei, 'ja')).toBe('ja');
    expect(resolveLang(null, 'en')).toBe('en');
  });
});

describe('pickVoice', () => {
  const voices = [
    { lang: 'en-US', name: 'a' },
    { lang: 'ja-JP', name: 'b', localService: false },
    { lang: 'ja-JP', name: 'c', localService: true },
    { lang: 'en-GB', name: 'd' },
  ];
  it('完全一致を優先し、端末内の声を先に取る', () => {
    expect(pickVoice(voices, 'ja-JP')?.name).toBe('c');
    expect(pickVoice(voices, 'en-GB')?.name).toBe('d');
  });
  it('先頭一致でも選ぶ', () => {
    expect(pickVoice(voices, 'ja')?.name).toBe('c');
    expect(pickVoice(voices, 'en')?.lang.startsWith('en')).toBe(true);
  });
  it('合う声が無ければ null', () => {
    expect(pickVoice(voices, 'fr')).toBeNull();
    expect(pickVoice([], 'ja')).toBeNull();
    expect(pickVoice(voices, '')).toBeNull();
  });
});

describe('発話の送り', () => {
  const items = [
    { id: 'a', text: 'one' },
    { id: 'b', text: '  ' },
    { id: 'c', text: 'three' },
  ];
  it('id から位置を探す', () => {
    expect(indexOfId(items, 'c')).toBe(2);
    expect(indexOfId(items, 'x')).toBe(-1);
    expect(indexOfId(items, null)).toBe(-1);
  });
  it('空の発話を飛ばして進む・戻る', () => {
    expect(nextIndex(items, 0)).toBe(2);
    expect(nextIndex(items, 2)).toBeNull();
    expect(prevIndex(items, 2)).toBe(0);
    expect(prevIndex(items, 0)).toBeNull();
  });
  it('最初に読む位置', () => {
    expect(firstIndex(items)).toBe(0);
    expect(firstIndex([{ id: 'x', text: '' }])).toBe(-1);
  });
});
