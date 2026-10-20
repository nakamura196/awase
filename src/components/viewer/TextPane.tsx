'use client';

import { useEffect, useRef } from 'react';
import { renderTeiText } from '@/lib/tei/render';
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

// ほかの列に、この id の要素があるか
function hasElsewhere(self: Element, id: string): boolean {
  const sel = `[id="${CSS.escape(id)}"]`;
  return Array.from(document.querySelectorAll('.awase-text')).some((pane) => pane !== self && pane.querySelector(sel));
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
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // この列で押して選んだときは、この列は動かさない（押した所が逃げないように）
  const selfSelected = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.replaceChildren(renderTeiText(tei, { doc: document, baseUrl }));
  }, [tei, baseUrl]);

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
    return () => {
      for (const r of ranges) highlight?.delete(r);
    };
  }, [tei, focusId, vertical]);

  // 縦書きは右から読むので、開いたとき右端を見せる（ブラウザによって最初の位置が違う）
  useEffect(() => {
    const el = ref.current;
    if (!el || !vertical || focusId) return;
    el.scrollLeft = el.scrollWidth;
  }, [tei, vertical, focusId]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    const root = ref.current;
    if (!onSelect || !root) return;
    const target = e.target as Element;
    if (target.closest('a')) return;
    const id = linkIdAt(root, target, pointFromCoords(document, e.clientX, e.clientY), (i) => hasElsewhere(root, i));
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
