'use client';

import { useEffect, type RefObject } from 'react';
import { followOffset, linkPoints, type PointPair } from '@/lib/tei/scrollSync';

// 並べた本文の列を、いっしょにスクロールさせる（合わせ方は src/lib/tei/scrollSync.ts）。
//
// 動かしたのがどの列かは、スクロールの前の操作（ホイール・指・マウス・キー）で決める。
// その列のスクロールだけを手本にし、ほかの列は付いていくだけにする。こうしないと、付いていった列のスクロールが
// 手本の列を動かし返して、行き来が止まらない。id で選んだ所へ移る動き（scrollIntoView）も手本にしない。

const PANE = '.awase-text';

// 列ごとの対応点。本文を描き直すと中身の要素が替わるので、それを鍵にする
const pointsCache = new WeakMap<Element, Map<string, Element>>();

function pointsOf(pane: Element): Map<string, Element> {
  const key = pane.firstElementChild ?? pane;
  let points = pointsCache.get(key);
  if (!points) {
    points = linkPoints(pane);
    pointsCache.set(key, points);
  }
  return points;
}

// 読む向きに、ペインの端から何 px 先か。見えない要素（隠した頁の目印など）は null
function position(pane: Element, el: Element, vertical: boolean): number | null {
  if (el.getClientRects().length === 0) return null;
  const p = pane.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return vertical ? p.right - r.right : r.top - p.top;
}

function follow(source: HTMLElement, target: HTMLElement) {
  const vertical = source.classList.contains('is-vertical');
  if (vertical !== target.classList.contains('is-vertical')) return;
  const own = pointsOf(source);
  const other = pointsOf(target);
  const pairs: PointPair[] = [];
  for (const [id, el] of own) {
    const there = other.get(id);
    if (!there) continue;
    const s = position(source, el, vertical);
    const t = position(target, there, vertical);
    if (s !== null && t !== null) pairs.push({ source: s, target: t });
  }
  const delta = followOffset(pairs);
  if (delta === null || Math.abs(delta) < 1) return;
  // 縦書きは右から左へ読むので、進めるとは左へ動かすこと
  if (vertical) target.scrollLeft -= delta;
  else target.scrollTop += delta;
}

export function useScrollSync(container: RefObject<HTMLElement | null>, enabled: boolean) {
  useEffect(() => {
    const root = container.current;
    if (!root || !enabled) return;
    let driver: HTMLElement | null = null;
    let frame = 0;

    const claim = (e: Event) => {
      driver = (e.target as Element | null)?.closest?.<HTMLElement>(PANE) ?? null;
    };
    const onScroll = (e: Event) => {
      const pane = e.target as HTMLElement;
      if (pane !== driver || !pane.matches?.(PANE)) return;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        for (const other of Array.from(root.querySelectorAll<HTMLElement>(PANE))) {
          if (other !== pane) follow(pane, other);
        }
      });
    };

    const claimEvents = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;
    for (const t of claimEvents) root.addEventListener(t, claim, { capture: true, passive: true });
    // scroll は親へ伝わらないので、捕まえる段階（capture）で受ける
    root.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      for (const t of claimEvents) root.removeEventListener(t, claim, { capture: true });
      root.removeEventListener('scroll', onScroll, { capture: true });
      if (frame) cancelAnimationFrame(frame);
    };
  }, [container, enabled]);
}
