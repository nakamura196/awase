// 頁（pb）から、その頁の画像を引く。
// TEI の facsimile の書き方は資料によって違うので、見つけた所で次の 3 通りを読む（docs/notes/survey.md の 2026-10-20 の節）。
//
// - koui・tei_viewer: <surfaceGrp facs="manifest"><surface><graphic n="canvas" url="画像"/><zone xml:id/></surface>、<pb facs="#zone"/>
// - 校異源氏（w3id）: <facsimile sameAs="manifest"><surface sameAs="canvas"><graphic sameAs="IIIF Image の base"/><zone/></surface>、
//   <pb corresp="#zone" facs="切り出した画像の URL"/>
// - TEI の標準: <surface xml:id><graphic url/></surface>、<pb facs="#surface"/>、または <pb facs="画像の URL"/>

/** 頁の画像。面（surface）全体の画像と、その中の範囲 */
export interface FacsTarget {
  manifest?: string;
  canvas?: string;
  /** IIIF Image API の base（この後に /full/…/default.jpg や /info.json を付ける） */
  service?: string;
  /** そのまま見せられる画像の URL */
  image?: string;
  /** 面の中の範囲 [x, y, 幅, 高さ]。無ければ面全体 */
  region?: [number, number, number, number];
}

const IIIF_IMAGE =
  /^(https?:\/\/.+?)\/(full|square|pct:[\d.,]+|\d+,\d+,\d+,\d+)\/(max|full|\^?!?\d*,?\d*|pct:[\d.]+)\/(!?\d+(?:\.\d+)?)\/(default|color|gray|grey|bitonal|native)\.(jpg|jpeg|png|webp|tif|gif)$/i;

/** IIIF Image API の URL なら、base と切り出しの範囲を返す */
export function parseIiifImageUrl(url: string): { service: string; region?: [number, number, number, number] } | null {
  const m = IIIF_IMAGE.exec(url.trim());
  if (!m) return null;
  const xywh = /^(\d+),(\d+),(\d+),(\d+)$/.exec(m[2]);
  return {
    service: m[1],
    region: xywh ? [Number(xywh[1]), Number(xywh[2]), Number(xywh[3]), Number(xywh[4])] : undefined,
  };
}

/**
 * 画面に出す画像の URL の候補。前から試し、読めなければ次を使う。
 * IIIF なら、範囲（その頁）だけを、幅を絞って取る。大きさの書き方はサーバによって受け付けるものが違う
 * （国立国会図書館は「!w,h」で 500 を返す）ので、幅だけの指定から始め、最後は元の大きさ（v3 は max、v2 は full）にする。
 * IIIF でない画像は切り出せないので、面全体を見せる
 */
export function imageSrcs(target: FacsTarget, width = 1600): string[] {
  if (target.service) {
    const region = target.region ? target.region.map((v) => Math.round(v)).join(',') : 'full';
    // 範囲より大きくは取れない（v3 は ^ を付けないと拡大を断る）
    const w = target.region ? Math.min(width, Math.round(target.region[2])) : width;
    return [`${w},`, 'max', 'full'].map((size) => `${target.service}/${region}/${size}/0/default.jpg`);
  }
  return target.image ? [target.image] : [];
}

/** 参照の値（空白区切り）のうち、文書の中を指すもの（#id）の id */
export function localRefs(value: string | null | undefined): string[] {
  return (value ?? '')
    .split(/\s+/)
    .filter((v) => v.startsWith('#') && v.length > 1)
    .map((v) => v.slice(1));
}

const num = (v: string | null) => {
  if (v === null) return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
};

function httpUrl(value: string | null | undefined, base?: string): string | undefined {
  const v = value?.trim();
  if (!v || v.startsWith('#')) return undefined;
  try {
    const url = new URL(v, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function firstUrl(el: Element | null, names: string[], base?: string): string | undefined {
  if (!el) return undefined;
  for (const n of names) {
    const url = httpUrl(el.getAttribute(n), base);
    if (url) return url;
  }
  return undefined;
}

const xmlId = (el: Element) => el.getAttribute('xml:id') ?? el.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'id');

function child(el: Element, name: string): Element | null {
  return Array.from(el.children).find((c) => c.localName === name) ?? null;
}

/** facsimile を読み、面と範囲の xml:id から画像を引ける表にする */
export function readFacsimile(tei: Document, baseUrl?: string): Map<string, FacsTarget> {
  const out = new Map<string, FacsTarget>();
  for (const surface of Array.from(tei.getElementsByTagNameNS('*', 'surface'))) {
    // 資料（manifest）は、面を囲む surfaceGrp か facsimile に書かれている
    let manifest: string | undefined;
    for (let p = surface.parentElement; p && !manifest; p = p.parentElement) {
      if (p.localName === 'surfaceGrp' || p.localName === 'facsimile') manifest = firstUrl(p, ['facs', 'sameAs', 'source'], baseUrl);
    }
    const graphic = child(surface, 'graphic');
    const image = httpUrl(graphic?.getAttribute('url'), baseUrl);
    const service = firstUrl(graphic, ['sameAs'], baseUrl) ?? (image ? parseIiifImageUrl(image)?.service : undefined);
    // 範囲の座標は面と同じ座標系なので、面の左上を引いて画像の中の位置にする
    const ulx = num(surface.getAttribute('ulx')) ?? 0;
    const uly = num(surface.getAttribute('uly')) ?? 0;
    const base: FacsTarget = {
      manifest,
      canvas: firstUrl(surface, ['sameAs', 'source', 'facs'], baseUrl) ?? firstUrl(graphic, ['n'], baseUrl),
      service,
      image,
    };
    const sid = xmlId(surface);
    if (sid) out.set(sid, base);
    for (const zone of Array.from(surface.getElementsByTagNameNS('*', 'zone'))) {
      const zid = xmlId(zone);
      const [x1, y1, x2, y2] = ['ulx', 'uly', 'lrx', 'lry'].map((n) => num(zone.getAttribute(n)));
      if (!zid) continue;
      const region: FacsTarget['region'] =
        x1 !== undefined && y1 !== undefined && x2 !== undefined && y2 !== undefined ? [x1 - ulx, y1 - uly, x2 - x1, y2 - y1] : undefined;
      out.set(zid, { ...base, region });
    }
  }
  return out;
}

/**
 * 頁の目印の facs・corresp から画像を引く。文書の中の参照（#id）を先に見て、
 * 無ければ facs に直接書かれた画像の URL を使う
 */
export function pageTarget(
  attrs: { facs?: string | null; corresp?: string | null },
  facsimile: Map<string, FacsTarget>,
  baseUrl?: string,
): FacsTarget | null {
  for (const id of [...localRefs(attrs.facs), ...localRefs(attrs.corresp)]) {
    const t = facsimile.get(id);
    if (t) return t;
  }
  const direct = httpUrl(attrs.facs?.split(/\s+/)[0], baseUrl);
  if (!direct) return null;
  // IIIF の URL なら base と範囲に分け、画面の大きさに合わせて取り直せるようにする
  return parseIiifImageUrl(direct) ?? { image: direct };
}

/**
 * 本文の頁の目印。本文ペインが描く範囲（src/lib/tei/render.ts の renderTeiText）と同じ所から、同じ順で拾う。
 * 画面の tei-pb と、この配列の何番目かで対応させるため
 */
export function pageBreaks(tei: Document): Element[] {
  const all = Array.from(tei.getElementsByTagNameNS('*', 'pb'));
  const inText = all.filter((pb) => pb.closest('text'));
  if (Array.from(tei.getElementsByTagNameNS('*', 'text')).length > 0) return inText;
  return all.filter((pb) => !pb.closest('teiHeader, facsimile, standOff'));
}

/**
 * 頁の目印（pb）が 1 つも無く、本文が sourceDoc の範囲（zone）に収まっている文書（PTV の絵入源氏）では、
 * 本文を含む範囲の頭に、その範囲を指す頁の目印を足す。足した目印は type="awase-zone" で見分ける。
 * こうすると、pb@facs の文書と同じ仕組み（頁の画像・頁の移動）がそのまま使える
 */
export function addZonePageBreaks(tei: Document): number {
  if (tei.getElementsByTagNameNS('*', 'pb').length > 0) return 0;
  let added = 0;
  for (const sourceDoc of Array.from(tei.getElementsByTagNameNS('*', 'sourceDoc'))) {
    for (const zone of Array.from(sourceDoc.getElementsByTagNameNS('*', 'zone'))) {
      const id = xmlId(zone);
      // 本文の無い範囲（挿絵だけの範囲など）と、範囲の中の範囲は頁にしない
      if (!id || !zone.textContent?.trim() || zone.parentElement?.closest('zone')) continue;
      const pb = tei.createElementNS(zone.namespaceURI, 'pb');
      pb.setAttribute('facs', `#${id}`);
      pb.setAttribute('type', 'awase-zone');
      zone.insertBefore(pb, zone.firstChild);
      added++;
    }
  }
  return added;
}
