'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import CommonLayout from '@/components/layout/Common';
import PageContainer from '@/components/layout/PageContainer';
import TextPane from '@/components/viewer/TextPane';
import HeaderPanel from '@/components/viewer/HeaderPanel';
import ImagePane, { type PlaceImages } from '@/components/viewer/ImagePane';
import ApparatusPane from '@/components/viewer/ApparatusPane';
import { useScrollSync } from '@/components/viewer/useScrollSync';
import { loadSource, TeiLoadError, type LoadError, type ParallelConfig } from '@/lib/tei/load';
import { summarizeHeader } from '@/lib/tei/header';
import { facsTargets, pageBreaks, pageTarget, readFacsimile } from '@/lib/tei/facs';
import { getSources, paneShown, togglePane } from '@/lib/viewerParams';
import { readApparatus } from '@/lib/tei/apparatus';

// URL で受け取るパラメータ（docs/notes/survey.md「viewer の URL」）。
// いま使っているのは u / tei / config（どれも繰り返し可）/ dir / id / embed / panes（image と apparatus を出すか）と、
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
      // 入は淡い地に印、切は枠だけ。塗りつぶしの青は「押すと何か起きる」ボタンと紛れるので使わない
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-sm ${
        pressed
          ? 'border-[var(--ds-primary)] bg-[var(--ds-primary)]/10 text-[var(--ds-primary)]'
          : 'border-[var(--ds-border)] text-[var(--ds-fg-muted)] hover:text-[var(--ds-fg)]'
      }`}
    >
      <span aria-hidden="true" className={`w-3 text-center ${pressed ? '' : 'opacity-40'}`}>
        {pressed ? '✓' : '+'}
      </span>
      {children}
    </button>
  );
}

// 本文の横のペインの並べ方（Tailwind が拾えるよう、クラス名を書き切る）
const LG_COLS: Record<number, string> = { 2: 'lg:grid-cols-2', 3: 'lg:grid-cols-3' };

type PaneKey = 'image' | 'text' | 'apparatus';

// ペインを横に並べられないとき（狭い画面と、本文を並べて読むとき）に、1 つずつ切り替えるタブ
function PaneTabs({
  panes,
  active,
  onChange,
  className,
}: {
  panes: PaneKey[];
  active: PaneKey;
  onChange: (p: PaneKey) => void;
  className: string;
}) {
  const t = useTranslations('Viewer');
  const label: Record<PaneKey, string> = { image: t('images'), text: t('textPane'), apparatus: t('apparatus') };
  return (
    <div role="tablist" aria-label={t('panes')} className={`flex shrink-0 gap-1 border-b border-[var(--ds-border)] ${className}`}>
      {panes.map((p) => (
        <button
          key={p}
          type="button"
          role="tab"
          aria-selected={p === active}
          onClick={() => onChange(p)}
          className={`-mb-px border-b-2 px-3 py-1 text-sm ${
            p === active
              ? 'border-[var(--ds-primary)] font-bold text-[var(--ds-fg)]'
              : 'border-transparent text-[var(--ds-fg-muted)] hover:text-[var(--ds-fg)]'
          }`}
        >
          {label[p]}
        </button>
      ))}
    </div>
  );
}

// 列ごとに「〜がある」を集める（ツールバーのボタンを出すかどうか）
function useColumnFlags() {
  const [flags, setFlags] = useState<ReadonlySet<number>>(new Set());
  const update = useCallback((i: number, has: boolean) => {
    setFlags((prev) => {
      if (prev.has(i) === has) return prev;
      const next = new Set(prev);
      if (has) next.add(i);
      else next.delete(i);
      return next;
    });
  }, []);
  return [flags, update] as const;
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
  showApparatus,
  onHasApparatus,
  wit,
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
  showApparatus: boolean;
  /** この列に異文（app）があるか（ツールバーの「異文」を出すかどうか） */
  onHasApparatus: (index: number, has: boolean) => void;
  /** 異文の箇所で見せる伝本（?wit=） */
  wit: string | null;
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

  // 異文の箇所（app）。番号と、本文・一覧と結ぶ id は一覧（ApparatusPane）と同じ
  const apps = useMemo(() => (state.status === 'ready' ? readApparatus(state.tei, []) : []), [state]);
  // 頁の目印（pb）ごとの画像と、異文の箇所（app@facs）ごとの画像。facs・corresp から facsimile を引く（src/lib/tei/facs.ts）。
  // どちらも 1 つも引けなければ null
  const facs = useMemo(() => {
    if (state.status !== 'ready') return null;
    const map = readFacsimile(state.tei, src);
    const pbs = pageBreaks(state.tei);
    const pages = pbs.map((pb) => pageTarget({ facs: pb.getAttribute('facs'), corresp: pb.getAttribute('corresp') }, map, src));
    const places = new Map<string, PlaceImages>();
    for (const e of apps) {
      const targets = facsTargets(e.facs, map);
      if (targets.length) places.set(e.id, { n: e.n, targets });
    }
    if (!pages.some(Boolean) && !places.size) return null;
    return { pages, labels: pbs.map((pb) => pb.getAttribute('n')), hasImage: pages.map(Boolean), places };
  }, [state, src, apps]);
  useEffect(() => onHasImages(index, Boolean(facs)), [facs, index, onHasImages]);
  const imaged = showImages && facs !== null;
  const placeIds = useMemo(() => new Set(facs?.places.keys()), [facs]);
  // 異文（app）。1 つでもあれば、異文の一覧を本文の横に出せる
  const hasApparatus = apps.length > 0;
  useEffect(() => onHasApparatus(index, hasApparatus), [hasApparatus, index, onHasApparatus]);
  const withApparatus = showApparatus && hasApparatus;
  // 出すペイン。1 列のときは広い画面で横に並べる。狭い画面と、本文を並べて読むときは、タブで 1 つずつ出す
  const panes: PaneKey[] = [...(imaged ? (['image'] as const) : []), 'text', ...(withApparatus ? (['apparatus'] as const) : [])];
  const [tab, setTab] = useState<PaneKey>('text');
  const active = panes.includes(tab) ? tab : 'text';
  const tabbed = panes.length > 1;
  // タブで隠すペイン。1 列のときは、広い画面では隠さない
  const paneClass = (p: PaneKey) => `h-full min-h-0 ${p === active ? '' : count === 1 ? 'hidden lg:block' : 'hidden'}`;

  return (
    <section
      className={`flex min-h-0 min-w-0 flex-col gap-2 ${count > 1 ? 'h-[85dvh] lg:h-full' : 'h-full'}`}
      data-testid="text-column"
      aria-label={header?.title || src}
    >
      <div className="flex shrink-0 items-start gap-2">
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
        <>
        {tabbed && <PaneTabs panes={panes} active={active} onChange={setTab} className={count === 1 ? 'lg:hidden' : ''} />}
        {/* grid-cols-1 で列の幅を枠に収める（縦書きの本文が、中身の長さまで列を広げないように） */}
        <div className={`grid min-h-0 flex-1 grid-cols-1 grid-rows-1 gap-4 ${count === 1 ? (LG_COLS[panes.length] ?? '') : ''}`}>
        {imaged && facs && (
          <div className={paneClass('image')}>
            <ImagePane
              pages={facs.pages}
              labels={facs.labels}
              index={page}
              place={focusId ? facs.places.get(focusId) : null}
              onGo={(i) => {
                setPage(i);
                setPageRequest((r) => ({ index: i, seq: (r?.seq ?? 0) + 1 }));
              }}
            />
          </div>
        )}
        <div className={`${paneClass('text')} rounded border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4 sm:p-6`}>
          <TextPane
            tei={state.tei}
            baseUrl={src}
            vertical={vertical}
            showLineBreaks={showLb}
            showPageBreaks={showPb}
            scroll
            focusId={focusId}
            onSelect={(id) => updateParams({ id })}
            pageImages={imaged ? facs?.hasImage : undefined}
            page={page}
            onPageChange={imaged ? setPage : undefined}
            pageRequest={pageRequest}
            wit={wit}
          />
        </div>
        {withApparatus && (
          <div className={paneClass('apparatus')}>
            <ApparatusPane
              tei={state.tei}
              baseUrl={src}
              focusId={focusId}
              onSelect={(id) => updateParams({ id })}
              wit={wit}
              onWitChange={(w) => updateParams({ wit: w })}
              imaged={imaged ? placeIds : undefined}
            />
          </div>
        )}
        </div>
        </>
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
  // 異文の箇所で見せる伝本（koui の ?wit=）。書かなければ lem
  const wit = search.get('wit');
  const many = sources.length > 1;
  // 並べた列のスクロール連動。既定で入れ、切ったときだけ URL に残す
  const sync = search.get('sync') !== '0';
  const columns = useRef<HTMLDivElement>(null);
  useScrollSync(columns, many && sync);
  // 頁の画像（pb@facs）と異文の一覧。panes を書いたときは、含むものだけ出す
  const panes = search.get('panes');
  const showImages = paneShown(panes, 'image');
  const showApparatus = paneShown(panes, 'apparatus');
  // 画像の引ける列・異文のある列があるときだけ、ツールバーにそのボタンを出す
  const [imageColumns, onHasImages] = useColumnFlags();
  const [apparatusColumns, onHasApparatus] = useColumnFlags();

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 bg-[var(--ds-bg)] px-4 py-3 sm:px-6">
      {/* 1 つのときは本文の題名が見出しになる。並べるときは列ごとの題名を h2 にし、ページの見出しを別に置く */}
      {many && <h1 className="sr-only">{t('parallelTitle', { count: sources.length })}</h1>}
      <div className="flex shrink-0 flex-wrap items-center gap-2" role="toolbar" aria-label={t('display')}>
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
          <Toggle pressed={showImages} onClick={() => updateParams({ panes: togglePane(panes, 'image') })}>
            {t('images')}
          </Toggle>
        )}
        {apparatusColumns.size > 0 && (
          <Toggle pressed={showApparatus} onClick={() => updateParams({ panes: togglePane(panes, 'apparatus') })}>
            {t('apparatus')}
          </Toggle>
        )}
        {many && (
          <Toggle pressed={sync} onClick={() => updateParams({ sync: sync ? '0' : null })}>
            {t('scrollSync')}
          </Toggle>
        )}
        <AddText />
      </div>
      {/* 画面の残りの高さに収める。並べるときは、狭い画面では縦に積んでこの枠をスクロールし、広い画面では横に並べる */}
      <div
        ref={columns}
        className={`min-h-0 flex-1 ${
          many ? 'grid gap-6 overflow-y-auto lg:grid-cols-[repeat(var(--awase-cols),minmax(0,1fr))] lg:overflow-hidden' : 'flex flex-col'
        }`}
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
            showApparatus={showApparatus}
            onHasApparatus={onHasApparatus}
            wit={wit}
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
  if (!sources.length) return embed ? <Entry /> : <CommonLayout><Entry /></CommonLayout>;
  // 本文を開いたら画面の高さに収める（ページ全体はスクロールさせない）
  return embed ? (
    <div className="h-[100dvh]">
      <Reader sources={sources} />
    </div>
  ) : (
    <CommonLayout fullScreen>
      <Reader sources={sources} />
    </CommonLayout>
  );
}

export default function ViewerContent() {
  // useSearchParams は静的書き出しでは Suspense の中で使う
  return (
    <Suspense fallback={null}>
      <Viewer />
    </Suspense>
  );
}
