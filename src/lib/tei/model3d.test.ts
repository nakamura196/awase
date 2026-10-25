import { describe, expect, it } from 'vitest';
import { hasModelData, readModels, zoneForId } from './model3d';

// Node 環境（DOMParser 無し）でも inline XML を DOMParser で読めるようにする簡易実装
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

function parseXmlToSpec(xml: string): NodeSpec {
  const cleaned = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();
  const root: NodeSpec = { tag: '__root__', children: [] };
  const stack: NodeSpec[] = [root];
  const tokenRe = /<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  const attrRe = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;

  for (const m of cleaned.matchAll(tokenRe)) {
    const [, closing, rawTag, attrStr, selfClosing, text] = m;
    const current = stack[stack.length - 1];
    if (text !== undefined) {
      current.children!.push(text);
      continue;
    }
    const tag = rawTag.includes(':') ? rawTag.split(':')[1] : rawTag;
    if (closing) {
      stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const am of attrStr.matchAll(attrRe)) {
      attrs[am[1]] = am[2] ?? am[3] ?? '';
    }
    const node: NodeSpec = { tag, attrs, children: [] };
    current.children!.push(node);
    if (!selfClosing) stack.push(node);
  }
  const firstEl = root.children?.find((c): c is NodeSpec => typeof c !== 'string');
  if (!firstEl) throw new Error('Invalid XML');
  return firstEl;
}

if (typeof globalThis.DOMParser === 'undefined') {
  globalThis.DOMParser = class {
    parseFromString(xml: string): Document {
      return buildDoc(parseXmlToSpec(xml));
    }
  } as unknown as typeof DOMParser;
}

function parseTei(xml: string): Document {
  return new DOMParser().parseFromString(xml, 'application/xml');
}

const UID_A = '0123456789abcdef0123456789abcdef';
const UID_B = 'fedcba9876543210fedcba9876543210';
const UID_C = 'abcdef0123456789abcdef0123456789';

describe('readModels: Sketchfab の uid と注記番号', () => {
  it('surface@corresp（そのまま・# 付き・#sketchfab- 付き）と graphic@url の 3 形から uid を取る', () => {
    const doc = parseTei(`
      <TEI xmlns="http://www.tei-c.org/ns/1.0">
        <facsimile>
          <surface xml:id="s1" corresp="${UID_A}">
            <label>モデル1</label>
          </surface>
          <surface xml:id="s2" corresp="#${UID_B}">
            <desc>モデル2の説明</desc>
          </surface>
          <surface xml:id="s3" corresp="#sketchfab-${UID_C}" />
          <surface xml:id="s4">
            <graphic url="https://sketchfab.com/3d-models/${UID_A}" />
          </surface>
          <surface xml:id="s5">
            <graphic url="https://sketchfab.com/3d-models/statue-sample-${UID_B}" />
          </surface>
          <surface xml:id="s6">
            <graphic url="https://sketchfab.com/models/${UID_C}" />
          </surface>
        </facsimile>
      </TEI>
    `);

    const models = readModels(doc);
    expect(models).toEqual([
      { id: 's1', model: { kind: 'sketchfab', uid: UID_A }, label: 'モデル1', zones: [] },
      { id: 's2', model: { kind: 'sketchfab', uid: UID_B }, label: 'モデル2の説明', zones: [] },
      { id: 's3', model: { kind: 'sketchfab', uid: UID_C }, zones: [] },
      { id: 's4', model: { kind: 'sketchfab', uid: UID_A }, zones: [] },
      { id: 's5', model: { kind: 'sketchfab', uid: UID_B }, zones: [] },
      { id: 's6', model: { kind: 'sketchfab', uid: UID_C }, zones: [] },
    ]);
  });

  it('zone の注記番号を @n・@idno・子孫の idno の順で読み、label と note も取る', () => {
    const doc = parseTei(`
      <TEI xmlns="http://www.tei-c.org/ns/1.0">
        <facsimile>
          <surface corresp="${UID_A}">
            <zone xml:id="z-n" n="0">
              <label>正面</label>
              <note>正面の注記</note>
            </zone>
            <zone xml:id="z-idno" idno="2">
              <note>側面の注記</note>
            </zone>
            <zone xml:id="z-desc-idno">
              <note>
                <label>背面</label>
                <idno>4</idno>
              </note>
            </zone>
            <zone xml:id="z-order" n="1" idno="9">
              <note><idno>12</idno></note>
            </zone>
            <zone n="5" />
          </surface>
        </facsimile>
      </TEI>
    `);

    const [surface] = readModels(doc);
    expect(surface.zones).toEqual([
      {
        id: 'z-n',
        annotation: 0,
        label: '正面',
        note: '正面の注記',
        ids: ['z-n'],
        selectId: 'z-n',
      },
      {
        id: 'z-idno',
        annotation: 2,
        note: '側面の注記',
        ids: ['z-idno'],
        selectId: 'z-idno',
      },
      {
        id: 'z-desc-idno',
        annotation: 4,
        label: '背面',
        ids: ['z-desc-idno'],
        selectId: 'z-desc-idno',
      },
      {
        id: 'z-order',
        annotation: 1,
        ids: ['z-order'],
        selectId: 'z-order',
      },
    ]);
  });
});

describe('readModels: glTF と 3 次元座標', () => {
  it('相対パスの .glb / .gltf を baseUrl で解決し、points と @x @y @z を読む', () => {
    const doc = parseTei(`
      <TEI xmlns="http://www.tei-c.org/ns/1.0">
        <facsimile>
          <surface xml:id="glb-surface" type="threejs" corresp="models/vessel.glb">
            <zone xml:id="poly" type="polygon" points="1,2,3 4.5,-6,7 bad 1,2 8,9,a">
              <label>口縁部</label>
            </zone>
            <zone xml:id="pt" x="10" y="-20.5" z="30" />
          </surface>
          <surface>
            <graphic url="sub/piece.GLTF" />
          </surface>
        </facsimile>
      </TEI>
    `);

    const models = readModels(doc, 'https://example.org/tei/sample.xml');
    expect(models).toEqual([
      {
        id: 'glb-surface',
        model: { kind: 'gltf', url: 'https://example.org/tei/models/vessel.glb' },
        zones: [
          {
            id: 'poly',
            points: [
              [1, 2, 3],
              [4.5, -6, 7],
            ],
            label: '口縁部',
            ids: ['poly'],
            selectId: 'poly',
          },
          {
            id: 'pt',
            points: [[10, -20.5, 30]],
            ids: ['pt'],
            selectId: 'pt',
          },
        ],
      },
      {
        model: { kind: 'gltf', url: 'https://example.org/tei/sub/piece.GLTF' },
        zones: [],
      },
    ]);
  });

  it('IIIF 画像などの通常の surface は飛ばす', () => {
    const doc = parseTei(`
      <TEI xmlns="http://www.tei-c.org/ns/1.0">
        <facsimile sameAs="https://example.org/iiif/manifest.json">
          <surface xml:id="page1" sameAs="https://example.org/iiif/canvas/1">
            <graphic url="https://example.org/iiif/image/1/full/max/0/default.jpg" />
            <zone xml:id="img-zone" ulx="0" uly="0" lrx="100" lry="100" />
          </surface>
          <surface xml:id="model1" corresp="${UID_A}">
            <zone xml:id="z1" n="0" />
          </surface>
        </facsimile>
      </TEI>
    `);

    const models = readModels(doc, 'https://example.org/tei/sample.xml');
    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('model1');
  });
});

describe('readModels: 本文との 3 通りのつなぎと ids / selectId', () => {
  it('zone@corresp・本文の @facs・本文の @corresp から ids と selectId を決める', () => {
    const doc = parseTei(`
      <TEI xmlns="http://www.tei-c.org/ns/1.0">
        <facsimile>
          <surface corresp="${UID_A}">
            <zone xml:id="z-from-zone" n="0" corresp="#missing #stanza1 #stanza2" />
            <zone xml:id="z-from-facs" n="1" />
            <zone xml:id="z-from-corresp-id" n="2" />
            <zone xml:id="z-from-corresp-noid" n="3" />
          </surface>
        </facsimile>
        <text>
          <body>
            <lg xml:id="stanza1"><l>一首目</l></lg>
            <lg xml:id="stanza2" facs="#z-from-zone"><l>二首目</l></lg>
            <div xml:id="sec1" facs="#z-from-facs"><p>段落</p></div>
            <l xml:id="line1" corresp="#z-from-corresp-id">xml:id 付きの行</l>
            <l corresp="#z-from-corresp-noid">xml:id 無しの行</l>
          </body>
        </text>
      </TEI>
    `);

    const [surface] = readModels(doc);
    expect(surface.zones).toEqual([
      {
        id: 'z-from-zone',
        annotation: 0,
        ids: ['z-from-zone', 'missing', 'stanza1', 'stanza2'],
        selectId: 'stanza1',
      },
      {
        id: 'z-from-facs',
        annotation: 1,
        ids: ['z-from-facs', 'sec1'],
        selectId: 'sec1',
      },
      {
        id: 'z-from-corresp-id',
        annotation: 2,
        ids: ['z-from-corresp-id', 'line1'],
        selectId: 'line1',
      },
      {
        id: 'z-from-corresp-noid',
        annotation: 3,
        ids: ['z-from-corresp-noid'],
        selectId: 'z-from-corresp-noid',
      },
    ]);
  });
});

describe('zoneForId と hasModelData', () => {
  it('zoneForId は ids に含まれる最初の zone を返し、空・未知の id には null を返す', () => {
    const doc = parseTei(`
      <TEI xmlns="http://www.tei-c.org/ns/1.0">
        <facsimile>
          <surface corresp="${UID_A}">
            <zone xml:id="z1" n="0" corresp="#p1" />
          </surface>
          <surface corresp="${UID_B}">
            <zone xml:id="z2" n="1" />
          </surface>
        </facsimile>
        <text>
          <body>
            <p xml:id="p1">一</p>
            <p xml:id="p2" facs="#z2">二</p>
          </body>
        </text>
      </TEI>
    `);

    const surfaces = readModels(doc);
    expect(zoneForId(surfaces, 'z1')).toEqual({ surface: 0, zone: surfaces[0].zones[0] });
    expect(zoneForId(surfaces, 'p1')).toEqual({ surface: 0, zone: surfaces[0].zones[0] });
    expect(zoneForId(surfaces, 'p2')).toEqual({ surface: 1, zone: surfaces[1].zones[0] });
    expect(zoneForId(surfaces, 'unknown')).toBeNull();
    expect(zoneForId(surfaces, '')).toBeNull();
    expect(zoneForId(surfaces, null)).toBeNull();
    expect(zoneForId(surfaces, undefined)).toBeNull();
  });

  it('hasModelData は 3D の無い文書や画像だけの文書で false、3D のある文書で true', () => {
    const plain = parseTei(`
      <TEI xmlns="http://www.tei-c.org/ns/1.0">
        <facsimile>
          <surface xml:id="p1">
            <graphic url="https://example.org/page1.jpg" />
          </surface>
        </facsimile>
        <text><body><p>本文のみ</p></body></text>
      </TEI>
    `);
    const withSketchfab = parseTei(`
      <TEI xmlns="http://www.tei-c.org/ns/1.0">
        <facsimile>
          <surface corresp="${UID_A}" />
        </facsimile>
      </TEI>
    `);
    const withGlb = parseTei(`
      <TEI xmlns="http://www.tei-c.org/ns/1.0">
        <facsimile>
          <surface corresp="relic.glb" />
        </facsimile>
      </TEI>
    `);

    expect(hasModelData(plain)).toBe(false);
    expect(hasModelData(withSketchfab)).toBe(true);
    expect(hasModelData(withGlb)).toBe(true);
  });
});
