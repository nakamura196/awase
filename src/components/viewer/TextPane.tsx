'use client';

import { useEffect, useRef } from 'react';
import { renderTeiText } from '@/lib/tei/render';
import './tei.css';

interface Props {
  tei: Document;
  /** TEI の URL。相対 URL の基準 */
  baseUrl?: string;
  vertical: boolean;
  showLineBreaks: boolean;
  showPageBreaks: boolean;
  /** 開いたときに移動・強調する xml:id */
  focusId?: string | null;
  /** id のある要素を押したとき */
  onSelect?: (id: string) => void;
}

// 本文ペイン。TEI を tei-* の部品に置き換えて（src/lib/tei/render.ts）、この枠の中に置く。
// 部品は React ではなく DOM で直接作る。数千の要素を React に持たせると重いため（CETEIcean と同じ作り）。
export default function TextPane({
  tei,
  baseUrl,
  vertical,
  showLineBreaks,
  showPageBreaks,
  focusId,
  onSelect,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

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
    if (!focusId) return;
    const target = el.querySelector(`[id="${CSS.escape(focusId)}"]`);
    if (!target) return;
    target.classList.add('is-selected');
    target.scrollIntoView({ block: 'center', inline: 'center' });
  }, [tei, focusId, vertical]);

  // 縦書きは右から読むので、開いたとき右端を見せる（ブラウザによって最初の位置が違う）
  useEffect(() => {
    const el = ref.current;
    if (!el || !vertical || focusId) return;
    el.scrollLeft = el.scrollWidth;
  }, [tei, vertical, focusId]);

  function handleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onSelect) return;
    const target = e.target as Element;
    if (target.closest('a')) return;
    const withId = target.closest('[id]');
    if (withId && ref.current?.contains(withId) && withId !== ref.current) onSelect(withId.id);
  }

  const classes = [
    'awase-text',
    vertical ? 'is-vertical' : '',
    showLineBreaks ? 'show-lb' : '',
    showPageBreaks ? 'show-pb' : '',
  ].filter(Boolean);

  return (
    <div
      ref={ref}
      className={classes.join(' ')}
      onClick={handleClick}
      data-testid="text-pane"
      lang={tei.documentElement.getAttribute('xml:lang') ?? undefined}
    />
  );
}
