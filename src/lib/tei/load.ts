// TEI を URL から読み、XML 文書にする。
// 失敗の理由（取れない・XML でない・TEI でない）を分けて返し、画面で言い分ける。
// ?u= には PTV（parallel_text_viewer）の config.json も来る。そのときは束ねている本文の URL を返す。

import { addZonePageBreaks } from './facs';

export type LoadError =
  | { kind: 'fetch'; status?: number }
  | { kind: 'parse'; message: string }
  | { kind: 'notTei'; root: string }
  /** config.json だが、本文の URL（url_main）が無い */
  | { kind: 'config' };

/** PTV の config.json から使うもの。本文（url_main）と訳（url_sub）を並べる */
export interface ParallelConfig {
  sources: string[];
  /** direction が vertical なら縦書き */
  vertical?: boolean;
}

export type Loaded = { kind: 'tei'; tei: Document } | { kind: 'config'; config: ParallelConfig };

export class TeiLoadError extends Error {
  constructor(public readonly detail: LoadError) {
    super(detail.kind);
  }
}

const isJson = (text: string) => /^\s*[{[]/.test(text);

/**
 * PTV の config.json を読む。url_main・url_sub（相対なら config の URL が基準）と direction だけを使う。
 * url_map・image_map（画像との対応）は読まない。同じことが本文の sourceDoc（範囲ごとの行と画像）に書いてあり、
 * そちらから頁の画像を引く（src/lib/tei/facs.ts の addZonePageBreaks）。query_main・query_sub も使わない
 */
export function parseConfig(text: string, baseUrl?: string): ParallelConfig {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new TeiLoadError({ kind: 'parse', message: (e as Error).message });
  }
  const c = (json ?? {}) as Record<string, unknown>;
  const sources: string[] = [];
  for (const key of ['url_main', 'urlMain', 'url_sub', 'urlSub']) {
    const v = c[key];
    if (typeof v !== 'string' || !v.trim()) continue;
    try {
      const resolved = new URL(v.trim(), baseUrl).href;
      if (!sources.includes(resolved)) sources.push(resolved);
    } catch {
      // URL として読めないものは飛ばす
    }
  }
  if (!sources.length) throw new TeiLoadError({ kind: 'config' });
  const dir = c.direction;
  return { sources, vertical: dir === 'vertical' ? true : dir === 'horizontal' ? false : undefined };
}

export function parseTei(text: string): Document {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const error = doc.getElementsByTagName('parsererror')[0];
  if (error) throw new TeiLoadError({ kind: 'parse', message: (error.textContent ?? '').trim().slice(0, 300) });
  const root = doc.documentElement.localName;
  if (root !== 'TEI' && root !== 'teiCorpus') throw new TeiLoadError({ kind: 'notTei', root });
  // 頁の目印が無く、本文が画像の範囲ごとに書かれている文書は、範囲を頁にする
  addZonePageBreaks(doc);
  return doc;
}

export async function loadSource(url: string, signal?: AbortSignal): Promise<Loaded> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    // CORS で断られたときもここに来る（理由はブラウザが教えてくれない）
    throw new TeiLoadError({ kind: 'fetch' });
  }
  if (!res.ok) throw new TeiLoadError({ kind: 'fetch', status: res.status });
  const text = await res.text();
  // ?u= は TEI か config.json のどちらか（docs/notes/survey.md の viewer の URL）
  if (isJson(text)) return { kind: 'config', config: parseConfig(text, url) };
  return { kind: 'tei', tei: parseTei(text) };
}
