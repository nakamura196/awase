'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  extractVideoSupportData,
  type SupportCategory,
  type SupportTerm,
} from '@/lib/tei/videoSupport';
import SupportTermCard, {
  CATEGORY_CHIP_STYLES,
  CATEGORY_STROKE_COLORS,
} from './SupportTermCard';

interface Props {
  tei: Document;
  baseUrl?: string;
  focusId?: string | null;
  onSelect?: (id: string) => void;
}

interface CurveLine {
  id: string;
  d: string;
  color: string;
  termKey: string;
}

const CATEGORIES: SupportCategory[] = ['person', 'place', 'org', 'keyword', 'date'];

export default function ReadingSupportView({ tei, baseUrl, focusId = null, onSelect }: Props) {
  const t = useTranslations('Xsl');
  const data = useMemo(() => extractVideoSupportData(tei, baseUrl), [tei, baseUrl]);

  const [showCards, setShowCards] = useState(true);
  const [showLines, setShowLines] = useState(true);
  const [highlight, setHighlight] = useState(true);
  const [vizOpen, setVizOpen] = useState(false);
  const [vizTab, setVizTab] = useState<'frequency' | 'terms'>('frequency');
  const [termSort, setTermSort] = useState<'frequency' | 'name'>('frequency');
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(() => new Set(data.terms.slice(0, 12).map((x) => x.key)));
  const [curves, setCurves] = useState<CurveLine[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);

  const selectedKey = useMemo(() => {
    if (!focusId) return null;
    for (const b of data.blocks) {
      if (b.id === focusId) return b.terms[0]?.key ?? null;
      for (const tr of b.terms) {
        if (tr.id === focusId) return tr.key;
      }
    }
    return null;
  }, [data.blocks, focusId]);

  // センターカラム内に見えている用語キーを計算し、左右のカードとベジェ曲線を更新する
  const recomputeLayout = useCallback(() => {
    const container = containerRef.current;
    const center = centerRef.current;
    if (!container || !center) return;

    const cRect = center.getBoundingClientRect();
    const refs = Array.from(center.querySelectorAll<HTMLElement>('.reference-text[data-key]'));
    const nextVisible = new Set<string>();

    for (const el of refs) {
      const r = el.getBoundingClientRect();
      if (r.bottom >= cRect.top - 20 && r.top <= cRect.bottom + 20) {
        const k = el.getAttribute('data-key');
        if (k) nextVisible.add(k);
      }
    }

    if (nextVisible.size === 0 && data.terms.length > 0) {
      for (const item of data.terms.slice(0, 10)) nextVisible.add(item.key);
    }

    setVisibleKeys((prev) => {
      if (prev.size === nextVisible.size && Array.from(prev).every((k) => nextVisible.has(k))) {
        return prev;
      }
      return nextVisible;
    });
  }, [data.terms]);

  const recomputeCurves = useCallback(() => {
    const container = containerRef.current;
    const center = centerRef.current;
    if (!container || !center || !showCards || !showLines) {
      setCurves([]);
      return;
    }

    const wrapRect = container.getBoundingClientRect();
    const cRect = center.getBoundingClientRect();
    const cardEls = Array.from(container.querySelectorAll<HTMLElement>('[data-testid="support-term-card"][data-key]'));
    const cardMap = new Map<string, HTMLElement>();
    for (const card of cardEls) {
      const k = card.getAttribute('data-key');
      const r = card.getBoundingClientRect();
      if (k && r.bottom >= wrapRect.top && r.top <= wrapRect.bottom) {
        cardMap.set(k, card);
      }
    }

    const refs = Array.from(center.querySelectorAll<HTMLElement>('.reference-text[data-key]'));
    const nextCurves: CurveLine[] = [];
    refs.forEach((refEl, idx) => {
      const r = refEl.getBoundingClientRect();
      if (r.bottom < cRect.top || r.top > cRect.bottom) return;
      const k = refEl.getAttribute('data-key');
      if (!k) return;
      const cardEl = cardMap.get(k);
      if (!cardEl) return;

      const s = cardEl.getBoundingClientRect();
      const cat = (refEl.getAttribute('data-type') as SupportCategory) || 'person';
      const color = CATEGORY_STROKE_COLORS[cat] ?? '#666';

      const cX = r.left - wrapRect.left + r.width / 2;
      const cY = r.top - wrapRect.top + r.height / 2;
      const oX = s.left < r.left ? s.right - wrapRect.left : s.left - wrapRect.left;
      const oY = s.top - wrapRect.top + s.height / 2;
      const midX = cX + (oX - cX) / 2;

      const d = `M ${cX.toFixed(1)} ${cY.toFixed(1)} C ${midX.toFixed(1)} ${cY.toFixed(1)}, ${midX.toFixed(1)} ${oY.toFixed(1)}, ${oX.toFixed(1)} ${oY.toFixed(1)}`;
      nextCurves.push({
        id: `${k}-${idx}`,
        d,
        color,
        termKey: k,
      });
    });

    setCurves(nextCurves);
  }, [showCards, showLines]);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      recomputeLayout();
      recomputeCurves();
    });
    return () => cancelAnimationFrame(raf);
  }, [recomputeLayout, recomputeCurves, visibleKeys, showCards, showLines, highlight]);

  useEffect(() => {
    const center = centerRef.current;
    const container = containerRef.current;
    if (!center || !container) return;

    let rafId = 0;
    const onScrollOrResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        recomputeLayout();
        recomputeCurves();
      });
    };

    center.addEventListener('scroll', onScrollOrResize, { passive: true });
    window.addEventListener('resize', onScrollOrResize);
    const leftCol = container.querySelector('[data-testid="reading-support-left-cards"]');
    const rightCol = container.querySelector('[data-testid="reading-support-right-cards"]');
    leftCol?.addEventListener('scroll', onScrollOrResize, { passive: true });
    rightCol?.addEventListener('scroll', onScrollOrResize, { passive: true });

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onScrollOrResize) : null;
    if (ro) {
      ro.observe(container);
      ro.observe(center);
      if (leftCol) ro.observe(leftCol);
      if (rightCol) ro.observe(rightCol);
    }

    const t1 = window.setTimeout(onScrollOrResize, 350);
    const t2 = window.setTimeout(onScrollOrResize, 1200);
    return () => {
      cancelAnimationFrame(rafId);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      ro?.disconnect();
      center.removeEventListener('scroll', onScrollOrResize);
      window.removeEventListener('resize', onScrollOrResize);
      leftCol?.removeEventListener('scroll', onScrollOrResize);
      rightCol?.removeEventListener('scroll', onScrollOrResize);
    };
  }, [recomputeLayout, recomputeCurves]);

  const visibleTerms = useMemo(
    () => data.terms.filter((term) => visibleKeys.has(term.key)),
    [data.terms, visibleKeys],
  );
  const leftTerms = useMemo(() => visibleTerms.filter((_, i) => i % 2 === 0), [visibleTerms]);
  const rightTerms = useMemo(() => visibleTerms.filter((_, i) => i % 2 === 1), [visibleTerms]);

  const categoryCounts = useMemo(() => {
    const counts: Record<SupportCategory, number> = {
      person: 0,
      place: 0,
      org: 0,
      keyword: 0,
      date: 0,
    };
    for (const term of data.terms) {
      counts[term.category] += term.count;
    }
    return counts;
  }, [data.terms]);

  const maxCatCount = Math.max(1, ...Object.values(categoryCounts));

  const sortedTerms = useMemo(() => {
    const list = [...data.terms];
    if (termSort === 'frequency') {
      list.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ja'));
    } else {
      list.sort((a, b) => a.label.localeCompare(b.label, 'ja'));
    }
    return list;
  }, [data.terms, termSort]);

  const handleTermClick = (term: SupportTerm) => {
    setHoveredKey(term.key);
    for (const b of data.blocks) {
      const hit = b.terms.find((tr) => tr.key === term.key);
      if (hit) {
        onSelect?.(hit.id);
        const el = centerRef.current?.querySelector<HTMLElement>(`[data-term-id="${CSS.escape(hit.id)}"]`);
        el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        break;
      }
    }
  };

  const catLabel = (cat: SupportCategory) =>
    cat === 'person'
      ? t('supportCatPerson')
      : cat === 'place'
        ? t('supportCatPlace')
        : cat === 'org'
          ? t('supportCatOrg')
          : cat === 'date'
            ? t('supportCatDate')
            : t('supportCatKeyword');

  return (
    <div
      data-testid="reading-support-view"
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded border border-[var(--ds-border)] bg-[var(--ds-bg)]"
    >
      {/* サブツールバー */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-[var(--ds-fg)] truncate">{data.title || t('readingSupportTitle')}</span>
          <span className="rounded-full bg-[var(--ds-bg)] px-2 py-0.5 text-[11px] text-[var(--ds-fg-muted)] border border-[var(--ds-border)]">
            {t('supportTermsTotal', { count: data.terms.length })}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            aria-pressed={showCards}
            onClick={() => setShowCards((v) => !v)}
            className={`rounded-full border px-2.5 py-1 font-medium transition-colors ${
              showCards
                ? 'border-[var(--ds-primary)] bg-[var(--ds-primary)]/10 text-[var(--ds-primary)]'
                : 'border-[var(--ds-border)] text-[var(--ds-fg-muted)]'
            }`}
          >
            {showCards ? '✓ ' : '+ '}
            {t('supportShowCards')}
          </button>
          <button
            type="button"
            aria-pressed={showLines}
            onClick={() => setShowLines((v) => !v)}
            className={`rounded-full border px-2.5 py-1 font-medium transition-colors ${
              showLines
                ? 'border-[var(--ds-primary)] bg-[var(--ds-primary)]/10 text-[var(--ds-primary)]'
                : 'border-[var(--ds-border)] text-[var(--ds-fg-muted)]'
            }`}
          >
            {showLines ? '✓ ' : '+ '}
            {t('supportShowLines')}
          </button>
          <button
            type="button"
            aria-pressed={highlight}
            onClick={() => setHighlight((v) => !v)}
            className={`rounded-full border px-2.5 py-1 font-medium transition-colors ${
              highlight
                ? 'border-[var(--ds-primary)] bg-[var(--ds-primary)]/10 text-[var(--ds-primary)]'
                : 'border-[var(--ds-border)] text-[var(--ds-fg-muted)]'
            }`}
          >
            {highlight ? '✓ ' : '+ '}
            {t('supportHighlight')}
          </button>
          <button
            type="button"
            data-testid="reading-support-viz-btn"
            onClick={() => setVizOpen(true)}
            className="rounded-full bg-[var(--ds-primary)] px-3 py-1 font-medium text-white hover:opacity-90 transition-opacity"
          >
            {t('supportVisualize')}
          </button>
        </div>
      </div>

      {/* 3 カラム本体 + SVG 結線オーバーレイ */}
      <div
        ref={containerRef}
        className={`relative grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden ${
          showCards ? 'lg:grid-cols-4' : 'lg:grid-cols-1'
        }`}
      >
        {showCards && showLines && (
          <svg
            data-testid="reading-support-svg"
            style={{ zIndex: 30 }}
            className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block"
          >
            {curves.map((c) => {
              const active = hoveredKey === c.termKey || selectedKey === c.termKey;
              return (
                <path
                  key={c.id}
                  d={c.d}
                  fill="none"
                  stroke={c.color}
                  strokeWidth={active ? 2.4 : 1.3}
                  opacity={active ? 0.92 : 0.55}
                />
              );
            })}
          </svg>
        )}

        {/* 左カード列 */}
        {showCards && (
          <div
            data-testid="reading-support-left-cards"
            className="hidden h-full min-h-0 overflow-y-auto border-r border-[var(--ds-border)] bg-[var(--ds-bg)] p-3 space-y-2.5 lg:block"
          >
            {leftTerms.map((term) => (
              <div
                key={term.key}
                onMouseEnter={() => setHoveredKey(term.key)}
                onMouseLeave={() => setHoveredKey(null)}
              >
                <SupportTermCard
                  term={term}
                  selected={selectedKey === term.key || hoveredKey === term.key}
                  onClick={() => handleTermClick(term)}
                />
              </div>
            ))}
          </div>
        )}

        {/* 中央テキスト列 */}
        <div
          ref={centerRef}
          data-testid="reading-support-center"
          className={`center-column relative z-20 h-full min-h-0 overflow-y-auto bg-[var(--ds-surface)] px-5 py-4 space-y-3.5 ${
            showCards ? 'lg:col-span-2' : 'mx-auto max-w-3xl w-full'
          }`}
        >
          {data.blocks.map((block) => (
            <p
              key={block.id}
              id={block.id}
              className="text-sm sm:text-base leading-relaxed text-[var(--ds-fg)]"
            >
              {block.segments.map((seg, i) => {
                if (seg.kind === 'text') {
                  return <span key={i}>{seg.text}</span>;
                }
                const style = CATEGORY_CHIP_STYLES[seg.category];
                const isActive = hoveredKey === seg.key || selectedKey === seg.key || focusId === seg.id;
                return (
                  <span
                    key={seg.id || i}
                    data-term-id={seg.id}
                    data-key={seg.key}
                    data-type={seg.category}
                    onMouseEnter={() => setHoveredKey(seg.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                    onClick={() => {
                      setHoveredKey(seg.key);
                      onSelect?.(seg.id);
                    }}
                    style={
                      highlight
                        ? {
                            backgroundColor: style.bg,
                            color: style.text,
                            borderBottom: `2px solid ${style.border}`,
                          }
                        : undefined
                    }
                    className={`reference-text cursor-pointer rounded px-1 py-0.5 font-medium transition-all ${
                      isActive ? 'ring-2 ring-[var(--ds-primary)]' : ''
                    }`}
                  >
                    {seg.text}
                  </span>
                );
              })}
            </p>
          ))}
        </div>

        {/* 右カード列 */}
        {showCards && (
          <div
            data-testid="reading-support-right-cards"
            className="hidden h-full min-h-0 overflow-y-auto border-l border-[var(--ds-border)] bg-[var(--ds-bg)] p-3 space-y-2.5 lg:block"
          >
            {rightTerms.map((term) => (
              <div
                key={term.key}
                onMouseEnter={() => setHoveredKey(term.key)}
                onMouseLeave={() => setHoveredKey(null)}
              >
                <SupportTermCard
                  term={term}
                  selected={selectedKey === term.key || hoveredKey === term.key}
                  onClick={() => handleTermClick(term)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 統計・出現分布モーダル */}
      {vizOpen && (
        <div
          data-testid="reading-support-viz-modal"
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setVizOpen(false)}
        >
          <div
            className="flex max-h-[85%] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--ds-border)] px-4 py-3">
              <h3 className="text-base font-semibold text-[var(--ds-fg)]">{t('supportVisualize')}</h3>
              <button
                type="button"
                onClick={() => setVizOpen(false)}
                className="rounded px-2 py-1 text-sm text-[var(--ds-fg-muted)] hover:bg-[var(--ds-bg)] hover:text-[var(--ds-fg)]"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center justify-between gap-2 border-b border-[var(--ds-border)] bg-[var(--ds-bg)] px-4 py-2 text-xs">
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setVizTab('frequency')}
                  className={`rounded-lg px-3 py-1 font-medium ${
                    vizTab === 'frequency'
                      ? 'bg-[var(--ds-primary)] text-white'
                      : 'border border-[var(--ds-border)] bg-[var(--ds-surface)] text-[var(--ds-fg)]'
                  }`}
                >
                  {t('supportFreqByType')}
                </button>
                <button
                  type="button"
                  onClick={() => setVizTab('terms')}
                  className={`rounded-lg px-3 py-1 font-medium ${
                    vizTab === 'terms'
                      ? 'bg-[var(--ds-primary)] text-white'
                      : 'border border-[var(--ds-border)] bg-[var(--ds-surface)] text-[var(--ds-fg)]'
                  }`}
                >
                  {t('supportTermsList')}
                </button>
              </div>

              {vizTab === 'terms' && (
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => setTermSort('frequency')}
                    className={`rounded px-2.5 py-1 ${
                      termSort === 'frequency'
                        ? 'bg-[var(--ds-primary)]/15 font-semibold text-[var(--ds-primary)]'
                        : 'text-[var(--ds-fg-muted)]'
                    }`}
                  >
                    {t('supportSortFreq')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTermSort('name')}
                    className={`rounded px-2.5 py-1 ${
                      termSort === 'name'
                        ? 'bg-[var(--ds-primary)]/15 font-semibold text-[var(--ds-primary)]'
                        : 'text-[var(--ds-fg-muted)]'
                    }`}
                  >
                    {t('supportSortName')}
                  </button>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {vizTab === 'frequency' ? (
                <div className="space-y-3">
                  {CATEGORIES.map((cat) => {
                    const count = categoryCounts[cat];
                    const pct = Math.round((count / maxCatCount) * 100);
                    return (
                      <div key={cat} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[var(--ds-fg)]">{catLabel(cat)}</span>
                          <span className="font-mono text-[var(--ds-fg-muted)]">
                            {t('supportCount', { count })}
                          </span>
                        </div>
                        <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--ds-bg)]">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: CATEGORY_STROKE_COLORS[cat],
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="divide-y divide-[var(--ds-border)]">
                  {sortedTerms.map((term) => (
                    <div
                      key={term.key}
                      onClick={() => {
                        setVizOpen(false);
                        handleTermClick(term);
                      }}
                      className="flex cursor-pointer items-center justify-between gap-3 py-2.5 px-2 hover:bg-[var(--ds-bg)] rounded"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-[var(--ds-fg)]">{term.label}</div>
                        <div className="text-xs text-[var(--ds-fg-muted)]">{catLabel(term.category)}</div>
                      </div>
                      <div className="font-mono text-xs font-medium text-[var(--ds-fg)]">
                        {t('supportCount', { count: term.count })}
                      </div>
                      <div
                        className="flex gap-1 rounded bg-[var(--ds-bg)] p-1 border border-[var(--ds-border)]"
                        title={t('supportDistributionHint')}
                      >
                        {Array.from({ length: 10 }, (_, d) => {
                          const has = term.positions.includes(d);
                          return (
                            <span
                              key={d}
                              title={`${d * 10}–${(d + 1) * 10}%`}
                              className="h-2.5 w-2.5 rounded-full"
                              style={{
                                backgroundColor: has
                                  ? CATEGORY_STROKE_COLORS[term.category]
                                  : 'rgba(128,128,128,0.22)',
                              }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
