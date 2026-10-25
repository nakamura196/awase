// VRM 読み上げペインの、画面に依存しない部分（声の選び方・言語の決め方・発話の送り方）。

/** 読み上げに使う発話の最小限の形（SpeechItem の一部） */
export interface ReaderItem {
  id: string;
  text: string;
}

/** 言語タグの先頭（ja-JP → ja）。小文字にそろえる */
export function langPrefix(lang: string | null | undefined): string {
  return (lang ?? '').trim().replace(/_/g, '-').split('-')[0].toLowerCase();
}

/**
 * 読み上げる言語。TEI の最初の xml:lang（text → ルートの順）を優先し、無ければ画面の言語。
 */
export function resolveLang(tei: Document | null, pageLocale: string): string {
  const root = tei?.documentElement;
  if (root) {
    const text = root.getElementsByTagNameNS('*', 'text')[0];
    for (const el of [text, root]) {
      const v = el?.getAttribute('xml:lang') ?? el?.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang');
      if (v && v.trim()) return v.trim();
    }
  }
  return pageLocale;
}

export interface VoiceLike {
  lang: string;
  name: string;
  default?: boolean;
  localService?: boolean;
}

/** 言語に合う声を選ぶ。完全一致、先頭一致の順。端末内の声と既定の声を先に取る。合う声が無ければ null */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], lang: string): T | null {
  const want = lang.trim().replace(/_/g, '-').toLowerCase();
  const prefix = langPrefix(lang);
  if (!prefix) return null;
  const rank = (v: T) => (v.localService ? 0 : 1) + (v.default ? 0 : 0.5);
  const sorted = [...voices].sort((a, b) => rank(a) - rank(b));
  const norm = (v: T) => v.lang.replace(/_/g, '-').toLowerCase();
  return sorted.find((v) => norm(v) === want) ?? sorted.find((v) => langPrefix(v.lang) === prefix) ?? null;
}

/** id に当たる発話の位置。無ければ -1 */
export function indexOfId(items: readonly ReaderItem[], id: string | null | undefined): number {
  if (!id) return -1;
  return items.findIndex((it) => it.id === id);
}

/** 次の位置。最後なら null（読み終わり）。読み上げる文字が空の発話は飛ばす */
export function nextIndex(items: readonly ReaderItem[], from: number): number | null {
  for (let i = from + 1; i < items.length; i++) if (items[i].text.trim()) return i;
  return null;
}

/** 前の位置。最初なら null。空の発話は飛ばす */
export function prevIndex(items: readonly ReaderItem[], from: number): number | null {
  for (let i = from - 1; i >= 0; i--) if (items[i].text.trim()) return i;
  return null;
}

/** 最初に読む位置（空でない最初の発話）。無ければ -1 */
export function firstIndex(items: readonly ReaderItem[]): number {
  return items.findIndex((it) => it.text.trim());
}
