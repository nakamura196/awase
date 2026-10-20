// 異文（parallel segmentation の app/lem/rdg）と伝本の一覧（listWit）を読む。apparatus ペインが使う。
//
// koui（TEI-EAJ/koui）と同じ決まり:
// - lem・rdg の @wit に名前の無い伝本は、lem と同じ読みとみなす（その箇所で黙っている伝本）
// - 箇所の番号は、本文の中の app の順（1 から）

const XML_NS = 'http://www.w3.org/XML/1998/namespace';
const xmlId = (el: Element) => el.getAttribute('xml:id') ?? el.getAttributeNS(XML_NS, 'id');

/** 伝本の略号（listWit の witness@xml:id）と名前 */
export interface Witness {
  id: string;
  label: string;
}

export interface Reading {
  kind: 'lem' | 'rdg';
  /** @wit に書かれた伝本の略号 */
  wits: string[];
  /** 読みの要素（中の del・add などは描くときに写す） */
  el: Element;
}

export interface ApparatusEntry {
  /** 箇所の番号（1 から） */
  n: number;
  /** 本文の app と一覧の行を結ぶ id（app の xml:id、無ければ appId(n)） */
  id: string;
  readings: Reading[];
  /** どの読みにも名前の無い伝本。lem と同じ読みとみなす */
  silent: string[];
}

/** xml:id の無い app に付ける id */
export function appId(n: number): string {
  return `awase-app-${n}`;
}

/** @wit の値（"#靑池 #河" や "wits.xml#A"）から略号を取り出す */
export function witIds(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s+/)
    .map((ref) => ref.slice(ref.indexOf('#') + 1))
    .filter(Boolean);
}

/** 一覧にあって、どの読みにも名前の無い伝本（一覧の順） */
export function silentWitnesses(all: string[], named: string[]): string[] {
  const seen = new Set(named);
  return all.filter((id) => !seen.has(id));
}

/**
 * その伝本の読みは何番目か（?wit= で本文を入れ替えるとき）。
 * @wit に名前があればその読み、どこにも無ければ lem（黙っている伝本は lem と同じとみなす）。lem も無ければ -1
 */
export function readingFor(readings: Pick<Reading, 'kind' | 'wits'>[], wit: string): number {
  const named = readings.findIndex((r) => r.wits.includes(wit));
  return named >= 0 ? named : readings.findIndex((r) => r.kind === 'lem');
}

/** 一覧の行で略号を畳む。先頭の limit 個だけ見せ、残りは「ほか N 本」にまとめる */
export function foldSigla<T>(ids: T[], limit: number): { shown: T[]; hidden: T[] } {
  if (ids.length <= limit + 1) return { shown: ids, hidden: [] };
  return { shown: ids.slice(0, limit), hidden: ids.slice(limit) };
}

/** 伝本の一覧。witness の中身（abbr があればそれを除いた文字）を名前にする */
export function readWitnesses(tei: Document): Witness[] {
  const out: Witness[] = [];
  for (const w of Array.from(tei.getElementsByTagNameNS('*', 'witness'))) {
    const id = xmlId(w);
    if (!id) continue;
    const label = (w.textContent ?? '').replace(/\s+/g, ' ').trim();
    out.push({ id, label: label || id });
  }
  return out;
}

/** 本文として描く範囲の app（文書の順）。render.ts の renderTeiText と同じ範囲を見る */
export function textApps(tei: Document): Element[] {
  const root = tei.documentElement;
  const texts = Array.from(root.getElementsByTagNameNS('*', 'text')).filter((t) => !t.parentElement?.closest('text'));
  const scopes = texts.length ? texts : [root];
  const out: Element[] = [];
  for (const scope of scopes) {
    for (const app of Array.from(scope.getElementsByTagNameNS('*', 'app'))) {
      if (!texts.length && app.closest('teiHeader, facsimile, standOff')) continue;
      out.push(app);
    }
  }
  return out;
}

export function readApparatus(tei: Document, witnesses: Witness[]): ApparatusEntry[] {
  const all = witnesses.map((w) => w.id);
  return textApps(tei).map((app, i) => {
    const n = i + 1;
    const readings: Reading[] = [];
    // rdgGrp の中の読みも拾う
    for (const el of Array.from(app.querySelectorAll('lem, rdg'))) {
      if (el.parentElement?.closest('app') !== app) continue;
      readings.push({ kind: el.localName === 'lem' ? 'lem' : 'rdg', wits: witIds(el.getAttribute('wit')), el });
    }
    const hasLem = readings.some((r) => r.kind === 'lem');
    return {
      n,
      id: xmlId(app) ?? appId(n),
      readings,
      silent: hasLem ? silentWitnesses(all, readings.flatMap((r) => r.wits)) : [],
    };
  });
}
