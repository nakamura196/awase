import { describe, expect, it } from 'vitest';
import {
  computeGeoJsonCenter,
  extractCorrespHeaders,
  extractTeiPlaces,
  extractTimeline,
  hasMapData,
  hasTimelineData,
  parseGeo,
  toGeoFeatures,
} from './corresp';

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

describe('parseGeo', () => {
  it('空白・カンマ区切りの緯度経度を [lng, lat] (GeoJSON 順) で返す', () => {
    expect(parseGeo('35.6895 139.6917')).toEqual([139.6917, 35.6895]);
    expect(parseGeo('35.6895, 139.6917')).toEqual([139.6917, 35.6895]);
    expect(parseGeo('  -33.8688 ,  151.2093 ')).toEqual([151.2093, -33.8688]);
  });

  it('範囲外・不正な文字列では null を返す', () => {
    expect(parseGeo('')).toBeNull();
    expect(parseGeo(null)).toBeNull();
    expect(parseGeo('35.6895')).toBeNull();
    expect(parseGeo('35.6895 139.6917 10')).toBeNull();
    expect(parseGeo('95.0 139.6917')).toBeNull();
    expect(parseGeo('35.6895 190.0')).toBeNull();
    expect(parseGeo('abc def')).toBeNull();
  });
});

describe('extractCorrespHeaders / extractTeiPlaces / toGeoFeatures', () => {
  const sampleLetterDoc = buildDoc({
    tag: 'TEI',
    children: [
      {
        tag: 'teiHeader',
        children: [
          {
            tag: 'profileDesc',
            children: [
              {
                tag: 'settingDesc',
                children: [
                  {
                    tag: 'listPlace',
                    children: [
                      {
                        tag: 'place',
                        attrs: { 'xml:id': 'tokyo', sameAs: 'https://www.wikidata.org/entity/Q1490' },
                        children: [
                          { tag: 'placeName', children: ['東京'] },
                          {
                            tag: 'location',
                            children: [{ tag: 'geo', children: ['35.6895 139.6917'] }],
                          },
                        ],
                      },
                      {
                        tag: 'place',
                        attrs: { 'xml:id': 'kyoto' },
                        children: [
                          { tag: 'placeName', children: ['京都'] },
                          {
                            tag: 'location',
                            children: [{ tag: 'geo', children: ['35.0116, 135.7681'] }],
                          },
                          { tag: 'idno', children: ['https://www.wikidata.org/entity/Q34600'] },
                        ],
                      },
                      {
                        tag: 'place',
                        attrs: { 'xml:id': 'nara' },
                        children: [
                          { tag: 'placeName', children: ['奈良'] },
                          { tag: 'geo', children: ['34.6851 135.8048'] },
                        ],
                      },
                    ],
                  },
                ],
              },
              {
                tag: 'correspDesc',
                attrs: { 'xml:id': 'letter-1' },
                children: [
                  {
                    tag: 'correspAction',
                    attrs: { type: 'sent' },
                    children: [
                      { tag: 'persName', children: ['夏目漱石'] },
                      { tag: 'placeName', attrs: { ref: '#tokyo' }, children: ['東京'] },
                      { tag: 'date', attrs: { when: '1914-08-01' }, children: ['大正3年8月1日'] },
                    ],
                  },
                  {
                    tag: 'correspAction',
                    attrs: { type: 'received' },
                    children: [
                      { tag: 'persName', children: ['芥川龍之介'] },
                      { tag: 'placeName', attrs: { ref: '#kyoto' }, children: ['京都'] },
                      { tag: 'date', attrs: { when: '1914-08-03' }, children: ['大正3年8月3日'] },
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
                  '昨日',
                  { tag: 'placeName', attrs: { ref: '#tokyo', 'xml:id': 'p-tokyo-1' }, children: ['東京'] },
                  'を発ち、',
                  { tag: 'placeName', attrs: { ref: '#kyoto' }, children: ['洛陽'] },
                  'および',
                  { tag: 'placeName', attrs: { ref: '#tokyo' }, children: ['江戸'] },
                  'を巡り、さらに',
                  {
                    tag: 'placeName',
                    attrs: { 'xml:id': 'p-kamakura' },
                    children: ['鎌倉', { tag: 'geo', children: ['35.3192 139.5467'] }],
                  },
                  'へ赴く。',
                ],
              },
            ],
          },
        ],
      },
    ],
  });

  it('correspDesc の sent / received アクションと座標を解決する', () => {
    const headers = extractCorrespHeaders(sampleLetterDoc);
    expect(headers).toHaveLength(1);
    expect(headers[0].id).toBe('letter-1');
    expect(headers[0].actions).toEqual([
      {
        type: 'sent',
        persName: '夏目漱石',
        placeName: '東京',
        placeRef: '#tokyo',
        dateText: '大正3年8月1日',
        dateWhen: '1914-08-01',
        coords: [139.6917, 35.6895],
      },
      {
        type: 'received',
        persName: '芥川龍之介',
        placeName: '京都',
        placeRef: '#kyoto',
        dateText: '大正3年8月3日',
        dateWhen: '1914-08-03',
        coords: [135.7681, 35.0116],
      },
    ]);
  });

  it('listPlace・correspDesc・本文中の placeName（インライン geo 含む）を統合し mentionIds を紐付ける', () => {
    const places = extractTeiPlaces(sampleLetterDoc);
    expect(places).toEqual([
      {
        id: 'tokyo',
        label: '東京',
        coords: [139.6917, 35.6895],
        role: 'sent',
        count: 2,
        mentionIds: ['p-tokyo-1', 'awase-entity-3'],
        externalUrl: 'https://www.wikidata.org/entity/Q1490',
      },
      {
        id: 'kyoto',
        label: '京都',
        coords: [135.7681, 35.0116],
        role: 'received',
        count: 1,
        mentionIds: ['awase-entity-2'],
        externalUrl: 'https://www.wikidata.org/entity/Q34600',
      },
      {
        id: 'nara',
        label: '奈良',
        coords: [135.8048, 34.6851],
        role: 'listPlace',
        count: 0,
        mentionIds: [],
        externalUrl: undefined,
      },
      {
        id: 'p-kamakura',
        label: '鎌倉',
        coords: [139.5467, 35.3192],
        role: 'mention',
        count: 1,
        mentionIds: ['p-kamakura'],
        externalUrl: undefined,
      },
    ]);

    const features = toGeoFeatures(places);
    expect(features).toHaveLength(4);
    expect(features[0]).toEqual({
      type: 'Feature',
      id: 'tokyo',
      geometry: { type: 'Point', coordinates: [139.6917, 35.6895] },
      properties: {
        title: '東京',
        tags: ['sent'],
        url: 'https://www.wikidata.org/entity/Q1490',
      },
    });
    expect(hasMapData(sampleLetterDoc)).toBe(true);
  });
});

describe('extractTimeline', () => {
  it('correspDesc・listEvent/event・本文の date を抽出し dateKey の昇順に並べる', () => {
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
                  tag: 'correspDesc',
                  attrs: { 'xml:id': 'c1' },
                  children: [
                    {
                      tag: 'correspAction',
                      attrs: { type: 'sent' },
                      children: [
                        { tag: 'persName', children: ['差出人A'] },
                        { tag: 'placeName', children: ['東京'] },
                        { tag: 'date', attrs: { when: '1914-08-05' }, children: ['1914年8月5日'] },
                      ],
                    },
                    {
                      tag: 'correspAction',
                      attrs: { type: 'received' },
                      children: [
                        { tag: 'persName', children: ['受取人B'] },
                        { tag: 'placeName', children: ['京都'] },
                        { tag: 'date', attrs: { when: '1914-08-08' }, children: ['1914年8月8日'] },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        {
          tag: 'standOff',
          children: [
            {
              tag: 'listEvent',
              children: [
                {
                  tag: 'event',
                  attrs: { 'xml:id': 'ev1', when: '1914-07-28' },
                  children: [
                    { tag: 'label', children: ['開戦'] },
                    { tag: 'desc', children: ['第一次世界大戦が始まる'] },
                    { tag: 'placeName', children: ['ウィーン'] },
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
                    '彼は',
                    { tag: 'date', attrs: { when: '1914-08-02', 'xml:id': 'd-aug2' }, children: ['八月二日'] },
                    'に日記を書き、また',
                    { tag: 'date', children: ['吉日'] },
                    'に旅立った。',
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const entries = extractTimeline(doc);
    expect(hasTimelineData(doc)).toBe(true);
    expect(entries.map((e) => ({ dateKey: e.dateKey, kind: e.kind, title: e.title, targetId: e.targetId }))).toEqual([
      {
        dateKey: '1914-07-28',
        kind: 'event',
        title: '開戦',
        targetId: null,
      },
      {
        dateKey: '1914-08-02',
        kind: 'text-date',
        title: '八月二日',
        targetId: 'd-aug2',
      },
      {
        dateKey: '1914-08-05',
        kind: 'corresp-sent',
        title: '差出人A — 東京',
        targetId: null,
      },
      {
        dateKey: '1914-08-08',
        kind: 'corresp-received',
        title: '受取人B — 京都',
        targetId: null,
      },
      {
        dateKey: '',
        kind: 'text-date',
        title: '吉日',
        targetId: 'awase-entity-2',
      },
    ]);
    expect(entries[1].detail).toContain('八月二日');
  });
});

describe('schema:geo GeoJSON URL と computeGeoJsonCenter', () => {
  it('wakozukan 形式の <note type="schema:geo">（相対・絶対 GeoJSON URL）と schema:description を抽出する', () => {
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
                  tag: 'settingDesc',
                  children: [
                    {
                      tag: 'listPlace',
                      children: [
                        {
                          tag: 'place',
                          attrs: { 'xml:id': '五島' },
                          children: [
                            { tag: 'placeName', children: ['五島'] },
                            { tag: 'note', attrs: { type: 'schema:description' }, children: ['五島列島。'] },
                            { tag: 'note', attrs: { type: 'schema:url' }, children: ['https://ja.wikipedia.org/wiki/五島列島'] },
                            { tag: 'note', attrs: { type: 'schema:geo' }, children: ['五島.json'] },
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
                    { tag: 'placeName', attrs: { corresp: '#五島' }, children: ['五嶋'] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    const baseUrl = 'https://www.hi.u-tokyo.ac.jp/collection/digitalgallery/wakozukan/tei/data/main.xml';
    expect(hasMapData(doc)).toBe(true);
    const places = extractTeiPlaces(doc, baseUrl);
    expect(places).toHaveLength(1);
    expect(places[0]).toMatchObject({
      id: '五島',
      label: '五島',
      coords: null,
      geoJsonUrl: 'https://www.hi.u-tokyo.ac.jp/collection/digitalgallery/wakozukan/tei/data/geojson/%E4%BA%94%E5%B3%B6.json',
      description: '五島列島。',
      externalUrl: 'https://ja.wikipedia.org/wiki/五島列島',
      count: 1,
    });
  });

  it('GeoJSON FeatureCollection の Polygon から中心座標 [lng, lat] を計算する', () => {
    const sampleGeoJson = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [128.0, 32.0],
                [130.0, 32.0],
                [130.0, 34.0],
                [128.0, 34.0],
                [128.0, 32.0],
              ],
            ],
          },
        },
      ],
    };
    expect(computeGeoJsonCenter(sampleGeoJson)).toEqual([129.0, 33.0]);
  });
});
