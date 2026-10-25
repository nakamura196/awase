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

/** Azure の声の名前（ja-JP-NanamiNeural）から、ブラウザの声の名前と照らす核の部分（Nanami）を取る */
export function coreVoiceName(azure: string | null | undefined): string {
  if (!azure) return '';
  let s = azure.trim().split(':')[0];
  s = s.replace(/^[a-z]{2,3}-[A-Za-z]{2,4}-/, '');
  s = s.replace(/(Multilingual)?Neural$/, '').replace(/Multilingual$/, '');
  return s.trim();
}

/** Azure の声の名前に当たる声（名前に核の部分を含むもの）。同じ言語を優先する。無ければ null */
export function matchAzureVoice<T extends VoiceLike>(voices: readonly T[], azure: string | null | undefined, lang: string): T | null {
  const core = coreVoiceName(azure).toLowerCase();
  if (core.length < 2) return null;
  const hits = voices.filter((v) => v.name.toLowerCase().includes(core));
  if (!hits.length) return null;
  const prefix = langPrefix(lang);
  return hits.find((v) => langPrefix(v.lang) === prefix) ?? hits[0];
}

/** 話者ごとの声の高さ。同じ声を使う話者が複数いても聞き分けられるように変える */
export const SPEAKER_PITCHES = [1, 0.8, 1.2, 0.9, 1.1, 0.7, 1.3] as const;

export interface SpeakerSpec {
  key: string;
  /** 台本が指定する Azure の声の名前 */
  voiceName?: string | null;
}

/**
 * 話者ごとの声と高さを決める。出てくる順に、
 * (1) Azure の声の名前に当たる声があればそれ、(2) 無ければ言語に合う声を順番に割り当てる。
 * 同じ声を使う話者には、出てくる順に違う高さを付ける。同じ入力なら同じ結果になる。
 */
export function assignVoices<T extends VoiceLike>(
  speakers: readonly SpeakerSpec[],
  voices: readonly T[],
  lang: string,
): Map<string, { voice: T | null; pitch: number }> {
  const prefix = langPrefix(lang);
  const pool = voices
    .filter((v) => langPrefix(v.lang) === prefix)
    .sort((a, b) => {
      const rank = (v: T) => (v.localService ? 0 : 1) + (v.default ? 0 : 0.5);
      return rank(a) - rank(b) || a.name.localeCompare(b.name);
    });
  const out = new Map<string, { voice: T | null; pitch: number }>();
  const used = new Map<T, number>();
  let rr = 0;
  for (const s of speakers) {
    if (out.has(s.key)) continue;
    let voice = matchAzureVoice(voices, s.voiceName, lang);
    if (!voice && pool.length) voice = pool[rr++ % pool.length];
    const k = voice ? (used.get(voice) ?? 0) : rr;
    if (voice) used.set(voice, k + 1);
    out.set(s.key, { voice, pitch: SPEAKER_PITCHES[k % SPEAKER_PITCHES.length] });
  }
  return out;
}

/** 声が出ない環境で、読み終わるまでの時間の目安（秒、速さ 1 のとき）。空白を除く文字数から */
export function estimateSeconds(text: string, audioDuration?: number | null): number {
  if (audioDuration && audioDuration > 0) return audioDuration;
  return Math.max(1, text.replace(/\s+/g, '').length * 0.17);
}
