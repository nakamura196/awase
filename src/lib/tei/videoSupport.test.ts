import { describe, expect, it } from 'vitest';
import { extractVideoSupportData, parseTimecode } from './videoSupport';

interface Spec {
  tag: string;
  attrs?: Record<string, string>;
  children?: (Spec | string)[];
}

function makeEl(spec: Spec, parent: Element | null = null): Element {
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
    getAttributeNS(_ns: string | null, local: string) {
      if (local === 'id') return attrs['xml:id'] ?? null;
      return attrs[local] ?? null;
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
    getElementsByTagNameNS(_ns: string | null, local: string) {
      const found: Element[] = [];
      const walk = (node: Element) => {
        for (const c of Array.from(node.children)) {
          if (local === '*' || c.localName === local) found.push(c);
          walk(c);
        }
      };
      walk(el as unknown as Element);
      return found as unknown as HTMLCollectionOf<Element>;
    },
  };
  Object.defineProperty(el, 'textContent', {
    get() {
      let out = '';
      for (const c of childNodes) {
        out += c.nodeType === 3 ? (c.nodeValue ?? '') : ((c as Element).textContent ?? '');
      }
      return out;
    },
  });
  for (const child of spec.children ?? []) {
    if (typeof child === 'string') {
      childNodes.push({ nodeType: 3, nodeValue: child } as unknown as Node);
    } else {
      const cEl = makeEl(child, el as unknown as Element);
      childNodes.push(cEl);
      children.push(cEl);
    }
  }
  return el as unknown as Element;
}

function makeDoc(rootSpec: Spec): Document {
  const root = makeEl(rootSpec);
  return {
    documentElement: root,
    getElementsByTagNameNS(ns: string | null, local: string) {
      const list = Array.from(root.getElementsByTagNameNS(ns, local));
      if (local === '*' || root.localName === local) {
        return [root, ...list] as unknown as HTMLCollectionOf<Element>;
      }
      return list as unknown as HTMLCollectionOf<Element>;
    },
  } as unknown as Document;
}

describe('parseTimecode', () => {
  it('HH:MM:SS.mmm と秒数を秒に変換する', () => {
    expect(parseTimecode('00:00:25.500')).toBe(25.5);
    expect(parseTimecode('00:01:03.500')).toBe(63.5);
    expect(parseTimecode('01:00:00.000')).toBe(3600);
    expect(parseTimecode('')).toBeNull();
  });
});

describe('extractVideoSupportData', () => {
  it('teiCorpus の recording・timeline・annotationBlock/u・name から動画・字幕・用語を取り出す', () => {
    const doc = makeDoc({
      tag: 'teiCorpus',
      children: [
        {
          tag: 'teiHeader',
          children: [
            { tag: 'fileDesc', children: [{ tag: 'titleStmt', children: [{ tag: 'title', children: ['県政ニュース　第1巻'] }] }] },
            {
              tag: 'recordingStmt',
              children: [
                {
                  tag: 'recording',
                  children: [
                    { tag: 'media', attrs: { mimeType: 'video/mp4', url: 'https://video-support.vercel.app/data/news.mp4' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          tag: 'TEI',
          children: [
            {
              tag: 'text',
              children: [
                {
                  tag: 'body',
                  children: [
                    {
                      tag: 'timeline',
                      children: [
                        { tag: 'when', attrs: { 'xml:id': 't1', absolute: '00:00:00.000' } },
                        { tag: 'when', attrs: { 'xml:id': 't2', absolute: '00:00:25.500' } },
                        { tag: 'when', attrs: { 'xml:id': 't3', absolute: '00:00:38.500' } },
                      ],
                    },
                    {
                      tag: 'annotationBlock',
                      attrs: { 'xml:id': 'ab1' },
                      children: [{ tag: 'u', attrs: { start: '#t1', end: '#t2' }, children: ['♪♪♪'] }],
                    },
                    {
                      tag: 'annotationBlock',
                      attrs: { 'xml:id': 'ab2' },
                      children: [
                        {
                          tag: 'u',
                          attrs: { start: '#t2', end: '#t3' },
                          children: [
                            '今年は',
                            { tag: 'name', attrs: { type: 'keyword' }, children: ['選挙'] },
                            'の当たり年。',
                            { tag: 'name', attrs: { type: 'org', key: '長野県' }, children: ['県下'] },
                            'で実施。',
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const res = extractVideoSupportData(doc);
    expect(res.title).toBe('県政ニュース 第1巻');
    expect(res.videoUrl).toBe('https://video-support.vercel.app/data/news.mp4');
    expect(res.duration).toBe(38.5);
    expect(res.blocks).toHaveLength(2);
    expect(res.blocks[1].start).toBe(25.5);
    expect(res.blocks[1].end).toBe(38.5);
    expect(res.terms.map((t) => ({ key: t.key, label: t.label, cat: t.category, count: t.count }))).toEqual([
      { key: '選挙', label: '選挙', cat: 'keyword', count: 1 },
      { key: '長野県', label: '県下', cat: 'org', count: 1 },
    ]);
  });
});
