'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import CommonLayout from '@/components/layout/Common';
import PageContainer from '@/components/layout/PageContainer';
import TextPane from '@/components/viewer/TextPane';
import HeaderPanel from '@/components/viewer/HeaderPanel';
import { loadTei, TeiLoadError, type LoadError } from '@/lib/tei/load';
import { summarizeHeader } from '@/lib/tei/header';

// URL で受け取るパラメータ（docs/notes/survey.md「viewer の URL」）。
// いま使っているのは u / tei / dir / id / embed と、表示の切り替えの lb / pb。ほかはペインを足すときに使う
export const VIEWER_PARAMS = ['u', 'tei', 'config', 'manifest', 'curation', 'panes', 'dir', 'wit', 'xsl', 'id', 'embed'] as const;

const SAMPLES = [
  { key: 'sampleKoui', url: 'https://w3id.org/kouigenjimonogatari/tei/01.xml', dir: 'v' },
  { key: 'sampleYosano', url: 'https://tei-eaj.github.io/parallel_text_viewer/data/yosano.xml', dir: 'h' },
] as const;

// URL の引数を書き換える。履歴を増やさない（表示の切り替え）か、増やす（別の TEI を開く）かを選ぶ
function updateParams(changes: Record<string, string | null>, push = false) {
  const params = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) params.delete(k);
    else params.set(k, v);
  }
  const url = `${window.location.pathname}?${params.toString()}`;
  if (push) window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

type State =
  | { status: 'loading' }
  | { status: 'ready'; tei: Document }
  | { status: 'error'; error: LoadError };

function ErrorMessage({ error }: { error: LoadError }) {
  const t = useTranslations('Viewer');
  let text: string;
  switch (error.kind) {
    case 'fetch':
      text = error.status ? t('errorStatus', { status: error.status }) : t('errorFetch');
      break;
    case 'parse':
      text = t('errorParse');
      break;
    case 'notTei':
      text = t('errorNotTei', { root: error.root });
      break;
    case 'config':
      text = t('errorConfig');
      break;
  }
  return (
    <div role="alert" data-testid="load-error" className="rounded border border-red-400 bg-red-50 dark:bg-red-950/40 p-4 text-sm space-y-2">
      <p className="text-red-800 dark:text-red-200">{text}</p>
      {error.kind === 'parse' && <pre className="whitespace-pre-wrap text-xs text-[var(--ds-fg-muted)]">{error.message}</pre>}
    </div>
  );
}

// 引数なしで開いたときの入口: TEI の URL を入れる欄と見本
function Entry() {
  const t = useTranslations('Viewer');
  const [url, setUrl] = useState('');
  return (
    <PageContainer width="text" className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-[var(--ds-fg)]">{t('title')}</h1>
        <p className="text-[var(--ds-fg-muted)]">{t('lead')}</p>
      </header>
      <form
        className="flex flex-col sm:flex-row gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (url.trim()) updateParams({ u: url.trim() }, true);
        }}
      >
        <label className="sr-only" htmlFor="tei-url">
          {t('urlLabel')}
        </label>
        <input
          id="tei-url"
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://…/tei.xml"
          className="flex-1 min-w-0 rounded border border-[var(--ds-border)] bg-[var(--ds-bg)] px-3 py-2 text-[var(--ds-fg)]"
        />
        <button type="submit" className="rounded bg-[var(--ds-primary)] px-4 py-2 text-white">
          {t('open')}
        </button>
      </form>
      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-[var(--ds-fg)]">{t('samples')}</h2>
        <ul className="space-y-1">
          {SAMPLES.map((s) => (
            <li key={s.key}>
              <a
                href={`?u=${encodeURIComponent(s.url)}&dir=${s.dir}`}
                onClick={(e) => {
                  e.preventDefault();
                  updateParams({ u: s.url, dir: s.dir }, true);
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

function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`rounded border px-3 py-1 text-sm ${
        pressed
          ? 'border-[var(--ds-primary)] bg-[var(--ds-primary)] text-white'
          : 'border-[var(--ds-border)] text-[var(--ds-fg)]'
      }`}
    >
      {children}
    </button>
  );
}

function Reader({ src }: { src: string }) {
  const t = useTranslations('Viewer');
  const search = useSearchParams();
  const vertical = search.get('dir') === 'v';
  // 改行と頁の目印は既定で見せる。消したときだけ URL に残す
  const showLb = search.get('lb') !== '0';
  const showPb = search.get('pb') !== '0';
  const focusId = search.get('id');
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const ac = new AbortController();
    loadTei(src, ac.signal)
      .then((tei) => setState({ status: 'ready', tei }))
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return;
        setState({ status: 'error', error: e instanceof TeiLoadError ? e.detail : { kind: 'fetch' } });
      });
    return () => ac.abort();
  }, [src]);

  const header = useMemo(() => (state.status === 'ready' ? summarizeHeader(state.tei) : null), [state]);

  return (
    <div className="flex flex-col gap-4 px-4 py-6 sm:px-8 bg-[var(--ds-bg)]">
      {state.status === 'ready' && header ? (
        <HeaderPanel header={header} sourceUrl={src} />
      ) : (
        <h1 className="text-xl font-bold text-[var(--ds-fg)]">{t('title')}</h1>
      )}
      {state.status === 'loading' && <p className="text-[var(--ds-fg-muted)]">{t('loading')}</p>}
      {state.status === 'error' && <ErrorMessage error={state.error} />}
      {state.status === 'ready' && (
        <>
          <div className="flex flex-wrap gap-2" role="toolbar" aria-label={t('display')}>
            <Toggle pressed={vertical} onClick={() => updateParams({ dir: vertical ? 'h' : 'v' })}>
              {t('vertical')}
            </Toggle>
            <Toggle pressed={showLb} onClick={() => updateParams({ lb: showLb ? '0' : null })}>
              {t('lineBreaks')}
            </Toggle>
            <Toggle pressed={showPb} onClick={() => updateParams({ pb: showPb ? '0' : null })}>
              {t('pageBreaks')}
            </Toggle>
          </div>
          <div
            className={`rounded border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4 sm:p-6 ${
              vertical ? 'h-[min(80vh,48rem)]' : ''
            }`}
          >
            <TextPane
              tei={state.tei}
              baseUrl={src}
              vertical={vertical}
              showLineBreaks={showLb}
              showPageBreaks={showPb}
              focusId={focusId}
              onSelect={(id) => updateParams({ id })}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Viewer() {
  const search = useSearchParams();
  // 複数の TEI（書簡の横断）はペインを足すときに受ける。いまは最初の 1 つ
  const src = search.get('tei') ?? search.get('u');
  const embed = search.get('embed') === '1';
  // src が変わったら Reader を作り直し、読み込み中の表示から始める
  const body = src ? <Reader key={src} src={src} /> : <Entry />;
  return embed ? body : <CommonLayout>{body}</CommonLayout>;
}

export default function ViewerContent() {
  // useSearchParams は静的書き出しでは Suspense の中で使う
  return (
    <Suspense fallback={null}>
      <Viewer />
    </Suspense>
  );
}
