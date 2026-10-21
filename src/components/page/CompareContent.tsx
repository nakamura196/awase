'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import CommonLayout from '@/components/layout/Common';
import PageContainer from '@/components/layout/PageContainer';
import ImagePane from '@/components/viewer/ImagePane';
import { diffChars, similarity } from '@/lib/compare/diff';
import { readManifest, type CompareManifest } from '@/lib/compare/manifest';
import { buildParams, networkMode, parseMode, readSides, type CompareMode, type Side } from '@/lib/compare/params';
import { matchCanvas } from '@/lib/tei/facs';
import { levenshtein } from '@/lib/tei/apparatus';

// URL で受け取るパラメータ（text-comparison と同じ名前と意味）。mode は 0 = 画像、1 = 文字の差分（既定）、2 = ネットワーク図（未対応）
export const COMPARE_PARAMS = ['manifest1', 'manifest2', 'canvas1', 'canvas2', 'label1', 'label2', 'mode', 'embed'] as const;

// 見本。text-comparison の見本と同じ組（校異源氏物語の桐壺と、国立国会図書館の写本）
const SAMPLES = [
  {
    key: 'sampleKoui',
    sides: [
      { manifest: 'https://genji-ai.web.app/iiif/koui/koui-01/manifest.json', canvas: 'https://genji-ai.web.app/iiif/koui/canvas/5', label: '校異源氏物語' },
      { manifest: 'https://genji-ai.web.app/iiif/ndl_2585098/ndl_2585098-01/manifest.json', canvas: 'https://dl.ndl.go.jp/api/iiif/2585098/canvas/3', label: '近世前期横本写本（国立国会図書館所蔵）' },
    ],
  },
] as const;

type LoadError = { kind: 'fetch'; status?: number } | { kind: 'notManifest' };
type Loaded = { manifest: CompareManifest } | { error: LoadError };

// マニフェストを読む。読めなかったときは例外にせず、画面に出す理由にする
async function loadManifest(url: string): Promise<Loaded> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { error: { kind: 'fetch', status: res.status } };
    const manifest = readManifest(await res.json());
    return manifest ? { manifest } : { error: { kind: 'notManifest' } };
  } catch (e) {
    // 通信の失敗と、JSON でない応答（読み取れない）をまとめて「読めない」とする
    return { error: e instanceof SyntaxError ? { kind: 'notManifest' } : { kind: 'fetch' } };
  }
}

/** 左右のマニフェストを読む。読み終わるまでは null */
function useManifests(urls: [string, string]): [Loaded, Loaded] | null {
  const key = urls.join('\n');
  const [state, setState] = useState<{ key: string; loaded: [Loaded, Loaded] } | null>(null);
  useEffect(() => {
    let live = true;
    Promise.all(urls.map(loadManifest)).then((loaded) => live && setState({ key, loaded: loaded as [Loaded, Loaded] }));
    return () => {
      live = false;
    };
    // urls は key から作り直せるので、key だけを見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state?.key === key ? state.loaded : null;
}

// URL の引数を書き換える（履歴は増やさない）。表示の切り替えを、そのまま共有できる URL にするため
function useUpdateParams() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return (changes: Record<string, string>) => {
    const params = new URLSearchParams(search.toString());
    for (const [k, v] of Object.entries(changes)) params.set(k, v);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
}

const field =
  'w-full min-w-0 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-bg)] px-3 py-2 text-sm text-[var(--ds-fg)] focus:border-[var(--ds-primary)] focus:outline-none';

// 引数なしで開いたときの入口: 2 つのマニフェストの URL を入れる欄と見本
function Entry() {
  const t = useTranslations('Compare');
  const router = useRouter();
  const pathname = usePathname();
  const [sides, setSides] = useState<[Side, Side]>([
    { manifest: '', canvas: '', label: '' },
    { manifest: '', canvas: '', label: '' },
  ]);
  const set = (i: 0 | 1, f: 'manifest' | 'label', v: string) =>
    setSides((prev) => {
      const next: [Side, Side] = [{ ...prev[0] }, { ...prev[1] }];
      next[i][f] = v;
      return next;
    });
  const open = (s: readonly [Side, Side]) => router.push(`${pathname}?${buildParams([s[0], s[1]]).toString()}`);
  return (
    <PageContainer width="text" className="space-y-8 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-[var(--ds-fg)]" style={{ fontFamily: 'var(--ds-font-serif)' }}>{t('title')}</h1>
        <p className="text-sm sm:text-base leading-relaxed text-[var(--ds-fg-muted)]">{t('lead')}</p>
      </header>
      <form
        className="space-y-4 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-5 sm:p-6 shadow-xs"
        onSubmit={(e) => {
          e.preventDefault();
          open(sides);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {([0, 1] as const).map((i) => (
            <fieldset key={i} className="space-y-2.5 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-bg)]/50 p-3.5">
              <legend className="px-1 text-sm font-semibold text-[var(--ds-fg)]">{t(i === 0 ? 'left' : 'right')}</legend>
              <label className="sr-only" htmlFor={`manifest-${i}`}>
                {t('manifestLabel', { side: t(i === 0 ? 'left' : 'right') })}
              </label>
              <input
                id={`manifest-${i}`}
                type="url"
                required
                value={sides[i].manifest}
                onChange={(e) => set(i, 'manifest', e.target.value)}
                placeholder="https://…/manifest.json"
                className={field}
              />
              <label className="sr-only" htmlFor={`label-${i}`}>
                {t('nameLabel', { side: t(i === 0 ? 'left' : 'right') })}
              </label>
              <input
                id={`label-${i}`}
                value={sides[i].label}
                onChange={(e) => set(i, 'label', e.target.value)}
                placeholder={t('namePlaceholder')}
                className={field}
              />
            </fieldset>
          ))}
        </div>
        <div className="flex justify-end">
          <button type="submit" className="rounded-lg bg-[var(--ds-primary)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity">
            {t('compare')}
          </button>
        </div>
      </form>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-[var(--ds-fg)]">{t('samples')}</h2>
        <ul className="space-y-2">
          {SAMPLES.map((s) => (
            <li key={s.key}>
              <a
                href={`?${buildParams([s.sides[0], s.sides[1]]).toString()}`}
                onClick={(e) => {
                  e.preventDefault();
                  open(s.sides);
                }}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-4 py-3 text-sm font-medium text-[var(--ds-primary)] hover:border-[var(--ds-primary)] transition-colors"
              >
                <span>{t(s.key)}</span>
                <span aria-hidden="true" className="text-[var(--ds-fg-muted)]">→</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  );
}

function ErrorMessage({ side, error }: { side: string; error: LoadError }) {
  const t = useTranslations('Compare');
  const text = error.kind === 'notManifest' ? t('errorNotManifest') : error.status ? t('errorStatus', { status: error.status }) : t('errorFetch');
  return (
    <p role="alert" data-testid="load-error" className="rounded border border-red-400 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-800 dark:text-red-200">
      {side}: {text}
    </p>
  );
}

const button = 'rounded border border-[var(--ds-border)] bg-[var(--ds-bg)] px-2 py-0.5 text-xs text-[var(--ds-fg)] hover:border-[var(--ds-primary)] disabled:opacity-40';

// 画面の左右それぞれで、見ている Canvas を替える小さな送り
function Pager({ side, index, total, label, onGo }: { side: 'left' | 'right'; index: number; total: number; label: string; onGo: (i: number) => void }) {
  const t = useTranslations('Compare');
  return (
    <div className="flex shrink-0 items-center gap-1.5 text-xs" role="group" aria-label={t('pager', { side: t(side) })} data-testid={`pager-${side}`}>
      <button type="button" disabled={index <= 0} onClick={() => onGo(index - 1)} className={button} aria-label={t('prev')}>
        ‹
      </button>
      <span className="tabular-nums text-[var(--ds-fg-muted)]" aria-live="polite" data-testid={`canvas-${side}`}>
        {label} ({index + 1} / {total})
      </span>
      <button type="button" disabled={index >= total - 1} onClick={() => onGo(index + 1)} className={button} aria-label={t('next')}>
        ›
      </button>
    </div>
  );
}

const TABS: { mode: CompareMode; key: 'tabImage' | 'tabDiff' }[] = [
  { mode: 'image', key: 'tabImage' },
  { mode: 'diff', key: 'tabDiff' },
];

function Comparison({ sides, mode, networkAsked }: { sides: [Side, Side]; mode: CompareMode; networkAsked: boolean }) {
  const t = useTranslations('Compare');
  const router = useRouter();
  const pathname = usePathname();
  const update = useUpdateParams();
  const loaded = useManifests([sides[0].manifest, sides[1].manifest]);
  const names = [t('left'), t('right')];

  if (!loaded) return <p className="p-4 text-sm text-[var(--ds-fg-muted)]">{t('loading')}</p>;
  const errors = loaded.flatMap((l, i) => ('error' in l ? [<ErrorMessage key={i} side={names[i]} error={l.error} />] : []));
  if (errors.length) {
    return (
      <div className="space-y-3 p-4">
        {errors}
        <button
          type="button"
          onClick={() => router.push(pathname)}
          className="rounded border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ds-fg)] hover:border-[var(--ds-primary)]"
        >
          ← {t('changeSources')}
        </button>
      </div>
    );
  }
  const ms = loaded.map((l) => (l as { manifest: CompareManifest }).manifest);

  // 書かれた Canvas を、マニフェストの Canvas に突き合わせる。無ければ 1 つ目
  const indexes = ms.map((m, i) => {
    const id = sides[i].canvas && matchCanvas(m.canvases.map((c) => c.id), sides[i].canvas);
    return id ? m.canvases.findIndex((c) => c.id === id) : 0;
  });
  const go = (i: 0 | 1, to: number) => update({ [`canvas${i + 1}`]: ms[i].canvases[to].id });
  const labelOf = (i: number) => sides[i].label || ms[i].label;
  const [a, b] = [ms[0].canvases[indexes[0]].text, ms[1].canvases[indexes[1]].text];
  const ops = diffChars(a, b);
  const distance = levenshtein(a, b);
  const rate = similarity(distance, a, b);

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[var(--ds-bg)]">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--ds-border)] bg-[var(--ds-surface)] px-4">
        <div role="tablist" aria-label={t('views')} className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.mode}
              type="button"
              role="tab"
              aria-selected={tab.mode === mode}
              onClick={() => update({ mode: tab.mode === 'image' ? '0' : '1' })}
              className={`-mb-px border-b-2 px-4 py-2 text-sm transition-colors ${
                tab.mode === mode
                  ? 'border-[var(--ds-primary)] font-bold text-[var(--ds-fg)]'
                  : 'border-transparent text-[var(--ds-fg-muted)] hover:text-[var(--ds-fg)]'
              }`}
            >
              {t(tab.key)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => router.push(pathname)}
          data-testid="compare-reset"
          className="my-1.5 rounded-full border border-[var(--ds-border)] bg-[var(--ds-bg)] px-3 py-1 text-xs font-medium text-[var(--ds-fg-muted)] hover:border-[var(--ds-primary)] hover:text-[var(--ds-fg)] transition-colors"
        >
          ← {t('changeSources')}
        </button>
      </div>
      {networkAsked && (
        <p className="shrink-0 px-4 pt-2 text-xs text-[var(--ds-fg-muted)]" data-testid="network-note">
          {t('networkNote')}
        </p>
      )}
      {mode === 'image' ? (
        <div className="grid min-h-0 flex-1 grid-rows-2 gap-3 p-3 md:grid-cols-2 md:grid-rows-1">
          {([0, 1] as const).map((i) => (
            <div key={i} className="min-h-0 h-full">
              <ImagePane
                title={labelOf(i)}
                pages={ms[i].canvases.map((c) => ({ manifest: sides[i].manifest, canvas: c.id }))}
                labels={ms[i].canvases.map((c) => c.label)}
                index={indexes[i]}
                onGo={(to) => go(i, to)}
              />
            </div>
          ))}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto p-3 sm:p-4 lg:overflow-hidden">
          {!a && !b ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] p-3">
              {([0, 1] as const).map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[var(--ds-fg)]">{labelOf(i)}</span>
                  <Pager
                    side={i === 0 ? 'left' : 'right'}
                    index={indexes[i]}
                    total={ms[i].canvases.length}
                    label={ms[i].canvases[indexes[i]].label}
                    onGo={(to) => go(i, to)}
                  />
                </div>
              ))}
              <p className="w-full text-sm text-[var(--ds-fg-muted)]" data-testid="no-text">{t('noText')}</p>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-3">
              {/* 左の資料カード */}
              <section className="flex min-h-0 flex-col rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)]">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--ds-border)] px-3 py-2">
                  <p className="truncate text-sm font-bold text-[var(--ds-fg)]">{labelOf(0)}</p>
                  <Pager
                    side="left"
                    index={indexes[0]}
                    total={ms[0].canvases.length}
                    label={ms[0].canvases[indexes[0]].label}
                    onGo={(to) => go(0, to)}
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-relaxed whitespace-pre-wrap text-[var(--ds-fg)]" data-testid="text-left">
                  {a}
                </div>
              </section>

              {/* 中央の差分カード */}
              <section className="flex min-h-0 flex-col rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)]">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--ds-border)] px-3 py-2">
                  <p className="text-sm font-bold text-[var(--ds-fg)]">{t('result')}</p>
                  <p className="rounded-full bg-[var(--ds-primary)]/10 px-2.5 py-0.5 text-xs font-medium tabular-nums text-[var(--ds-primary)]" data-testid="similarity">
                    {t('distance', { distance })} / {t('similarity', { rate: (rate * 100).toFixed(1) })}
                  </p>
                </div>
                <div
                  className="min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-relaxed whitespace-pre-wrap text-[var(--ds-fg)]"
                  data-testid="diff-result"
                  aria-label={t('result')}
                >
                  {ops.map((op, i) =>
                    op.type === 'delete' ? (
                      <del key={i} className="rounded-xs bg-red-100 px-0.5 text-red-800 dark:bg-red-950 dark:text-red-200">{op.text}</del>
                    ) : op.type === 'insert' ? (
                      <ins key={i} className="rounded-xs bg-green-100 px-0.5 text-green-800 no-underline dark:bg-green-950 dark:text-green-200">{op.text}</ins>
                    ) : (
                      <span key={i}>{op.text}</span>
                    ),
                  )}
                </div>
              </section>

              {/* 右の資料カード */}
              <section className="flex min-h-0 flex-col rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)]">
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[var(--ds-border)] px-3 py-2">
                  <p className="truncate text-sm font-bold text-[var(--ds-fg)]">{labelOf(1)}</p>
                  <Pager
                    side="right"
                    index={indexes[1]}
                    total={ms[1].canvases.length}
                    label={ms[1].canvases[indexes[1]].label}
                    onGo={(to) => go(1, to)}
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-relaxed whitespace-pre-wrap text-[var(--ds-fg)]" data-testid="text-right">
                  {b}
                </div>
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Compare() {
  const search = useSearchParams();
  const sides = readSides(search);
  const embed = search.get('embed') === '1';
  if (!sides) return embed ? <Entry /> : <CommonLayout><Entry /></CommonLayout>;
  const body = (
    <Comparison sides={sides} mode={parseMode(search.get('mode'))} networkAsked={networkMode(search.get('mode'))} />
  );
  // 開いたら画面の高さに収める（ページ全体はスクロールさせない）
  return embed ? (
    <div className="flex h-[100dvh] flex-col">{body}</div>
  ) : (
    <CommonLayout fullScreen>{body}</CommonLayout>
  );
}

export default function CompareContent() {
  // useSearchParams は静的書き出しでは Suspense の中で使う
  return (
    <Suspense fallback={null}>
      <Compare />
    </Suspense>
  );
}
