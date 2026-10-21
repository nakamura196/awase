// 並べた本文どうしの対応（@corresp）。
//
// 対応は「片方の @corresp が、もう片方の xml:id を指す」形で書かれる。
// 例: 絵入源氏の <anchor corresp="yosano_genji_ids.xml#YG0000000100"/> → 与謝野訳の <s xml:id="YG0000000100">
// 指す先のファイル名は、並べた TEI の URL と一致しないことが多い（上の例も別名）ので、# の後の id だけで突き合わせる。
//
// 選んだ対応は、URL の id に「指される側の id」として持つ。どの列も、その id を
//   - xml:id に持つ要素、
//   - @corresp で指す要素（中身があれば要素そのもの、anchor のような空の目印なら次の目印までの範囲）
// として見つけて印を付ける。どちらの列から選んでも同じ id になるので、向きを問わない。

/** @corresp の値（空白区切りの参照）から、# の後の id を取り出す */
export function correspIds(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .split(/\s+/)
    .map((ref) => {
      const hash = ref.indexOf('#');
      return hash >= 0 ? ref.slice(hash + 1) : '';
    })
    .filter(Boolean);
}

/** 中身の無い要素（anchor・milestone など）。ここから次の目印までを 1 つの区切りと見る */
function isMilestone(el: Element): boolean {
  return el.childNodes.length === 0 || (el.children.length === 0 && !(el.textContent ?? '').trim());
}

/** 列の中の、対応を持つ空の目印（文書の順） */
function milestones(root: Element): Element[] {
  return Array.from(root.querySelectorAll('[corresp]')).filter(isMilestone);
}

/** 目印から、同じ列の次の目印の手前（無ければ本文の終わり）までの範囲 */
function milestoneRange(root: Element, m: Element, all: Element[]): Range {
  const range = root.ownerDocument.createRange();
  range.setStartAfter(m);
  const next = all[all.indexOf(m) + 1];
  if (next) range.setEndBefore(next);
  else range.setEnd(root, root.childNodes.length);
  return range;
}

export interface LinkTargets {
  /** 印を付け、見える所へ動かす要素 */
  elements: Element[];
  /** 目印から次の目印までの範囲（要素に収まらないので、別の方法で色を付ける） */
  ranges: Range[];
}

/** 列の中で、id に当たるもの（xml:id を持つ要素と、@corresp で指す要素・範囲）を探す */
export function findLinked(root: Element, id: string): LinkTargets {
  const elements: Element[] = [];
  const ranges: Range[] = [];
  const own = root.querySelector(`[id="${CSS.escape(id)}"]`);
  if (own) elements.push(own);
  // o-0001 / y-0001 / ja-0001 / z-0001 の並列セグメント対応
  const pm = /^(?:o|y|ja|z)-(\d+)$/.exec(id);
  if (pm) {
    for (const prefix of ['o', 'y', 'ja']) {
      const pid = `${prefix}-${pm[1]}`;
      if (pid === id) continue;
      const peer = root.querySelector(`[id="${CSS.escape(pid)}"]`);
      if (peer && !elements.includes(peer)) elements.push(peer);
    }
  }
  const all = milestones(root);
  for (const el of Array.from(root.querySelectorAll('[corresp]'))) {
    if (!correspIds(el.getAttribute('corresp')).includes(id)) continue;
    elements.push(el);
    if (all.includes(el)) ranges.push(milestoneRange(root, el, all));
  }
  return { elements, ranges };
}

/** 押した位置。文字の中の位置が取れれば、目印の前か後かまで分かる */
export interface Point {
  node: Node;
  offset: number;
}

/** 画面上の座標から、文字の中の位置を取る（取れなければ null） */
export function pointFromCoords(doc: Document, x: number, y: number): Point | null {
  const d = doc as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const pos = d.caretPositionFromPoint?.(x, y);
  if (pos) return { node: pos.offsetNode, offset: pos.offset };
  const r = d.caretRangeFromPoint?.(x, y);
  if (r) return { node: r.startContainer, offset: r.startOffset };
  return null;
}

/** 位置より前にある、いちばん近い目印 */
function precedingMilestone(root: Element, point: Point, all: Element[]): Element | null {
  const at = root.ownerDocument.createRange();
  at.setStart(point.node, point.offset);
  let found: Element | null = null;
  for (const m of all) {
    const before = root.ownerDocument.createRange();
    before.setStartAfter(m);
    if (before.compareBoundaryPoints(Range.START_TO_START, at) > 0) break;
    found = m;
  }
  return found;
}

/**
 * 押した所から、URL の id にする値を決める。
 * 1. @corresp を持つ要素の中なら、それが指す id（ほかの列に有るもの）
 * 2. 空の目印の後なら、いちばん近い目印が指す id（ほかの列に有るもの）
 * 3. それ以外は、押した所を含む xml:id（ほかの列からは @corresp で探される）
 *
 * hasElsewhere は「その id がほかの列に有るか」。無い id を選ぶと、どの列も光らないため。
 */
export function linkIdAt(
  root: Element,
  target: Element,
  point: Point | null,
  hasElsewhere: (id: string) => boolean,
): string | null {
  const firstFound = (el: Element | null) => correspIds(el?.getAttribute('corresp')).find(hasElsewhere) ?? null;

  for (let el: Element | null = target; el && el !== root && root.contains(el); el = el.parentElement) {
    if (el.hasAttribute('corresp') && !isMilestone(el)) {
      const id = firstFound(el);
      if (id) return id;
    }
  }
  const all = milestones(root);
  if (all.length > 0) {
    const p = point && root.contains(point.node) ? point : { node: target, offset: 0 };
    const id = firstFound(precedingMilestone(root, p, all));
    if (id) return id;
  }
  const withId = target.closest('[id]');
  return withId && withId !== root && root.contains(withId) ? withId.id : null;
}
