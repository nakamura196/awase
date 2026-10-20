'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import CommonLayout from '@/components/layout/Common';
import PageContainer from '@/components/layout/PageContainer';
import TextPane from '@/components/viewer/TextPane';
import HeaderPanel from '@/components/viewer/HeaderPanel';
import ImagePane from '@/components/viewer/ImagePane';
import { useScrollSync } from '@/components/viewer/useScrollSync';
import { loadSource, TeiLoadError, type LoadError, type ParallelConfig } from '@/lib/tei/load';
import { summarizeHeader } from '@/lib/tei/header';
import { pageBreaks, pageTarget, readFacsimile } from '@/lib/tei/facs';
import { getSources } from '@/lib/viewerParams';

// URL で受け取るパラメータ（docs/notes/survey.md「viewer の URL」）。
// いま使っているのは u / tei / config（どれも繰り返し可）/ dir / id / embed / panes（image を含むかだけを見る）と、
// 表示の切り替えの lb / pb / sync。ほかはペインを足すときに使う
export const VIEWER_PARAMS = ['u', 'tei', 'config', 'manifest', 'curation', 'panes', 'dir', 'wit', 'xsl', 'id', 'embed'] as const;

const KOUI = 'https://w3id.org/kouigenjimonogatari/tei/01.xml';
const YOSANO = 'https://tei-eaj.github.io/parallel_text_viewer/data/yosano.xml';
// 絵入源氏 桐壺と与謝野訳を束ねた PTV の config.json。絵入源氏の anchor@corresp が与謝野訳の文を指す
const EIRI_CONFIG = 'https://tei-eaj.github.io/parallel_text_viewer/data/pt/config.json';
const SAMPLES = [
  { key: 'sampleKoui', urls: [KOUI], dir: 'v' },
  { key: 'sampleYosano', urls: [YOSANO], dir: 'h' },
  { key: 'sampleParallel', urls: [KOUI, YOSANO], dir: 'h' },
  { key: 'sampleLinked', urls: [EIRI_CONFIG], dir: 'v' },
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

// 読む TEI の一覧を書き換える。並べ方が変わるので履歴に残す。書くときは u にそろえる
function setSources(sources: string[], push = true) {
  const params = new URLSearchParams(window.location.search);
  params.delete('u');
  params.delete('tei');
  params.delete('config');
  for (const s of sources) params.append('u', s);
  const url = `${window.location.pathname}?${params.toString()}`;
  if (push) window.history.pushState(null, '', url);
  else window.history.replaceState(null, '', url);
}

// config.json を、束ねている本文の URL に開く。開いた形を URL に残す（履歴は増やさない）
function expandConfig(index: number, config: ParallelConfig) {
  const sources = getSources(new URLSearchParams(window.location.search));
  sources.splice(index, 1, ...config.sources);
  if (config.vertical !== undefined) updateParams({ dir: config.vertical ? 'v' : 'h' });
  setSources(sources, false);
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
                href={`?${s.urls.map((u) => `u=${encodeURIComponent(u)}`).join('&')}&dir=${s.dir}`}
                onClick={(e) => {
                  e.preventDefault();
                  updateParams({ dir: s.dir });
                  setSources([...s.urls]);
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

// 本文を 1 つ読み、書誌と本文を出す列。複数の TEI を並べるときは、この列を横に並べる
function Column({
  src,
  index,
  count,
  vertical,
  showLb,
  showPb,
  focusId,
  showImages,
  onHasImages,
}: {
  src: string;
  index: number;
  count: number;
  vertical: boolean;
  showLb: boolean;
  showPb: boolean;
  focusId: string | null;
  showImages: boolean;
  /** この列に画像の引ける頁があるか（ツールバーの「画像」を出すかどうか） */
  onHasImages: (index: number, has: boolean) => void;
}) {
  const t = useTranslations('Viewer');
  const [state, setState] = useState<State>({ status: 'loading' });
  // 画像ペインで見ている頁と、本文をその頁へ動かす頼み（何番目の pb か）
  const [page, setPage] = useState(0);
  const [pageRequest, setPageRequest] = useState<{ index: number; seq: number } | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    loadSource(src, ac.signal)
      .then((loaded) => {
        if (loaded.kind === 'config') expandConfig(index, loaded.config);
        else setState({ status: 'ready', tei: loaded.tei });
      })
      .catch((e) => {
        if ((e as Error).name === 'AbortError') return;
        setState({ status: 'error', error: e instanceof TeiLoadError ? e.detail : { kind: 'fetch' } });
      });
    return () => ac.abort();
  }, [src, index]);

  const header = useMemo(() => (state.status === 'ready' ? summarizeHeader(state.tei) : null), [state]);

  // 頁の目印（pb）ごとの画像。facs・corresp から facsimile を引く（src/lib/tei/facs.ts）。1 つも引けなければ null
  const facs = useMemo(() => {
    if (state.status !== 'ready') return null;
    const map = readFacsimile(state.tei, src);
    const pbs = pageBreaks(state.tei);
    const pages = pbs.map((pb) => pageTarget({ facs: pb.getAttribute('facs'), corresp: pb.getAttribute('corresp') }, map, src));
    if (!pages.some(Boolean)) return null;
    return { pages, labels: pbs.map((pb) => pb.getAttribute('n')), hasImage: pages.map(Boolean) };
  }, [state, src]);
  useEffect(() => onHasImages(index, Boolean(facs)), [facs, index, onHasImages]);
  const imaged = showImages && facs !== null;
  // 横書きの 1 列はページ全体がスクロールするので、画像を画面に留める
  const pageScroll = !vertical && count === 1;

  return (
    <section className="flex min-w-0 flex-col gap-4" data-testid="text-column" aria-label={header?.title || src}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {state.status === 'ready' && header ? (
            <HeaderPanel header={header} sourceUrl={src} headingLevel={count > 1 ? 2 : 1} />
          ) : (
            <p className="break-all text-sm text-[var(--ds-fg-muted)]">{src}</p>
          )}
        </div>
        {count > 1 && (
          <button
            type="button"
            onClick={() => setSources(getSources(new URLSearchParams(window.location.search)).filter((_, i) => i !== index))}
            aria-label={t('closeText')}
            title={t('closeText')}
            className="shrink-0 rounded border border-[var(--ds-border)] px-2 text-[var(--ds-fg-muted)] hover:text-[var(--ds-fg)]"
          >
            ×
          </button>
        )}
      </div>
      {state.status === 'loading' && <p className="text-[var(--ds-fg-muted)]">{t('loading')}</p>}
      {state.status === 'error' && <ErrorMessage error={state.error} />}
      {state.status === 'ready' && (
        // grid-cols-1 で列の幅を枠に収める（縦書きの本文が、中身の長さまで列を広げないように）
        <div className={imaged ? `grid grid-cols-1 gap-4 ${count === 1 ? 'lg:grid-cols-2' : ''}` : ''}>
        {imaged && facs && (
          <div
            className={`h-[45vh] ${count === 1 ? 'lg:h-[min(80vh,48rem)]' : ''} ${pageScroll ? 'lg:sticky lg:top-4 lg:self-start' : ''}`}
          >
            <ImagePane
              pages={facs.pages}
              labels={facs.labels}
              index={page}
              onGo={(i) => {
                setPage(i);
                setPageRequest((r) => ({ index: i, seq: (r?.seq ?? 0) + 1 }));
              }}
            />
          </div>
        )}
        <div
          className={`rounded border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4 sm:p-6 ${
            vertical || count > 1 ? 'h-[min(80vh,48rem)]' : ''
          }`}
        >
          <TextPane
            tei={state.tei}
            baseUrl={src}
            vertical={vertical}
            showLineBreaks={showLb}
            showPageBreaks={showPb}
            scroll={count > 1}
            focusId={focusId}
            onSelect={(id) => updateParams({ id })}
            pageImages={imaged ? facs?.hasImage : undefined}
            page={page}
            onPageChange={imaged ? setPage : undefined}
            pageRequest={pageRequest}
          />
        </div>
        </div>
      )}
    </section>
  );
}

// 本文を足す欄。並べて読むときに使う
function AddText() {
  const t = useTranslations('Viewer');
  const [url, setUrl] = useState('');
  return (
    <form
      className="flex min-w-[14rem] flex-1 gap-2 sm:max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        const u = url.trim();
        if (!u) return;
        setSources([...getSources(new URLSearchParams(window.location.search)), u]);
        setUrl('');
      }}
    >
      <label className="sr-only" htmlFor="tei-add-url">
        {t('addLabel')}
      </label>
      <input
        id="tei-add-url"
        type="url"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder={t('addPlaceholder')}
        className="min-w-0 flex-1 rounded border border-[var(--ds-border)] bg-[var(--ds-bg)] px-2 py-1 text-sm text-[var(--ds-fg)]"
      />
      <button type="submit" className="shrink-0 whitespace-nowrap rounded border border-[var(--ds-border)] px-3 py-1 text-sm text-[var(--ds-fg)]">
        {t('add')}
      </button>
    </form>
  );
}

function Reader({ sources }: { sources: string[] }) {
  const t = useTranslations('Viewer');
  const search = useSearchParams();
  const vertical = search.get('dir') === 'v';
  // 改行と頁の目印は既定で見せる。消したときだけ URL に残す
  const showLb = search.get('lb') !== '0';
  const showPb = search.get('pb') !== '0';
  // id は列ごとに探す。その id を持つ要素と、@corresp でそれを指す要素・範囲に印が付く（src/lib/tei/link.ts）
  const focusId = search.get('id');
  const many = sources.length > 1;
  // 並べた列のスクロール連動。既定で入れ、切ったときだけ URL に残す
  const sync = search.get('sync') !== '0';
  const columns = useRef<HTMLDivElement>(null);
  useScrollSync(columns, many && sync);
  // 頁の画像（pb@facs）。panes を書いたときは、image を含むときだけ出す
  const panes = search.get('panes');
  const showImages = !panes || panes.split(',').includes('image');
  // 画像の引ける列があるときだけ、ツールバーに「画像」を出す
  const [imageColumns, setImageColumns] = useState<ReadonlySet<number>>(new Set());
  const onHasImages = useCallback((i: number, has: boolean) => {
    setImageColumns((prev) => {
      if (prev.has(i) === has) return prev;
      const next = new Set(prev);
      if (has) next.add(i);
      else next.delete(i);
      return next;
    });
  }, []);

  return (
    <div className="flex flex-col gap-4 px-4 py-6 sm:px-8 bg-[var(--ds-bg)]">
      {/* 1 つのときは本文の題名が見出しになる。並べるときは列ごとの題名を h2 にし、ページの見出しを別に置く */}
      {many && <h1 className="sr-only">{t('parallelTitle', { count: sources.length })}</h1>}
      <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t('display')}>
        <Toggle pressed={vertical} onClick={() => updateParams({ dir: vertical ? 'h' : 'v' })}>
          {t('vertical')}
        </Toggle>
        <Toggle pressed={showLb} onClick={() => updateParams({ lb: showLb ? '0' : null })}>
          {t('lineBreaks')}
        </Toggle>
        <Toggle pressed={showPb} onClick={() => updateParams({ pb: showPb ? '0' : null })}>
          {t('pageBreaks')}
        </Toggle>
        {imageColumns.size > 0 && (
          <Toggle pressed={showImages} onClick={() => updateParams({ panes: showImages ? 'text' : null })}>
            {t('images')}
          </Toggle>
        )}
        {many && (
          <Toggle pressed={sync} onClick={() => updateParams({ sync: sync ? '0' : null })}>
            {t('scrollSync')}
          </Toggle>
        )}
        <AddText />
      </div>
      {/* 並べるときは、狭い画面では縦に積み、広い画面では横に並べる */}
      <div
        ref={columns}
        className={many ? 'grid gap-6 lg:grid-cols-[repeat(var(--awase-cols),minmax(0,1fr))]' : ''}
        style={many ? ({ '--awase-cols': sources.length } as React.CSSProperties) : undefined}
      >
        {sources.map((src, i) => (
          // 同じ URL を 2 度並べてもよいように、順番も鍵に含める
          <Column
            key={`${i}:${src}`}
            src={src}
            index={i}
            count={sources.length}
            vertical={vertical}
            showLb={showLb}
            showPb={showPb}
            focusId={focusId}
            showImages={showImages}
            onHasImages={onHasImages}
          />
        ))}
      </div>
    </div>
  );
}

function Viewer() {
  const search = useSearchParams();
  const sources = getSources(search);
  const embed = search.get('embed') === '1';
  const body = sources.length ? <Reader sources={sources} /> : <Entry />;
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
