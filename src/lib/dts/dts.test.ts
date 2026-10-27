import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseEntry } from './entry';
import { parseCollection, parseDublinCore, parseNavigationResource } from './collection';
import { buildTree, parseNavigation, shortLabel } from './navigation';
import { collectionUrl, documentUrl, navigationUrl, nodeTarget } from './urls';
import { looksLikeUrl, resolveUrl } from './url';
import { nextPage } from './json';

// 実際の応答（https://dts.ldas.jp/api/v2/dts、2026-10-20）を短くしたもの
const load = (name: string): unknown => JSON.parse(readFileSync(path.join(__dirname, 'fixtures', `${name}.json`), 'utf-8'));
const ENTRY_URL = 'https://dts.ldas.jp/api/v2/dts';

describe('parseEntry', () => {
  it('三つの窓口のテンプレートを取る', () => {
    const e = parseEntry(load('entry'));
    expect(e?.version).toBe('1.0');
    expect(e?.collection).toBe('/api/v2/dts/collection{?id,page,nav}');
    expect(e?.navigation).toContain('navigation{?resource');
    expect(e?.document).toContain('document{?resource');
  });
  it('入口でないものは null', () => {
    expect(parseEntry({ foo: 1 })).toBeNull();
    expect(parseEntry('x')).toBeNull();
  });
  it('古い書き方（collections / documents）も受ける', () => {
    expect(parseEntry({ collections: '/c', documents: '/d' })).toMatchObject({ collection: '/c', document: '/d' });
  });
});

describe('parseCollection', () => {
  it('根のコレクションと子', () => {
    const c = parseCollection(load('collection-root'));
    expect(c?.title).toBe('校異源氏物語テキストDB');
    expect(c?.totalChildren).toBe(54);
    expect(c?.members).toHaveLength(3);
    expect(c?.members[0]).toMatchObject({ id: 'urn:kouigenjimonogatari.1', type: 'Resource', title: '桐壺' });
  });
  it('資料は navigation / document / 引用構造を持つ', () => {
    const r = parseCollection(load('resource'));
    expect(r?.type).toBe('Resource');
    expect(r?.navigation).toContain('navigation?resource=urn:kouigenjimonogatari.1');
    expect(r?.citationTrees.map((c) => [c.identifier, c.chain])).toEqual([
      [undefined, 'page > line'],
      ['waka', 'waka > ku'],
    ]);
  });
  it('Dublin Core の値は {lang,value} も文字列も読む', () => {
    const f = parseDublinCore({ creator: ['裏源氏勉強会'], title: [{ lang: 'ja', value: '桐壺' }], x: [], y: 3 });
    expect(f).toEqual([
      { name: 'creator', values: [{ value: '裏源氏勉強会' }] },
      { name: 'title', values: [{ value: '桐壺', lang: 'ja' }] },
      { name: 'y', values: [{ value: '3' }] },
    ]);
  });
  it('@id が無ければ null', () => {
    expect(parseCollection({ title: 'x' })).toBeNull();
  });
});

describe('navigation', () => {
  it('単位を読み、parent で入れ子にする', () => {
    const units = parseNavigation(load('navigation-ref'));
    expect(units.map((u) => u.level)).toEqual([1, 2, 2, 2]);
    const tree = buildTree(units);
    expect(tree).toHaveLength(1);
    expect(tree[0].identifier).toBe('5');
    expect(tree[0].children).toHaveLength(3);
  });
  it('親が一覧に無い単位は根に置く', () => {
    const tree = buildTree([{ identifier: 'b', level: 2, parent: 'a', label: 'b' }]);
    expect(tree.map((n) => n.identifier)).toEqual(['b']);
  });
  it('短い名前は citeType と、URL なら末尾', () => {
    expect(shortLabel({ identifier: '5', level: 1, parent: null, citeType: 'page', label: '5' })).toBe('page 5');
    expect(
      shortLabel({ identifier: 'https://e.org/items/0005-01.json', level: 2, parent: '5', citeType: 'line', label: 'https://e.org/items/0005-01.json' }),
    ).toBe('line 0005-01.json');
  });
  it('応答が壊れていれば空', () => {
    expect(parseNavigation({ member: 'x' })).toEqual([]);
    expect(parseNavigation(null)).toEqual([]);
  });
});

describe('URL の組み立て', () => {
  const entry = parseEntry(load('entry'))!;
  it('url を書かなければ根のコレクション', () => {
    expect(collectionUrl(entry, ENTRY_URL, null)).toBe('https://dts.ldas.jp/api/v2/dts/collection');
  });
  it('入口のテンプレート（resource が変数）でも展開できる', () => {
    expect(navigationUrl(entry.navigation, ENTRY_URL, 'urn:a.1', '5')).toBe(
      'https://dts.ldas.jp/api/v2/dts/navigation?resource=urn%3Aa.1&ref=5&down=1',
    );
  });
  it('url が id ならテンプレートに入れる', () => {
    expect(collectionUrl(entry, ENTRY_URL, 'urn:a.1', '2')).toBe('https://dts.ldas.jp/api/v2/dts/collection?id=urn%3Aa.1&page=2');
  });
  it('url が URL ならそのまま（相対なら入口から見た絶対に）', () => {
    expect(collectionUrl(entry, ENTRY_URL, 'https://x.org/c?id=1', undefined)).toBe('https://x.org/c?id=1');
    expect(collectionUrl(entry, ENTRY_URL, '/api/v2/dts/collection?id=1')).toBe('https://dts.ldas.jp/api/v2/dts/collection?id=1');
  });
  // 資料の窓口のテンプレートは resource が書き込み済み。入口のテンプレート（{?resource,…}）でも同じ形になる
  it('資料の Navigation と本文の URL', () => {
    const r = parseCollection(load('resource'))!;
    expect(navigationUrl(r.navigation!, ENTRY_URL, r.id)).toBe(
      'https://dts.ldas.jp/api/v2/dts/navigation?resource=urn:kouigenjimonogatari.1&down=1',
    );
    expect(navigationUrl(r.navigation!, ENTRY_URL, r.id, 'https://e.org/a.json')).toContain('&ref=https%3A%2F%2Fe.org%2Fa.json&down=1');
    expect(documentUrl(r.document!, ENTRY_URL, r.id)).toBe('https://dts.ldas.jp/api/v2/dts/document?resource=urn:kouigenjimonogatari.1');
    expect(documentUrl(r.document!, ENTRY_URL, r.id, '5')).toBe('https://dts.ldas.jp/api/v2/dts/document?resource=urn:kouigenjimonogatari.1&ref=5');
  });
  it('引用構造（tree）と mediaType を URL に入れる', () => {
    const r = parseCollection(load('resource'))!;
    expect(navigationUrl(r.navigation!, ENTRY_URL, r.id, undefined, 'waka')).toBe(
      'https://dts.ldas.jp/api/v2/dts/navigation?resource=urn:kouigenjimonogatari.1&down=1&tree=waka',
    );
    expect(documentUrl(r.document!, ENTRY_URL, r.id, 'waka-001', 'waka', 'application/xml')).toBe(
      'https://dts.ldas.jp/api/v2/dts/document?resource=urn:kouigenjimonogatari.1&ref=waka-001&tree=waka&mediaType=application%2Fxml',
    );
  });
  it('Navigation の応答から、資料と tree を取り出す', () => {
    const url = 'https://dts.ldas.jp/api/v2/dts/navigation?resource=urn:kouigenjimonogatari.1&down=1&tree=waka';
    const got = parseNavigationResource(load('navigation-top'), url);
    expect(got?.resource.id).toBe('urn:kouigenjimonogatari.1');
    expect(got?.tree).toBe('waka');
    expect(nodeTarget(got!.resource, ENTRY_URL)).toBe('https://dts.ldas.jp/api/v2/dts/collection?id=urn:kouigenjimonogatari.1');
    expect(parseNavigationResource(load('resource'), url)).toBeNull();
  });
  it('画面の url に書く値は、窓口を展開した絶対 URL', () => {
    const c = parseCollection(load('collection-root'))!;
    expect(nodeTarget(c.members[0], ENTRY_URL)).toBe('https://dts.ldas.jp/api/v2/dts/collection?id=urn:kouigenjimonogatari.1');
    expect(nodeTarget({ id: 'urn:z' }, ENTRY_URL)).toBe('urn:z');
  });
  it('looksLikeUrl / resolveUrl / nextPage', () => {
    expect(looksLikeUrl('https://a')).toBe(true);
    expect(looksLikeUrl('/a')).toBe(true);
    expect(looksLikeUrl('urn:a')).toBe(false);
    expect(resolveUrl('/x?y=1', 'https://a.org/b/c')).toBe('https://a.org/x?y=1');
    expect(nextPage({ view: { next: '/c?page=2' } })).toBe('/c?page=2');
    expect(nextPage({})).toBeUndefined();
  });
});
