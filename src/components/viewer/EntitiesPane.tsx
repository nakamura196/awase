'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ENTITY_KINDS, readEntities, type EntityGroup, type EntityKind, type EntityVariant } from '@/lib/tei/entities';

interface Props {
  tei: Document;
  /** 選んでいる箇所（URL の id）。本文の要素と同じ id */
  focusId?: string | null;
  /** 箇所を押したとき。その箇所の id を渡す */
  onSelect?: (id: string) => void;
}

const KIND_LABEL_KEY: Record<EntityKind, 'entityPerson' | 'entityPlace' | 'entityOrg' | 'entityDate'> = {
  persName: 'entityPerson',
  placeName: 'entityPlace',
  orgName: 'entityOrg',
  date: 'entityDate',
};

const VARIANT_COLORS = [
  '#096fbe', // UTokyo blue
  '#d97706', // amber
  '#059669', // emerald
  '#7c3aed', // violet
  '#e11d48', // rose
  '#0891b2', // cyan
  '#4f46e5', // indigo
  '#65a30d', // lime
];

function variantColor(index: number): string {
  return VARIANT_COLORS[index % VARIANT_COLORS.length];
}

function isExternalUrl(ref: string | null): ref is string {
  return Boolean(ref && /^https?:\/\//.test(ref));
}

export default function EntitiesPane({ tei, focusId, onSelect }: Props) {
  const t = useTranslations('Viewer');
  const { mentions, groups } = useMemo(() => readEntities(tei), [tei]);
  const [filter, setFilter] = useState<{ kind: 'all' | EntityKind; atFocusId: string | null | undefined }>({
    kind: 'all',
    atFocusId: undefined,
  });
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const availableKinds = useMemo(
    () => ENTITY_KINDS.filter((k) => groups.some((g) => g.kind === k)),
    [groups],
  );

  const focusedMention = useMemo(
    () => (focusId ? mentions.find((m) => m.id === focusId) : undefined),
    [focusId, mentions],
  );

  const activeFilter: 'all' | EntityKind = useMemo(() => {
    if (filter.kind === 'all') return 'all';
    if (!availableKinds.includes(filter.kind)) return 'all';
    if (filter.atFocusId !== focusId && focusedMention && focusedMention.kind !== filter.kind) {
      return 'all';
    }
    return filter.kind;
  }, [filter, availableKinds, focusId, focusedMention]);

  const filteredGroups = useMemo(
    () => (activeFilter === 'all' ? groups : groups.filter((g) => g.kind === activeFilter)),
    [groups, activeFilter],
  );

  // 初期状態では、複数の呼称（呼び名の変化）を持つ最上位グループを自動で開いておく
  const defaultExpandedKey = useMemo(
    () => filteredGroups.find((g) => g.variants.length > 1)?.key ?? null,
    [filteredGroups],
  );

  const maxCount = useMemo(
    () => Math.max(1, ...filteredGroups.map((g) => g.mentions.length)),
    [filteredGroups],
  );

  // 選んだ箇所の行を、一覧の中ほどへ動かす。ページ全体は動かさない（scrollIntoView を使わない）
  useEffect(() => {
    const box = list.current;
    if (!box || !focusId) return;
    const row =
      box.querySelector<HTMLElement>(`[data-awase-entry="${CSS.escape(focusId)}"]`) ??
      (focusedMention
        ? box.querySelector<HTMLElement>(`[data-awase-entity-group="${CSS.escape(focusedMention.key)}"]`)
        : null);
    if (!row) return;
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTo({ top: top - box.clientHeight / 2 + row.clientHeight / 2 });
  }, [focusId, focusedMention, filteredGroups]);

  const handleGroupClick = (group: EntityGroup) => {
    setSelectedGroupKey((prev) => (prev === group.key && group.mentions.length === 0 ? null : group.key));
    if (!onSelect || group.mentions.length === 0) return;
    const idx = focusId ? group.mentions.findIndex((m) => m.id === focusId) : -1;
    const next = idx >= 0 ? group.mentions[(idx + 1) % group.mentions.length] : group.mentions[0];
    onSelect(next.id);
  };

  const handleVariantClick = (variant: EntityVariant) => {
    if (!onSelect || variant.mentionIds.length === 0) return;
    const idx = focusId ? variant.mentionIds.indexOf(focusId) : -1;
    const nextId = idx >= 0 ? variant.mentionIds[(idx + 1) % variant.mentionIds.length] : variant.mentionIds[0];
    onSelect(nextId);
  };

  return (
    <section
      className="awase-entities flex h-full flex-col rounded border border-[var(--ds-border)] bg-[var(--ds-surface)]"
      aria-label={t('entities')}
      data-testid="entities-pane"
    >
      <div className="border-b border-[var(--ds-border)] px-3 py-2 text-sm">
        <p className="font-bold text-[var(--ds-fg)]">{t('entitiesCount', { count: mentions.length })}</p>
        {availableKinds.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label={t('entities')}>
            {availableKinds.length > 1 && (
              <button
                type="button"
                aria-pressed={activeFilter === 'all'}
                onClick={() => setFilter({ kind: 'all', atFocusId: focusId })}
                className={`rounded px-2 py-0.5 text-xs ${
                  activeFilter === 'all'
                    ? 'bg-[var(--ds-primary)] text-white'
                    : 'bg-[var(--ds-bg)] text-[var(--ds-fg-muted)] hover:text-[var(--ds-fg)]'
                }`}
              >
                {t('entityAll')} ({groups.length})
              </button>
            )}
            {availableKinds.map((kind) => {
              const count = groups.filter((g) => g.kind === kind).length;
              const chosen = activeFilter === kind;
              return (
                <button
                  key={kind}
                  type="button"
                  aria-pressed={chosen}
                  onClick={() => setFilter({ kind, atFocusId: focusId })}
                  className={`rounded px-2 py-0.5 text-xs ${
                    chosen
                      ? 'bg-[var(--ds-primary)] text-white'
                      : 'bg-[var(--ds-bg)] text-[var(--ds-fg-muted)] hover:text-[var(--ds-fg)]'
                  }`}
                >
                  {t(KIND_LABEL_KEY[kind])} ({count})
                </button>
              );
            })}
          </div>
        )}
      </div>
      <div ref={list} className="min-h-0 flex-1 overflow-auto p-2" tabIndex={0}>
        <ul className="flex flex-col gap-1">
          {filteredGroups.map((group) => {
            const hasFocusMention = Boolean(focusId && group.mentions.some((m) => m.id === focusId));
            const selected =
              hasFocusMention ||
              selectedGroupKey === group.key ||
              (!focusId && selectedGroupKey === null && defaultExpandedKey === group.key);
            const externalRef = isExternalUrl(group.ref) ? group.ref : null;
            const hasMultipleVariants = group.variants.length > 1;
            const variantIndexByText = new Map(group.variants.map((v, idx) => [v.text, idx]));

            return (
              <li
                key={group.key}
                data-awase-entity-group={group.key}
                data-awase-entry={group.mentions.length === 1 ? group.mentions[0].id : undefined}
                className={`rounded ${
                  selected
                    ? 'bg-[color-mix(in_srgb,var(--ds-primary)_12%,transparent)] outline outline-1 outline-[var(--ds-primary)]'
                    : 'hover:bg-[var(--ds-bg)]'
                }`}
              >
                <div className="flex items-center gap-1 px-2 py-1">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handleGroupClick(group)}
                    className="grid min-w-0 flex-1 grid-cols-[minmax(4rem,auto)_1fr_auto] items-center gap-x-2 text-left text-xs"
                  >
                    <span className="truncate font-medium text-[var(--ds-fg)]">{group.label}</span>
                    <span className="h-2 rounded bg-[var(--ds-bg)]" aria-hidden>
                      <span
                        className="block h-full rounded bg-[var(--ds-primary)]"
                        style={{ width: `${(group.mentions.length / maxCount) * 100}%` }}
                      />
                    </span>
                    <span className="flex items-center gap-1 whitespace-nowrap tabular-nums text-[var(--ds-fg-muted)]">
                      {hasMultipleVariants && (
                        <span className="rounded bg-[var(--ds-primary)]/15 px-1.5 py-0.2 text-[10px] font-medium text-[var(--ds-primary)]">
                          {t('entityVariantsCount', { count: group.variants.length })}
                        </span>
                      )}
                      {group.mentions.length > 0 && (
                        <span>{t('entityMentions', { count: group.mentions.length })}</span>
                      )}
                    </span>
                  </button>
                  {externalRef && (
                    <a
                      href={externalRef}
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
                </div>

                {(group.description || group.image) && (
                  <div className="flex items-start gap-2.5 px-2 pb-1.5 text-xs text-[var(--ds-fg-muted)]">
                    {group.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={group.image}
                        alt={group.label}
                        className="h-12 w-12 shrink-0 rounded border border-[var(--ds-border)] object-cover"
                      />
                    )}
                    {group.description && (
                      <p className={`leading-relaxed ${selected ? 'text-[var(--ds-fg)]' : 'line-clamp-2'}`}>
                        {group.description}
                      </p>
                    )}
                  </div>
                )}

                {selected && hasMultipleVariants && (
                  <div className="mx-2 mb-2 space-y-2 rounded border border-[var(--ds-border)] bg-[var(--ds-surface)] p-2 text-xs">
                    {/* 1. 呼称の内訳（頻度グラフ） */}
                    <div data-testid="entity-variants" className="space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--ds-fg-muted)]">
                        <span>{t('entityVariantsHeading')}</span>
                        <span className="tabular-nums">{t('entityVariantsCount', { count: group.variants.length })}</span>
                      </div>
                      {/* 積み上げシェアバー */}
                      <div className="flex h-2.5 w-full overflow-hidden rounded bg-[var(--ds-bg)]" aria-hidden="true">
                        {group.variants.map((v, vIdx) => (
                          <div
                            key={v.text}
                            style={{
                              width: `${(v.count / Math.max(1, group.mentions.length)) * 100}%`,
                              backgroundColor: variantColor(vIdx),
                            }}
                            title={`${v.text}: ${v.count}`}
                          />
                        ))}
                      </div>
                      {/* 呼称ごとの横棒リスト */}
                      <div className="max-h-24 space-y-0.5 overflow-y-auto pr-0.5">
                        {group.variants.map((v, vIdx) => {
                          const rate = Math.round((v.count / Math.max(1, group.mentions.length)) * 100);
                          const isFocusedVariant = Boolean(focusId && v.mentionIds.includes(focusId));
                          const maxVarCount = group.variants[0]?.count ?? 1;
                          return (
                            <div key={v.text}>
                              <button
                                type="button"
                                onClick={() => handleVariantClick(v)}
                                className={`grid w-full grid-cols-[minmax(4.5rem,auto)_1fr_auto] items-center gap-x-2 rounded px-1.5 py-0.5 text-left transition-colors ${
                                  isFocusedVariant
                                    ? 'bg-[var(--ds-primary)]/15 font-semibold text-[var(--ds-fg)]'
                                    : 'hover:bg-[var(--ds-bg)] text-[var(--ds-fg)]'
                                }`}
                              >
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <span
                                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                                    style={{ backgroundColor: variantColor(vIdx) }}
                                    aria-hidden="true"
                                  />
                                  <span className="truncate">{v.text}</span>
                                </span>
                                <span className="h-1.5 rounded bg-[var(--ds-bg)]" aria-hidden="true">
                                  <span
                                    className="block h-full rounded"
                                    style={{
                                      width: `${(v.count / maxVarCount) * 100}%`,
                                      backgroundColor: variantColor(vIdx),
                                    }}
                                  />
                                </span>
                                <span className="whitespace-nowrap tabular-nums text-[11px] text-[var(--ds-fg-muted)]">
                                  {t('entityVariantStat', { count: v.count, rate })}
                                </span>
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* 2. 呼び名の変化（本文の出現順シーケンス） */}
                    <div data-testid="entity-sequence" className="space-y-1 border-t border-[var(--ds-border)] pt-1.5">
                      <p className="text-[11px] font-semibold text-[var(--ds-fg-muted)]">
                        {t('entitySequenceHeading')}
                      </p>
                      <div className="flex max-h-24 flex-wrap items-center gap-1 overflow-y-auto">
                        {(() => {
                          const compress = group.mentions.length > 12;
                          const runs: { text: string; startIdx: number; mentionIds: string[] }[] = [];
                          for (let i = 0; i < group.mentions.length; i++) {
                            const m = group.mentions[i];
                            const last = runs[runs.length - 1];
                            if (compress && last && last.text === m.text) {
                              last.mentionIds.push(m.id);
                            } else {
                              runs.push({ text: m.text, startIdx: i + 1, mentionIds: [m.id] });
                            }
                          }
                          return runs.map((run) => {
                            const active = Boolean(focusId && run.mentionIds.includes(focusId));
                            const entryId = active && focusId ? focusId : run.mentionIds[0];
                            const vIdx = variantIndexByText.get(run.text) ?? 0;
                            const color = variantColor(vIdx);
                            return (
                              <button
                                key={run.mentionIds[0]}
                                type="button"
                                data-awase-entry={entryId}
                                aria-pressed={active}
                                onClick={() => {
                                  if (!onSelect) return;
                                  const idx = focusId ? run.mentionIds.indexOf(focusId) : -1;
                                  const nextId =
                                    idx >= 0 ? run.mentionIds[(idx + 1) % run.mentionIds.length] : run.mentionIds[0];
                                  onSelect(nextId);
                                }}
                                className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] tabular-nums transition-colors ${
                                  active
                                    ? 'border-[var(--ds-primary)] bg-[var(--ds-primary)] text-white font-semibold'
                                    : 'border-[var(--ds-border)] bg-[var(--ds-bg)] text-[var(--ds-fg)] hover:border-[var(--ds-primary)]'
                                }`}
                              >
                                <span
                                  className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: active ? '#fff' : color }}
                                  aria-hidden="true"
                                />
                                <span className={active ? 'text-white/85' : 'text-[var(--ds-fg-muted)]'}>
                                  #{run.startIdx}
                                </span>
                                <span>{run.text}</span>
                                {run.mentionIds.length > 1 && (
                                  <span
                                    className={`rounded px-1 text-[10px] ${
                                      active ? 'bg-white/20 text-white' : 'bg-[var(--ds-surface)] text-[var(--ds-fg-muted)]'
                                    }`}
                                  >
                                    ×{run.mentionIds.length}
                                  </span>
                                )}
                              </button>
                            );
                          });
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {selected && !hasMultipleVariants && group.mentions.length > 1 && (
                  <div className="flex flex-wrap gap-1 px-2 pb-1.5">
                    {group.mentions.map((m, i) => {
                      const active = m.id === focusId;
                      const diffText = m.text !== group.label ? m.text : m.when && m.when !== group.label ? m.when : null;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          data-awase-entry={m.id}
                          aria-pressed={active}
                          onClick={() => onSelect?.(m.id)}
                          className={`rounded px-1.5 py-0.5 text-xs tabular-nums ${
                            active
                              ? 'bg-[var(--ds-primary)] text-white'
                              : 'bg-[var(--ds-bg)] text-[var(--ds-fg-muted)] hover:text-[var(--ds-fg)]'
                          }`}
                        >
                          #{i + 1}
                          {diffText ? ` ${diffText}` : ''}
                        </button>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
