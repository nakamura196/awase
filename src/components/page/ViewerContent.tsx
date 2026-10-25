'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import CommonLayout from '@/components/layout/Common';
import PageContainer from '@/components/layout/PageContainer';
import TextPane from '@/components/viewer/TextPane';
import XslViewPane from '@/components/viewer/XslViewPane';
import HeaderPanel from '@/components/viewer/HeaderPanel';
import ImagePane, { type PlaceImages } from '@/components/viewer/ImagePane';
import ModelPane from '@/components/viewer/ModelPane';
import VrmPane from '@/components/viewer/VrmPane';
import { parseBoneFilter, type BoneFilter } from '@/lib/vrm/script';
import ApparatusPane from '@/components/viewer/ApparatusPane';
import EntitiesPane from '@/components/viewer/EntitiesPane';
import SpeechPane from '@/components/viewer/SpeechPane';
import MapPane from '@/components/viewer/MapPane';
import TimelinePane from '@/components/viewer/TimelinePane';
import LineView from '@/components/xsl/LineView';
import ReadingSupportView from '@/components/xsl/ReadingSupportView';
import VideoSupportView from '@/components/xsl/VideoSupportView';
import { useScrollSync } from '@/components/viewer/useScrollSync';
import { withBasePath } from '@/lib/basePath';
import { loadSource, TeiLoadError, type LoadError, type ParallelConfig } from '@/lib/tei/load';
import { summarizeHeader } from '@/lib/tei/header';
import { facsTargets, pageBreaks, pageTarget, readFacsimile } from '@/lib/tei/facs';
import { getSources, isVertical, paneShown, togglePane } from '@/lib/viewerParams';
import { readApparatus } from '@/lib/tei/apparatus';
import { entityId, hasEntitiesData, textEntities } from '@/lib/tei/entities';
import { textSpeeches } from '@/lib/tei/speech';
import { hasMapData, hasTimelineData } from '@/lib/tei/corresp';
import { hasModelData, readModels } from '@/lib/tei/model3d';
import { XSL_CATALOG, xslTitle } from '@/lib/xsl/catalog';
import { parseXslChoice } from '@/lib/xsl/params';

// URL で受け取るパラメータ（docs/notes/survey.md「viewer の URL」「旧 URL の受け方」）。
// いま使っているのは u / tei / config / url（どれも繰り返し可）/ dir / textDirection / id / embed / panes（image と apparatus を出すか）と、
// 表示の切り替えの lb / pb / sync。ほかはペインを足すときに使う
export const VIEWER_PARAMS = ['u', 'tei', 'config', 'url', 'manifest', 'curation', 'panes', 'dir', 'textDirection', 'wit', 'xsl', 'id', 'embed'] as const;

const KOUI = 'https://w3id.org/kouigenjimonogatari/tei/01.xml';
const YOSANO = 'https://tei-eaj.github.io/parallel_text_viewer/data/yosano.xml';
// 絵入源氏 桐壺と与謝野訳を束ねた PTV の config.json。絵入源氏の anchor@corresp が与謝野訳の文を指す
const EIRI_CONFIG = 'https://tei-eaj.github.io/parallel_text_viewer/data/pt/config.json';
const ANNAN = withBasePath('/samples/annan-kokusho.xml');
const TAKARA = 'https://raw.githubusercontent.com/TEI-EAJ/aozora_tei/master/data/complete/tei_lib_lv3/1126_tei.xml';
const MEROS = 'https://raw.githubusercontent.com/TEI-EAJ/aozora_tei/master/data/complete/tei_lib_lv4/1567_tei.xml';
const GUIDE = 'https://tei-tools.toyobunko-lab.jp/xml/tei-guide/tei.xml';
const VIDEO_NEWS = 'https://video-support.vercel.app/data/sdcommons_npl-02FT0102974177/sdcommons_npl-02FT0102974177.xml';
const SAMPLES: readonly { key: string; urls: readonly string[]; dir: 'v' | 'h'; xsl?: string }[] = [
  { key: 'sampleKoui', urls: [KOUI], dir: 'v' },
  { key: 'sampleYosano', urls: [YOSANO], dir: 'h' },
  { key: 'sampleParallel', urls: [KOUI, YOSANO], dir: 'h' },
  { key: 'sampleLinked', urls: [EIRI_CONFIG], dir: 'v' },
  { key: 'sampleAnnan', urls: [ANNAN], dir: 'v' },
  { key: 'sampleTakara', urls: [TAKARA], dir: 'v' },
  { key: 'sampleTakaraLine', urls: [TAKARA], dir: 'v', xsl: 'line' },
  { key: 'sampleMeros', urls: [MEROS], dir: 'v' },
  { key: 'sampleMerosLine', urls: [MEROS], dir: 'v', xsl: 'line' },
  { key: 'sampleReadingSupport', urls: [VIDEO_NEWS], dir: 'h', xsl: 'reading-support' },
  { key: 'sampleVideoSupport', urls: [VIDEO_NEWS], dir: 'h', xsl: 'video' },
  { key: 'sampleGuide', urls: [GUIDE], dir: 'h', xsl: 'analysis' },
];

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
  params.delete('url');
  if (sources.length === 0) {
    params.delete('xsl');
    params.delete('id');
  }
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
    <PageContainer width="text" className="space-y-8 py-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold text-[var(--ds-fg)]" style={{ fontFamily: 'var(--ds-font-serif)' }}>{t('title')}</h1>
        <p className="text-sm sm:text-base leading-relaxed text-[var(--ds-fg-muted)]">{t('lead')}</p>
      </header>
      <form
        className="flex flex-col sm:flex-row gap-2.5 rounded-xl border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4 sm:p-5 shadow-xs"
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
          className="flex-1 min-w-0 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-bg)] px-3.5 py-2 text-sm text-[var(--ds-fg)] focus:border-[var(--ds-primary)] focus:outline-none"
        />
        <button type="submit" className="rounded-lg bg-[var(--ds-primary)] px-5 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity">
          {t('open')}
        </button>
      </form>
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-[var(--ds-fg)]">{t('samples')}</h2>
        <ul className="space-y-2">
          {SAMPLES.map((s) => (
            <li key={s.key}>
              <a
                href={`?${s.urls.map((u) => `u=${encodeURIComponent(u)}`).join('&')}&dir=${s.dir}${s.xsl ? `&xsl=${encodeURIComponent(s.xsl)}` : ''}`}
                onClick={(e) => {
                  e.preventDefault();
                  updateParams({ dir: s.dir, xsl: s.xsl ?? null });
                  setSources([...s.urls]);
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

type PaneKey = 'image' | 'model' | 'vrm' | 'text' | 'apparatus' | 'entities' | 'speech' | 'map' | 'timeline';

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
  const label: Record<PaneKey, string> = {
    image: t('images'),
    model: t('model'),
    vrm: t('vrm'),
    text: t('textPane'),
    apparatus: t('apparatus'),
    entities: t('entities'),
    speech: t('speech'),
    map: t('map'),
    timeline: t('timeline'),
  };
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
  showModel,
  onHasModel,
  showVrm,
  onHasVrm,
  vrmUrl,
  vrmScriptUrl,
  vrmFilter,
  showApparatus,
  onHasApparatus,
  showEntities,
  onHasEntities,
  showSpeech,
  onHasSpeech,
  showMap,
  onHasMap,
  showTimeline,
  onHasTimeline,
  wit,
  xslParam,
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
  showModel: boolean;
  /** この列に 3D モデルがあるか（ツールバーの「3D」を出すかどうか） */
  onHasModel: (index: number, has: boolean) => void;
  showVrm: boolean;
  /** この列に読み上げられる発話があるか（ツールバーの「読み上げ」を出すかどうか） */
  onHasVrm: (index: number, has: boolean) => void;
  /** URL の vrm（アバターの VRM ファイル）。無ければ同梱のもの */
  vrmUrl: string | null;
  /** URL の json（台本 JSON）と filter（動かすボーン） */
  vrmScriptUrl: string | null;
  vrmFilter: BoneFilter;
  showApparatus: boolean;
  /** この列に異文（app）があるか（ツールバーの「異文」を出すかどうか） */
  onHasApparatus: (index: number, has: boolean) => void;
  showEntities: boolean;
  /** この列に固有表現（persName・placeName・orgName・date・rs・name）があるか */
  onHasEntities: (index: number, has: boolean) => void;
  showSpeech: boolean;
  /** この列に発話（sp・said）があるか */
  onHasSpeech: (index: number, has: boolean) => void;
  showMap: boolean;
  /** この列に地図に出せる地点・書簡（listPlace の geo や correspDesc）があるか */
  onHasMap: (index: number, has: boolean) => void;
  showTimeline: boolean;
  /** この列に年表に出せる日時（correspDesc・event・日付属性つきの date）があるか */
  onHasTimeline: (index: number, has: boolean) => void;
  /** 異文の箇所で見せる伝本（?wit=） */
  wit: string | null;
  /** 表示スタイルの切り替え（?xsl=line / reading / notes / ocr / analysis 等） */
  xslParam: string | null;
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
    for (const [id, entry] of map.entries()) {
      if ((!entry.manifest && !entry.service && !entry.image) || (entry.image && /sketchfab\.com/i.test(entry.image))) {
        map.delete(id);
      }
    }
    const pbs = pageBreaks(state.tei);
    const pages = pbs.map((pb) => pageTarget({ facs: pb.getAttribute('facs'), corresp: pb.getAttribute('corresp') }, map, src));
    const places = new Map<string, PlaceImages>();
    for (const e of apps) {
      const targets = facsTargets(e.facs, map);
      if (targets.length) places.set(e.id, { n: e.n, targets });
    }
    for (const [id, entry] of map.entries()) {
      if (!entry.region) continue;
      const m = /^z-0*(\d+)$/.exec(id);
      if (m) {
        const n = Number(m[1]);
        const pad = id.slice(2);
        const place: PlaceImages = { n, targets: [entry] };
        places.set(`o-${pad}`, place);
        places.set(`y-${pad}`, place);
        places.set(`ja-${pad}`, place);
        places.set(id, place);
      }
    }
    if (places.size > 0) {
      textEntities(state.tei).forEach((el, i) => {
        const entId = el.getAttribute('xml:id') ?? el.getAttribute('id') ?? entityId(i + 1);
        for (let p: Element | null = el.parentElement; p; p = p.parentElement) {
          const pid = p.getAttribute('xml:id') ?? p.getAttribute('id');
          if (pid && places.has(pid)) {
            if (!places.has(entId)) places.set(entId, places.get(pid)!);
            break;
          }
        }
      });
    }
    if (!pages.some(Boolean) && !places.size) return null;
    return { pages, labels: pbs.map((pb) => pb.getAttribute('n')), hasImage: pages.map(Boolean), places };
  }, [state, src, apps]);
  useEffect(() => onHasImages(index, Boolean(facs)), [facs, index, onHasImages]);
  const imaged = showImages && facs !== null;
  const placeIds = useMemo(() => new Set(facs?.places.keys()), [facs]);
  // 3D モデル（facsimile/surface が 3D モデルを指すもの）
  const hasModel = useMemo(() => (state.status === 'ready' ? hasModelData(state.tei) : false), [state]);
  useEffect(() => onHasModel(index, hasModel), [hasModel, index, onHasModel]);
  const withModel = showModel && hasModel;
  const models = useMemo(() => (state.status === 'ready' && hasModel ? readModels(state.tei, src) : []), [state, hasModel, src]);
  const modelIds = useMemo(() => new Set(models.flatMap((s) => s.zones.flatMap((z) => z.ids))), [models]);
  // 異文（app）。1 つでもあれば、異文の一覧を本文の横に出せる
  const hasApparatus = apps.length > 0;
  useEffect(() => onHasApparatus(index, hasApparatus), [hasApparatus, index, onHasApparatus]);
  const withApparatus = showApparatus && hasApparatus;
  // 固有表現（persName・placeName・orgName・date・rs・name）。1 つでもあれば一覧を出せる
  const hasEntities = useMemo(() => (state.status === 'ready' ? hasEntitiesData(state.tei) : false), [state]);
  useEffect(() => onHasEntities(index, hasEntities), [hasEntities, index, onHasEntities]);
  const withEntities = showEntities && hasEntities;
  // 発話（sp・said）。1 つでもあれば一覧を出せる
  const hasSpeech = useMemo(() => (state.status === 'ready' ? textSpeeches(state.tei).length > 0 : false), [state]);
  useEffect(() => onHasSpeech(index, hasSpeech), [hasSpeech, index, onHasSpeech]);
  const withSpeech = showSpeech && hasSpeech;
  // VRM の読み上げ。panes に vrm と書いたときだけ出す（20MB のモデルを読むため）
  useEffect(() => onHasVrm(index, hasSpeech), [hasSpeech, index, onHasVrm]);
  const withVrm = showVrm && hasSpeech;
  // 地図（listPlace の geo や correspDesc）
  const hasMap = useMemo(() => (state.status === 'ready' ? hasMapData(state.tei) : false), [state]);
  useEffect(() => onHasMap(index, hasMap), [hasMap, index, onHasMap]);
  const withMap = showMap && hasMap;
  // 年表（correspDesc・event・日付属性つきの date）
  const hasTimeline = useMemo(() => (state.status === 'ready' ? hasTimelineData(state.tei) : false), [state]);
  useEffect(() => onHasTimeline(index, hasTimeline), [hasTimeline, index, onHasTimeline]);
  const withTimeline = showTimeline && hasTimeline;
  // 出すペイン。1 列のときは広い画面で横に並べる（補助ペインは右カラムにまとめて積み、本文の表示領域を広く保つ）。
  // 狭い画面と、本文を並べて読むときは、タブで 1 つずつ出す
  const analysisPanes: PaneKey[] = [
    ...(withApparatus ? (['apparatus'] as const) : []),
    ...(withEntities ? (['entities'] as const) : []),
    ...(withSpeech ? (['speech'] as const) : []),
    ...(withMap ? (['map'] as const) : []),
    ...(withTimeline ? (['timeline'] as const) : []),
  ];
  const panes: PaneKey[] = [
    ...(imaged ? (['image'] as const) : []),
    ...(withModel ? (['model'] as const) : []),
    ...(withVrm ? (['vrm'] as const) : []),
    'text',
    ...analysisPanes,
  ];
  const [tab, setTab] = useState<PaneKey>('text');
  const active = panes.includes(tab) ? tab : 'text';
  const tabbed = panes.length > 1;
  // タブで隠すペイン。1 列のときは、広い画面では隠さない
  const paneClass = (p: PaneKey) => `h-full min-h-0 ${p === active ? '' : count === 1 ? 'hidden lg:block' : 'hidden'}`;
  const analysisPaneClass = (p: PaneKey) =>
    `min-h-0 flex-1 overflow-hidden ${p === active ? 'h-full' : count === 1 ? 'hidden lg:block' : 'hidden'}`;
  const hasVisual = imaged || withModel || withVrm;
  const desktopLayout =
    count !== 1
      ? undefined
      : hasVisual && analysisPanes.length > 0
        ? 'image-text-analysis'
        : hasVisual
          ? 'image-text'
          : analysisPanes.length > 0
            ? 'text-analysis'
            : 'text-only';

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
        <div
          className="awase-viewer-grid grid min-h-0 flex-1 grid-cols-1 grid-rows-1 gap-4"
          data-layout={desktopLayout}
        >
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
        {withModel && (
          <div className={paneClass('model')}>
            <ModelPane
              surfaces={models}
              focusId={focusId}
              onSelect={(id) => updateParams({ id })}
            />
          </div>
        )}
        {withVrm && (
          <div className={paneClass('vrm')}>
            <VrmPane
              tei={state.tei}
              focusId={focusId}
              onSelect={(id) => updateParams({ id })}
              vrmUrl={vrmUrl}
              scriptUrl={vrmScriptUrl}
              boneFilter={vrmFilter}
            />
          </div>
        )}
        {xslParam === 'line' ? (
          <div className={`${paneClass('text')} overflow-hidden rounded border border-[var(--ds-border)] bg-[var(--ds-surface)]`} data-testid="text-pane">
            <LineView
              tei={state.tei}
              focusId={focusId}
              onSelect={(id) => updateParams({ id })}
            />
          </div>
        ) : xslParam === 'reading-support' ? (
          <div className={paneClass('text')} data-testid="text-pane">
            <ReadingSupportView
              tei={state.tei}
              baseUrl={src}
              focusId={focusId}
              onSelect={(id) => updateParams({ id })}
            />
          </div>
        ) : xslParam === 'video' ? (
          <div className={paneClass('text')} data-testid="text-pane">
            <VideoSupportView
              tei={state.tei}
              baseUrl={src}
              focusId={focusId}
              onSelect={(id) => updateParams({ id })}
            />
          </div>
        ) : xslParam ? (
          <div className={paneClass('text')}>
            <XslViewPane
              key={`${src}:${xslParam}`}
              tei={state.tei}
              baseUrl={src}
              choice={parseXslChoice(xslParam)}
              vertical={vertical}
              focusId={focusId}
              onSelect={(id) => updateParams({ id })}
              onDirectionChange={(dir) => updateParams({ dir })}
            />
          </div>
        ) : (
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
              linkedIds={withModel ? modelIds : undefined}
            />
          </div>
        )}
        {analysisPanes.length > 0 && (
          <div
            data-testid="viewer-analysis-sidebar"
            data-single-column={count === 1 ? 'true' : undefined}
            className={`awase-analysis-sidebar h-full min-h-0 min-w-0 flex-col gap-3 ${
              analysisPanes.includes(active)
                ? 'flex'
                : count === 1
                  ? 'hidden lg:block'
                  : 'hidden'
            }`}
          >
            {withApparatus && (
              <div className={analysisPaneClass('apparatus')}>
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
            {withEntities && (
              <div className={analysisPaneClass('entities')}>
                <EntitiesPane
                  tei={state.tei}
                  focusId={focusId}
                  onSelect={(id) => updateParams({ id })}
                />
              </div>
            )}
            {withSpeech && (
              <div className={analysisPaneClass('speech')}>
                <SpeechPane
                  tei={state.tei}
                  focusId={focusId}
                  onSelect={(id) => updateParams({ id })}
                />
              </div>
            )}
            {withMap && (
              <div className={analysisPaneClass('map')}>
                <MapPane
                  tei={state.tei}
                  baseUrl={src}
                  focusId={focusId}
                  onSelect={(id) => updateParams({ id })}
                />
              </div>
            )}
            {withTimeline && (
              <div className={analysisPaneClass('timeline')}>
                <TimelinePane
                  tei={state.tei}
                  focusId={focusId}
                  onSelect={(id) => updateParams({ id })}
                />
              </div>
            )}
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
  const locale = useLocale();
  const search = useSearchParams();
  const vertical = isVertical(search);
  // 改行と頁の目印は既定で見せる。消したときだけ URL に残す
  const showLb = search.get('lb') !== '0';
  const showPb = search.get('pb') !== '0';
  // id は列ごとに探す。その id を持つ要素と、@corresp でそれを指す要素・範囲に印が付く（src/lib/tei/link.ts）
  const focusId = search.get('id');
  // 異文の箇所で見せる伝本（koui の ?wit=）。書かなければ lem
  const wit = search.get('wit');
  const xslParam = search.get('xsl')?.trim() || null;
  const xslChoice = parseXslChoice(xslParam);
  const many = sources.length > 1;
  // 並べた列のスクロール連動。既定で入れ、切ったときだけ URL に残す
  const sync = search.get('sync') !== '0';
  const columns = useRef<HTMLDivElement>(null);
  useScrollSync(columns, many && sync);
  // 頁の画像（pb@facs）・異文の一覧・固有表現の一覧・発話・地図・年表。panes を書いたときは、含むものだけ出す
  // 電子読書支援ビュー / 動画閲覧支援ビューは独自に左右の用語カード列を持つため、panes 未指定時は entities を自動展開しない
  const panes = search.get('panes');
  const isSupportStyle = xslParam === 'reading-support' || xslParam === 'video';
  const showImages = paneShown(panes, 'image');
  const showModel = paneShown(panes, 'model');
  const showVrm = paneShown(panes, 'vrm');
  const vrmUrl = search.get('vrm');
  const vrmScriptUrl = search.get('json');
  const vrmFilter = parseBoneFilter(search.get('filter'));
  const showApparatus = paneShown(panes, 'apparatus');
  const showEntities = isSupportStyle && panes === null ? false : paneShown(panes, 'entities');
  const showSpeech = paneShown(panes, 'speech');
  const showMap = paneShown(panes, 'map');
  const showTimeline = paneShown(panes, 'timeline');
  // 各ペインに出せる中身がある列があるときだけ、ツールバーにそのボタンを出す
  const [imageColumns, onHasImages] = useColumnFlags();
  const [modelColumns, onHasModel] = useColumnFlags();
  const [vrmColumns, onHasVrm] = useColumnFlags();
  const [apparatusColumns, onHasApparatus] = useColumnFlags();
  const [entityColumns, onHasEntities] = useColumnFlags();
  const [speechColumns, onHasSpeech] = useColumnFlags();
  const [mapColumns, onHasMap] = useColumnFlags();
  const [timelineColumns, onHasTimeline] = useColumnFlags();

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 bg-[var(--ds-bg)] px-4 py-3 sm:px-6">
      {/* 1 つのときは本文の題名が見出しになる。並べるときは列ごとの題名を h2 にし、ページの見出しを別に置く */}
      {many && <h1 className="sr-only">{t('parallelTitle', { count: sources.length })}</h1>}
      <div
        className="flex shrink-0 flex-wrap items-center gap-2 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-2"
        role="toolbar"
        aria-label={t('display')}
      >
        <label className="flex items-center gap-1.5 text-sm">
          <span className="font-medium text-[var(--ds-fg-muted)]">{t('styleLabel')}</span>
          <select
            data-testid="viewer-style-select"
            value={xslChoice.kind === 'catalog' ? xslChoice.id : xslChoice.kind === 'sef' ? '__custom' : ''}
            onChange={(e) => updateParams({ xsl: e.target.value || null })}
            className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-bg)] px-2.5 py-1 text-sm text-[var(--ds-fg)]"
          >
            <option value="">{t('styleStandard')}</option>
            {xslChoice.kind === 'sef' && <option value="__custom">{xslChoice.url.split('/').pop()}</option>}
            {XSL_CATALOG.map((x) => (
              <option key={x.id} value={x.id}>
                {xslTitle(x, locale)}
              </option>
            ))}
          </select>
        </label>
        <Toggle pressed={vertical} onClick={() => updateParams({ dir: vertical ? 'h' : 'v' })}>
          {t('vertical')}
        </Toggle>
        {!xslParam && (
          <>
            <Toggle pressed={showLb} onClick={() => updateParams({ lb: showLb ? '0' : null })}>
              {t('lineBreaks')}
            </Toggle>
            <Toggle pressed={showPb} onClick={() => updateParams({ pb: showPb ? '0' : null })}>
              {t('pageBreaks')}
            </Toggle>
          </>
        )}
        {imageColumns.size > 0 && (
          <Toggle pressed={showImages} onClick={() => updateParams({ panes: togglePane(panes, 'image') })}>
            {t('images')}
          </Toggle>
        )}
        {modelColumns.size > 0 && (
          <Toggle pressed={showModel} onClick={() => updateParams({ panes: togglePane(panes, 'model') })}>
            {t('model')}
          </Toggle>
        )}
        {apparatusColumns.size > 0 && (
          <Toggle pressed={showApparatus} onClick={() => updateParams({ panes: togglePane(panes, 'apparatus') })}>
            {t('apparatus')}
          </Toggle>
        )}
        {entityColumns.size > 0 && (
          <Toggle pressed={showEntities} onClick={() => updateParams({ panes: togglePane(panes, 'entities') })}>
            {t('entities')}
          </Toggle>
        )}
        {speechColumns.size > 0 && (
          <Toggle pressed={showSpeech} onClick={() => updateParams({ panes: togglePane(panes, 'speech') })}>
            {t('speech')}
          </Toggle>
        )}
        {vrmColumns.size > 0 && (
          <Toggle pressed={showVrm} onClick={() => updateParams({ panes: togglePane(panes, 'vrm') })}>
            {t('vrm')}
          </Toggle>
        )}
        {mapColumns.size > 0 && (
          <Toggle pressed={showMap} onClick={() => updateParams({ panes: togglePane(panes, 'map') })}>
            {t('map')}
          </Toggle>
        )}
        {timelineColumns.size > 0 && (
          <Toggle pressed={showTimeline} onClick={() => updateParams({ panes: togglePane(panes, 'timeline') })}>
            {t('timeline')}
          </Toggle>
        )}
        {many && (
          <Toggle pressed={sync} onClick={() => updateParams({ sync: sync ? '0' : null })}>
            {t('scrollSync')}
          </Toggle>
        )}
        <AddText />
        <button
          type="button"
          onClick={() => setSources([], true)}
          className="ml-auto shrink-0 rounded-full border border-[var(--ds-border)] bg-[var(--ds-bg)] px-3 py-1 text-xs font-medium text-[var(--ds-fg-muted)] hover:border-[var(--ds-primary)] hover:text-[var(--ds-fg)] transition-colors"
        >
          ← {t('changeSource')}
        </button>
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
            showModel={showModel}
            onHasModel={onHasModel}
            showVrm={showVrm}
            onHasVrm={onHasVrm}
            vrmUrl={vrmUrl}
            vrmScriptUrl={vrmScriptUrl}
            vrmFilter={vrmFilter}
            showApparatus={showApparatus}
            onHasApparatus={onHasApparatus}
            showEntities={showEntities}
            onHasEntities={onHasEntities}
            showSpeech={showSpeech}
            onHasSpeech={onHasSpeech}
            showMap={showMap}
            onHasMap={onHasMap}
            showTimeline={showTimeline}
            onHasTimeline={onHasTimeline}
            wit={wit}
            xslParam={xslParam}
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
