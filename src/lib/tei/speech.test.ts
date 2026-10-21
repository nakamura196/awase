import { describe, expect, it } from 'vitest';
import {
  extractLineDialogues,
  extractSpeeches,
  groupBySpeaker,
  SPEECH_TAGS,
  speechId,
  textSpeeches,
  type SpeechItem,
} from './speech';

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

describe('speechId / 定数', () => {
  it('番号から awase-speech-N を作る', () => {
    expect(speechId(1)).toBe('awase-speech-1');
    expect(speechId(15)).toBe('awase-speech-15');
    expect(SPEECH_TAGS).toEqual(['sp', 'said']);
  });
});

describe('textSpeeches と extractSpeeches', () => {
  it('listPerson と castList の典拠を引き、<sp>（speaker・p・l・stage）と <said> を抽出する', () => {
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
                          attrs: { 'xml:id': 'p1', sameAs: 'https://www.wikidata.org/entity/Q1047858' },
                          children: [
                            { tag: 'persName', children: ['光源氏（典拠名）'] },
                            { tag: 'note', children: ['主人公'] },
                          ],
                        },
                        {
                          tag: 'person',
                          attrs: { 'xml:id': 'p2' },
                          children: [
                            { tag: 'persName', children: ['紫の上'] },
                            { tag: 'idno', children: ['https://example.org/persons/p2'] },
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
          tag: 'standOff',
          children: [{ tag: 'said', attrs: { who: '#p1' }, children: ['standOff 内は除外'] }],
        },
        {
          tag: 'text',
          children: [
            {
              tag: 'front',
              children: [
                {
                  tag: 'castList',
                  children: [
                    {
                      tag: 'castItem',
                      children: [
                        { tag: 'role', attrs: { 'xml:id': 'r1' }, children: ['頭中将'] },
                        { tag: 'roleDesc', children: ['源氏の友人'] },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              tag: 'body',
              children: [
                {
                  tag: 'sp',
                  attrs: { 'xml:id': 'sp-1', who: '#p1' },
                  children: [
                    { tag: 'speaker', children: ['源氏'] },
                    { tag: 'p', children: ['いづれの御時にか'] },
                    { tag: 'p', children: ['女御更衣あまたさぶらひたまひける'] },
                    { tag: 'stage', children: ['扇を翳す'] },
                  ],
                },
                {
                  tag: 'sp',
                  attrs: { who: '#r1' },
                  children: [
                    { tag: 'speaker', children: ['中将'] },
                    {
                      tag: 'lg',
                      children: [
                        { tag: 'l', children: ['上の句'] },
                        { tag: 'l', children: ['下の句'] },
                      ],
                    },
                  ],
                },
                {
                  tag: 'p',
                  children: [
                    '地の文に続いて',
                    {
                      tag: 'said',
                      attrs: { who: '#p2' },
                      children: ['「雀の子を犬君が逃がしつる」'],
                    },
                    'と語った。',
                  ],
                },
              ],
            },
          ],
        },
      ],
    });

    expect(textSpeeches(doc)).toHaveLength(3);

    const items = extractSpeeches(doc);
    expect(items).toHaveLength(3);

    expect(items[0]).toEqual({
      n: 1,
      id: 'sp-1',
      kind: 'sp',
      speakerKey: 'p1',
      speakerLabel: '光源氏（典拠名）',
      rawSpeaker: '#p1',
      text: 'いづれの御時にか 女御更衣あまたさぶらひたまひける',
      stage: '扇を翳す',
      charCount: 'いづれの御時にか女御更衣あまたさぶらひたまひける'.length,
      externalUrl: 'https://www.wikidata.org/entity/Q1047858',
    });

    expect(items[1]).toEqual({
      n: 2,
      id: 'awase-speech-2',
      kind: 'sp',
      speakerKey: 'r1',
      speakerLabel: '頭中将',
      rawSpeaker: '#r1',
      text: '上の句 下の句',
      charCount: 6,
    });

    expect(items[2]).toEqual({
      n: 3,
      id: 'awase-speech-3',
      kind: 'said',
      speakerKey: 'p2',
      speakerLabel: '紫の上',
      rawSpeaker: '#p2',
      text: '「雀の子を犬君が逃がしつる」',
      charCount: '「雀の子を犬君が逃がしつる」'.length,
      externalUrl: 'https://example.org/persons/p2',
    });
  });

  it('@who の無い <sp>（<speaker> のみ）や話者不明の <said>、未登録の @who を処理する', () => {
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
                  tag: 'sp',
                  children: [
                    { tag: 'speaker', children: ['旅人'] },
                    { tag: 'p', children: ['道をお尋ね申す'] },
                  ],
                },
                {
                  tag: 'sp',
                  attrs: { who: '#unlisted' },
                  children: [
                    { tag: 'speaker', children: ['名無しの翁'] },
                    { tag: 'p', children: ['この先じゃ'] },
                  ],
                },
                {
                  tag: 'said',
                  children: ['誰とも知れぬ声'],
                },
              ],
            },
          ],
        },
      ],
    });

    const items = extractSpeeches(doc);
    expect(items).toHaveLength(3);

    // @who 無し・<speaker> あり
    expect(items[0]).toMatchObject({
      n: 1,
      id: 'awase-speech-1',
      kind: 'sp',
      speakerKey: '旅人',
      speakerLabel: '旅人',
      rawSpeaker: '旅人',
      text: '道をお尋ね申す',
    });

    // @who が典拠に無い場合、<speaker> のテキストを表示名に使う
    expect(items[1]).toMatchObject({
      n: 2,
      id: 'awase-speech-2',
      kind: 'sp',
      speakerKey: 'unlisted',
      speakerLabel: '名無しの翁',
      rawSpeaker: '#unlisted',
      text: 'この先じゃ',
    });

    // @who も <speaker> も無い場合
    expect(items[2]).toMatchObject({
      n: 3,
      id: 'awase-speech-3',
      kind: 'said',
      speakerKey: '__unknown__',
      speakerLabel: '',
      rawSpeaker: null,
      text: '誰とも知れぬ声',
    });
  });

  it('<text> の無い TEI 断片でも teiHeader / facsimile / standOff を除外して拾う', () => {
    const doc = buildDoc({
      tag: 'TEI',
      children: [
        { tag: 'teiHeader', children: [{ tag: 'said', children: ['除外'] }] },
        { tag: 'p', children: [{ tag: 'said', attrs: { who: '#a' }, children: ['発話本文'] }] },
      ],
    });
    const items = extractSpeeches(doc);
    expect(items).toHaveLength(1);
    expect(items[0].text).toBe('発話本文');
  });
});

describe('groupBySpeaker', () => {
  it('発話数降順 → 文字数降順 → 初出順（n 昇順）でソートする', () => {
    const makeItem = (
      n: number,
      speakerKey: string,
      speakerLabel: string,
      text: string,
      externalUrl?: string,
    ): SpeechItem => ({
      n,
      id: speechId(n),
      kind: 'said',
      speakerKey,
      speakerLabel,
      rawSpeaker: speakerKey === '__unknown__' ? null : `#${speakerKey}`,
      text,
      charCount: text.replace(/\s+/g, '').length,
      ...(externalUrl ? { externalUrl } : {}),
    });

    const items: SpeechItem[] = [
      makeItem(1, 'short_first', '短文A', 'あ'),
      makeItem(2, 'long_second', '長文B', 'かきくけこ'),
      makeItem(3, 'frequent', '多発話C', 'さし', 'https://example.org/c'),
      makeItem(4, 'tie_early', '同数先D', 'たちつて'),
      makeItem(5, 'tie_late', '同数後E', 'なにぬね'),
      makeItem(6, 'frequent', '多発話C', 'すせ'),
    ];

    const groups = groupBySpeaker(items);
    expect(groups.map((g) => ({ key: g.key, count: g.count, charCount: g.charCount, externalUrl: g.externalUrl }))).toEqual([
      // count: 2 が最優先
      { key: 'frequent', count: 2, charCount: 4, externalUrl: 'https://example.org/c' },
      // count: 1 同士は charCount 降順（5文字 → 4文字 → 1文字）
      { key: 'long_second', count: 1, charCount: 5, externalUrl: undefined },
      // count: 1, charCount: 4 同士は初出順（n=4 → n=5）
      { key: 'tie_early', count: 1, charCount: 4, externalUrl: undefined },
      { key: 'tie_late', count: 1, charCount: 4, externalUrl: undefined },
      { key: 'short_first', count: 1, charCount: 1, externalUrl: undefined },
    ]);
  });
});

describe('extractLineDialogues', () => {
  it('<sp> / <said> が無い場合でも <seg>・<l>・<p> から LINE 風対話メッセージを構築する', () => {
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
                          attrs: { 'xml:id': '蒋洲' },
                          children: [
                            { tag: 'persName', children: ['蒋洲'] },
                            { tag: 'note', attrs: { type: 'schema:image' }, children: ['https://example.org/img/shoshu.jpg'] },
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
                  tag: 'div',
                  attrs: { type: '釈文' },
                  children: [
                    {
                      tag: 'p',
                      children: [
                        { tag: 'persName', attrs: { corresp: '#蒋洲' }, children: ['蒋洲'] },
                        'より対馬国主に宛てた咨文。',
                      ],
                    },
                    {
                      tag: 'lg',
                      children: [
                        { tag: 'l', children: ['かぎりなく遠くも来にけるかな'] },
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

    const items = extractLineDialogues(doc);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      speakerKey: '蒋洲',
      speakerLabel: '蒋洲',
      speakerImage: 'https://example.org/img/shoshu.jpg',
      stage: '釈文',
    });
    expect(items[1]).toMatchObject({
      speakerKey: '蒋洲',
      speakerLabel: '蒋洲',
      text: 'かぎりなく遠くも来にけるかな',
      stage: '釈文',
    });
  });
});
