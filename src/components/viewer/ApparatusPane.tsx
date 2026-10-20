'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { renderElement } from '@/lib/tei/render';
import { readApparatus, readWitnesses, type ApparatusEntry, type Witness } from '@/lib/tei/apparatus';

interface Props {
  tei: Document;
  /** TEI の URL。相対 URL の基準 */
  baseUrl?: string;
  /** 選んでいる箇所（URL の id）。本文の app と同じ id */
  focusId?: string | null;
  /** 行を押したとき。その箇所の id を渡す */
  onSelect?: (id: string) => void;
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

function Sigla({ ids, names, muted, title }: { ids: string[]; names: Map<string, string>; muted?: boolean; title?: string }) {
  return (
    <>
      {ids.map((id) => (
        <span
          key={id}
          title={title ? `${names.get(id) ?? id}（${title}）` : (names.get(id) ?? id)}
          className={`whitespace-nowrap rounded px-1 text-xs ${
            muted ? 'text-[var(--ds-fg-muted)]' : 'bg-[var(--ds-bg)] text-[var(--ds-fg)]'
          }`}
        >
          {id}
        </span>
      ))}
    </>
  );
}

function Entry({
  entry,
  names,
  baseUrl,
  selected,
  onSelect,
}: {
  entry: ApparatusEntry;
  names: Map<string, string>;
  baseUrl?: string;
  selected: boolean;
  onSelect?: (id: string) => void;
}) {
  const t = useTranslations('Viewer');
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
        <span className="w-8 shrink-0 text-right text-xs tabular-nums text-[var(--ds-fg-muted)]">{entry.n}</span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {entry.readings.map((r, i) => (
            <span key={i} className="flex flex-wrap items-baseline gap-1">
              <span className={r.kind === 'lem' ? 'font-bold' : ''}>
                {empty(r.el) ? <span className="text-[var(--ds-fg-muted)]">{t('omitted')}</span> : <ReadingText el={r.el} baseUrl={baseUrl} />}
              </span>
              <Sigla ids={r.wits} names={names} />
              {r.kind === 'lem' && <Sigla ids={entry.silent} names={names} muted title={t('silentWitness')} />}
            </span>
          ))}
        </span>
      </button>
    </li>
  );
}

export default function ApparatusPane({ tei, baseUrl, focusId, onSelect }: Props) {
  const t = useTranslations('Viewer');
  const witnesses: Witness[] = useMemo(() => readWitnesses(tei), [tei]);
  const entries = useMemo(() => readApparatus(tei, witnesses), [tei, witnesses]);
  const names = useMemo(() => new Map(witnesses.map((w) => [w.id, w.label])), [witnesses]);
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
        {witnesses.length > 0 && (
          <details className="text-[var(--ds-fg-muted)]">
            <summary className="cursor-pointer">{t('witnesses', { count: witnesses.length })}</summary>
            <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              {witnesses.map((w) => (
                <div key={w.id} className="contents">
                  <dt className="text-[var(--ds-fg)]">{w.id}</dt>
                  <dd>{w.label}</dd>
                </div>
              ))}
            </dl>
          </details>
        )}
      </div>
      <div ref={list} className="min-h-0 flex-1 overflow-auto p-1" tabIndex={0}>
        <ol className="flex flex-col">
          {entries.map((e) => (
            <Entry key={e.id} entry={e} names={names} baseUrl={baseUrl} selected={e.id === focusId} onSelect={onSelect} />
          ))}
        </ol>
      </div>
    </section>
  );
}
