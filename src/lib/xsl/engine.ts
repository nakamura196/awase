// SaxonJS で TEI を変換する（tei-tools の xslt-engine.js と同じ手順）。
// ブラウザ組み込みの XSLT は Chromium が消す予定なので、コンパイル済みの SEF を SaxonJS で動かす。
// ランタイム（約 500KB）は使うときに <script> で読み込む。
import { withBasePath } from '@/lib/basePath';

interface SaxonJSApi {
  transform(options: Record<string, unknown>, mode: 'async'): Promise<{ principalResult?: unknown }>;
}
declare global {
  interface Window {
    SaxonJS?: SaxonJSApi;
  }
}

const RUNTIME = '/vendor/saxon/SaxonJS2.rt.js';
let runtime: Promise<SaxonJSApi> | null = null;

function loadRuntime(): Promise<SaxonJSApi> {
  if (runtime) return runtime;
  runtime = new Promise<SaxonJSApi>((resolve, reject) => {
    if (window.SaxonJS) return resolve(window.SaxonJS);
    const s = document.createElement('script');
    s.src = withBasePath(RUNTIME);
    s.onload = () => (window.SaxonJS ? resolve(window.SaxonJS) : reject(new Error('SaxonJS missing')));
    s.onerror = () => reject(new Error('SaxonJS load failed'));
    document.head.appendChild(s);
  });
  // 失敗したら次の変換でもう一度試せるようにする
  runtime.catch(() => {
    runtime = null;
  });
  return runtime;
}

/** 影印の graphic@url を、TEI の置き場所を基準にした絶対 URL にする（iframe の中では相対パスが通じない） */
export function absolutizeGraphics(doc: Document, baseUrl: string) {
  const graphics = doc.getElementsByTagNameNS('*', 'graphic');
  for (let i = 0; i < graphics.length; i++) {
    const u = graphics[i].getAttribute('url');
    if (!u) continue;
    try {
      graphics[i].setAttribute('url', new URL(u, baseUrl).href);
    } catch {
      /* そのままにする */
    }
  }
}

/** 変換して、HTML 文書全体を文字列で返す */
export async function transformTei(sefUrl: string, doc: Document): Promise<string> {
  const saxon = await loadRuntime();
  const result = await saxon.transform(
    { stylesheetLocation: sefUrl, sourceNode: doc, destination: 'serialized' },
    'async',
  );
  const html = typeof result.principalResult === 'string' ? result.principalResult : '';
  if (!html) throw new Error('empty output');
  return /^\s*</.test(html) ? html : `<!DOCTYPE html>\n${html}`;
}
