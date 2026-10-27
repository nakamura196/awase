// Collection の応答（コレクションか資料）を、画面で使う形にする。
import { isRecord, num, str } from './json';

export interface DcValue {
  value: string;
  lang?: string;
}

export interface DcField {
  /** creator, title, license など */
  name: string;
  values: DcValue[];
}

export interface CitationTree {
  /** tree に渡す値。既定の引用構造には無い */
  identifier?: string;
  description?: string;
  /** "page > line" のような文字列 */
  chain: string;
}

export interface DtsNode {
  id: string;
  /** "Collection" か "Resource" */
  type: string;
  title: string;
  description?: string;
  totalChildren: number;
  dublinCore: DcField[];
  /** 自分を開く URI テンプレート（Collection の窓口） */
  collection?: string;
  navigation?: string;
  document?: string;
  /** 引用構造（複数あれば tree で選ぶ） */
  citationTrees: CitationTree[];
}

export interface DtsCollection extends DtsNode {
  members: DtsNode[];
  /** 親（nav=parents で返ってくることがある） */
  parents: DtsNode[];
}

// 値は 文字列・文字列の配列・{lang,value}・その配列 のどれかで来る
function dcValues(v: unknown): DcValue[] {
  const list = Array.isArray(v) ? v : [v];
  const out: DcValue[] = [];
  for (const item of list) {
    if (typeof item === 'string' && item) out.push({ value: item });
    else if (typeof item === 'number') out.push({ value: String(item) });
    else if (isRecord(item) && str(item.value)) out.push({ value: item.value as string, lang: str(item.lang) });
  }
  return out;
}

/** dublinCore の中身を、項目名ごとの値の並びにする（空の項目は除く） */
export function parseDublinCore(v: unknown): DcField[] {
  if (!isRecord(v)) return [];
  const out: DcField[] = [];
  for (const [name, raw] of Object.entries(v)) {
    const values = dcValues(raw);
    if (values.length) out.push({ name, values });
  }
  return out;
}

// citeStructure を "page > line" のように一本の文字列にする（枝分かれは最初の枝）
function citeChain(structure: unknown): string[] {
  const chain: string[] = [];
  let cur: unknown = Array.isArray(structure) ? structure[0] : structure;
  while (isRecord(cur)) {
    const t = str(cur.citeType);
    if (t) chain.push(t);
    cur = Array.isArray(cur.citeStructure) ? cur.citeStructure[0] : undefined;
  }
  return chain;
}

function citationTrees(v: unknown): CitationTree[] {
  if (!Array.isArray(v)) return [];
  const out: CitationTree[] = [];
  for (const tree of v) {
    if (!isRecord(tree)) continue;
    const chain = citeChain(tree.citeStructure).join(' > ');
    if (!chain) continue;
    out.push({ identifier: str(tree.identifier), description: str(tree.description), chain });
  }
  return out;
}

/** Navigation の応答なら、その資料（resource）と、選ばれていた引用構造（tree）を返す */
export function parseNavigationResource(json: unknown, url: string): { resource: DtsNode; tree?: string } | null {
  if (!isRecord(json) || str(json['@type']) !== 'Navigation') return null;
  const resource = parseNode(json.resource);
  if (!resource) return null;
  let tree: string | undefined;
  try {
    tree = new URL(url).searchParams.get('tree') || undefined;
  } catch {
    tree = undefined;
  }
  return { resource, tree };
}

export function parseNode(json: unknown): DtsNode | null {
  if (!isRecord(json)) return null;
  const id = str(json['@id']);
  if (!id) return null;
  const dublinCore = parseDublinCore(json.dublinCore);
  const dcTitle = dublinCore.find((f) => f.name === 'title')?.values[0]?.value;
  return {
    id,
    type: str(json['@type']) ?? 'Collection',
    title: str(json.title) ?? dcTitle ?? id,
    description: str(json.description),
    totalChildren: num(json.totalChildren) ?? num(json.totalItems) ?? 0,
    dublinCore,
    collection: str(json.collection),
    navigation: str(json.navigation) ?? str(json['dts:references']),
    document: str(json.document) ?? str(json['dts:passage']),
    citationTrees: citationTrees(json.citationTrees),
  };
}

/** Collection の応答を読む。形が違えば null */
export function parseCollection(json: unknown): DtsCollection | null {
  const node = parseNode(json);
  if (!node || !isRecord(json)) return null;
  const nodes = (v: unknown) =>
    (Array.isArray(v) ? v : []).map(parseNode).filter((n): n is DtsNode => n !== null);
  return { ...node, members: nodes(json.member), parents: nodes(json.parent) };
}
