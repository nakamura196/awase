'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { extractSpeeches, groupBySpeaker, type SpeakerGroup } from '@/lib/tei/speech';

interface Props {
  tei: Document;
  /** 選んでいる発話（URL の id）。本文の sp / said 要素と同じ id */
  focusId?: string | null;
  /** 発話を押したとき。その箇所の id を渡す */
  onSelect?: (id: string) => void;
}

const SPEAKER_COLORS = [
  '#096fbe', // UTokyo blue
  '#d97706', // amber
  '#059669', // emerald
  '#7c3aed', // violet
  '#e11d48', // rose
  '#0891b2', // cyan
  '#4f46e5', // indigo
  '#64748b', // slate
];

export default function SpeechPane({ tei, focusId = null, onSelect }: Props) {
  const t = useTranslations('Viewer');
  const items = useMemo(() => extractSpeeches(tei), [tei]);
  const groups = useMemo(() => groupBySpeaker(items), [items]);
  const [filter, setFilter] = useState<{ speaker: string | null; atFocusId: string | null }>({
    speaker: null,
    atFocusId: null,
  });
  const [sortBy, setSortBy] = useState<'count' | 'chars'>('count');
  const listRef = useRef<HTMLDivElement>(null);

  const totalChars = useMemo(() => items.reduce((acc, it) => acc + it.charCount, 0), [items]);
  const maxItemChars = useMemo(() => Math.max(1, ...items.map((it) => it.charCount)), [items]);

  const speakerColorMap = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g, idx) => {
      map.set(g.key, g.key === '__unknown__' ? '#94a3b8' : SPEAKER_COLORS[idx % SPEAKER_COLORS.length]);
    });
    return map;
  }, [groups]);

  const sortedGroups = useMemo(() => {
    if (sortBy === 'chars') {
      return [...groups].sort((a, b) => b.charCount - a.charCount || b.count - a.count);
    }
    return groups;
  }, [groups, sortBy]);

  const focusedItem = useMemo(
    () => (focusId ? items.find((item) => item.id === focusId) : undefined),
    [focusId, items],
  );

  const selectedSpeaker: string | null = useMemo(() => {
    if (!filter.speaker) return null;
    if (!groups.some((g) => g.key === filter.speaker)) return null;
    if (filter.atFocusId !== focusId && focusedItem && focusedItem.speakerKey !== filter.speaker) {
      return null;
    }
    return filter.speaker;
  }, [filter, groups, focusId, focusedItem]);

  const filteredItems = useMemo(
    () => (selectedSpeaker ? items.filter((item) => item.speakerKey === selectedSpeaker) : items),
    [items, selectedSpeaker],
  );

  const maxCount = useMemo(() => Math.max(1, ...groups.map((g) => g.count)), [groups]);
  const maxChars = useMemo(() => Math.max(1, ...groups.map((g) => g.charCount)), [groups]);

  // 選んだ発話の行を、一覧の中ほどへ動かす。ページ全体は動かさない（scrollIntoView を使わない）
  useEffect(() => {
    const box = listRef.current;
    if (!box || !focusId) return;
    const row = box.querySelector<HTMLElement>(`[data-awase-entry="${CSS.escape(focusId)}"]`);
    if (!row) return;
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTo({ top: top - box.clientHeight / 2 + row.clientHeight / 2 });
  }, [focusId, filteredItems]);

  const handleSpeakerClick = (group: SpeakerGroup) => {
    const nextSpeaker = selectedSpeaker === group.key ? null : group.key;
    const firstId = group.items[0]?.id ?? null;
    setFilter({ speaker: nextSpeaker, atFocusId: firstId ?? focusId });
    if (firstId) {
      onSelect?.(firstId);
    }
  };

  return (
    <section
      className="awase-speech flex h-full flex-col rounded border border-[var(--ds-border)] bg-[var(--ds-surface)]"
      aria-label={t('speechCount', { count: items.length })}
      data-testid="speech-pane"
    >
      <div className="border-b border-[var(--ds-border)] px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <p className="font-bold text-[var(--ds-fg)]">{t('speechCount', { count: items.length })}</p>
            <span className="text-xs tabular-nums text-[var(--ds-fg-muted)]">
              {t('speechTotalChars', { chars: totalChars })}
            </span>
          </div>
          {selectedSpeaker !== null && (
            <button
              type="button"
              onClick={() => setFilter({ speaker: null, atFocusId: focusId })}
              className="rounded bg-[var(--ds-primary)] px-2 py-0.5 text-xs text-white"
            >
              {t('speechAll')} ({items.length})
            </button>
          )}
        </div>

        {groups.length > 0 && (
          <details open className="mt-1.5 text-[var(--ds-fg-muted)]" data-testid="speech-speakers">
            <summary className="cursor-pointer select-none text-xs font-medium text-[var(--ds-fg)]">
              {t('speakers', { count: groups.length })}
            </summary>

            {/* 話者シェアの積み上げバー */}
            <div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded bg-[var(--ds-bg)]" aria-hidden="true">
              {sortedGroups.map((g) => {
                const displayName = g.label || t('speechUnknownSpeaker');
                const pct =
                  sortBy === 'chars'
                    ? (g.charCount / Math.max(1, totalChars)) * 100
                    : (g.count / Math.max(1, items.length)) * 100;
                return (
                  <div
                    key={g.key}
                    style={{
                      width: `${pct}%`,
                      backgroundColor: speakerColorMap.get(g.key) ?? '#096fbe',
                    }}
                    title={`${displayName}: ${g.count} (${g.charCount}c)`}
                  />
                );
              })}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1">
              <button
                type="button"
                aria-pressed={selectedSpeaker === null}
                onClick={() => setFilter({ speaker: null, atFocusId: focusId })}
                className={`rounded px-2 py-0.5 text-xs ${
                  selectedSpeaker === null
                    ? 'bg-[var(--ds-primary)] text-white'
                    : 'bg-[var(--ds-bg)] text-[var(--ds-fg-muted)] hover:text-[var(--ds-fg)]'
                }`}
              >
                {t('speechAll')} ({items.length})
              </button>

              <div className="flex items-center gap-0.5 rounded bg-[var(--ds-bg)] p-0.5 text-[11px]">
                <button
                  type="button"
                  onClick={() => setSortBy('count')}
                  className={`rounded px-1.5 py-0.5 ${
                    sortBy === 'count' ? 'bg-[var(--ds-surface)] font-semibold text-[var(--ds-fg)] shadow-2xs' : ''
                  }`}
                >
                  {t('speechSortByCount')}
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('chars')}
                  className={`rounded px-1.5 py-0.5 ${
                    sortBy === 'chars' ? 'bg-[var(--ds-surface)] font-semibold text-[var(--ds-fg)] shadow-2xs' : ''
                  }`}
                >
                  {t('speechSortByChars')}
                </button>
              </div>
            </div>

            <ul className="mt-1 max-h-28 overflow-auto flex flex-col gap-0.5">
              {sortedGroups.map((g) => {
                const chosen = selectedSpeaker === g.key;
                const displayName = g.label || t('speechUnknownSpeaker');
                const color = speakerColorMap.get(g.key) ?? '#096fbe';
                const avg = Math.round(g.charCount / Math.max(1, g.count));
                const rate = Math.round(
                  sortBy === 'chars'
                    ? (g.charCount / Math.max(1, totalChars)) * 100
                    : (g.count / Math.max(1, items.length)) * 100,
                );
                const barPct =
                  sortBy === 'chars' ? (g.charCount / maxChars) * 100 : (g.count / maxCount) * 100;
                return (
                  <li
                    key={g.key}
                    className={`flex items-center gap-1 rounded px-1 py-0.5 ${
                      chosen
                        ? 'bg-[color-mix(in_srgb,var(--ds-primary)_20%,transparent)] outline outline-1 outline-[var(--ds-primary)]'
                        : 'hover:bg-[var(--ds-bg)]'
                    }`}
                  >
                    <button
                      type="button"
                      aria-pressed={chosen}
                      onClick={() => handleSpeakerClick(g)}
                      title={displayName}
                      className="grid min-w-0 flex-1 grid-cols-[minmax(4.5rem,auto)_1fr_auto] items-center gap-x-2 text-left text-xs"
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: color }}
                          aria-hidden="true"
                        />
                        <span className="truncate font-medium text-[var(--ds-fg)]">{displayName}</span>
                      </span>
                      <span className="h-2 rounded bg-[var(--ds-bg)]" aria-hidden>
                        <span
                          className="block h-full rounded"
                          style={{ width: `${barPct}%`, backgroundColor: color }}
                        />
                      </span>
                      <span className="whitespace-nowrap tabular-nums text-[11px] text-[var(--ds-fg-muted)]">
                        {t('speechDetailStat', { count: g.count, chars: g.charCount, avg, rate })}
                      </span>
                    </button>
                    {g.externalUrl && (
                      <a
                        href={g.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={t('entityExternalLink')}
                        aria-label={t('entityExternalLink')}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0 rounded px-1 text-xs text-[var(--ds-fg-muted)] hover:bg-[var(--ds-bg)] hover:text-[var(--ds-fg)]"
                      >
                        ↗
                      </a>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* 発話ごとの文字数推移（バーチャート） */}
            {items.length > 1 && (
              <div data-testid="speech-timeline" className="mt-1.5 border-t border-[var(--ds-border)] pt-1.5">
                <p className="mb-1 text-[11px] font-medium text-[var(--ds-fg-muted)]">{t('speechTimeline')}</p>
                <div className="flex h-8 w-full min-w-0 items-end overflow-hidden rounded bg-[var(--ds-bg)] p-1">
                  {items.map((it) => {
                    const active = it.id === focusId;
                    const dimmed = selectedSpeaker !== null && it.speakerKey !== selectedSpeaker;
                    const hPct = Math.max(12, Math.round((it.charCount / maxItemChars) * 100));
                    const color = speakerColorMap.get(it.speakerKey) ?? '#096fbe';
                    const spk = it.speakerLabel || t('speechUnknownSpeaker');
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => onSelect?.(it.id)}
                        title={`#${it.n} ${spk} (${it.charCount}字)`}
                        aria-label={`#${it.n} ${spk}`}
                        className={`min-w-0 flex-1 rounded-t transition-opacity ${
                          active ? 'ring-1 ring-[var(--ds-fg)]' : dimmed ? 'opacity-25' : 'opacity-85 hover:opacity-100'
                        }`}
                        style={{
                          height: `${hPct}%`,
                          backgroundColor: color,
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </details>
        )}
      </div>

      <div
        ref={listRef}
        data-testid="speech-list"
        className="min-h-0 flex-1 overflow-auto p-2"
        tabIndex={0}
      >
        <div className="flex flex-col gap-1">
          {filteredItems.map((item) => {
            const active = item.id === focusId;
            const speakerName = item.speakerLabel || t('speechUnknownSpeaker');
            const color = speakerColorMap.get(item.speakerKey) ?? '#096fbe';
            return (
              <button
                key={item.id}
                type="button"
                data-testid="speech-item"
                data-awase-entry={item.id}
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect?.(item.id)}
                className={`flex w-full flex-col gap-1 rounded px-2 py-1.5 text-left ${
                  active
                    ? 'bg-[color-mix(in_srgb,var(--ds-primary)_20%,transparent)] outline outline-1 outline-[var(--ds-primary)]'
                    : 'hover:bg-[var(--ds-bg)]'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="tabular-nums text-[var(--ds-fg-muted)]">#{item.n}</span>
                    <span className="inline-flex items-center gap-1 rounded bg-[var(--ds-bg)] px-1.5 py-0.5 font-medium text-[var(--ds-fg)]">
                      <span
                        className="inline-block h-2 w-2 rounded-full"
                        style={{ backgroundColor: color }}
                        aria-hidden="true"
                      />
                      {speakerName}
                    </span>
                    {item.stage && (
                      <span className="italic text-[var(--ds-fg-muted)]">{item.stage}</span>
                    )}
                  </div>
                  <span className="tabular-nums text-[11px] text-[var(--ds-fg-muted)]">
                    {t('speechItemChars', { chars: item.charCount })}
                  </span>
                </div>
                <p className={`text-xs text-[var(--ds-fg)] ${active ? '' : 'line-clamp-3'}`}>
                  {item.text}
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
