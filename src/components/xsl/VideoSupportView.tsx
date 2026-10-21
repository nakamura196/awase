'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  extractVideoSupportData,
  type SupportBlock,
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

export default function VideoSupportView({ tei, baseUrl, focusId = null, onSelect }: Props) {
  const t = useTranslations('Xsl');
  const data = useMemo(() => extractVideoSupportData(tei, baseUrl), [tei, baseUrl]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const activeCaptionRef = useRef<HTMLDivElement>(null);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(focusId);
  const [vizOpen, setVizOpen] = useState(false);
  const [termSort, setTermSort] = useState<'frequency' | 'name'>('frequency');

  const termMap = useMemo(() => new Map(data.terms.map((item) => [item.key, item])), [data.terms]);

  // 再生位置または選択された字幕ブロックを特定
  const activeBlock: SupportBlock | null = useMemo(() => {
    if (selectedBlockId) {
      const byId = data.blocks.find(
        (b) => b.id === selectedBlockId || b.terms.some((tr) => tr.id === selectedBlockId),
      );
      if (byId) return byId;
    }
    const byTime = data.blocks.find(
      (b) => b.start !== null && b.end !== null && currentTime >= b.start && currentTime <= b.end,
    );
    if (byTime) return byTime;
    return data.blocks.find((b) => b.terms.length > 0) ?? data.blocks[0] ?? null;
  }, [data.blocks, selectedBlockId, currentTime]);

  useEffect(() => {
    if (focusId) setSelectedBlockId(focusId);
  }, [focusId]);

  useEffect(() => {
    activeCaptionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [activeBlock?.id]);

  // 左カラム「再生中の箇所の用語」に出す用語一覧
  // 現在のブロックに用語が無い場合（冒頭BGM「♪♪♪」など）は、最初に用語が現れるブロックの用語を出す
  const currentTerms: SupportTerm[] = useMemo(() => {
    const sourceBlock =
      activeBlock && activeBlock.terms.length > 0
        ? activeBlock
        : data.blocks.find((b) => b.terms.length > 0) ?? null;
    if (!sourceBlock) return [];
    const seen = new Set<string>();
    const out: SupportTerm[] = [];
    for (const tr of sourceBlock.terms) {
      if (seen.has(tr.key)) continue;
      seen.add(tr.key);
      const found = termMap.get(tr.key);
      if (found) out.push(found);
    }
    return out;
  }, [activeBlock, data.blocks, termMap]);

  const sortedTerms = useMemo(() => {
    const list = [...data.terms];
    if (termSort === 'frequency') {
      list.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ja'));
    } else {
      list.sort((a, b) => a.label.localeCompare(b.label, 'ja'));
    }
    return list;
  }, [data.terms, termSort]);

  const handleCaptionClick = (block: SupportBlock) => {
    setSelectedBlockId(block.id);
    onSelect?.(block.id);
    if (block.start !== null) {
      setCurrentTime(block.start);
      if (videoRef.current) {
        try {
          videoRef.current.currentTime = block.start;
        } catch {
          /* jsdom 等の未実装環境では無視 */
        }
      }
    }
  };

  const handleTermCardClick = (term: SupportTerm) => {
    const targetBlock = data.blocks.find((b) => b.terms.some((tr) => tr.key === term.key));
    if (targetBlock) handleCaptionClick(targetBlock);
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

  const duration = Math.max(data.duration, 1);

  return (
    <div
      data-testid="video-support-view"
      className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded border border-[var(--ds-border)] bg-[var(--ds-bg)]"
    >
      {/* サブツールバー */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-2 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-semibold text-[var(--ds-fg)] truncate">{data.title || t('videoSupportTitle')}</span>
          <span className="rounded-full bg-[var(--ds-bg)] px-2 py-0.5 text-[11px] text-[var(--ds-fg-muted)] border border-[var(--ds-border)]">
            {t('supportCaptionsTotal', { count: data.blocks.length })}
          </span>
          <span className="rounded-full bg-[var(--ds-bg)] px-2 py-0.5 text-[11px] text-[var(--ds-fg-muted)] border border-[var(--ds-border)]">
            {t('supportTermsTotal', { count: data.terms.length })}
          </span>
        </div>

        <button
          type="button"
          data-testid="video-support-viz-btn"
          onClick={() => setVizOpen(true)}
          className="rounded-full bg-[var(--ds-primary)] px-3 py-1 font-medium text-white hover:opacity-90 transition-opacity"
        >
          {t('supportVisualize')}
        </button>
      </div>

      {/* 3 カラム本体 */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-4">
        {/* 左カラム: 再生中・選択中の箇所の用語 */}
        <div
          data-testid="video-support-current-terms"
          className="hidden h-full min-h-0 overflow-y-auto border-r border-[var(--ds-border)] bg-[var(--ds-bg)] p-3 space-y-2.5 lg:block"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-fg-muted)]">
            {t('supportCurrentTerms')} ({currentTerms.length})
          </h3>
          {currentTerms.map((term) => (
            <SupportTermCard
              key={term.key}
              term={term}
              showCount
              onClick={() => handleTermCardClick(term)}
            />
          ))}
        </div>

        {/* 中央カラム: 動画プレーヤー + 字幕一覧 */}
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--ds-surface)] lg:col-span-2">
          {data.videoUrl && (
            <div
              style={{ height: '46%' }}
              className="flex shrink-0 items-center justify-center bg-black p-2"
            >
              <video
                ref={videoRef}
                data-testid="video-support-player"
                src={data.videoUrl}
                controls
                muted
                playsInline
                onTimeUpdate={() => {
                  if (videoRef.current) {
                    setSelectedBlockId(null);
                    setCurrentTime(videoRef.current.currentTime);
                  }
                }}
                className="h-full max-h-full max-w-full rounded object-contain"
              />
            </div>
          )}

          <div
            data-testid="video-support-captions"
            className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2"
          >
            <h3 className="sticky top-0 z-10 bg-[var(--ds-surface)] py-1 text-xs font-semibold uppercase tracking-wide text-[var(--ds-fg-muted)]">
              {t('supportCaptionList')}
            </h3>
            {data.blocks.map((block) => {
              const isCurrent = activeBlock?.id === block.id;
              const uniqueBlockTerms: { key: string; text: string; category: SupportCategory }[] = [];
              const seen = new Set<string>();
              for (const tr of block.terms) {
                if (seen.has(tr.key)) continue;
                seen.add(tr.key);
                uniqueBlockTerms.push({ key: tr.key, text: tr.text, category: tr.category });
              }

              return (
                <div
                  key={block.id}
                  ref={isCurrent ? activeCaptionRef : null}
                  data-testid="video-support-caption-item"
                  onClick={() => handleCaptionClick(block)}
                  className={`cursor-pointer rounded-lg border p-2.5 transition-colors ${
                    isCurrent
                      ? 'border-[var(--ds-primary)] bg-[var(--ds-primary)]/10'
                      : 'border-[var(--ds-border)] bg-[var(--ds-bg)] hover:border-[var(--ds-primary)]'
                  }`}
                >
                  <div className="mb-1.5 flex flex-wrap items-center justify-between gap-1.5">
                    {block.start !== null ? (
                      <span className="font-mono text-xs text-[var(--ds-fg-muted)]">
                        {block.start.toFixed(2)}{t('supportSec')}
                        {block.end !== null ? ` – ${block.end.toFixed(2)}${t('supportSec')}` : ''}
                      </span>
                    ) : (
                      <span className="font-mono text-xs text-[var(--ds-fg-muted)]">#{block.id}</span>
                    )}

                    {uniqueBlockTerms.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {uniqueBlockTerms.map((tr) => {
                          const chip = CATEGORY_CHIP_STYLES[tr.category];
                          return (
                            <span
                              key={tr.key}
                              style={{ backgroundColor: chip.bg, color: chip.text }}
                              className="rounded px-1.5 py-0.5 text-[11px] font-medium"
                            >
                              {tr.text}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <p className="text-sm leading-relaxed text-[var(--ds-fg)]">
                    {block.segments.map((seg, idx) => {
                      if (seg.kind === 'text') return <span key={idx}>{seg.text}</span>;
                      const chip = CATEGORY_CHIP_STYLES[seg.category];
                      return (
                        <span
                          key={seg.id || idx}
                          style={{ backgroundColor: chip.bg, color: chip.text }}
                          className="rounded px-1 py-0.5 font-medium"
                        >
                          {seg.text}
                        </span>
                      );
                    })}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* 右カラム: 全用語カード一覧 */}
        <div
          data-testid="video-support-terms-list"
          className="hidden h-full min-h-0 overflow-y-auto border-l border-[var(--ds-border)] bg-[var(--ds-bg)] p-3 space-y-2.5 lg:block"
        >
          <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--ds-fg-muted)]">
            {t('supportTermsList')} ({data.terms.length})
          </h3>
          {data.terms.map((term) => (
            <SupportTermCard
              key={term.key}
              term={term}
              showCount
              onClick={() => handleTermCardClick(term)}
            />
          ))}
        </div>
      </div>

      {/* 出現タイムライン可視化モーダル */}
      {vizOpen && (
        <div
          data-testid="video-support-viz-modal"
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setVizOpen(false)}
        >
          <div
            className="flex max-h-[85%] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[var(--ds-border)] px-4 py-3">
              <h3 className="text-base font-semibold text-[var(--ds-fg)]">{t('supportVisualize')}</h3>
              <div className="flex items-center gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setTermSort('frequency')}
                  className={`rounded px-2.5 py-1 ${
                    termSort === 'frequency'
                      ? 'bg-[var(--ds-primary)] text-white'
                      : 'border border-[var(--ds-border)] bg-[var(--ds-bg)] text-[var(--ds-fg)]'
                  }`}
                >
                  {t('supportSortFreq')}
                </button>
                <button
                  type="button"
                  onClick={() => setTermSort('name')}
                  className={`rounded px-2.5 py-1 ${
                    termSort === 'name'
                      ? 'bg-[var(--ds-primary)] text-white'
                      : 'border border-[var(--ds-border)] bg-[var(--ds-bg)] text-[var(--ds-fg)]'
                  }`}
                >
                  {t('supportSortName')}
                </button>
                <button
                  type="button"
                  onClick={() => setVizOpen(false)}
                  className="rounded px-2 py-1 text-sm text-[var(--ds-fg-muted)] hover:bg-[var(--ds-bg)] hover:text-[var(--ds-fg)]"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-2.5">
              {sortedTerms.map((term) => {
                const segLen = duration / 10;
                return (
                  <div
                    key={term.key}
                    onClick={() => {
                      setVizOpen(false);
                      handleTermCardClick(term);
                    }}
                    className="cursor-pointer rounded-lg border border-[var(--ds-border)] bg-[var(--ds-bg)] p-3 hover:border-[var(--ds-primary)]"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--ds-fg)]">{term.label}</span>
                        <span className="text-[var(--ds-fg-muted)]">({catLabel(term.category)})</span>
                      </div>
                      <span className="font-mono font-medium text-[var(--ds-primary)]">
                        {t('supportCount', { count: term.count })}
                      </span>
                    </div>
                    <div className="mt-2 flex h-3 w-full overflow-hidden rounded border border-[var(--ds-border)]">
                      {Array.from({ length: 10 }, (_, idx) => {
                        const segStart = idx * segLen;
                        const segEnd = segStart + segLen;
                        const has =
                          term.timestamps.length > 0
                            ? term.timestamps.some((ts) => ts >= segStart && ts < segEnd)
                            : term.positions.includes(idx);
                        return (
                          <div
                            key={idx}
                            title={
                              term.timestamps.length > 0
                                ? `${segStart.toFixed(0)}${t('supportSec')} – ${segEnd.toFixed(0)}${t('supportSec')}`
                                : `${idx * 10}–${(idx + 1) * 10}%`
                            }
                            className="flex-1 border-r border-[var(--ds-border)] last:border-r-0"
                            style={{
                              backgroundColor: has
                                ? CATEGORY_STROKE_COLORS[term.category]
                                : 'transparent',
                            }}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
