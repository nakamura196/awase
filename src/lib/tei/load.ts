// TEI を URL から読み、XML 文書にする。
// 失敗の理由（取れない・XML でない・TEI でない）を分けて返し、画面で言い分ける。

export type LoadError =
  | { kind: 'fetch'; status?: number }
  | { kind: 'parse'; message: string }
  | { kind: 'notTei'; root: string }
  /** config.json（PTV の束ね方）が来た。まだ読めない */
  | { kind: 'config' };

export class TeiLoadError extends Error {
  constructor(public readonly detail: LoadError) {
    super(detail.kind);
  }
}

export function parseTei(text: string): Document {
  // ?u= は TEI か config.json のどちらか（docs/notes/survey.md の viewer の URL）
  if (/^\s*[{[]/.test(text)) throw new TeiLoadError({ kind: 'config' });
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  const error = doc.getElementsByTagName('parsererror')[0];
  if (error) throw new TeiLoadError({ kind: 'parse', message: (error.textContent ?? '').trim().slice(0, 300) });
  const root = doc.documentElement.localName;
  if (root !== 'TEI' && root !== 'teiCorpus') throw new TeiLoadError({ kind: 'notTei', root });
  return doc;
}

export async function loadTei(url: string, signal?: AbortSignal): Promise<Document> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    // CORS で断られたときもここに来る（理由はブラウザが教えてくれない）
    throw new TeiLoadError({ kind: 'fetch' });
  }
  if (!res.ok) throw new TeiLoadError({ kind: 'fetch', status: res.status });
  return parseTei(await res.text());
}
