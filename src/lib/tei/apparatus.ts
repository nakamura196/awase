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

/** その app の読み（rdgGrp の中も拾う。入れ子の app の読みは入れない） */
function appReadings(app: Element): Reading[] {
  const readings: Reading[] = [];
  for (const el of Array.from(app.querySelectorAll('lem, rdg'))) {
    if (el.parentElement?.closest('app') !== app) continue;
    readings.push({ kind: el.localName === 'lem' ? 'lem' : 'rdg', wits: witIds(el.getAttribute('wit')), el });
  }
  return readings;
}

export function readApparatus(tei: Document, witnesses: Witness[]): ApparatusEntry[] {
  const all = witnesses.map((w) => w.id);
  return textApps(tei).map((app, i) => {
    const n = i + 1;
    const readings = appReadings(app);
    const hasLem = readings.some((r) => r.kind === 'lem');
    return {
      n,
      id: xmlId(app) ?? appId(n),
      readings,
      silent: hasLem ? silentWitnesses(all, readings.flatMap((r) => r.wits)) : [],
    };
  });
}

/** 2 つの文字列の編集距離（1 字の挿入・削除・置換をそれぞれ 1 と数える）。サロゲートペアの字も 1 字と数える */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const s = Array.from(a);
  const t = Array.from(b);
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  let prev = Array.from({ length: t.length + 1 }, (_, j) => j);
  for (let i = 1; i <= s.length; i++) {
    const cur = [i];
    for (let j = 1; j <= t.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[t.length];
}

/**
 * 読みの文字（空白を除く）。del の中の字も数える（koui と同じ）。
 * 読みの中に入れ子の app があれば、その伝本の読み（wit が null なら lem）だけを取る。
 * textContent のままだと、入れ子の lem と rdg の字が両方入ってしまう（koui の見本で 31 箇所）
 */
export function readingText(el: Element, wit: string | null = null): string {
  let out = '';
  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === 3) out += child.nodeValue ?? '';
      else if (child.nodeType !== 1) continue;
      else if ((child as Element).localName === 'app') {
        const readings = appReadings(child as Element);
        const i = wit ? readingFor(readings, wit) : readings.findIndex((r) => r.kind === 'lem');
        if (i >= 0) walk(readings[i].el);
      } else walk(child);
    }
  };
  walk(el);
  return out.replace(/\s+/g, '');
}

export interface WitnessDistance {
  /** lem との編集距離の合計 */
  distance: number;
  /** lem と違う読みの箇所の数 */
  places: number;
}

/**
 * 伝本ごとの、lem との違い（koui の Chart.vue と同じ、編集距離の合計）。
 * 箇所ごとの読みは ?wit= と同じ決まり（readingFor）で選ぶ。lem の無い箇所は数えない
 */
export function witnessDistances(entries: Pick<ApparatusEntry, 'readings'>[], witnesses: string[]): Map<string, WitnessDistance> {
  const out = new Map(witnesses.map((id) => [id, { distance: 0, places: 0 }]));
  for (const { readings } of entries) {
    const lem = readings.findIndex((r) => r.kind === 'lem');
    if (lem < 0) continue;
    let lemText: string | null = null;
    for (const [id, sum] of out) {
      const i = readingFor(readings, id);
      if (i === lem) continue;
      lemText ??= readingText(readings[lem].el);
      const d = levenshtein(lemText, readingText(readings[i].el, id));
      sum.distance += d;
      if (d > 0) sum.places += 1;
    }
  }
  return out;
}
