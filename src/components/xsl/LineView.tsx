'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { extractLineDialogues, groupBySpeaker } from '@/lib/tei/speech';
import { summarizeHeader } from '@/lib/tei/header';

interface Props {
  tei: Document;
  focusId?: string | null;
  onSelect?: (id: string) => void;
}

const AVATAR_COLORS = [
  'bg-sky-600 text-white',
  'bg-emerald-600 text-white',
  'bg-amber-600 text-white',
  'bg-purple-600 text-white',
  'bg-rose-600 text-white',
  'bg-indigo-600 text-white',
  'bg-teal-600 text-white',
];

function speakerColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0;
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function LineView({ tei, focusId = null, onSelect }: Props) {
  const t = useTranslations('Xsl');
  const tv = useTranslations('Viewer');
  const items = useMemo(() => extractLineDialogues(tei), [tei]);
  const groups = useMemo(() => groupBySpeaker(items), [items]);
  const header = useMemo(() => summarizeHeader(tei), [tei]);

  const [selfSpeaker, setSelfSpeaker] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string>('all');
  const scrollRef = useRef<HTMLDivElement>(null);

  // 初期状態で語り手以外の最頻出話者（または先頭話者）を右側（自分側）にする（話者が 2 人以上のとき）
  const activeSelfSpeaker = useMemo(() => {
    if (selfSpeaker && groups.some((g) => g.key === selfSpeaker)) return selfSpeaker;
    if (groups.length >= 2) {
      const oji = groups.find((g) => g.key === '王子' || g.label === '王子');
      if (oji) return oji.key;
      const nonNarrator = groups.find((g) => g.key !== '__narrator__' && g.key !== '__unknown__');
      return nonNarrator?.key ?? groups[0].key;
    }
    return '__none__';
  }, [selfSpeaker, groups]);

  const availableStages = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.stage && (item.stage === '釈文' || item.stage === '読み下し' || item.stage === '現代語訳')) {
        set.add(item.stage);
      }
    }
    return Array.from(set);
  }, [items]);

  const visibleItems = useMemo(() => {
    if (stageFilter === 'all' || !availableStages.includes(stageFilter)) return items;
    return items.filter((item) => item.stage === stageFilter);
  }, [items, stageFilter, availableStages]);

  useEffect(() => {
    const box = scrollRef.current;
    if (!box || !focusId) return;
    const row = box.querySelector<HTMLElement>(`[data-line-id="${CSS.escape(focusId)}"]`);
    if (!row) return;
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTo({ top: top - box.clientHeight / 2 + row.clientHeight / 2, behavior: 'smooth' });
  }, [focusId, visibleItems]);

  return (
    <section
      data-testid="xsl-line-view"
      aria-label={t('lineTitle')}
      className="flex h-full min-h-0 flex-col bg-[#7494c0] dark:bg-[#1b2838]"
    >
      {/* チャットヘッダー帯 */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-black/15 bg-[#273246] px-4 py-2.5 text-white shadow-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#06c755] text-xs font-bold text-white">
            L
          </span>
          <h2 className="truncate text-sm font-bold">{header?.title || t('lineTitle')}</h2>
          <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-xs tabular-nums">
            {items.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {availableStages.length > 1 && (
            <div className="flex items-center gap-1 rounded-lg bg-white/10 p-0.5">
              <button
                type="button"
                onClick={() => setStageFilter('all')}
                className={`rounded-md px-2 py-0.5 transition-colors ${
                  stageFilter === 'all' ? 'bg-white text-slate-900 font-semibold' : 'text-white/80 hover:text-white'
                }`}
              >
                {tv('entityAll')}
              </button>
              {availableStages.map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStageFilter(st)}
                  className={`rounded-md px-2 py-0.5 transition-colors ${
                    stageFilter === st ? 'bg-white text-slate-900 font-semibold' : 'text-white/80 hover:text-white'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          )}

          {groups.length >= 2 && (
            <label className="flex items-center gap-1.5">
              <span className="text-white/80">{t('lineMainSpeaker')}</span>
              <select
                aria-label={t('lineMainSpeaker')}
                value={activeSelfSpeaker}
                onChange={(e) => setSelfSpeaker(e.target.value)}
                className="rounded border border-white/25 bg-[#1b2434] px-2 py-1 text-xs text-white"
              >
                {groups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label || tv('speechUnknownSpeaker')} ({g.count})
                  </option>
                ))}
                <option value="__none__">—</option>
              </select>
            </label>
          )}
        </div>
      </div>

      {/* チャット本文タイムライン */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6"
        tabIndex={0}
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {visibleItems.map((item, idx) => {
            const isSelf = item.speakerKey === activeSelfSpeaker;
            const selected = item.id === focusId;
            const speakerName = item.speakerLabel || tv('speechUnknownSpeaker');
            const initial = speakerName.replace(/^[（(]/, '').slice(0, 1) || '？';
            const timeStr = `${String(Math.floor((idx + 1) / 60)).padStart(2, '0')}:${String((idx + 1) % 60).padStart(2, '0')}`;

            if (isSelf) {
              return (
                <div
                  key={item.id}
                  data-testid="line-bubble"
                  data-line-id={item.id}
                  onClick={() => onSelect?.(item.id)}
                  className="flex cursor-pointer flex-col items-end gap-1"
                >
                  <div className="flex items-center gap-1.5 pr-1 text-[11px] text-white/90">
                    {item.stage && (
                      <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] text-white/90">
                        {item.stage}
                      </span>
                    )}
                    <span className="font-medium">{speakerName}</span>
                  </div>
                  <div className="flex max-w-[85%] items-end gap-1.5 sm:max-w-[75%]">
                    <span className="shrink-0 text-right text-[10px] leading-tight text-white/85 tabular-nums">
                      {t('lineRead')}
                      <br />
                      {timeStr}
                    </span>
                    <div
                      className={`relative rounded-2xl rounded-tr-xs bg-[#8de055] px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 shadow-xs ${
                        selected ? 'ring-2 ring-white ring-offset-2 ring-offset-[#7494c0]' : ''
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{item.text}</p>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={item.id}
                data-testid="line-bubble"
                data-line-id={item.id}
                onClick={() => onSelect?.(item.id)}
                className="flex cursor-pointer items-start gap-2.5"
              >
                {item.speakerImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.speakerImage}
                    alt={speakerName}
                    className="h-9 w-9 shrink-0 rounded-full border border-white/40 object-cover shadow-xs"
                  />
                ) : (
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold shadow-xs ${speakerColor(
                      item.speakerKey,
                    )}`}
                    aria-hidden="true"
                  >
                    {initial}
                  </div>
                )}
                <div className="flex max-w-[85%] flex-col items-start gap-1 sm:max-w-[75%]">
                  <div className="flex flex-wrap items-center gap-1.5 pl-0.5 text-xs text-white">
                    <span className="font-semibold drop-shadow-xs">{speakerName}</span>
                    {item.stage && (
                      <span className="rounded bg-black/20 px-1.5 py-0.5 text-[10px] text-white/90">
                        {item.stage}
                      </span>
                    )}
                  </div>
                  <div className="flex items-end gap-1.5">
                    <div
                      className={`relative rounded-2xl rounded-tl-xs bg-white px-3.5 py-2.5 text-sm leading-relaxed text-slate-900 shadow-xs dark:bg-slate-800 dark:text-slate-100 ${
                        selected ? 'ring-2 ring-[#06c755] ring-offset-2 ring-offset-[#7494c0]' : ''
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{item.text}</p>
                    </div>
                    <span className="shrink-0 text-[10px] text-white/85 tabular-nums">{timeStr}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
