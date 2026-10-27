import { describe, expect, it } from 'vitest';
import { firstIndex, indexOfId, langPrefix, nextIndex, pickVoice, prevIndex, resolveLang, voiceRank } from './reader';

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

import { assignVoices, coreVoiceName, estimateSeconds, matchAzureVoice } from './reader';

describe('coreVoiceName / matchAzureVoice', () => {
  it('Azure の名前から核を取る', () => {
    expect(coreVoiceName('ja-JP-NanamiNeural')).toBe('Nanami');
    expect(coreVoiceName('ja-JP-Masaru:DragonHDLatestNeural')).toBe('Masaru');
    expect(coreVoiceName('en-US-AvaMultilingualNeural')).toBe('Ava');
    expect(coreVoiceName(null)).toBe('');
  });
  it('Edge の声の名前に当たる', () => {
    const voices = [
      { lang: 'ja-JP', name: 'Microsoft Ayumi Online (Natural)' },
      { lang: 'ja-JP', name: 'Microsoft Nanami Online (Natural)' },
    ];
    expect(matchAzureVoice(voices, 'ja-JP-NanamiNeural', 'ja')?.name).toContain('Nanami');
    expect(matchAzureVoice(voices, 'ja-JP-DaichiNeural', 'ja')).toBeNull();
  });
});

describe('assignVoices', () => {
  const voices = [
    { lang: 'ja-JP', name: 'B', localService: true },
    { lang: 'ja-JP', name: 'A', localService: true },
    { lang: 'en-US', name: 'E' },
  ];
  it('順に割り当て、同じ入力なら同じ結果', () => {
    const sp = [{ key: 'x' }, { key: 'y' }, { key: 'z' }];
    const r1 = assignVoices(sp, voices, 'ja');
    const r2 = assignVoices(sp, [...voices].reverse(), 'ja');
    expect(r1.get('x')?.voice?.name).toBe('A');
    expect(r1.get('y')?.voice?.name).toBe('B');
    expect(r1.get('z')?.voice?.name).toBe('A');
    expect(r1.get('x')?.voice?.name).toBe(r2.get('x')?.voice?.name);
  });
  it('同じ声を使う話者は高さが違う', () => {
    const r = assignVoices([{ key: 'x' }, { key: 'y' }], [{ lang: 'ja-JP', name: 'only' }], 'ja');
    expect(r.get('x')?.pitch).not.toBe(r.get('y')?.pitch);
  });
  it('Azure の指定を優先する', () => {
    const r = assignVoices(
      [{ key: 'x', voiceName: 'ja-JP-NanamiNeural' }],
      [{ lang: 'ja-JP', name: 'A', localService: true }, { lang: 'ja-JP', name: 'Microsoft Nanami Online' }],
      'ja',
    );
    expect(r.get('x')?.voice?.name).toContain('Nanami');
  });
  it('声が無ければ null', () => {
    expect(assignVoices([{ key: 'x' }], [], 'ja').get('x')?.voice).toBeNull();
  });
});

describe('estimateSeconds', () => {
  it('音声の長さを優先し、無ければ文字数から', () => {
    expect(estimateSeconds('abc', 2.5)).toBe(2.5);
    expect(estimateSeconds('あ'.repeat(100))).toBeCloseTo(17);
    expect(estimateSeconds('あ')).toBe(1);
  });
});

describe('voiceRank', () => {
  // Mac の Chrome に並ぶ日本語の声（実際の名前）
  const mac = [
    { lang: 'ja-JP', name: 'Eddy (日本語（日本）)', localService: true },
    { lang: 'ja-JP', name: 'Kyoko', localService: true, default: true },
    { lang: 'ja-JP', name: 'Google 日本語', localService: false },
  ];
  it('Mac の Chrome では、質の低い声より Google の声を先に取る', () => {
    expect(pickVoice(mac, 'ja')?.name).toBe('Google 日本語');
    expect(voiceRank(mac[0])).toBeGreaterThan(voiceRank(mac[1]));
  });
  it('自然な声（Edge の Natural、Mac の拡張）をいちばん先に取る', () => {
    const voices = [
      ...mac,
      {
        lang: 'ja-JP',
        name: 'Microsoft Nanami Online (Natural) - Japanese (Japan)',
        localService: false,
      },
    ];
    expect(pickVoice(voices, 'ja')?.name).toContain('Nanami');
    expect(
      pickVoice([...mac, { lang: 'ja-JP', name: 'Kyoko (Enhanced)', localService: true }], 'ja')
        ?.name
    ).toBe('Kyoko (Enhanced)');
  });
});

describe('assignVoices と質の低い声', () => {
  it('話者が多くても、質の低い声は割り当てず、高さで分ける', () => {
    const voices = [
      { lang: 'ja-JP', name: 'Kyoko', localService: true },
      { lang: 'ja-JP', name: 'Eddy (日本語（日本）)', localService: true },
      { lang: 'ja-JP', name: 'Google 日本語', localService: false },
    ];
    const map = assignVoices([{ key: 'a' }, { key: 'b' }, { key: 'c' }], voices, 'ja');
    expect([...map.values()].map((x) => x.voice?.name)).toEqual(['Google 日本語', 'Kyoko', 'Google 日本語']);
    expect(map.get('c')?.pitch).not.toBe(map.get('a')?.pitch);
  });
});
