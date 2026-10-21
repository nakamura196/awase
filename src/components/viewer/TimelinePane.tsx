'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { extractTimeline } from '@/lib/tei/corresp';

interface Props {
  tei: Document;
  focusId?: string | null;
  onSelect?: (id: string) => void;
}

export default function TimelinePane({ tei, focusId = null, onSelect }: Props) {
  const t = useTranslations('Viewer');
  const entries = useMemo(() => extractTimeline(tei), [tei]);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = listRef.current;
    if (!box || !focusId) return;
    const row = box.querySelector<HTMLElement>(`[data-awase-entry="${CSS.escape(focusId)}"]`);
    if (!row) return;
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTo({ top: top - box.clientHeight / 2 + row.clientHeight / 2 });
  }, [focusId, entries]);

  return (
    <section
      className="awase-timeline flex h-full flex-col rounded border border-[var(--ds-border)] bg-[var(--ds-surface)]"
      aria-label={t('timelineCount', { count: entries.length })}
      data-testid="timeline-pane"
    >
      <div className="border-b border-[var(--ds-border)] px-3 py-2 text-sm">
        <p className="font-bold text-[var(--ds-fg)]">{t('timelineCount', { count: entries.length })}</p>
      </div>
      <div ref={listRef} className="min-h-0 flex-1 overflow-auto p-3" tabIndex={0}>
        <ol
          className="ml-2 flex flex-col gap-2 border-l-2 border-[var(--ds-border)] pl-3"
          data-testid="timeline-list"
        >
          {entries.map((entry) => {
            const active = Boolean(entry.targetId && focusId === entry.targetId);
            const kindBadge =
              entry.kind === 'corresp-sent'
                ? t('correspSent')
                : entry.kind === 'corresp-received'
                  ? t('correspReceived')
                  : null;
            const dateBadge = entry.dateKey || entry.dateLabel;
            const showSubDate = entry.dateKey && entry.dateLabel && entry.dateLabel !== entry.dateKey;

            const inner = (
              <>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  {dateBadge && (
                    <span className="rounded bg-[var(--ds-bg)] px-1.5 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-[var(--ds-fg)]">
                      {dateBadge}
                    </span>
                  )}
                  {showSubDate && (
                    <span className="text-[11px] text-[var(--ds-fg-muted)]">({entry.dateLabel})</span>
                  )}
                  {kindBadge && (
                    <span className="rounded bg-[var(--ds-primary)] px-1.5 py-0.5 text-[10px] font-medium text-white">
                      {kindBadge}
                    </span>
                  )}
                  {entry.placeName && (
                    <span className="text-[11px] text-[var(--ds-fg-muted)]">📍 {entry.placeName}</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs font-medium text-[var(--ds-fg)]">{entry.title}</p>
                {entry.detail && entry.detail !== entry.title && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-[var(--ds-fg-muted)]">{entry.detail}</p>
                )}
              </>
            );

            return (
              <li
                key={entry.id}
                data-testid="timeline-item"
                data-awase-entry={entry.targetId ?? undefined}
                aria-current={active ? 'true' : undefined}
                className={`relative rounded px-2 py-1.5 ${
                  active
                    ? 'bg-[color-mix(in_srgb,var(--ds-primary)_20%,transparent)] outline outline-1 outline-[var(--ds-primary)]'
                    : 'hover:bg-[var(--ds-bg)]'
                }`}
              >
                <span
                  aria-hidden
                  className={`absolute -left-[19px] top-3 h-2.5 w-2.5 rounded-full border-2 ${
                    active
                      ? 'border-[var(--ds-primary)] bg-[var(--ds-primary)]'
                      : 'border-[var(--ds-border)] bg-[var(--ds-surface)]'
                  }`}
                />
                {entry.targetId ? (
                  <button
                    type="button"
                    onClick={() => onSelect?.(entry.targetId!)}
                    className="block w-full text-left"
                  >
                    {inner}
                  </button>
                ) : (
                  <div className="block w-full text-left">{inner}</div>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
