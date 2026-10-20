// TEI を、ページの部品（tei-* 要素）に置き換える。CETEIcean と同じ考え方で、
// 要素の名前と属性をそのまま残し、見た目は CSS（src/components/viewer/tei.css）で決める。
// 名前を残すだけでは読めない要素（改行・頁・リンク・異文など）にだけ、下の BEHAVIORS で手を足す。
//
// innerHTML は使わず、要素を 1 つずつ作る。外から読んだ TEI にスクリプトが紛れていても動かないように。
import { htmlAttrName, htmlTagName, isIndentation, safeUrl } from './attrs';

export interface RenderContext {
  /** 部品を作る先の文書（ブラウザの document） */
  doc: Document;
  /** TEI の URL。相対 URL を解決する基準 */
  baseUrl?: string;
}

/** 部品を作ったあとに手を足す処理。戻り値 false なら子を写さない */
type Behavior = (src: Element, el: HTMLElement, ctx: RenderContext) => void | false;

function textOf(src: Element): string {
  return (src.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const BEHAVIORS: Record<string, Behavior> = {
  // 改行。<br> を中に置き、表示するかどうかは CSS で切り替える
  lb(src, el, { doc }) {
    if (src.getAttribute('break') === 'no') return;
    el.appendChild(doc.createElement('br'));
  },
  // 頁。@n を目印として見せる
  pb(src, el, { doc }) {
    const label = doc.createElement('span');
    label.className = 'awase-pb-label';
    label.textContent = src.getAttribute('n') ?? '';
    el.appendChild(label);
  },
  // リンク。子をそのまま <a> で包む
  ref(src, el, ctx) {
    const href = safeUrl(src.getAttribute('target') ?? '', ctx.baseUrl);
    if (!href) return;
    const a = ctx.doc.createElement('a');
    a.href = href;
    if (!href.startsWith('#')) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    renderChildren(src, a, ctx);
    el.appendChild(a);
    return false;
  },
  // 指し示しだけのリンク。URL を文字として見せる
  ptr(src, el, ctx) {
    const href = safeUrl(src.getAttribute('target') ?? '', ctx.baseUrl);
    if (!href) return;
    const a = ctx.doc.createElement('a');
    a.href = href;
    a.textContent = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    el.appendChild(a);
  },
  // 本文中の画像
  graphic(src, el, ctx) {
    const url = safeUrl(src.getAttribute('url') ?? '', ctx.baseUrl);
    if (!url || url.startsWith('#')) return;
    const img = ctx.doc.createElement('img');
    img.src = url;
    img.loading = 'lazy';
    img.alt = textOf(src.parentElement ?? src);
    el.appendChild(img);
  },
  // 選択（sic/corr、orig/reg、abbr/expan）。どれを見せるかは CSS で決め、
  // 見せない方は、指を置いたときに出す
  choice(src, el) {
    const alt = Array.from(src.children)
      .map((c) => `${c.localName}: ${textOf(c)}`)
      .join(' / ');
    if (alt) el.title = alt;
  },
  // 異文。本文には lem を見せ、指を置くと諸本の読みを出す（並べて見るのは apparatus ペイン）
  app(src, el) {
    const lines = Array.from(src.children)
      .filter((c) => c.localName === 'lem' || c.localName === 'rdg')
      .map((c) => {
        const wit = c.getAttribute('wit');
        return `${wit ? `${wit} ` : ''}${textOf(c) || '—'}`;
      });
    if (lines.length) el.title = lines.join('\n');
  },
};

function copyAttributes(src: Element, el: HTMLElement) {
  for (const attr of Array.from(src.attributes)) {
    const name = htmlAttrName(attr.name);
    if (!name) continue;
    try {
      el.setAttribute(name, attr.value);
    } catch {
      // HTML の属性名として使えない名前は捨てる
    }
  }
}

function renderNode(node: Node, ctx: RenderContext): Node | null {
  switch (node.nodeType) {
    case 1: // 要素
      return renderElement(node as Element, ctx);
    case 3: // 文字
    case 4: {
      // CDATA
      const text = node.nodeValue ?? '';
      if (isIndentation(text)) return null;
      return ctx.doc.createTextNode(text);
    }
    default: // コメント・処理命令は捨てる
      return null;
  }
}

function renderChildren(src: Element, parent: HTMLElement, ctx: RenderContext) {
  for (const child of Array.from(src.childNodes)) {
    const out = renderNode(child, ctx);
    if (out) parent.appendChild(out);
  }
}

export function renderElement(src: Element, ctx: RenderContext): HTMLElement {
  const el = ctx.doc.createElement(htmlTagName(src.localName));
  el.setAttribute('data-origname', src.localName);
  copyAttributes(src, el);
  const behavior = BEHAVIORS[src.localName];
  if (behavior?.(src, el, ctx) === false) return el;
  renderChildren(src, el, ctx);
  return el;
}

/**
 * TEI 文書のうち、本文として見せる部分を部品にする。
 * teiHeader と facsimile・standOff は本文ペインには出さない（ヘッダーの欄・画像ペインが受け持つ）。
 */
export function renderTeiText(tei: Document, ctx: RenderContext): DocumentFragment {
  const frag = ctx.doc.createDocumentFragment();
  const root = tei.documentElement;
  const texts = Array.from(root.getElementsByTagNameNS('*', 'text')).filter(
    // <text> の中の <group>/<text> は親ごと写るので、いちばん外側だけを拾う
    (t) => !t.parentElement?.closest('text'),
  );
  if (texts.length > 0) {
    for (const t of texts) frag.appendChild(renderElement(t, ctx));
    return frag;
  }
  // <text> が無い（TEI の断片など）ときは、ヘッダー類を除いて全体を写す
  const el = renderElement(root, ctx);
  for (const skip of Array.from(el.querySelectorAll('tei-teiheader, tei-facsimile, tei-standoff'))) skip.remove();
  frag.appendChild(el);
  return frag;
}
