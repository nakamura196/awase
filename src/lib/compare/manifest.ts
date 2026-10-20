// IIIF のマニフェストから、比べるのに要るもの（Canvas の id・名前・文字）を取り出す。
// 文字は text-comparison と同じく、Canvas の annotations（注釈の頁）の各注釈の body.value を順につなぐ。
// Presentation 2 の Canvas には文字が付かないので、画像だけ比べられる

export interface CompareCanvas {
  id: string;
  label: string;
  /** Canvas の文字。注釈の値を改行でつないだもの。無ければ空 */
  text: string;
}

export interface CompareManifest {
  label: string;
  canvases: CompareCanvas[];
}

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** IIIF の名前（文字列、言語ごとの配列、v2 の @value の組）から先頭の 1 つを取る */
export function pickLabel(label: unknown): string {
  if (typeof label === 'string') return label;
  if (Array.isArray(label)) return label.length ? pickLabel(label[0]) : '';
  if (isObj(label)) {
    if (typeof label['@value'] === 'string') return label['@value'];
    for (const v of Object.values(label)) {
      const s = pickLabel(v);
      if (s) return s;
    }
  }
  return '';
}

/** Canvas の注釈の頁から、文字（TextualBody の値）を順に集める */
export function canvasText(canvas: Json): string {
  const pages = Array.isArray(canvas.annotations) ? canvas.annotations : [];
  const values: string[] = [];
  for (const page of pages) {
    const items = isObj(page) && Array.isArray(page.items) ? page.items : [];
    for (const a of items) {
      const body = isObj(a) ? a.body : null;
      if (isObj(body) && typeof body.value === 'string') values.push(body.value);
    }
  }
  return values.join('\n');
}

/** マニフェストの JSON を読む。Canvas が 1 つも無ければ null（マニフェストとして使えない） */
export function readManifest(json: unknown): CompareManifest | null {
  if (!isObj(json)) return null;
  let raw: unknown[] = [];
  let v2 = false;
  if (Array.isArray(json.items)) {
    raw = json.items;
  } else if (Array.isArray(json.sequences)) {
    v2 = true;
    raw = json.sequences.flatMap((s) => (isObj(s) && Array.isArray(s.canvases) ? s.canvases : []));
  }
  const canvases: CompareCanvas[] = [];
  raw.forEach((c, i) => {
    if (!isObj(c)) return;
    const id = (v2 ? c['@id'] : c.id) as unknown;
    if (typeof id !== 'string') return;
    canvases.push({ id, label: pickLabel(c.label) || String(i + 1), text: canvasText(c) });
  });
  return canvases.length ? { label: pickLabel(json.label), canvases } : null;
}
