// video-support.vercel.app（電子読書支援システム / 動画閲覧支援システム）のデータ抽出。
// <teiCorpus> / <TEI> の両方に対応し、<timeline><when> と <u start="#t1" end="#t2"> の字幕・映像、
// および一般の TEI（<p>・<ab>・<sp>・<l> 内の <name>・<persName>・<placeName>・<orgName>・<date>・<rs>）から
// 用語カード・結線・10分割出現位置・タイムラインを作る。

import { entityId, readEntities, textEntities } from './entities';

export type SupportCategory = 'person' | 'place' | 'org' | 'keyword' | 'date';

export interface SupportTermRef {
  id: string;
  text: string;
  key: string;
  wikiKey: string;
  category: SupportCategory;
}

export type SupportInlineSegment =
  | { kind: 'text'; text: string }
  | ({ kind: 'term' } & SupportTermRef);

export interface SupportBlock {
  id: string;
  start: number | null;
  end: number | null;
  text: string;
  segments: SupportInlineSegment[];
  terms: SupportTermRef[];
}

export interface SupportTerm {
  key: string;
  label: string;
  wikiKey: string;
  category: SupportCategory;
  count: number;
  /** 文書全体を 0..9 の 10 区間に分けたときの出現区間 */
  positions: number[];
  /** 秒単位の出現時刻（タイムラインがある場合） */
  timestamps: number[];
  /** TEI 内の典拠情報（あれば Wikipedia 取得前でも即表示できる） */
  description?: string;
  image?: string;
  href?: string | null;
}

export interface VideoSupportData {
  title: string;
  videoUrl: string | null;
  duration: number;
  blocks: SupportBlock[];
  terms: SupportTerm[];
}

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const xmlId = (el: Element) => el.getAttribute('xml:id') ?? el.getAttributeNS(XML_NS, 'id');

function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

/** "00:01:25.500" または "85.5" を秒数にする */
export function parseTimecode(raw: string | null | undefined): number | null {
  const s = clean(raw);
  if (!s) return null;
  const parts = s.split(':').map(Number);
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 1) return parts[0];
  return null;
}

/** 要素から SupportCategory を判定する（<name type="keyword"> 等にも対応） */
export function categoryOfElement(el: Element): SupportCategory | null {
  switch (el.localName) {
    case 'persName':
      return 'person';
    case 'placeName':
      return 'place';
    case 'orgName':
      return 'org';
    case 'date':
      return 'date';
    case 'name':
    case 'rs':
    case 'term': {
      const t = clean(el.getAttribute('type')).toLowerCase();
      if (t === 'place' || t === 'placename' || t === 'geog') return 'place';
      if (t === 'org' || t === 'orgname') return 'org';
      if (t === 'date' || t === 'time') return 'date';
      if (t === 'keyword' || t === 'term' || el.localName === 'term') return 'keyword';
      return 'person';
    }
    default:
      return null;
  }
}

function resolveWikiKey(el: Element, surface: string): string {
  for (const attr of ['key', 'nymRef', 'corresp', 'ref']) {
    const raw = clean(el.getAttribute(attr));
    if (!raw) continue;
    const tok = raw.split(/\s+/)[0];
    if (!tok || /^https?:\/\//i.test(tok)) continue;
    const stripped = tok.startsWith('#') ? tok.slice(1) : tok;
    if (stripped) return stripped;
  }
  return surface;
}

export function extractVideoSupportData(tei: Document, baseUrl?: string): VideoSupportData {
  const root = tei.documentElement;
  const titleEl = root.getElementsByTagNameNS('*', 'title')[0];
  const title = clean(titleEl?.textContent);

  // 映像 URL（<media mimeType="video/mp4" url="..."/>）
  let videoUrl: string | null = null;
  for (const media of Array.from(root.getElementsByTagNameNS('*', 'media'))) {
    const mime = clean(media.getAttribute('mimeType')).toLowerCase();
    const u = clean(media.getAttribute('url'));
    if (!u) continue;
    if (mime.startsWith('video/') || /\.mp4(?:\?|$)/i.test(u)) {
      try {
        videoUrl = baseUrl ? new URL(u, baseUrl).href : u;
      } catch {
        videoUrl = u;
      }
      break;
    }
  }

  // <timeline><when xml:id="t1" absolute="00:00:25.500"/>
  const whenMap = new Map<string, number>();
  for (const whenEl of Array.from(root.getElementsByTagNameNS('*', 'when'))) {
    const id = xmlId(whenEl);
    const sec = parseTimecode(whenEl.getAttribute('absolute') ?? whenEl.getAttribute('interval'));
    if (id && sec !== null) {
      whenMap.set(`#${id}`, sec);
      whenMap.set(id, sec);
    }
  }

  // TEI の典拠情報と entity 番号マップ
  const entityNumberMap = new Map(textEntities(tei).map((el, i) => [el, i + 1]));
  const { groups: entityGroups } = readEntities(tei);
  const authorityByLabel = new Map<string, { description?: string; image?: string; href?: string | null }>();
  for (const g of entityGroups) {
    if (g.description || g.image || g.ref) {
      authorityByLabel.set(g.label, { description: g.description, image: g.image, href: g.ref });
    }
  }

  // ブロック要素を集める: <u> があれば <u>、なければ <p>・<ab>・<sp>・<l>
  const texts = Array.from(root.getElementsByTagNameNS('*', 'text')).filter((t) => !t.parentElement?.closest('text'));
  const scopes = texts.length ? texts : [root];

  const uList: Element[] = [];
  const blockList: Element[] = [];
  for (const scope of scopes) {
    for (const el of Array.from(scope.getElementsByTagNameNS('*', '*'))) {
      if (el.closest('teiHeader, facsimile, standOff, listPerson, listPlace, listOrg, note')) continue;
      if (el.localName === 'u') {
        uList.push(el);
      } else if (el.localName === 'p' || el.localName === 'ab' || el.localName === 'l') {
        if (!el.parentElement?.closest('p, ab, l, u')) {
          blockList.push(el);
        }
      }
    }
  }

  const rawBlocks = uList.length > 0 ? uList : blockList;
  let mentionSeq = 0;

  const parseInlineSegments = (container: Element): { segments: SupportInlineSegment[]; terms: SupportTermRef[] } => {
    const segments: SupportInlineSegment[] = [];
    const terms: SupportTermRef[] = [];

    const pushText = (t: string) => {
      if (!t) return;
      const prev = segments[segments.length - 1];
      if (prev && prev.kind === 'text') {
        prev.text += t;
      } else {
        segments.push({ kind: 'text', text: t });
      }
    };

    const walk = (node: Node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === 3 || child.nodeType === 4) {
          const val = child.nodeValue ?? '';
          if (/^\s+$/.test(val) && /[\r\n]/.test(val)) continue;
          pushText(val);
        } else if (child.nodeType === 1) {
          const el = child as Element;
          if (el.localName === 'note' || el.localName === 'rt' || el.localName === 'rp') continue;
          if (el.localName === 'span') {
            const st = clean(el.getAttribute('type')).toLowerCase();
            if (st === 'rt' || st === 'rp') continue;
          }
          const cat = categoryOfElement(el);
          if (cat) {
            const surface = clean(el.textContent);
            if (surface) {
              mentionSeq += 1;
              const entN = entityNumberMap.get(el);
              const id = xmlId(el) ?? (entN ? entityId(entN) : `support-term-${mentionSeq}`);
              const wikiKey = resolveWikiKey(el, surface);
              const key = wikiKey || surface;
              const termRef: SupportTermRef = {
                id,
                text: surface,
                key,
                wikiKey,
                category: cat,
              };
              segments.push({ kind: 'term', ...termRef });
              terms.push(termRef);
              continue;
            }
          }
          walk(el);
        }
      }
    };

    walk(container);
    return { segments, terms };
  };

  const blocks: SupportBlock[] = [];
  rawBlocks.forEach((el, idx) => {
    const text = clean(el.textContent);
    if (!text) return;
    const parentAb = el.closest('annotationBlock');
    const id = xmlId(el) ?? (parentAb ? xmlId(parentAb) : null) ?? `block-${idx + 1}`;
    const startAttr = clean(el.getAttribute('start') ?? parentAb?.getAttribute('start'));
    const endAttr = clean(el.getAttribute('end') ?? parentAb?.getAttribute('end'));
    const start = startAttr ? (whenMap.get(startAttr) ?? parseTimecode(startAttr)) : null;
    const end = endAttr ? (whenMap.get(endAttr) ?? parseTimecode(endAttr)) : null;

    const { segments, terms } = parseInlineSegments(el);
    blocks.push({
      id,
      start,
      end,
      text,
      segments,
      terms,
    });
  });

  // 全用語の集計と 10 分割位置・タイムスタンプ
  const totalMentions = Math.max(mentionSeq, 1);
  let seenIdx = 0;
  const termMap = new Map<string, {
    key: string;
    label: string;
    wikiKey: string;
    category: SupportCategory;
    count: number;
    posSet: Set<number>;
    timestamps: number[];
  }>();

  for (const b of blocks) {
    for (const tr of b.terms) {
      const decile = Math.min(9, Math.floor((seenIdx / totalMentions) * 10));
      seenIdx += 1;
      const existing = termMap.get(tr.key);
      if (existing) {
        existing.count += 1;
        existing.posSet.add(decile);
        if (b.start !== null) existing.timestamps.push(b.start);
      } else {
        termMap.set(tr.key, {
          key: tr.key,
          label: tr.text,
          wikiKey: tr.wikiKey,
          category: tr.category,
          count: 1,
          posSet: new Set([decile]),
          timestamps: b.start !== null ? [b.start] : [],
        });
      }
    }
  }

  const terms: SupportTerm[] = Array.from(termMap.values()).map((item) => {
    const auth = authorityByLabel.get(item.wikiKey) ?? authorityByLabel.get(item.label);
    return {
      key: item.key,
      label: item.label,
      wikiKey: item.wikiKey,
      category: item.category,
      count: item.count,
      positions: Array.from(item.posSet).sort((a, b) => a - b),
      timestamps: item.timestamps,
      ...(auth?.description ? { description: auth.description } : {}),
      ...(auth?.image ? { image: auth.image } : {}),
      ...(auth?.href ? { href: auth.href } : {}),
    };
  });

  const maxEnd = Math.max(
    0,
    ...blocks.map((b) => b.end ?? b.start ?? 0),
    ...Array.from(whenMap.values()),
  );

  return {
    title,
    videoUrl,
    duration: maxEnd,
    blocks,
    terms,
  };
}
