// SaxonJS で TEI を変換する（tei-tools の xslt-engine.js と同じ手順）。
// ブラウザ組み込みの XSLT は Chromium が消す予定なので、コンパイル済みの SEF を SaxonJS で動かす。
// ランタイム（約 500KB）は使うときに <script> で読み込む。
import { withBasePath } from '@/lib/basePath';
import { appId, textApps } from '@/lib/tei/apparatus';
import { entityId, entityKindOf, textEntities } from '@/lib/tei/entities';
import { speechId, textSpeeches } from '@/lib/tei/speech';

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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function cleanText(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function xmlIdOf(el: Element): string | null {
  return el.getAttribute('xml:id')?.trim() || el.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'id')?.trim() || null;
}

const SAFE_STYLE_PROP = /^(margin-top|margin-bottom|margin-left|margin-right|text-indent)$/i;
const SAFE_STYLE_VAL = /^-?\d+(?:\.\d+)?(?:rem|em|px|%)$/i;

/** 平出・台頭などの字下げ指定（margin-top / text-indent 等）だけを安全に通す */
export function extractSafeLayoutStyle(raw: string | null | undefined): string {
  if (!raw) return '';
  const kept: string[] = [];
  for (const part of raw.split(';')) {
    const idx = part.indexOf(':');
    if (idx < 0) continue;
    const prop = part.slice(0, idx).trim().toLowerCase();
    const val = part.slice(idx + 1).trim();
    if (SAFE_STYLE_PROP.test(prop) && SAFE_STYLE_VAL.test(val)) {
      kept.push(`${prop}: ${val}`);
    }
  }
  return kept.join('; ');
}

function isHiddenStyle(raw: string | null | undefined): boolean {
  return Boolean(raw && /display\s*:\s*none/i.test(raw));
}

function isIndentOnlyText(text: string): boolean {
  return /^\s*$/.test(text) && /[\r\n]/.test(text);
}

const PARALLEL_DIV_LABELS: Record<string, string> = {
  original: '釈文',
  yomikudashi: '読み下し',
  japanese: '大意（現代語訳）',
  釈文: '釈文',
  読み下し: '読み下し',
  現代語訳: '現代語訳',
};

const PARALLEL_ID_RE = /^(?:o|y|ja)-(\d+)$/;

/**
 * リーディングビュー（tei-reading.sef.json）の <main class="doc"> を、
 * <ab>（平出・台頭含む）・<lb>・<pb>・<seg>・<sp>/<speaker>/<stage>・<lg>/<l>・<add>/<del>・
 * <persName>/<placeName>/<name>・ルビ（<ruby> / <span type="ruby">）・複数セクション（釈文／読み下し／大意）に
 * 完全対応した HTML に拡張する。
 */
export function enhanceReadingHtml(html: string, doc: Document): string {
  const root = doc.documentElement;
  if (!root) return html;

  const entityMap = new Map(textEntities(doc).map((el, i) => [el, i + 1]));
  const speechMap = new Map(textSpeeches(doc).map((el, i) => [el, i + 1]));
  const appMap = new Map(textApps(doc).map((el, i) => [el, i + 1]));

  // <note target="#id"> の注記テキストを集め、対象要素のツールチップにする
  const notesByTarget = new Map<string, string[]>();
  const footnoteList: { id: string; targetId?: string; label: string; text: string }[] = [];
  for (const note of Array.from(root.getElementsByTagNameNS('*', 'note'))) {
    if (note.closest('teiHeader, facsimile, standOff, listPerson, listPlace, listOrg')) continue;
    const text = cleanText(note.textContent);
    if (!text) continue;
    const target = note.getAttribute('target')?.trim();
    if (target) {
      for (const tok of target.split(/\s+/)) {
        const tid = tok.startsWith('#') ? tok.slice(1) : tok;
        if (!tid) continue;
        const arr = notesByTarget.get(tid) ?? [];
        if (!arr.includes(text)) arr.push(text);
        notesByTarget.set(tid, arr);
      }
    }
    const nid = xmlIdOf(note) || `note-${footnoteList.length + 1}`;
    const label = note.getAttribute('n')?.trim() || String(footnoteList.length + 1);
    footnoteList.push({
      id: nid,
      targetId: target?.replace(/^#/, ''),
      label,
      text,
    });
  }

  const renderChildren = (parent: Element): string => {
    let out = '';
    for (const child of Array.from(parent.childNodes)) {
      if (child.nodeType === 3 || child.nodeType === 4) {
        const val = child.nodeValue ?? '';
        if (isIndentOnlyText(val)) continue;
        out += escapeHtml(val);
      } else if (child.nodeType === 1) {
        out += renderNode(child as Element);
      }
    }
    return out;
  };

  const commonAttrs = (el: Element, extraClasses: string[] = []): string => {
    const classes = [...extraClasses];
    const id =
      xmlIdOf(el) ||
      (entityMap.has(el) ? entityId(entityMap.get(el)!) : null) ||
      (speechMap.has(el) ? speechId(speechMap.get(el)!) : null) ||
      (appMap.has(el) ? appId(appMap.get(el)!) : null);

    const attrs: string[] = [];
    if (id) {
      attrs.push(`id="${escapeHtml(id)}"`);
      const pm = PARALLEL_ID_RE.exec(id);
      if (pm) {
        attrs.push(`data-parallel-num="${escapeHtml(pm[1])}"`);
        classes.push('tei-parallel-item');
      }
      const noteTexts = notesByTarget.get(id);
      if (noteTexts?.length) {
        const joined = noteTexts.join(' / ');
        attrs.push(`title="${escapeHtml(joined)}"`);
        attrs.push(`data-note="${escapeHtml(joined)}"`);
        classes.push('has-note');
      }
    }

    const style = extractSafeLayoutStyle(el.getAttribute('style'));
    if (style) attrs.push(`style="${escapeHtml(style)}"`);

    const corresp = el.getAttribute('corresp') || el.getAttribute('ref') || el.getAttribute('who');
    if (corresp) attrs.push(`data-corresp="${escapeHtml(corresp.trim())}"`);

    if (classes.length > 0) {
      attrs.unshift(`class="${escapeHtml(classes.join(' '))}"`);
    }
    return attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
  };

  const renderNode = (el: Element): string => {
    const tag = el.localName;
    if (tag === 'teiHeader' || tag === 'facsimile' || tag === 'standOff') return '';
    if (tag === 'listPerson' || tag === 'listPlace' || tag === 'listOrg') return '';

    switch (tag) {
      case 'text':
      case 'body':
      case 'front':
      case 'back':
        return renderChildren(el);

      case 'titlePart':
        return `<h1${commonAttrs(el, ['doc-title'])}>${renderChildren(el)}</h1>`;

      case 'div': {
        const divType = el.getAttribute('type')?.trim() ?? '';
        return `<section${commonAttrs(el, ['tei-div', ...(divType ? [`tei-div-${divType}`] : [])])}>${renderChildren(el)}</section>`;
      }

      case 'head': {
        let depth = 0;
        for (let p = el.parentElement; p; p = p.parentElement) {
          if (p.localName === 'div') depth++;
        }
        const hTag = depth <= 1 ? 'h2' : depth === 2 ? 'h3' : 'h4';
        return `<${hTag}${commonAttrs(el, ['tei-head'])}>${renderChildren(el)}</${hTag}>`;
      }

      case 'p': {
        const inner = renderChildren(el);
        if (!inner.trim()) return '';
        return `<p${commonAttrs(el, ['tei-p'])}>${inner}</p>`;
      }

      case 'ab': {
        const inner = renderChildren(el);
        if (!inner.trim()) return '';
        return `<div${commonAttrs(el, ['tei-ab'])}>${inner}</div>`;
      }

      case 'seg':
      case 's':
        return `<span${commonAttrs(el, [`tei-${tag}`])}>${renderChildren(el)}</span>`;

      case 'lb': {
        if (el.getAttribute('break') === 'no' || isHiddenStyle(el.getAttribute('style'))) return '';
        if (el.parentElement?.localName === 'div') {
          return '<span class="tei-lb-col" aria-hidden="true"></span>';
        }
        return '<br class="tei-lb"/>';
      }

      case 'pb': {
        const n = el.getAttribute('n')?.trim();
        const facs = el.getAttribute('facs')?.trim();
        return `<span class="tei-pb"${facs ? ` data-facs="${escapeHtml(facs)}"` : ''}>${escapeHtml(n ? `[${n}]` : '¶')}</span>`;
      }

      case 'lg':
        return `<div${commonAttrs(el, ['tei-lg'])}>${renderChildren(el)}</div>`;

      case 'l':
        return `<span${commonAttrs(el, ['tei-l'])}>${renderChildren(el)}</span>`;

      case 'sp':
        return `<div${commonAttrs(el, ['tei-sp', 'tei-Interactive'])}>${renderChildren(el)}</div>`;

      case 'speaker':
        return `<span${commonAttrs(el, ['tei-speaker'])}>${renderChildren(el)}</span>`;

      case 'stage': {
        const inSp = Boolean(el.closest('sp'));
        const sTag = inSp ? 'span' : 'div';
        return `<${sTag}${commonAttrs(el, ['tei-stage'])}>${renderChildren(el)}</${sTag}>`;
      }

      case 'said':
        return `<span${commonAttrs(el, ['tei-said', 'tei-Interactive'])}>${renderChildren(el)}</span>`;

      case 'add':
        return `<span${commonAttrs(el, ['tei-add'])}>${renderChildren(el)}</span>`;

      case 'del':
        return `<del${commonAttrs(el, ['tei-del'])}>${renderChildren(el)}</del>`;

      case 'persName':
      case 'placeName':
      case 'orgName':
      case 'date':
      case 'rs':
      case 'name': {
        const kind = entityKindOf(el) ?? 'persName';
        const subType = el.getAttribute('type')?.trim().toLowerCase();
        const typeCls = subType === 'keyword' ? 'tei-keyword' : `tei-${kind.toLowerCase()}`;
        return `<span${commonAttrs(el, ['tei-entity', typeCls, 'tei-Interactive'])}>${renderChildren(el)}</span>`;
      }

      case 'span': {
        const t = el.getAttribute('type')?.trim().toLowerCase();
        if (t === 'ruby') return `<ruby class="tei-ruby">${renderChildren(el)}</ruby>`;
        if (t === 'rb') return `<rb>${renderChildren(el)}</rb>`;
        if (t === 'rt') return `<rt>${renderChildren(el)}</rt>`;
        if (t === 'rp') return `<rp>${renderChildren(el)}</rp>`;
        return `<span${commonAttrs(el)}>${renderChildren(el)}</span>`;
      }

      case 'ruby':
      case 'rb':
      case 'rt':
      case 'rp':
        return `<${tag}${commonAttrs(el)}>${renderChildren(el)}</${tag}>`;

      case 'choice': {
        const alt = Array.from(el.children)
          .map((c) => `${c.localName}: ${cleanText(c.textContent)}`)
          .join(' / ');
        const preferred =
          Array.from(el.children).find((c) => c.localName === 'corr' || c.localName === 'reg' || c.localName === 'expan') ??
          el.children[0];
        return `<span class="tei-choice"${alt ? ` title="${escapeHtml(alt)}"` : ''}>${preferred ? renderNode(preferred) : renderChildren(el)}</span>`;
      }

      case 'app': {
        const lines = Array.from(el.children)
          .filter((c) => c.localName === 'lem' || c.localName === 'rdg')
          .map((c) => {
            const wit = c.getAttribute('wit');
            return `${wit ? `${wit}: ` : ''}${cleanText(c.textContent) || '—'}`;
          });
        const lem = Array.from(el.children).find((c) => c.localName === 'lem') ?? el.children[0];
        const titleAttr = lines.length ? ` title="${escapeHtml(lines.join('\n'))}"` : '';
        return `<span${commonAttrs(el, ['tei-app'])}${titleAttr}>${lem ? renderChildren(lem) : ''}</span>`;
      }

      case 'hi': {
        const rend = el.getAttribute('rend') ?? '';
        const classes = ['hi'];
        if (rend.includes('bold')) classes.push('hi-bold');
        if (rend.includes('italic')) classes.push('hi-italic');
        if (rend.includes('underline')) classes.push('hi-underline');
        return `<span${commonAttrs(el, classes)}>${renderChildren(el)}</span>`;
      }

      case 'list': {
        const lTag = el.getAttribute('rend') === 'numbered' ? 'ol' : 'ul';
        return `<${lTag}${commonAttrs(el)}>${renderChildren(el)}</${lTag}>`;
      }

      case 'item':
        return `<li${commonAttrs(el)}>${renderChildren(el)}</li>`;

      case 'table':
        return `<table${commonAttrs(el)}>${renderChildren(el)}</table>`;

      case 'row':
        return `<tr${commonAttrs(el)}>${renderChildren(el)}</tr>`;

      case 'cell':
        return `<td${commonAttrs(el)}>${renderChildren(el)}</td>`;

      case 'ref': {
        const target = el.getAttribute('target')?.trim() ?? '';
        if (/^https?:\/\//i.test(target) || target.startsWith('#')) {
          const ext = !target.startsWith('#') ? ' target="_blank" rel="noopener noreferrer"' : '';
          return `<a href="${escapeHtml(target)}"${ext}>${renderChildren(el)}</a>`;
        }
        return renderChildren(el);
      }

      case 'graphic': {
        const url = el.getAttribute('url')?.trim() ?? '';
        if (/^https?:\/\//i.test(url)) {
          return `<img src="${escapeHtml(url)}" alt="" loading="lazy" class="tei-graphic"/>`;
        }
        return '';
      }

      case 'note': {
        // @target を持つ注は対象要素のツールチップおよび末尾注記に出すため、行中には割り込ませない
        if (el.getAttribute('target')) return '';
        const text = cleanText(el.textContent);
        if (!text) return '';
        const n = el.getAttribute('n')?.trim() || '*';
        return `<sup class="note-ref" title="${escapeHtml(text)}" data-note="${escapeHtml(text)}">[${escapeHtml(n)}]</sup>`;
      }

      default:
        return `<span${commonAttrs(el, [`tei-${tag.toLowerCase()}`])}>${renderChildren(el)}</span>`;
    }
  };

  const body = root.getElementsByTagNameNS('*', 'body')[0];
  const front = root.getElementsByTagNameNS('*', 'front')[0];
  if (!body) return html;

  const topDivs = Array.from(body.children).filter((c) => c.localName === 'div');
  const isParallelSections =
    topDivs.length >= 2 &&
    topDivs.every((d) => {
      const t = d.getAttribute('type')?.trim() ?? '';
      return t in PARALLEL_DIV_LABELS;
    });

  let mainHtml = '';
  if (isParallelSections) {
    const cards = topDivs
      .map((div) => {
        const divType = div.getAttribute('type')?.trim() ?? '';
        const label = PARALLEL_DIV_LABELS[divType] ?? divType;
        return `<section class="tei-div-card" data-div-type="${escapeHtml(divType)}">
          <header class="tei-div-card-header">
            <span class="tei-div-card-title">${escapeHtml(label)}</span>
            <button type="button" class="tei-div-card-toggle" aria-expanded="true" title="セクションを開閉">▾</button>
          </header>
          <div class="tei-div-card-body">${renderChildren(div)}</div>
        </section>`;
      })
      .join('\n');
    mainHtml = `<main class="doc doc-multi-sections">${cards}</main>`;
  } else {
    const frontTitleParts = front
      ? Array.from(front.getElementsByTagNameNS('*', 'titlePart'))
          .map((tp) => renderNode(tp))
          .join('')
      : '';
    mainHtml = `<main class="doc doc-single-stream">${frontTitleParts}${renderChildren(body)}</main>`;
  }

  let updated = html.replace(/<main\s+class="doc"[\s\S]*?<\/main>/i, () => mainHtml);

  // tei-header に「縦書き / 横書き」切り替えボタンを差し込む
  updated = updated.replace(
    /(<div\s+class="tei-header"[^>]*>)/i,
    '$1<button type="button" class="tei-extra" data-dir-toggle>縦書き / 横書き</button>',
  );

  // iframe 内での双方向ハイライト・縦書きホイールスクロール・セクション開閉のスクリプト
  const script = `<script>
(function(){
  function updateDirBtn(){
    var btn = document.querySelector('[data-dir-toggle]');
    if (!btn) return;
    var isV = document.documentElement.classList.contains('is-vertical');
    btn.textContent = isV ? '✓ 縦書き' : '横書き';
    btn.classList.toggle('tei-extra-on', isV);
  }
  function applyFocus(id, notifyParent){
    document.querySelectorAll('.is-selected').forEach(function(el){ el.classList.remove('is-selected'); });
    if (!id) return;
    var pm = /^(?:o|y|ja|z)-(\\d+)$/.exec(id);
    var targets = [];
    if (pm) {
      targets = Array.prototype.slice.call(document.querySelectorAll('[data-parallel-num="' + pm[1] + '"]'));
    } else {
      var byId = document.getElementById(id);
      if (byId) targets.push(byId);
    }
    targets.forEach(function(el){
      el.classList.add('is-selected');
      try { el.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); } catch(e){}
    });
    if (notifyParent && window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'awase:focus', id: id }, '*');
    }
  }
  document.addEventListener('click', function(e){
    var toggleBtn = e.target.closest && e.target.closest('.tei-div-card-toggle');
    if (toggleBtn) {
      var card = toggleBtn.closest('.tei-div-card');
      if (card) {
        var collapsed = card.classList.toggle('is-collapsed');
        toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        toggleBtn.textContent = collapsed ? '▸' : '▾';
      }
      return;
    }
    var dirBtn = e.target.closest && e.target.closest('[data-dir-toggle]');
    if (dirBtn) {
      var nextV = !document.documentElement.classList.contains('is-vertical');
      document.documentElement.classList.toggle('is-vertical', nextV);
      updateDirBtn();
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'awase:dir', dir: nextV ? 'v' : 'h' }, '*');
      }
      return;
    }
    var hit = e.target.closest && e.target.closest('[data-parallel-num], .tei-Interactive, .tei-entity, .tei-add.has-note');
    if (hit && hit.id) {
      applyFocus(hit.id, true);
    }
  });
  window.addEventListener('message', function(e){
    if (!e.data || typeof e.data !== 'object') return;
    if (e.data.type === 'awase:focus') {
      applyFocus(e.data.id || null, false);
    } else if (e.data.type === 'awase:dir') {
      document.documentElement.classList.toggle('is-vertical', e.data.dir === 'v');
      updateDirBtn();
    }
  });
  document.addEventListener('wheel', function(e){
    if (!document.documentElement.classList.contains('is-vertical')) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    var scroller = (e.target.closest && e.target.closest('.tei-div-card-body, .doc-single-stream')) || document.querySelector('.doc-single-stream');
    if (scroller && scroller.scrollWidth > scroller.clientWidth) {
      scroller.scrollLeft -= e.deltaY;
      e.preventDefault();
    }
  }, { passive: false });
  function init(){
    updateDirBtn();
    var initFocus = document.documentElement.getAttribute('data-focus-id');
    if (initFocus) applyFocus(initFocus, false);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else setTimeout(init, 0);
})();
</script>`;

  return updated.replace(/<\/body>/i, `${script}</body>`);
}

/** 変換して、HTML 文書全体を文字列で返す */
export async function transformTei(sefUrl: string, doc: Document): Promise<string> {
  const saxon = await loadRuntime();
  const result = await saxon.transform(
    { stylesheetLocation: sefUrl, sourceNode: doc, destination: 'serialized' },
    'async',
  );
  const raw = typeof result.principalResult === 'string' ? result.principalResult : '';
  if (!raw) throw new Error('empty output');
  const html = /^\s*</.test(raw) ? raw : `<!DOCTYPE html>\n${raw}`;
  if (/\/tei-reading\.sef\.json(?:\?|$)/i.test(sefUrl)) {
    return enhanceReadingHtml(html, doc);
  }
  return html;
}
