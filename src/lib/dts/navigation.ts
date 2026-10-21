// Navigation の応答（引用できる単位の一覧）を、画面で使う形にする。
import { isRecord, num, str } from './json';

export interface CitableUnit {
  /** ref に渡す値 */
  identifier: string;
  level: number;
  parent: string | null;
  citeType?: string;
  /** 画面に出す名前（応答に title があればそれ、無ければ identifier） */
  label: string;
}

export interface UnitNode extends CitableUnit {
  children: UnitNode[];
}

export function parseNavigation(json: unknown): CitableUnit[] {
  if (!isRecord(json)) return [];
  const rawMember = json.member ?? json['hydra:member'];
  const list = Array.isArray(rawMember) ? rawMember : isRecord(rawMember) ? [rawMember] : [];
  if (!list.length) return [];
  const fallbackLevel = num(json.level) ?? num(json['dts:level']) ?? 1;
  const fallbackCiteType = str(json.citeType) ?? str(json['dts:citeType']);
  const out: CitableUnit[] = [];
  for (const m of list) {
    if (!isRecord(m)) continue;
    const identifier = str(m.identifier) ?? str(m.ref) ?? str(m['dts:ref']);
    if (identifier === undefined) continue;
    out.push({
      identifier,
      level: num(m.level) ?? fallbackLevel,
      parent: str(m.parent) ?? null,
      citeType: str(m.citeType) ?? fallbackCiteType,
      label: str(m.title) ?? identifier,
    });
  }
  return out;
}

/** 平らな一覧を、parent をたどって入れ子にする。親が一覧に無い単位は根に置く */
export function buildTree(units: CitableUnit[]): UnitNode[] {
  const byId = new Map<string, UnitNode>();
  for (const u of units) byId.set(u.identifier, { ...u, children: [] });
  const roots: UnitNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent === null ? undefined : byId.get(node.parent);
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** 「頁 5」のような短い名前。citeType が無ければ identifier だけ。URL の identifier は末尾だけ見せる */
export function shortLabel(u: CitableUnit): string {
  const id = u.label.startsWith('http') ? (u.label.split('/').filter(Boolean).pop() ?? u.label) : u.label;
  return u.citeType ? `${u.citeType} ${id}` : id;
}
