import { describe, expect, it } from 'vitest';
import {
  defaultReadingVertical,
  defaultXslId,
  getTeiUrl,
  injectBase,
  parseXslChoice,
  sefLocation,
  setDarkClass,
  setFrameHtmlAttrs,
  toSefUrl,
} from './params';
import { enhanceReadingHtml } from './engine';
import { XSL_CATALOG, xslTitle } from './catalog';

const q = (s: string) => new URLSearchParams(s);
const site = (p: string) => `/awase${p}`;

describe('getTeiUrl', () => {
  it('u・url・tei の順に、空でない最初のものを使う', () => {
    expect(getTeiUrl(q('u=a&url=b'))).toBe('a');
    expect(getTeiUrl(q('url=b&tei=c'))).toBe('b');
    expect(getTeiUrl(q('tei=c'))).toBe('c');
    expect(getTeiUrl(q('u=%20&url=b'))).toBe('b');
    expect(getTeiUrl(q(''))).toBe('');
  });
});

describe('parseXslChoice', () => {
  it('目録の id', () => expect(parseXslChoice('notes')).toEqual({ kind: 'catalog', id: 'notes' }));
  it('.sef.json の URL はそのまま', () => {
    expect(parseXslChoice('https://e.org/x.sef.json')).toEqual({ kind: 'sef', url: 'https://e.org/x.sef.json' });
  });
  it('.xsl の URL は隣の .sef.json にする', () => {
    expect(parseXslChoice('https://e.org/x/a.xsl')).toEqual({ kind: 'sef', url: 'https://e.org/x/a.sef.json' });
    expect(toSefUrl('a.xslt')).toBe('a.sef.json');
  });
  it('空・知らない id は auto', () => {
    expect(parseXslChoice(null)).toEqual({ kind: 'auto' });
    expect(parseXslChoice('nope')).toEqual({ kind: 'auto' });
  });
});

describe('既定の XSL', () => {
  it('影印の画像があり、頁が surface を指していれば ocr', () => {
    expect(
      defaultXslId('<TEI><facsimile><surface><graphic url="a"/></surface></facsimile><text><pb n="1" facs="#f1"/></text></TEI>'),
    ).toBe('ocr');
  });
  it('頁の facs が画像の URL（校異源氏の形）なら reading', () => {
    expect(
      defaultXslId('<TEI><facsimile><surface><graphic url="a"/></surface></facsimile><text><pb facs="https://x/1.jpg"/></text></TEI>'),
    ).toBe('reading');
  });
  it('なければ reading', () => {
    expect(defaultXslId('<TEI><text/></TEI>')).toBe('reading');
    expect(defaultXslId('<TEI><facsimile><surface/></facsimile></TEI>')).toBe('reading');
  });
  it('SEF の場所を決める', () => {
    expect(sefLocation({ kind: 'auto' }, '<TEI/>', site)).toBe('/awase/xsl/tei-reading.sef.json');
    expect(sefLocation({ kind: 'catalog', id: 'ner' }, '', site)).toBe('/awase/xsl/tei-ner.sef.json');
    expect(sefLocation({ kind: 'catalog', id: 'line' }, '', site)).toBeNull();
    expect(sefLocation({ kind: 'sef', url: 'https://e.org/a.sef.json' }, '', site)).toBe('https://e.org/a.sef.json');
  });
});

describe('injectBase', () => {
  it('head の直後に入れる', () => {
    expect(injectBase('<!DOCTYPE html><html><head><meta charset="utf-8"></head>', 'https://x/')).toBe(
      '<!DOCTYPE html><html><head><base href="https://x/"><meta charset="utf-8"></head>',
    );
  });
  it('head が無ければ先頭に入れる', () => expect(injectBase('<p>a</p>', 'https://x/')).toBe('<base href="https://x/"><p>a</p>'));
});

describe('目録', () => {
  it('10 件（東洋文庫固有の urenja・vellum・manchu を除き line・reading-support・video を含む）で、題名は言語ごとに分かれている', () => {
    expect(XSL_CATALOG).toHaveLength(10);
    expect(XSL_CATALOG.some((x) => x.id === 'urenja' || x.id === 'vellum' || x.id === 'manchu')).toBe(false);
    for (const x of XSL_CATALOG) {
      if (x.file !== null) expect(x.file).toMatch(/^tei-.+\.sef\.json$/);
    }
    const line = XSL_CATALOG.find((x) => x.id === 'line')!;
    expect(xslTitle(line, 'ja')).toBe('LINE風 対話ビュー');
    expect(xslTitle(line, 'en')).toMatch(/^LINE/);
    expect(sefLocation({ kind: 'catalog', id: 'reading-support' }, '', site)).toBeNull();
    expect(sefLocation({ kind: 'catalog', id: 'video' }, '', site)).toBeNull();
  });
});

interface NodeSpec {
  tag: string;
  attrs?: Record<string, string>;
  children?: (NodeSpec | string)[];
}

function buildElement(spec: NodeSpec, parent: Element | null = null): Element {
  const attrs = spec.attrs ?? {};
  const childNodes: Node[] = [];
  const children: Element[] = [];
  const el = {
    nodeType: 1,
    localName: spec.tag,
    parentElement: parent,
    childNodes: childNodes as unknown as NodeListOf<ChildNode>,
    children: children as unknown as HTMLCollection,
    getAttribute(name: string) {
      return attrs[name] ?? null;
    },
    getAttributeNS(_ns: string | null, localName: string) {
      if (localName === 'id') return attrs['xml:id'] ?? null;
      return attrs[localName] ?? null;
    },
    closest(selector: string) {
      const names = new Set(selector.split(',').map((s) => s.trim()));
      let cur: Element | null = el as unknown as Element;
      while (cur) {
        if (names.has(cur.localName)) return cur;
        cur = cur.parentElement;
      }
      return null;
    },
    getElementsByTagNameNS(_ns: string | null, localName: string) {
      const found: Element[] = [];
      const walk = (node: Element) => {
        for (const c of Array.from(node.children)) {
          if (localName === '*' || c.localName === localName) found.push(c);
          walk(c);
        }
      };
      walk(el as unknown as Element);
      return found as unknown as HTMLCollectionOf<Element>;
    },
  };
  Object.defineProperty(el, 'textContent', {
    get() {
      let text = '';
      for (const c of childNodes) {
        text += c.nodeType === 3 ? (c.nodeValue ?? '') : ((c as Element).textContent ?? '');
      }
      return text;
    },
  });
  for (const child of spec.children ?? []) {
    if (typeof child === 'string') {
      childNodes.push({ nodeType: 3, nodeValue: child } as unknown as Node);
    } else {
      const childEl = buildElement(child, el as unknown as Element);
      childNodes.push(childEl);
      children.push(childEl);
    }
  }
  return el as unknown as Element;
}

function buildDoc(rootSpec: NodeSpec): Document {
  const root = buildElement(rootSpec);
  return {
    documentElement: root,
    getElementsByTagNameNS(ns: string | null, localName: string) {
      const list = Array.from(root.getElementsByTagNameNS(ns, localName));
      if (localName === '*' || root.localName === localName) {
        return [root, ...list] as unknown as HTMLCollectionOf<Element>;
      }
      return list as unknown as HTMLCollectionOf<Element>;
    },
  } as unknown as Document;
}

describe('ダークの受け渡し', () => {
  it('html に dark を付ける・外す', () => {
    expect(setDarkClass('<html lang="ja"><body/></html>', true)).toBe('<html lang="ja" class="dark"><body/></html>');
    expect(setDarkClass('<html class="a"><body/></html>', true)).toBe('<html lang="a dark"><body/></html>'.replace('lang="a dark"', 'class="a dark"'));
    expect(setDarkClass('<html class="a dark"><body/></html>', false)).toBe('<html class="a"><body/></html>');
    expect(setDarkClass('<html class="dark">', false)).toBe('<html>');
    expect(setDarkClass('<p/>', true)).toBe('<p/>');
  });

  it('html に is-vertical と data-focus-id を付ける', () => {
    const out = setFrameHtmlAttrs('<html lang="ja"><body/></html>', {
      dark: false,
      vertical: true,
      focusId: 'o-0001',
    });
    expect(out).toBe('<html lang="ja" class="is-vertical" data-focus-id="o-0001"><body/></html>');
  });

  it('日本語の TEI は既定で縦書きにする', () => {
    const jaDoc = buildDoc({ tag: 'TEI', children: [{ tag: 'text', children: [{ tag: 'body', children: [{ tag: 'p', children: ['いづれの御時にか'] }] }] }] });
    const enDoc = buildDoc({ tag: 'TEI', children: [{ tag: 'text', children: [{ tag: 'body', children: [{ tag: 'p', children: ['Hello world'] }] }] }] });
    expect(defaultReadingVertical(jaDoc)).toBe(true);
    expect(defaultReadingVertical(enDoc)).toBe(false);
  });

  it('enhanceReadingHtml は釈文・読み下し・大意の3段縦書きと平出・台頭スタイル・ルビを再現する', () => {
    const doc = buildDoc({
      tag: 'TEI',
      children: [
        {
          tag: 'text',
          children: [
            {
              tag: 'body',
              children: [
                {
                  tag: 'div',
                  attrs: { type: 'original' },
                  children: [
                    {
                      tag: 'ab',
                      attrs: { style: 'margin-top: 2rem; text-indent: -1rem;' },
                      children: [
                        { tag: 'lb', attrs: { style: 'display: none' } },
                        {
                          tag: 'seg',
                          attrs: { 'xml:id': 'o-0001' },
                          children: [{ tag: 'persName', attrs: { corresp: '#蒋洲' }, children: ['蒋洲'] }],
                        },
                      ],
                    },
                  ],
                },
                {
                  tag: 'div',
                  attrs: { type: 'yomikudashi' },
                  children: [
                    {
                      tag: 'ab',
                      children: [{ tag: 'seg', attrs: { 'xml:id': 'y-0001' }, children: ['読み下し文'] }],
                    },
                  ],
                },
                {
                  tag: 'div',
                  attrs: { type: 'japanese' },
                  children: [
                    {
                      tag: 'p',
                      children: [{ tag: 'seg', attrs: { 'xml:id': 'ja-0001' }, children: ['現代語訳'] }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const baseHtml = '<html><body><header class="tei-header"><h1>Title</h1></header><main class="doc"><p>old</p></main></body></html>';
    const enhanced = enhanceReadingHtml(baseHtml, doc);
    expect(enhanced).toContain('doc-multi-sections');
    expect(enhanced).toContain('釈文');
    expect(enhanced).toContain('読み下し');
    expect(enhanced).toContain('大意（現代語訳）');
    expect(enhanced).toContain('margin-top: 2rem; text-indent: -1rem');
    expect(enhanced).toContain('data-parallel-num="0001"');
  });
});
