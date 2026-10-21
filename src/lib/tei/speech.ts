// 本文中の発話（戯曲の <sp> と、青空文庫 TEI などの <said>）と、話者の典拠（listPerson / castList）を読む。
// speech ペインと本文のハイライトが使う。

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const xmlId = (el: Element) => el.getAttribute('xml:id') ?? el.getAttributeNS(XML_NS, 'id') ?? el.getAttribute('id');

export type SpeechKind = 'sp' | 'said' | 'seg';

export const SPEECH_TAGS = ['sp', 'said'] as const;

export interface SpeechItem {
  /** 本文中の出現順（1 から） */
  n: number;
  /** 本文の要素と一覧を結ぶ id（xml:id、無ければ speechId(n)） */
  id: string;
  kind: SpeechKind;
  /** 集計用のキー（参照先の id、speaker 表記、または '__unknown__'） */
  speakerKey: string;
  /** 表示用の話者名（典拠または <speaker>、不明なら空文字） */
  speakerLabel: string;
  /** 要素上の生の話者指定（@who や <speaker> の文字列、無ければ null） */
  rawSpeaker: string | null;
  /** 発話本文（<sp> では <speaker> と <stage> を除いた文字列） */
  text: string;
  /** <sp> 内のト書き（<stage>） */
  stage?: string;
  /** 空白を除いた発話文字数 */
  charCount: number;
  /** 外部 URI（要素の属性または典拠から解決できたとき） */
  externalUrl?: string;
  /** 典拠のアイコン画像（<note type="schema:image"> 等） */
  speakerImage?: string;
}

export interface SpeakerGroup {
  key: string;
  label: string;
  rawWho: string | null;
  count: number;
  charCount: number;
  externalUrl?: string;
  image?: string;
  items: SpeechItem[];
}

function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** xml:id の無い発話要素に付ける id */
export function speechId(n: number): string {
  return `awase-speech-${n}`;
}

/** 本文として描く範囲の <sp>・<said> 要素（文書の順）。render.ts の renderTeiText と同じ範囲を見る */
export function textSpeeches(tei: Document): Element[] {
  const root = tei.documentElement;
  if (!root) return [];
  const texts = Array.from(root.getElementsByTagNameNS('*', 'text')).filter((t) => !t.parentElement?.closest('text'));
  const scopes = texts.length ? texts : [root];
  const out: Element[] = [];
  for (const scope of scopes) {
    const candidates = [scope, ...Array.from(scope.getElementsByTagNameNS('*', '*'))];
    for (const el of candidates) {
      if (!texts.length && el.closest('teiHeader, facsimile, standOff')) continue;
      if (el.localName !== 'sp' && el.localName !== 'said') continue;
      out.push(el);
    }
  }
  return out;
}

const HTTP_RE = /^https?:\/\//i;

interface SpeakerAuthority {
  label: string;
  externalUrl?: string;
  image?: string;
  description?: string;
}

function ownTextWithoutMeta(el: Element): string {
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

function firstHttpInAttrs(el: Element, attrs: readonly string[]): string | undefined {
  for (const attr of attrs) {
    const raw = el.getAttribute(attr);
    if (!raw) continue;
    for (const token of raw.trim().split(/\s+/)) {
      if (HTTP_RE.test(token)) return token;
    }
  }
  return undefined;
}

/**
 * teiHeader / standOff の <listPerson><person> と、本文・前付の <castList><castItem><role> から
 * xml:id ごとの話者名と外部 URI を引く
 */
function readSpeakerAuthorities(tei: Document): Map<string, SpeakerAuthority> {
  const map = new Map<string, SpeakerAuthority>();
  const root = tei.documentElement;
  if (!root) return map;

  for (const person of Array.from(root.getElementsByTagNameNS('*', 'person'))) {
    const id = xmlId(person);
    if (!id) continue;
    const children = Array.from(person.children);
    const nameEl =
      children.find((c) => c.localName === 'persName' || c.localName === 'label') ??
      person.getElementsByTagNameNS('*', 'persName')[0];
    const label = (nameEl ? ownTextWithoutMeta(nameEl) : '') || ownTextWithoutMeta(person) || id;
    let externalUrl = firstHttpInAttrs(person, ['sameAs', 'corresp', 'ref']);
    let image: string | undefined;
    const descriptions: string[] = [];
    for (const c of children) {
      if (c.localName === 'idno' && !externalUrl) {
        const val = clean(c.textContent);
        if (HTTP_RE.test(val)) externalUrl = val;
      } else if (c.localName === 'occupation' || c.localName === 'roleName') {
        const val = ownTextWithoutMeta(c);
        if (val) descriptions.push(val);
      } else if (c.localName === 'note') {
        const noteType = clean(c.getAttribute('type')).toLowerCase();
        const val = clean(c.textContent);
        if (!val) continue;
        if (noteType === 'schema:url' && !externalUrl && HTTP_RE.test(val)) {
          externalUrl = val;
        } else if (noteType === 'schema:image' && !image && HTTP_RE.test(val)) {
          image = val;
        } else if (noteType === 'schema:description' || !noteType) {
          if (!HTTP_RE.test(val)) descriptions.push(val);
        }
      } else if (c.localName === 'graphic' && !image) {
        const u = clean(c.getAttribute('url'));
        if (HTTP_RE.test(u)) image = u;
      }
    }
    const description = descriptions.length > 0 ? descriptions.join(' ') : undefined;
    map.set(id, {
      label,
      ...(externalUrl ? { externalUrl } : {}),
      ...(image ? { image } : {}),
      ...(description ? { description } : {}),
    });
  }

  for (const role of Array.from(root.getElementsByTagNameNS('*', 'role'))) {
    const parentCastItem = role.parentElement?.localName === 'castItem' ? role.parentElement : null;
    const id = xmlId(role) ?? (parentCastItem ? xmlId(parentCastItem) : null);
    if (!id || map.has(id)) continue;
    const roleDesc = parentCastItem
      ? Array.from(parentCastItem.children).find((c) => c.localName === 'roleDesc')
      : undefined;
    const label = clean(role.textContent) || clean(roleDesc?.textContent) || id;
    const externalUrl =
      firstHttpInAttrs(role, ['sameAs', 'corresp', 'ref']) ??
      (parentCastItem ? firstHttpInAttrs(parentCastItem, ['sameAs', 'corresp', 'ref']) : undefined);
    map.set(id, { label, ...(externalUrl ? { externalUrl } : {}) });
  }

  return map;
}

const SP_TEXT_BLOCKS = new Set(['p', 'l', 'lg', 'ab', 'seg']);

function extractSpTextAndStage(sp: Element): { text: string; stage?: string } {
  const stages: string[] = [];
  let textOut = '';

  const walkText = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3 || child.nodeType === 4) {
        textOut += child.nodeValue ?? '';
      } else if (child.nodeType === 1) {
        const childEl = child as Element;
        const tag = childEl.localName;
        if (tag === 'speaker' || tag === 'rt' || tag === 'rp') continue;
        if (tag === 'span') {
          const st = childEl.getAttribute('type');
          if (st === 'rt' || st === 'rp') continue;
        }
        if (tag === 'stage') {
          const st = ownTextWithoutMeta(childEl);
          if (st) stages.push(st);
          continue;
        }
        walkText(childEl);
        if (SP_TEXT_BLOCKS.has(tag)) {
          textOut += ' ';
        }
      }
    }
  };

  walkText(sp);
  const text = clean(textOut);
  const stage = stages.length > 0 ? stages.join(' ') : undefined;
  return { text, ...(stage ? { stage } : {}) };
}

function resolveWhoAttr(el: Element): { rawToken: string | null; lookupId: string | null; directUrl?: string } {
  for (const attr of ['who', 'corresp', 'ref']) {
    const raw = el.getAttribute(attr);
    if (!raw) continue;
    for (const token of raw.trim().split(/\s+/)) {
      if (!token || token === '#') continue;
      if (HTTP_RE.test(token)) {
        return { rawToken: token, lookupId: token, directUrl: token };
      }
      const hashIdx = token.indexOf('#');
      if (hashIdx >= 0) {
        const frag = token.slice(hashIdx + 1);
        if (frag) return { rawToken: token, lookupId: frag };
        continue;
      }
      return { rawToken: token, lookupId: token };
    }
  }
  return { rawToken: null, lookupId: null };
}

/** 本文中の <sp>・<said> から発話一覧を取り出す */
export function extractSpeeches(tei: Document): SpeechItem[] {
  const authorities = readSpeakerAuthorities(tei);
  return textSpeeches(tei).map((el, i) => {
    const n = i + 1;
    const id = xmlId(el) || speechId(n);
    const kind: SpeechKind = el.localName === 'sp' ? 'sp' : 'said';

    const { rawToken, lookupId, directUrl } = resolveWhoAttr(el);
    const speakerChildren = kind === 'sp' ? Array.from(el.children).filter((c) => c.localName === 'speaker') : [];
    const speakerText = clean(speakerChildren.map((c) => c.textContent ?? '').join(' ')) || null;

    let speakerKey: string;
    let speakerLabel: string;
    let rawSpeaker: string | null;
    let externalUrl: string | undefined;
    let speakerImage: string | undefined;

    if (lookupId) {
      const auth = authorities.get(lookupId);
      speakerKey = lookupId;
      speakerLabel = auth?.label || speakerText || lookupId;
      rawSpeaker = rawToken ?? speakerText;
      externalUrl = auth?.externalUrl ?? directUrl;
      speakerImage = auth?.image;
    } else if (speakerText) {
      const auth = authorities.get(speakerText);
      speakerKey = speakerText;
      speakerLabel = auth?.label || speakerText;
      rawSpeaker = speakerText;
      externalUrl = auth?.externalUrl;
      speakerImage = auth?.image;
    } else {
      speakerKey = '__unknown__';
      speakerLabel = '';
      rawSpeaker = null;
    }

    const { text, stage } =
      kind === 'sp' ? extractSpTextAndStage(el) : { text: ownTextWithoutMeta(el), stage: undefined };
    const charCount = text.replace(/\s+/g, '').length;

    return {
      n,
      id,
      kind,
      speakerKey,
      speakerLabel,
      rawSpeaker,
      text,
      ...(stage ? { stage } : {}),
      charCount,
      ...(externalUrl ? { externalUrl } : {}),
      ...(speakerImage ? { speakerImage } : {}),
    };
  });
}

/**
 * LINE 風対話ビュー用の発話・セグメント一覧を取り出す。
 * - <sp>・<said> があればそれをそのまま返す。
 * - 無ければ、本文の <seg>・<l>・<ab>・<p> を順に拾い、その中の <persName>（無ければ文書全体の最初の人物や題名）を話者として割り当てる。
 *   これにより『校異源氏物語』（<seg>・<l>）や『蒋洲咨文』（<seg>・<persName>）でも LINE 風チャット形式で閲覧できる。
 */
export function extractLineDialogues(tei: Document): SpeechItem[] {
  const direct = extractSpeeches(tei);
  if (direct.length > 0) return direct;

  const authorities = readSpeakerAuthorities(tei);
  const root = tei.documentElement;
  if (!root) return [];

  const defaultNarrator = '語り手';

  const texts = Array.from(root.getElementsByTagNameNS('*', 'text')).filter((t) => !t.parentElement?.closest('text'));
  const scopes = texts.length ? texts : [root];

  const blocks: Element[] = [];
  for (const scope of scopes) {
    const found = Array.from(scope.getElementsByTagNameNS('*', '*')).filter((el) => {
      if (el.closest('teiHeader, facsimile, standOff, note, back')) return false;
      const tag = el.localName;
      if (tag === 'seg' || tag === 'l') {
        return !el.parentElement?.closest('seg, l');
      }
      if (tag === 'p' || tag === 'ab') {
        if (el.parentElement?.closest('p, ab, seg, l')) return false;
        const hasInnerSegOrL =
          el.getElementsByTagNameNS('*', 'seg').length > 0 || el.getElementsByTagNameNS('*', 'l').length > 0;
        return !hasInnerSegOrL;
      }
      return false;
    });
    blocks.push(...found);
  }

  const out: SpeechItem[] = [];
  let currentSpeakerKey = '__narrator__';
  let currentSpeakerLabel = defaultNarrator;
  let currentSpeakerImage: string | undefined;
  let currentExternalUrl: string | undefined;

  // listPerson の先頭に人物がいれば（書簡・咨文の差出人など）、初期話者にする
  const firstAuth = authorities.entries().next().value as [string, SpeakerAuthority] | undefined;
  if (firstAuth) {
    currentSpeakerKey = firstAuth[0];
    currentSpeakerLabel = firstAuth[1].label;
    currentSpeakerImage = firstAuth[1].image;
    currentExternalUrl = firstAuth[1].externalUrl;
  }

  for (const el of blocks) {
    // 要素内の note は本文から除く
    let text = '';
    const walk = (node: Node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3 || child.nodeType === 4) {
          text += child.nodeValue ?? '';
        } else if (child.nodeType === 1) {
          const childEl = child as Element;
          const tag = childEl.localName;
          if (tag === 'note' || tag === 'rt' || tag === 'rp') continue;
          if (tag === 'span') {
            const st = childEl.getAttribute('type');
            if (st === 'rt' || st === 'rp') continue;
          }
          walk(child);
        }
      }
    };
    walk(el);
    text = clean(text);
    if (!text) continue;

    const persEl = el.getElementsByTagNameNS('*', 'persName')[0];
    if (persEl) {
      const { lookupId, directUrl } = resolveWhoAttr(persEl);
      const pText = clean(persEl.textContent);
      if (lookupId && authorities.has(lookupId)) {
        const auth = authorities.get(lookupId)!;
        currentSpeakerKey = lookupId;
        currentSpeakerLabel = auth.label;
        currentSpeakerImage = auth.image;
        currentExternalUrl = auth.externalUrl ?? directUrl;
      } else if (pText) {
        const auth = authorities.get(pText);
        currentSpeakerKey = lookupId || pText;
        currentSpeakerLabel = auth?.label || pText;
        currentSpeakerImage = auth?.image;
        currentExternalUrl = auth?.externalUrl ?? directUrl;
      }
    }

    const isVerse = el.localName === 'l' || Boolean(el.closest('lg'));
    const speakerKey = isVerse && currentSpeakerKey === '__narrator__' ? '__verse__' : currentSpeakerKey;
    const speakerLabel = isVerse && currentSpeakerKey === '__narrator__' ? '和歌' : currentSpeakerLabel;

    const n = out.length + 1;
    const id = xmlId(el) || speechId(n);
    let divType: string | undefined;
    for (let cur = el.parentElement; cur; cur = cur.parentElement) {
      if (cur.localName === 'div') {
        const t = cur.getAttribute('type');
        if (t) {
          divType = t;
          break;
        }
      }
    }
    const stage =
      divType === 'original' || divType === '釈文'
        ? '釈文'
        : divType === 'yomikudashi' || divType === '読み下し'
          ? '読み下し'
          : divType === 'japanese' || divType === '現代語訳'
            ? '現代語訳'
            : isVerse
              ? '和歌'
              : undefined;

    out.push({
      n,
      id,
      kind: 'seg',
      speakerKey,
      speakerLabel,
      rawSpeaker: speakerKey,
      text,
      ...(stage ? { stage } : {}),
      charCount: text.replace(/\s+/g, '').length,
      ...(currentExternalUrl ? { externalUrl: currentExternalUrl } : {}),
      ...(currentSpeakerImage ? { speakerImage: currentSpeakerImage } : {}),
    });
  }

  return out;
}

/** 発話一覧を話者ごとに集計し、発話数降順 → 文字数降順 → 初出順で並べる */
export function groupBySpeaker(items: SpeechItem[]): SpeakerGroup[] {
  const map = new Map<string, SpeakerGroup>();

  for (const item of items) {
    const existing = map.get(item.speakerKey);
    if (existing) {
      existing.count += 1;
      existing.charCount += item.charCount;
      if (!existing.label && item.speakerLabel) existing.label = item.speakerLabel;
      if (!existing.rawWho && item.rawSpeaker) existing.rawWho = item.rawSpeaker;
      if (!existing.externalUrl && item.externalUrl) existing.externalUrl = item.externalUrl;
      if (!existing.image && item.speakerImage) existing.image = item.speakerImage;
      existing.items.push(item);
    } else {
      map.set(item.speakerKey, {
        key: item.speakerKey,
        label: item.speakerLabel,
        rawWho: item.rawSpeaker,
        count: 1,
        charCount: item.charCount,
        ...(item.externalUrl ? { externalUrl: item.externalUrl } : {}),
        ...(item.speakerImage ? { image: item.speakerImage } : {}),
        items: [item],
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) =>
      b.count - a.count ||
      b.charCount - a.charCount ||
      (a.items[0]?.n ?? 0) - (b.items[0]?.n ?? 0),
  );
}
