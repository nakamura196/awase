'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
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
  'w-full min-w-0 rounded border border-[var(--ds-border)] bg-[var(--ds-bg)] px-3 py-2 text-[var(--ds-fg)]';

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
    <PageContainer width="text" className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-[var(--ds-fg)]">{t('title')}</h1>
        <p className="text-[var(--ds-fg-muted)]">{t('lead')}</p>
      </header>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          open(sides);
        }}
      >
        {([0, 1] as const).map((i) => (
          <fieldset key={i} className="space-y-2">
            <legend className="font-semibold text-[var(--ds-fg)]">{t(i === 0 ? 'left' : 'right')}</legend>
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
        <button type="submit" className="rounded bg-[var(--ds-primary)] px-4 py-2 text-white">
          {t('compare')}
        </button>
      </form>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[var(--ds-fg)]">{t('samples')}</h2>
        <ul className="space-y-1">
          {SAMPLES.map((s) => (
            <li key={s.key}>
              <a
                href={`?${buildParams([s.sides[0], s.sides[1]]).toString()}`}
                onClick={(e) => {
                  e.preventDefault();
                  open(s.sides);
                }}
                className="underline text-[var(--ds-primary)]"
              >
                {t(s.key)}
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

const button = 'rounded border border-[var(--ds-border)] px-2 py-0.5 text-[var(--ds-fg)] disabled:opacity-40';

// 画面の左右それぞれで、見ている Canvas を替える小さな送り
function Pager({ side, index, total, label, onGo }: { side: 'left' | 'right'; index: number; total: number; label: string; onGo: (i: number) => void }) {
  const t = useTranslations('Compare');
  return (
    <div className="flex items-center justify-center gap-2 text-sm" role="group" aria-label={t('pager', { side: t(side) })} data-testid={`pager-${side}`}>
      <button type="button" disabled={index <= 0} onClick={() => onGo(index - 1)} className={button} aria-label={t('prev')}>
        ‹
      </button>
      <span className="tabular-nums text-[var(--ds-fg)]" aria-live="polite" data-testid={`canvas-${side}`}>
        {label} ({index + 1} / {total})
      </span>
      <button type="button" disabled={index >= total - 1} onClick={() => onGo(index + 1)} className={button} aria-label={t('next')}>
        ›
      </button>
    </div>
  );
}

const box = 'rounded border border-[var(--ds-border)] bg-[var(--ds-bg)] p-3 text-sm leading-relaxed whitespace-pre-wrap text-[var(--ds-fg)]';

// 2 つの Canvas の文字の差分。左だけにある字は取り消し線、右だけにある字は下線
function DiffView({ texts }: { texts: [string, string] }) {
  const t = useTranslations('Compare');
  const [a, b] = texts;
  const ops = useMemo(() => diffChars(a, b), [a, b]);
  const distance = useMemo(() => levenshtein(a, b), [a, b]);
  const rate = similarity(distance, a, b);
  if (!a && !b) return <p className="p-4 text-sm text-[var(--ds-fg-muted)]" data-testid="no-text">{t('noText')}</p>;
  return (
    <div className="space-y-3 p-3">
      <p className="text-sm text-[var(--ds-fg)]" data-testid="similarity">
        {t('distance', { distance })} / {t('similarity', { rate: (rate * 100).toFixed(1) })}
      </p>
      <div className="grid gap-3 lg:grid-cols-3">
        <div className={box} data-testid="text-left">{a}</div>
        <div className={box} data-testid="diff-result" aria-label={t('result')}>
          {ops.map((op, i) =>
            op.type === 'delete' ? (
              <del key={i} className="bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200">{op.text}</del>
            ) : op.type === 'insert' ? (
              <ins key={i} className="bg-green-100 text-green-800 no-underline dark:bg-green-950 dark:text-green-200">{op.text}</ins>
            ) : (
              <span key={i}>{op.text}</span>
            ),
          )}
        </div>
        <div className={box} data-testid="text-right">{b}</div>
      </div>
    </div>
  );
}

const TABS: { mode: CompareMode; key: 'tabImage' | 'tabDiff' }[] = [
  { mode: 'image', key: 'tabImage' },
  { mode: 'diff', key: 'tabDiff' },
];

function Comparison({ sides, mode, networkAsked }: { sides: [Side, Side]; mode: CompareMode; networkAsked: boolean }) {
  const t = useTranslations('Compare');
  const update = useUpdateParams();
  const loaded = useManifests([sides[0].manifest, sides[1].manifest]);
  const names = [t('left'), t('right')];

  if (!loaded) return <p className="p-4 text-sm text-[var(--ds-fg-muted)]">{t('loading')}</p>;
  const errors = loaded.flatMap((l, i) => ('error' in l ? [<ErrorMessage key={i} side={names[i]} error={l.error} />] : []));
  if (errors.length) return <div className="space-y-2 p-4">{errors}</div>;
  const ms = loaded.map((l) => (l as { manifest: CompareManifest }).manifest);

  // 書かれた Canvas を、マニフェストの Canvas に突き合わせる。無ければ 1 つ目
  const indexes = ms.map((m, i) => {
    const id = sides[i].canvas && matchCanvas(m.canvases.map((c) => c.id), sides[i].canvas);
    return id ? m.canvases.findIndex((c) => c.id === id) : 0;
  });
  const go = (i: 0 | 1, to: number) => update({ [`canvas${i + 1}`]: ms[i].canvases[to].id });
  const labelOf = (i: number) => sides[i].label || ms[i].label;
  const texts: [string, string] = [ms[0].canvases[indexes[0]].text, ms[1].canvases[indexes[1]].text];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div role="tablist" aria-label={t('views')} className="flex shrink-0 justify-center gap-1 border-b border-[var(--ds-border)]">
        {TABS.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            aria-selected={tab.mode === mode}
            onClick={() => update({ mode: tab.mode === 'image' ? '0' : '1' })}
            className={`-mb-px border-b-2 px-4 py-1 text-sm ${
              tab.mode === mode ? 'border-[var(--ds-primary)] font-bold text-[var(--ds-fg)]' : 'border-transparent text-[var(--ds-fg-muted)] hover:text-[var(--ds-fg)]'
            }`}
          >
            {t(tab.key)}
          </button>
        ))}
      </div>
      {networkAsked && (
        <p className="shrink-0 px-3 pt-2 text-sm text-[var(--ds-fg-muted)]" data-testid="network-note">
          {t('networkNote')}
        </p>
      )}
      {mode === 'image' ? (
        <div className="grid min-h-0 flex-1 grid-rows-2 gap-3 p-3 md:grid-cols-2 md:grid-rows-1">
          {([0, 1] as const).map((i) => (
            <div key={i} className="flex min-h-0 flex-col gap-1">
              <p className="truncate text-center text-sm font-bold text-[var(--ds-fg)]">{labelOf(i)}</p>
              <div className="min-h-0 flex-1">
                <ImagePane
                  pages={ms[i].canvases.map((c) => ({ manifest: sides[i].manifest, canvas: c.id }))}
                  labels={ms[i].canvases.map((c) => c.label)}
                  index={indexes[i]}
                  onGo={(to) => go(i, to)}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-2 p-3 pb-0 md:grid-cols-2">
            {([0, 1] as const).map((i) => (
              <div key={i} className="space-y-1">
                <p className="truncate text-center text-sm font-bold text-[var(--ds-fg)]">{labelOf(i)}</p>
                <Pager
                  side={i === 0 ? 'left' : 'right'}
                  index={indexes[i]}
                  total={ms[i].canvases.length}
                  label={ms[i].canvases[indexes[i]].label}
                  onGo={(to) => go(i, to)}
                />
              </div>
            ))}
          </div>
          <DiffView texts={texts} />
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
