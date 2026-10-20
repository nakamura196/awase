'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { renderElement } from '@/lib/tei/render';
import { foldSigla, readApparatus, readingFor, readWitnesses, witnessDistances, type ApparatusEntry, type Witness } from '@/lib/tei/apparatus';

interface Props {
  tei: Document;
  /** TEI の URL。相対 URL の基準 */
  baseUrl?: string;
  /** 選んでいる箇所（URL の id）。本文の app と同じ id */
  focusId?: string | null;
  /** 行を押したとき。その箇所の id を渡す */
  onSelect?: (id: string) => void;
  /** 本文に見せている伝本（?wit= の略号）。null は lem */
  wit?: string | null;
  /** 伝本を選び替えたとき。null は lem に戻す */
  onWitChange?: (wit: string | null) => void;
  /** 画像の範囲（app@facs）が引ける箇所の id。選ぶと画像ペインにその範囲が出る */
  imaged?: Set<string>;
}

// 異文の一覧（koui の右の欄）。箇所ごとに、読みとその伝本を並べる。
// 行を押すと本文のその箇所へ、本文の箇所を押すとこの一覧のその行へ移る（どちらも URL の id で結ぶ）。

/** 読みの中身。del・add などの印を、本文と同じ部品で写す */
function ReadingText({ el, baseUrl }: { el: Element; baseUrl?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    ref.current?.replaceChildren(...Array.from(renderElement(el, { doc: document, baseUrl }).childNodes));
  }, [el, baseUrl]);
  return <span ref={ref} />;
}

/** 畳まずに見せる略号の数。koui の見本では lem に 10 本前後の名前が並ぶ */
const SIGLA_LIMIT = 3;

interface Siglum {
  id: string;
  /** lem に名前の無い伝本（lem と同じ読みとみなす） */
  silent?: boolean;
}

function Sigla({ sigla, names, expanded }: { sigla: Siglum[]; names: Map<string, string>; expanded: boolean }) {
  const t = useTranslations('Viewer');
  const label = (s: Siglum) => {
    const name = names.get(s.id) ?? s.id;
    return s.silent ? `${name}（${t('silentWitness')}）` : name;
  };
  const { shown, hidden } = expanded ? { shown: sigla, hidden: [] as Siglum[] } : foldSigla(sigla, SIGLA_LIMIT);
  return (
    <>
      {shown.map((s) => (
        <span
          key={s.id}
          title={label(s)}
          className={`whitespace-nowrap rounded px-1 text-xs ${
            s.silent ? 'text-[var(--ds-fg-muted)]' : 'bg-[var(--ds-bg)] text-[var(--ds-fg)]'
          }`}
        >
          {s.id}
        </span>
      ))}
      {hidden.length > 0 && (
        <span title={hidden.map(label).join('、')} className="whitespace-nowrap text-xs text-[var(--ds-fg-muted)]">
          {t('moreWitnesses', { count: hidden.length })}
        </span>
      )}
    </>
  );
}

function Entry({
  entry,
  names,
  baseUrl,
  selected,
  onSelect,
  wit,
  imaged,
}: {
  entry: ApparatusEntry;
  names: Map<string, string>;
  baseUrl?: string;
  selected: boolean;
  onSelect?: (id: string) => void;
  wit?: string | null;
  imaged?: boolean;
}) {
  const t = useTranslations('Viewer');
  // 本文に見せている読み（伝本を選んだときだけ印を付ける）
  const chosen = wit ? readingFor(entry.readings, wit) : -1;
  const empty = (el: Element) => !(el.textContent ?? '').trim() && !el.children.length;
  return (
    <li data-awase-entry={entry.id}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => onSelect?.(entry.id)}
        className={`flex w-full gap-2 rounded px-2 py-1 text-left ${
          selected ? 'bg-[color-mix(in_srgb,var(--ds-primary)_20%,transparent)] outline outline-1 outline-[var(--ds-primary)]' : 'hover:bg-[var(--ds-bg)]'
        }`}
      >
        <span className="flex w-8 shrink-0 flex-col items-end text-xs tabular-nums text-[var(--ds-fg-muted)]">
          {entry.n}
          {imaged && (
            <span title={t('placeHasImage')} aria-label={t('placeHasImage')} data-awase-imaged="">
              ▣
            </span>
          )}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {entry.readings.map((r, i) => (
            <span
              key={i}
              data-awase-chosen={i === chosen ? '' : undefined}
              className={`flex flex-wrap items-baseline gap-1 ${i === chosen ? 'border-l-4 border-[#f59e0b] pl-1' : ''}`}
            >
              <span className={r.kind === 'lem' ? 'font-bold' : ''}>
                {empty(r.el) ? <span className="text-[var(--ds-fg-muted)]">{t('omitted')}</span> : <ReadingText el={r.el} baseUrl={baseUrl} />}
              </span>
              <Sigla
                sigla={[
                  ...r.wits.map((id) => ({ id })),
                  ...(r.kind === 'lem' ? entry.silent.map((id) => ({ id, silent: true })) : []),
                ]}
                names={names}
                expanded={selected}
              />
            </span>
          ))}
        </span>
      </button>
    </li>
  );
}

export default function ApparatusPane({ tei, baseUrl, focusId, onSelect, wit, onWitChange, imaged }: Props) {
  const t = useTranslations('Viewer');
  const witnesses: Witness[] = useMemo(() => readWitnesses(tei), [tei]);
  const entries = useMemo(() => readApparatus(tei, witnesses), [tei, witnesses]);
  const names = useMemo(() => new Map(witnesses.map((w) => [w.id, w.label])), [witnesses]);
  const distances = useMemo(() => witnessDistances(entries, witnesses.map((w) => w.id)), [entries, witnesses]);
  const maxDistance = Math.max(1, ...Array.from(distances.values(), (d) => d.distance));
  const list = useRef<HTMLDivElement>(null);

  // 選んだ箇所の行を、一覧の中ほどへ動かす。ページ全体は動かさない（scrollIntoView を使わない）
  useEffect(() => {
    const box = list.current;
    if (!box || !focusId) return;
    const row = box.querySelector<HTMLElement>(`[data-awase-entry="${CSS.escape(focusId)}"]`);
    if (!row) return;
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    box.scrollTo({ top: top - box.clientHeight / 2 + row.clientHeight / 2 });
  }, [focusId, entries]);

  return (
    <section
      className="awase-apparatus flex h-full flex-col rounded border border-[var(--ds-border)] bg-[var(--ds-surface)]"
      aria-label={t('apparatus')}
      data-testid="apparatus-pane"
    >
      <div className="border-b border-[var(--ds-border)] px-3 py-2 text-sm">
        <p className="font-bold text-[var(--ds-fg)]">{t('apparatusCount', { count: entries.length })}</p>
        {witnesses.length > 0 && onWitChange && (
          <label className="mt-1 flex items-center gap-2 text-[var(--ds-fg-muted)]">
            {t('readAs')}
            <select
              value={wit ?? ''}
              onChange={(e) => onWitChange(e.target.value || null)}
              className="min-w-0 flex-1 rounded border border-[var(--ds-border)] bg-[var(--ds-bg)] px-1 py-0.5 text-[var(--ds-fg)]"
            >
              <option value="">{t('readAsLemma')}</option>
              {witnesses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.id === w.label ? w.id : `${w.id}（${w.label}）`}
                </option>
              ))}
            </select>
          </label>
        )}
        {witnesses.length > 0 && (
          <details className="text-[var(--ds-fg-muted)]" data-testid="witness-distances">
            <summary className="cursor-pointer">{t('witnesses', { count: witnesses.length })}</summary>
            {/* koui の Chart.vue（伝本ごとの編集距離の棒グラフ）を、グラフの部品を入れずに CSS の横棒で出す */}
            <p className="mt-1 text-xs">{t('witnessDistanceNote')}</p>
            <ul className="mt-1 flex flex-col">
              {witnesses.map((w) => {
                const d = distances.get(w.id) ?? { distance: 0, places: 0 };
                const chosen = w.id === wit;
                return (
                  <li key={w.id}>
                    <button
                      type="button"
                      aria-pressed={chosen}
                      disabled={!onWitChange}
                      onClick={() => onWitChange?.(chosen ? null : w.id)}
                      title={w.label}
                      className={`grid w-full grid-cols-[minmax(3rem,auto)_1fr_auto] items-center gap-x-2 rounded px-1 py-0.5 text-left text-xs ${
                        chosen ? 'outline outline-1 outline-[#f59e0b]' : 'hover:bg-[var(--ds-bg)]'
                      }`}
                    >
                      <span className="truncate text-[var(--ds-fg)]">
                        {w.id}
                        {w.id !== w.label && <span className="ml-1 text-[var(--ds-fg-muted)]">{w.label}</span>}
                      </span>
                      <span className="h-2 rounded bg-[var(--ds-bg)]" aria-hidden>
                        <span
                          className="block h-full rounded bg-[#f59e0b]"
                          style={{ width: `${(d.distance / maxDistance) * 100}%` }}
                        />
                      </span>
                      <span className="whitespace-nowrap tabular-nums" data-awase-distance={d.distance}>
                        {t('witnessDistance', { distance: d.distance, places: d.places })}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
      </div>
      <div ref={list} className="min-h-0 flex-1 overflow-auto p-1" tabIndex={0}>
        <ol className="flex flex-col">
          {entries.map((e) => (
            <Entry key={e.id} entry={e} names={names} baseUrl={baseUrl} selected={e.id === focusId} onSelect={onSelect} wit={wit} imaged={imaged?.has(e.id)} />
          ))}
        </ol>
      </div>
    </section>
  );
}
