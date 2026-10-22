import { describe, expect, it } from 'vitest';
import {
  ENTITY_KINDS,
  ENTITY_TAGS,
  entityId,
  entityKindOf,
  hasEntitiesData,
  normalizeRef,
  readEntities,
  textEntities,
} from './entities';

// Node 環境（DOMParser 無し）で TEI の要素木を組み立てる簡易ヘルパー
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

describe('entityId / 定数', () => {
  it('番号から awase-entity-N を作る', () => {
    expect(entityId(1)).toBe('awase-entity-1');
    expect(entityId(42)).toBe('awase-entity-42');
    expect(ENTITY_KINDS).toEqual(['persName', 'placeName', 'orgName', 'date']);
    expect(ENTITY_TAGS).toContain('persName');
  });
});

describe('entityKindOf', () => {
  it('persName / placeName / orgName / date と rs・name の @type を判定する', () => {
    expect(entityKindOf(buildElement({ tag: 'persName' }))).toBe('persName');
    expect(entityKindOf(buildElement({ tag: 'placeName' }))).toBe('placeName');
    expect(entityKindOf(buildElement({ tag: 'orgName' }))).toBe('orgName');
    expect(entityKindOf(buildElement({ tag: 'date' }))).toBe('date');
    expect(entityKindOf(buildElement({ tag: 'rs', attrs: { type: 'person' } }))).toBe('persName');
    expect(entityKindOf(buildElement({ tag: 'rs' }))).toBe('persName');
    expect(entityKindOf(buildElement({ tag: 'rs', attrs: { type: 'place' } }))).toBe('placeName');
    expect(entityKindOf(buildElement({ tag: 'name', attrs: { type: 'org' } }))).toBe('orgName');
    expect(entityKindOf(buildElement({ tag: 'name', attrs: { type: 'date' } }))).toBe('date');
    expect(entityKindOf(buildElement({ tag: 'p' }))).toBeNull();
  });
});

describe('normalizeRef', () => {
  it('@ref / @corresp / @key / @nymRef を順に見て識別子と URL を返す', () => {
    expect(normalizeRef(buildElement({ tag: 'persName', attrs: { ref: 'https://www.wikidata.org/entity/Q1' } }))).toEqual({
      keyId: 'https://www.wikidata.org/entity/Q1',
      href: 'https://www.wikidata.org/entity/Q1',
    });
    expect(normalizeRef(buildElement({ tag: 'persName', attrs: { corresp: 'persons.xml#hikaru #other' } }))).toEqual({
      keyId: '#hikaru',
      href: null,
    });
    expect(normalizeRef(buildElement({ tag: 'placeName', attrs: { key: 'kyoto' } }))).toEqual({
      keyId: 'kyoto',
      href: null,
    });
    expect(normalizeRef(buildElement({ tag: 'persName' }))).toEqual({
      keyId: null,
      href: null,
    });
  });
});

describe('textEntities と readEntities', () => {
  it('teiHeader / facsimile / standOff を飛ばし、典拠の名寄せ・頻度順ソート・id 採番を行う', () => {
    const doc = buildDoc({
      tag: 'TEI',
      children: [
        {
          tag: 'teiHeader',
          children: [
            {
              tag: 'fileDesc',
              children: [{ tag: 'persName', children: ['紫式部（ヘッダー内は除外）'] }],
            },
            {
              tag: 'profileDesc',
              children: [
                {
                  tag: 'particDesc',
                  children: [
                    {
                      tag: 'listPerson',
                      children: [
                        {
                          tag: 'person',
                          attrs: { 'xml:id': 'hikaru', sameAs: 'https://www.wikidata.org/entity/Q1047858' },
                          children: [
                            { tag: 'persName', children: ['光源氏'] },
                            { tag: 'note', children: ['主人公'] },
                          ],
                        },
                      ],
                    },
                    {
                      tag: 'listOrg',
                      children: [
                        {
                          tag: 'org',
                          attrs: { 'xml:id': 'kurodo' },
                          children: [
                            { tag: 'orgName', children: ['蔵人所'] },
                            { tag: 'idno', children: ['https://example.org/org/kurodo'] },
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
        {
          tag: 'facsimile',
          children: [{ tag: 'placeName', children: ['画像内の地名（除外）'] }],
        },
        {
          tag: 'standOff',
          children: [{ tag: 'persName', children: ['standOff 内（除外）'] }],
        },
        {
          tag: 'text',
          children: [
            {
              tag: 'body',
              children: [
                {
                  tag: 'p',
                  children: [
                    { tag: 'placeName', attrs: { 'xml:id': 'pl-1' }, children: ['京'] },
                    'にて',
                    { tag: 'persName', attrs: { corresp: '#hikaru' }, children: ['源氏'] },
                    'と',
                    { tag: 'rs', attrs: { type: 'person', corresp: '#hikaru' }, children: ['光君'] },
                    'は',
                    { tag: 'name', attrs: { type: 'org', ref: '#kurodo' }, children: ['蔵人'] },
                    'を召し、',
                    { tag: 'date', attrs: { when: '1008-11-01' }, children: ['寛弘五年十一月一日'] },
                    'に',
                    { tag: 'rs', attrs: { type: 'place' }, children: ['宇治'] },
                    '・',
                    { tag: 'placeName', children: ['宇治'] },
                    '・',
                    { tag: 'persName', attrs: { corresp: '#hikaru' }, children: ['源氏の君'] },
                    { tag: 'persName', children: ['   '] }, // 空要素は除外
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(textEntities(doc)).toHaveLength(8);

    const { mentions, groups } = readEntities(doc);
    expect(mentions).toHaveLength(8);

    // xml:id があれば維持し、無ければ awase-entity-N
    expect(mentions[0]).toMatchObject({ n: 1, id: 'pl-1', kind: 'placeName', text: '京' });
    expect(mentions[1]).toMatchObject({
      n: 2,
      id: 'awase-entity-2',
      kind: 'persName',
      text: '源氏',
      key: 'persName:#hikaru',
      ref: 'https://www.wikidata.org/entity/Q1047858',
    });
    expect(mentions[2]).toMatchObject({
      n: 3,
      id: 'awase-entity-3',
      kind: 'persName',
      text: '光君',
      key: 'persName:#hikaru',
    });
    expect(mentions[3]).toMatchObject({
      n: 4,
      id: 'awase-entity-4',
      kind: 'orgName',
      text: '蔵人',
      key: 'orgName:#kurodo',
      ref: 'https://example.org/org/kurodo',
    });
    expect(mentions[4]).toMatchObject({
      n: 5,
      id: 'awase-entity-5',
      kind: 'date',
      text: '寛弘五年十一月一日',
      when: '1008-11-01',
      key: 'date:1008-11-01',
    });

    // グループは件数降順、同数なら初出順
    expect(groups.map((g) => ({ key: g.key, label: g.label, count: g.mentions.length, ref: g.ref }))).toEqual([
      {
        key: 'persName:#hikaru',
        label: '光源氏',
        count: 3,
        ref: 'https://www.wikidata.org/entity/Q1047858',
      },
      {
        key: 'placeName:宇治',
        label: '宇治',
        count: 2,
        ref: null,
      },
      {
        key: 'placeName:京',
        label: '京',
        count: 1,
        ref: null,
      },
      {
        key: 'orgName:#kurodo',
        label: '蔵人所',
        count: 1,
        ref: 'https://example.org/org/kurodo',
      },
      {
        key: 'date:1008-11-01',
        label: '寛弘五年十一月一日',
        count: 1,
        ref: null,
      },
    ]);
  });

  it('<text> の無い TEI 断片でも teiHeader / facsimile / standOff を除外して拾う', () => {
    const doc = buildDoc({
      tag: 'TEI',
      children: [
        { tag: 'teiHeader', children: [{ tag: 'persName', children: ['除外'] }] },
        { tag: 'p', children: [{ tag: 'persName', children: ['藤原道長'] }] },
      ],
    });
    const { mentions } = readEntities(doc);
    expect(mentions).toHaveLength(1);
    expect(mentions[0].text).toBe('藤原道長');
  });

  it('schema:description・schema:url・schema:image と # 無し @corresp を解決する', () => {
    const doc = buildDoc({
      tag: 'TEI',
      children: [
        {
          tag: 'teiHeader',
          children: [
            {
              tag: 'profileDesc',
              children: [
                {
                  tag: 'particDesc',
                  children: [
                    {
                      tag: 'listPerson',
                      children: [
                        {
                          tag: 'person',
                          attrs: { 'xml:id': '徳陽' },
                          children: [
                            { tag: 'persName', children: ['徳陽'] },
                            { tag: 'note', attrs: { type: 'schema:description' }, children: ['日本僧'] },
                            { tag: 'note', attrs: { type: 'schema:url' }, children: ['https://kotobank.jp/word/徳陽'] },
                            { tag: 'note', attrs: { type: 'schema:image' }, children: ['https://example.org/tokuyo.jpg'] },
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
        {
          tag: 'text',
          children: [
            {
              tag: 'body',
              children: [
                {
                  tag: 'p',
                  children: [
                    { tag: 'persName', attrs: { corresp: '徳陽' }, children: ['僧徳陽'] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(hasEntitiesData(doc)).toBe(true);
    const { groups } = readEntities(doc);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      key: 'persName:#徳陽',
      label: '徳陽',
      ref: 'https://kotobank.jp/word/徳陽',
      description: '日本僧',
      image: 'https://example.org/tokuyo.jpg',
    });
  });

  it('人物ごとの呼称（呼び名の変化）を頻度順の variants として集計し、日本語の @corresp ID を見出しに使う', () => {
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
                  tag: 'p',
                  children: [
                    { tag: 'persName', attrs: { corresp: '#ディオニス' }, children: ['邪智暴虐の王'] },
                    { tag: 'persName', attrs: { corresp: '#ディオニス' }, children: ['王'] },
                    { tag: 'persName', attrs: { corresp: '#ディオニス' }, children: ['暴君ディオニス'] },
                    { tag: 'persName', attrs: { corresp: '#ディオニス' }, children: ['王'] },
                    { tag: 'rs', attrs: { corresp: '#ディオニス' }, children: ['わし'] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    const { groups } = readEntities(doc);
    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('ディオニス');
    expect(groups[0].variants.map((v) => ({ text: v.text, count: v.count }))).toEqual([
      { text: '王', count: 2 },
      { text: '邪智暴虐の王', count: 1 },
      { text: '暴君ディオニス', count: 1 },
      { text: 'わし', count: 1 },
    ]);
  });
});
