'use client';

import { useEffect, useRef } from 'react';
import { renderTeiText } from '@/lib/tei/render';
import { readingFor, witIds } from '@/lib/tei/apparatus';
import { findLinked, linkIdAt, pointFromCoords } from '@/lib/tei/link';
import './tei.css';

interface Props {
  tei: Document;
  /** TEI の URL。相対 URL の基準 */
  baseUrl?: string;
  vertical: boolean;
  showLineBreaks: boolean;
  showPageBreaks: boolean;
  /** 横書きでも枠の高さに収めて、中でスクロールさせる（並べて読むとき） */
  scroll?: boolean;
  /** 移動・強調する xml:id。ほかの列の @corresp から指されている要素・範囲にも印を付ける（src/lib/tei/link.ts） */
  focusId?: string | null;
  /** 本文を押したとき。対応の id（無ければ押した所の xml:id）を渡す */
  onSelect?: (id: string) => void;
  /** 頁の目印ごとに、画像が引けるか（画像ペインがあるとき） */
  pageImages?: boolean[];
  /** 画像ペインで見ている頁（何番目の pb か）。その目印に印を付ける */
  page?: number;
  /** 読んでいる頁（何番目の pb か）が変わったとき。頁の目印を押したときも */
  onPageChange?: (index: number) => void;
  /** 異文の箇所で見せる伝本（?wit= の略号）。無ければ lem */
  wit?: string | null;
  /** この頁（何番目の pb か）へ動かす。seq は同じ頁へ 2 度動かすときのため */
  pageRequest?: { index: number; seq: number } | null;
  /** ほかのペイン（3D ペインなど）が受け取れる id。@corresp の行き先として選ぶ */
  linkedIds?: ReadonlySet<string>;
}

// 本文ペイン。TEI を tei-* の部品に置き換えて（src/lib/tei/render.ts）、この枠の中に置く。
// 部品は React ではなく DOM で直接作る。数千の要素を React に持たせると重いため（CETEIcean と同じ作り）。

// 目印から次の目印までの範囲は要素に収まらないので、要素を足さずに色を付ける仕組み（CSS Custom Highlight）を使う。
// 名前はページで 1 つなので、列ごとに自分の範囲だけを足し引きする
const HIGHLIGHT = 'awase-link';

function highlightRegistry(): Highlight | null {
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) return null;
  let h = CSS.highlights.get(HIGHLIGHT);
  if (!h) {
    h = new Highlight();
    CSS.highlights.set(HIGHLIGHT, h);
  }
  return h;
}

// ほかの列やペインに、この id に当たるものがあるか
function hasElsewhere(self: Element, id: string, linkedIds?: ReadonlySet<string>): boolean {
  if (linkedIds?.has(id)) return true;
  const sel = `[id="${CSS.escape(id)}"]`;
  return Array.from(document.querySelectorAll('.awase-text')).some((pane) => pane !== self && pane.querySelector(sel));
}

// 読んでいる頁。読み始めの端（横書きは上、縦書きは右）から 4 分の 1 の所を、最後に越えた頁の目印。
// 頁の目印は文書の順に並んでいるので、越えたものは先頭からひと続きになる
// 終わりまで動かしきったときは、それ以上進めないので、枠の中に見えている最後の目印にする（最後の頁が短いと、目印が 4 分の 1 の所まで来ない）
function currentPage(
  pbs: Element[],
  frame: { top: number; right: number; width: number; height: number },
  vertical: boolean,
  atEnd = false,
) {
  const edge = atEnd
    ? vertical
      ? frame.right - frame.width
      : frame.top + frame.height
    : vertical
      ? frame.right - frame.width / 4
      : frame.top + frame.height / 4;
  let cur = 0;
  for (let i = 0; i < pbs.length; i++) {
    const r = pbs[i].getBoundingClientRect();
    if (vertical ? r.right >= edge : r.top <= edge) cur = i;
    else break;
  }
  return cur;
}

// 枠の中を、読み進める向きの終わりまで動かしきったか（縦書きは左へ進むので scrollLeft が負になる）
function scrolledToEnd(el: HTMLElement, vertical: boolean) {
  if (vertical) return el.scrollWidth > el.clientWidth && Math.abs(el.scrollLeft) + el.clientWidth >= el.scrollWidth - 1;
  return el.scrollHeight > el.clientHeight && el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
}
export default function TextPane({
  tei,
  baseUrl,
  vertical,
  showLineBreaks,
  showPageBreaks,
  scroll = false,
  focusId,
  onSelect,
  pageImages,
  page,
  onPageChange,
  pageRequest,
  wit,
  linkedIds,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // この列で押して選んだときは、この列は動かさない（押した所が逃げないように）
  const selfSelected = useRef(false);
  const focusedPageRef = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.replaceChildren(renderTeiText(tei, { doc: document, baseUrl }));
  }, [tei, baseUrl]);

  // 伝本を選んだときは、異文の箇所ごとにその伝本の読みへ入れ替える（見せ方は tei.css）。
  // 描き直さずに印を付け替えるだけなので、読んでいる位置は動かない
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.querySelectorAll('[data-awase-chosen]').forEach((n) => n.removeAttribute('data-awase-chosen'));
    el.querySelectorAll('[data-awase-variant]').forEach((n) => n.removeAttribute('data-awase-variant'));
    if (!wit) {
      el.removeAttribute('data-awase-wit');
      return;
    }
    el.setAttribute('data-awase-wit', wit);
    for (const app of Array.from(el.querySelectorAll('tei-app'))) {
      const readings = Array.from(app.querySelectorAll('tei-lem, tei-rdg')).filter((r) => r.parentElement?.closest('tei-app') === app);
      const i = readingFor(
        readings.map((r) => ({ kind: r.localName === 'tei-lem' ? 'lem' : 'rdg', wits: witIds(r.getAttribute('wit')) })),
        wit,
      );
      if (i < 0) continue;
      readings[i].setAttribute('data-awase-chosen', '');
      if (readings[i].localName === 'tei-rdg') app.setAttribute('data-awase-variant', '');
    }
  }, [tei, baseUrl, wit]);

  // 選んだ要素へ移動して印を付ける。縦書きに切り替えたときも移動し直す
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.querySelectorAll('.is-selected').forEach((n) => n.classList.remove('is-selected'));
    const keep = selfSelected.current;
    selfSelected.current = false;
    if (!focusId) return;
    const { elements, ranges } = findLinked(el, focusId);
    for (const target of elements) target.classList.add('is-selected');
    const highlight = highlightRegistry();
    for (const r of ranges) highlight?.add(r);
    if (elements[0] && !keep) elements[0].scrollIntoView({ block: 'center', inline: 'center' });
    if (elements[0]) {
      const pbs = Array.from(el.querySelectorAll('tei-pb'));
      let pbIdx = -1;
      for (let i = 0; i < pbs.length; i++) {
        if (pbs[i].compareDocumentPosition(elements[0]) & Node.DOCUMENT_POSITION_FOLLOWING) pbIdx = i;
      }
      if (pbIdx >= 0) {
        focusedPageRef.current = pbIdx;
        onPageChange?.(pbIdx);
      }
    }
    return () => {
      for (const r of ranges) highlight?.delete(r);
    };
  }, [tei, focusId, vertical, onPageChange]);

  // 縦書きは右から読むので、開いたとき右端を見せる（ブラウザによって最初の位置が違う）
  useEffect(() => {
    const el = ref.current;
    if (!el || !vertical || focusId) return;
    el.scrollLeft = el.scrollWidth;
  }, [tei, vertical, focusId]);

  // 読み進めたら、読んでいる頁を知らせる。枠の中でスクロールしないとき（横書きの 1 列）はページ全体のスクロールを見る
  // onPageChange は列の setState をそのまま受けるので、描き直しのたびに変わらない
  useEffect(() => {
    const el = ref.current;
    if (!el || !onPageChange) return;
    const pbs = Array.from(el.querySelectorAll('tei-pb'));
    if (!pbs.length) return;
    const inner = vertical || scroll;
    let raf = 0;
    let last = -1;
    const measure = () => {
      raf = 0;
      if (focusedPageRef.current !== null) {
        const p = focusedPageRef.current;
        focusedPageRef.current = null;
        if (p !== last) {
          last = p;
          onPageChange(p);
        }
        return;
      }
      const frame = inner
        ? el.getBoundingClientRect()
        : { top: 0, right: window.innerWidth, width: window.innerWidth, height: window.innerHeight };
      const i = currentPage(pbs, frame, vertical, inner && scrolledToEnd(el, vertical));
      if (i !== last) {
        last = i;
        onPageChange(i);
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    const target: HTMLElement | Window = inner ? el : window;
    target.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // 開いたときの位置（縦書きの右端寄せ・id への移動）が決まってから測る
    onScroll();
    return () => {
      target.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [tei, vertical, scroll, onPageChange]);

  // 画像の引ける頁の目印と、いま見ている頁の目印に印を付ける
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.querySelectorAll('tei-pb').forEach((pb, i) => {
      pb.toggleAttribute('data-awase-facs', Boolean(pageImages?.[i]));
      pb.classList.toggle('is-current', pageImages !== undefined && i === page);
    });
  }, [tei, pageImages, page]);

  // 画像ペインから頁を移ったとき、本文もその頁の頭へ動かす
  useEffect(() => {
    const el = ref.current;
    if (!el || !pageRequest) return;
    el.querySelectorAll('tei-pb')[pageRequest.index]?.scrollIntoView({ block: 'start', inline: 'start' });
  }, [pageRequest]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const root = ref.current;
    if (!root) return;
    const target = e.target as Element;
    if (target.closest('a')) return;
    // 頁の目印を押したら、その頁の画像を出す
    const pb = target.closest('tei-pb');
    if (pb && onPageChange) {
      onPageChange(Array.from(root.querySelectorAll('tei-pb')).indexOf(pb));
      return;
    }
    if (!onSelect) return;
    const id = linkIdAt(root, target, pointFromCoords(document, e.clientX, e.clientY), (i) => hasElsewhere(root, i, linkedIds));
    if (!id || id === focusId) return;
    selfSelected.current = true;
    onSelect(id);
  }

  const classes = [
    'awase-text',
    vertical ? 'is-vertical' : '',
    showLineBreaks ? 'show-lb' : '',
    showPageBreaks ? 'show-pb' : '',
    scroll ? 'is-scroll' : '',
  ].filter(Boolean);

  return (
    <div
      ref={ref}
      className={classes.join(' ')}
      onClick={handleClick}
      // 中でスクロールする枠は、キーでも動かせるようにする
      tabIndex={vertical || scroll ? 0 : undefined}
      data-testid="text-pane"
      lang={tei.documentElement.getAttribute('xml:lang') ?? undefined}
    />
  );
}
