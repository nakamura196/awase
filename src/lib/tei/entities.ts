// 本文中の固有表現（人名・地名・組織名・日付）と、ヘッダーの典拠（listPerson / listPlace / listOrg）を読む。
// entities ペインと本文のハイライトが使う。

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const xmlId = (el: Element) => el.getAttribute('xml:id') ?? el.getAttributeNS(XML_NS, 'id');

export type EntityKind = 'persName' | 'placeName' | 'orgName' | 'date';

export const ENTITY_KINDS: readonly EntityKind[] = ['persName', 'placeName', 'orgName', 'date'] as const;

export const ENTITY_TAGS = ['persName', 'placeName', 'orgName', 'rs', 'name', 'date'] as const;

export interface EntityMention {
  /** 本文中の出現順（1 から） */
  n: number;
  /** 本文の要素と一覧を結ぶ id（xml:id、無ければ entityId(n)） */
  id: string;
  kind: EntityKind;
  /** 本文の表記（空白を整えた文字列） */
  text: string;
  /** 集計用のキー（kind + 参照先または表記） */
  key: string;
  /** 外部 URI（要素の属性またはヘッダーの典拠から解決できたとき） */
  ref: string | null;
  /** date の正規化値（@when / @from / @notBefore） */
  when: string | null;
}

export interface EntityVariant {
  /** 本文中の呼称（表記） */
  text: string;
  /** この呼称での出現回数 */
  count: number;
  /** 最初に現れた出現順（1 から） */
  firstN: number;
  /** この呼称の mention id 一覧 */
  mentionIds: string[];
}

export interface EntityGroup {
  key: string;
  kind: EntityKind;
  /** 見出し（典拠の標準名があればそれ、無ければ最初の出現の表記） */
  label: string;
  ref: string | null;
  /** 典拠の解説（<note type="schema:description">・<note>・<trait>・<occupation> 等） */
  description?: string;
  /** 典拠のサムネイル画像（<note type="schema:image">・<graphic url> 等） */
  image?: string;
  mentions: EntityMention[];
  /** 呼称（表記揺れ・呼び名の変化）ごとの内訳（回数降順 → 初出順） */
  variants: EntityVariant[];
}

function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** xml:id の無い固有表現要素に付ける id */
export function entityId(n: number): string {
  return `awase-entity-${n}`;
}

/** 要素が固有表現ならその種別、そうでなければ null */
export function entityKindOf(el: Element): EntityKind | null {
  switch (el.localName) {
    case 'persName':
      return 'persName';
    case 'placeName':
      return 'placeName';
    case 'orgName':
      return 'orgName';
    case 'date':
      return 'date';
    case 'rs':
    case 'name': {
      const t = el.getAttribute('type')?.trim().toLowerCase();
      if (t === 'place' || t === 'placename' || t === 'geog') return 'placeName';
      if (t === 'org' || t === 'orgname') return 'orgName';
      if (t === 'date' || t === 'time') return 'date';
      return 'persName';
    }
    default:
      return null;
  }
}

/** 本文として描く範囲の固有表現要素（文書の順）。render.ts の renderTeiText と同じ範囲を見る */
export function textEntities(tei: Document): Element[] {
  const root = tei.documentElement;
  const texts = Array.from(root.getElementsByTagNameNS('*', 'text')).filter((t) => !t.parentElement?.closest('text'));
  const scopes = texts.length ? texts : [root];
  const out: Element[] = [];
  for (const scope of scopes) {
    const candidates = [scope, ...Array.from(scope.getElementsByTagNameNS('*', '*'))];
    for (const el of candidates) {
      if (el.closest('teiHeader, facsimile, standOff, listPerson, listPlace, listOrg, note')) continue;
      if (!entityKindOf(el)) continue;
      if (!clean(el.textContent)) continue;
      out.push(el);
    }
  }
  return out;
}

const HTTP_RE = /^https?:\/\//i;

/** @ref / @corresp / @key / @nymRef から名寄せ用の識別子と外部リンクを取り出す */
export function normalizeRef(el: Element): { keyId: string | null; href: string | null } {
  for (const attr of ['ref', 'corresp', 'key', 'nymRef']) {
    const raw = el.getAttribute(attr);
    if (!raw) continue;
    for (const token of raw.trim().split(/\s+/)) {
      if (!token || token === '#') continue;
      if (HTTP_RE.test(token)) {
        return { keyId: token, href: token };
      }
      const hashIdx = token.indexOf('#');
      if (hashIdx >= 0) {
        const frag = token.slice(hashIdx);
        if (frag.length > 1) return { keyId: frag, href: null };
        continue;
      }
      return { keyId: token, href: null };
    }
  }
  return { keyId: null, href: null };
}

interface AuthorityEntry {
  kind: EntityKind;
  label: string;
  href: string | null;
  description?: string;
  image?: string;
}

function ownTextWithoutNotes(el: Element): string {
  let out = '';
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3 || child.nodeType === 4) {
        out += child.nodeValue ?? '';
      } else if (child.nodeType === 1) {
        const childEl = child as Element;
        const tag = childEl.localName;
        if (tag === 'note' || tag === 'bibl' || tag === 'idno' || tag === 'rt' || tag === 'rp') continue;
        if (tag === 'span') {
          const st = childEl.getAttribute('type');
          if (st === 'rt' || st === 'rp') continue;
        }
        walk(child);
      }
    }
  };
  walk(el);
  return clean(out);
}

function firstHttpInAttrs(el: Element, attrs: readonly string[]): string | null {
  for (const attr of attrs) {
    const raw = el.getAttribute(attr);
    if (!raw) continue;
    for (const token of raw.trim().split(/\s+/)) {
      if (HTTP_RE.test(token)) return token;
    }
  }
  return null;
}

const TAG_TO_KIND: Record<string, EntityKind> = {
  person: 'persName',
  place: 'placeName',
  org: 'orgName',
};

/** teiHeader / standOff の listPerson・listPlace・listOrg から xml:id ごとの見出し・URI・解説・画像を引く */
function readAuthorities(tei: Document): Map<string, AuthorityEntry> {
  const map = new Map<string, AuthorityEntry>();
  const root = tei.documentElement;
  for (const tag of ['person', 'place', 'org']) {
    const kind = TAG_TO_KIND[tag];
    for (const item of Array.from(root.getElementsByTagNameNS('*', tag))) {
      const id = xmlId(item);
      if (!id) continue;
      const children = Array.from(item.children);
      const labelEl = children.find(
        (c) => c.localName === 'persName' || c.localName === 'placeName' || c.localName === 'orgName' || c.localName === 'label',
      );
      const label = (labelEl ? ownTextWithoutNotes(labelEl) : '') || ownTextWithoutNotes(item) || id;
      let href = firstHttpInAttrs(item, ['sameAs', 'corresp', 'ref']);
      const descriptions: string[] = [];
      let image: string | undefined;

      for (const c of children) {
        if (c.localName === 'idno' && !href) {
          const val = clean(c.textContent);
          if (HTTP_RE.test(val)) href = val;
        } else if (c.localName === 'note') {
          const noteType = clean(c.getAttribute('type')).toLowerCase();
          const val = clean(c.textContent);
          if (!val) continue;
          if (noteType === 'schema:url') {
            if (!href && HTTP_RE.test(val)) href = val;
          } else if (noteType === 'schema:image') {
            if (!image && (HTTP_RE.test(val) || val.startsWith('data:image/') || val.startsWith('/'))) image = val;
          } else if (noteType === 'schema:geo') {
            continue;
          } else if (noteType === 'schema:description' || !noteType) {
            if (!HTTP_RE.test(val) && !val.startsWith('data:image/')) descriptions.push(val);
          }
        } else if (c.localName === 'occupation' || c.localName === 'roleName') {
          const val = ownTextWithoutNotes(c);
          if (val) descriptions.push(val);
        } else if (c.localName === 'graphic' && !image) {
          const u = clean(c.getAttribute('url'));
          if (HTTP_RE.test(u) || u.startsWith('data:image/') || u.startsWith('/')) image = u;
        }
      }
      const description = descriptions.length > 0 ? descriptions.join(' ') : undefined;
      map.set(id, {
        kind,
        label,
        href,
        ...(description ? { description } : {}),
        ...(image ? { image } : {}),
      });
    }
  }
  return map;
}

/** 本文に固有表現または典拠（listPerson・listPlace・listOrg）があるか */
export function hasEntitiesData(tei: Document): boolean {
  if (textEntities(tei).length > 0) return true;
  return readAuthorities(tei).size > 0;
}

/** 本文中の固有表現と、名寄せ・頻度順のグループ一覧を返す */
export function readEntities(tei: Document): { mentions: EntityMention[]; groups: EntityGroup[] } {
  const authorities = readAuthorities(tei);
  const mentions: EntityMention[] = [];
  const groupMap = new Map<string, EntityGroup>();
  const matchedAuthorityIds = new Set<string>();

  textEntities(tei).forEach((el, i) => {
    const n = i + 1;
    const id = xmlId(el) ?? entityId(n);
    const kind = entityKindOf(el)!;
    const text = ownTextWithoutNotes(el) || clean(el.textContent);
    const when =
      clean(el.getAttribute('when')) ||
      clean(el.getAttribute('from')) ||
      clean(el.getAttribute('notBefore')) ||
      null;

    const { keyId, href } = normalizeRef(el);
    const rawLookupId = keyId ? (keyId.startsWith('#') ? keyId.slice(1) : keyId) : null;
    const authority = rawLookupId ? authorities.get(rawLookupId) : undefined;
    if (authority && rawLookupId) matchedAuthorityIds.add(rawLookupId);
    const normalizedKeyId = authority && rawLookupId ? `#${rawLookupId}` : keyId;
    const groupKey = `${kind}:${normalizedKeyId ?? (kind === 'date' && when ? when : text)}`;
    const resolvedHref = href ?? authority?.href ?? null;
    const readableId = rawLookupId && /[ぁ-んァ-ヶー一-龠々]/.test(rawLookupId) ? rawLookupId : null;
    const groupLabel = authority?.label || readableId || text;

    const mention: EntityMention = {
      n,
      id,
      kind,
      text,
      key: groupKey,
      ref: resolvedHref,
      when,
    };
    mentions.push(mention);

    const existing = groupMap.get(groupKey);
    if (existing) {
      if (!existing.ref && resolvedHref) existing.ref = resolvedHref;
      if (!existing.description && authority?.description) existing.description = authority.description;
      if (!existing.image && authority?.image) existing.image = authority.image;
      existing.mentions.push(mention);
    } else {
      groupMap.set(groupKey, {
        key: groupKey,
        kind,
        label: groupLabel,
        ref: resolvedHref,
        ...(authority?.description ? { description: authority.description } : {}),
        ...(authority?.image ? { image: authority.image } : {}),
        mentions: [mention],
        variants: [],
      });
    }
  });

  // 典拠（listPerson・listPlace・listOrg）に解説や外部 URL があるが本文から直接参照されていないものも一覧に出す
  for (const [id, auth] of authorities.entries()) {
    if (matchedAuthorityIds.has(id)) continue;
    if (!auth.description && !auth.href && !auth.image) continue;
    const groupKey = `${auth.kind}:#${id}`;
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        key: groupKey,
        kind: auth.kind,
        label: auth.label,
        ref: auth.href,
        ...(auth.description ? { description: auth.description } : {}),
        ...(auth.image ? { image: auth.image } : {}),
        mentions: [],
        variants: [],
      });
    }
  }

  for (const group of groupMap.values()) {
    const vMap = new Map<string, EntityVariant>();
    for (const m of group.mentions) {
      const surface = m.text || group.label;
      const found = vMap.get(surface);
      if (found) {
        found.count += 1;
        found.mentionIds.push(m.id);
      } else {
        vMap.set(surface, {
          text: surface,
          count: 1,
          firstN: m.n,
          mentionIds: [m.id],
        });
      }
    }
    group.variants = Array.from(vMap.values()).sort((a, b) => b.count - a.count || a.firstN - b.firstN);
  }

  const groups = Array.from(groupMap.values()).sort(
    (a, b) =>
      b.mentions.length - a.mentions.length ||
      (a.mentions[0]?.n ?? Number.MAX_SAFE_INTEGER) - (b.mentions[0]?.n ?? Number.MAX_SAFE_INTEGER),
  );

  return { mentions, groups };
}
