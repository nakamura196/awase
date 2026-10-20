// 並べた列のスクロール連動。
//
// 列どうしで共通する対応点（同じ xml:id、または片方の @corresp が指す、もう片方の xml:id）を、読む向きの位置で突き合わせる。
// 動かした列で、ペインの読み始めの端（横書きは上、縦書きは右）がどの 2 点の間にあるかを割合で出し、
// ほかの列も、同じ 2 点の間の同じ割合の所を端に合わせる。点の間は直線で補うので、対応の間が長くても滑らかに動く。
import { correspIds } from './link';

/** 列の中の対応点。id → その id に当たる最初の要素（xml:id を持つ要素か、@corresp で指す要素）。並びは文書の順 */
export function linkPoints(root: Element): Map<string, Element> {
  const points = new Map<string, Element>();
  for (const el of Array.from(root.querySelectorAll('[id], [corresp]'))) {
    for (const id of [el.id, ...correspIds(el.getAttribute('corresp'))]) {
      if (id && !points.has(id)) points.set(id, el);
    }
  }
  return points;
}

/** 共通の対応点の、両方の列での位置（読む向きに、ペインの端から何 px 先か。負ならもう読み過ぎた側） */
export interface PointPair {
  source: number;
  target: number;
}

/**
 * 合わせる列を、読む向きに何 px 進めればよいか。共通の点が無ければ null。
 * 端が最初の点より手前、または最後の点より先のときは、いちばん近い点と端との間を、両方の列でそろえる。
 */
export function followOffset(pairs: PointPair[]): number | null {
  if (pairs.length === 0) return null;
  const sorted = [...pairs].sort((a, b) => a.source - b.source);
  let i = -1;
  while (i + 1 < sorted.length && sorted[i + 1].source <= 0) i++;
  if (i < 0) return sorted[0].target - sorted[0].source;
  const a = sorted[i];
  const b = sorted[i + 1];
  if (!b || b.source === a.source) return a.target - a.source;
  const f = -a.source / (b.source - a.source);
  return a.target + f * (b.target - a.target);
}
