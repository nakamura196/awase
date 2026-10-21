'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import CommonLayout from '@/components/layout/Common';
import PageContainer from '@/components/layout/PageContainer';
import ImagePane, { type PlaceImages } from '@/components/viewer/ImagePane';
import EntitiesPane from '@/components/viewer/EntitiesPane';
import SpeechPane from '@/components/viewer/SpeechPane';
import MapPane from '@/components/viewer/MapPane';
import LineView from '@/components/xsl/LineView';
import ReadingSupportView from '@/components/xsl/ReadingSupportView';
import VideoSupportView from '@/components/xsl/VideoSupportView';
import { withBasePath } from '@/lib/basePath';
import { addZonePageBreaks, pageBreaks, pageTarget, readFacsimile } from '@/lib/tei/facs';
import { entityId, hasEntitiesData, textEntities } from '@/lib/tei/entities';
import { textSpeeches } from '@/lib/tei/speech';
import { hasMapData } from '@/lib/tei/corresp';
import { XSL_CATALOG, xslTitle } from '@/lib/xsl/catalog';
import { absolutizeGraphics, transformTei } from '@/lib/xsl/engine';
import {
  defaultReadingVertical,
  defaultXslId,
  getTeiUrl,
  injectBase,
  parseXslChoice,
  sefLocation,
  setFrameHtmlAttrs,
  type XslChoice,
} from '@/lib/xsl/params';

// URL で受け取るパラメータ。TEI は u（url・tei も受ける）、変換は xsl、dir で縦横、panes で画像・地図・固有表現を並べる、embed=1 で帯と枠を隠す
export const XSL_PARAMS = ['u', 'url', 'tei', 'xsl', 'dir', 'panes', 'id', 'embed'] as const;

const SAMPLES = [
  { key: 'sampleKoui', u: 'https://w3id.org/kouigenjimonogatari/tei/01.xml', xsl: 'reading' },
  {
    key: 'sampleAnnan',
    u: withBasePath('/samples/annan-kokusho.xml'),
    xsl: 'reading',
  },
  {
    key: 'sampleTakara',
    u: 'https://raw.githubusercontent.com/TEI-EAJ/aozora_tei/master/data/complete/tei_lib_lv3/1126_tei.xml',
    xsl: 'line',
  },
  {
    key: 'sampleMeros',
    u: 'https://raw.githubusercontent.com/TEI-EAJ/aozora_tei/master/data/complete/tei_lib_lv4/1567_tei.xml',
    xsl: 'reading',
  },
  {
    key: 'sampleYume',
    u: 'https://raw.githubusercontent.com/TEI-EAJ/aozora_tei/master/data/complete/tei_lib_lv3/55783_tei.xml',
    xsl: 'line',
  },
  {
    key: 'sampleReadingSupport',
    u: 'https://video-support.vercel.app/data/sdcommons_npl-02FT0102974177/sdcommons_npl-02FT0102974177.xml',
    xsl: 'reading-support',
  },
  {
    key: 'sampleVideoSupport',
    u: 'https://video-support.vercel.app/data/sdcommons_npl-02FT0102974177/sdcommons_npl-02FT0102974177.xml',
    xsl: 'video',
  },
  { key: 'sampleGuide', u: 'https://tei-tools.toyobunko-lab.jp/xml/tei-guide/tei.xml', xsl: 'analysis' },
  { key: 'sampleOcr', u: 'https://tei-tools.toyobunko-lab.jp/xml/ocr-sample/tei.xml', xsl: null },
] as const;

type Failure = 'fetch' | 'parse' | 'transform';
type State =
  | { status: 'loading' }
  | { status: 'ready'; doc: Document; text: string; html: string | null }
  | { status: 'error'; kind: Failure; httpStatus?: number };

/** TEI を取って XML にする。失敗は kind を付けて投げる */
async function fetchTei(url: string, signal: AbortSignal): Promise<{ text: string; doc: Document }> {
  let res: Response;
  try {
    res = await fetch(url, { signal });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw { kind: 'fetch' };
  }
  if (!res.ok) throw { kind: 'fetch', httpStatus: res.status };
  const text = await res.text();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw { kind: 'parse' };
  return { text, doc };
}

// XSL だけ替えたときに TEI を取り直さない（Frame は TEI・XSL が変わるたびに作り直すので、外に置く）
let cache: { url: string; text: string; doc: Document } | null = null;

function Toggle({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
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

type SidePane = 'image' | 'speech' | 'entities' | 'map';

function parseSidePanes(
  raw: string | null,
  defaultImage: boolean,
  defaultSpeech: boolean,
  defaultEntities: boolean,
  defaultMap: boolean,
): Set<SidePane> {
  if (raw === null) {
    const out = new Set<SidePane>();
    if (defaultImage) out.add('image');
    if (defaultSpeech) out.add('speech');
    if (defaultEntities) out.add('entities');
    if (defaultMap) out.add('map');
    return out;
  }
  if (raw === 'none' || raw === '') return new Set();
  const out = new Set<SidePane>();
  for (const part of raw.split(',')) {
    const p = part.trim();
    if (p === 'image' || p === 'speech' || p === 'entities' || p === 'map') out.add(p);
  }
  return out;
}

function serializeSidePanes(set: Set<SidePane>): string {
  if (set.size === 0) return 'none';
  return Array.from(set).join(',');
}

function Workspace({
  teiUrl,
  choice,
  embed,
}: {
  teiUrl: string;
  choice: XslChoice;
  embed: boolean;
}) {
  const t = useTranslations('Xsl');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  // 枠の中は別の文書なので、awase のダークを html の class で渡す
  const { resolvedTheme } = useTheme();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [draft, setDraft] = useState(() =>
    typeof window !== 'undefined' && teiUrl.startsWith('/') ? new URL(teiUrl, window.location.origin).href : teiUrl,
  );
  const [pageIdx, setPageIdx] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const choiceKey = JSON.stringify(choice);
  const focusId = search.get('id');
  const rawPanes = search.get('panes');
  const rawDir = search.get('dir');

  const go = (changes: Record<string, string | null>, push: boolean) => {
    const query: Record<string, string> = {};
    search.forEach((v, k) => {
      query[k] = v;
    });
    for (const [k, v] of Object.entries(changes)) {
      if (v === null) delete query[k];
      else query[k] = v;
    }
    const to = { pathname, query } as Parameters<typeof router.replace>[0];
    if (push) router.push(to);
    else router.replace(to);
  };

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const absUrl = new URL(teiUrl, window.location.href).href;
        if (cache?.url !== absUrl) {
          const { text, doc } = await fetchTei(absUrl, ctrl.signal);
          absolutizeGraphics(doc, absUrl);
          addZonePageBreaks(doc);
          cache = { url: absUrl, text, doc };
        }
        const { text, doc } = cache;
        const sefPath = sefLocation(choice, text, withBasePath);
        if (!sefPath) {
          if (!ctrl.signal.aborted) setState({ status: 'ready', doc, text, html: null });
          return;
        }
        const sef = new URL(sefPath, window.location.href).href;
        let html: string;
        try {
          html = await transformTei(sef, doc);
        } catch {
          throw { kind: 'transform' };
        }
        const base = new URL(withBasePath('/xsl-assets/'), window.location.href).href;
        if (!ctrl.signal.aborted) setState({ status: 'ready', doc, text, html: injectBase(html, base) });
      } catch (e) {
        if ((e as Error).name === 'AbortError' || ctrl.signal.aborted) return;
        const f = e as { kind?: Failure; httpStatus?: number };
        setState({ status: 'error', kind: f.kind ?? 'transform', httpStatus: f.httpStatus });
      }
    })();
    return () => ctrl.abort();
    // choice は choiceKey で見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teiUrl, choiceKey]);

  const doc = state.status === 'ready' ? state.doc : null;
  const xmlText = state.status === 'ready' ? state.text : '';
  const effectiveXslId = choice.kind === 'catalog' ? choice.id : choice.kind === 'auto' ? defaultXslId(xmlText) : null;
  const isReadingView = effectiveXslId === 'reading';
  const isLineView = choice.kind === 'catalog' && choice.id === 'line';
  const isReadingSupportView = choice.kind === 'catalog' && choice.id === 'reading-support';
  const isVideoSupportView = choice.kind === 'catalog' && choice.id === 'video';
  const isSupportView = isReadingSupportView || isVideoSupportView;

  const isVert = useMemo(() => {
    if (rawDir === 'v' || rawDir === 'vertical') return true;
    if (rawDir === 'h' || rawDir === 'horizontal') return false;
    return doc ? defaultReadingVertical(doc) : false;
  }, [rawDir, doc]);

  // 影印（IIIF 画像と zone 対応）
  const facs = useMemo(() => {
    if (!doc) return null;
    const map = readFacsimile(doc, teiUrl);
    const pbs = pageBreaks(doc);
    const pages = pbs.map((pb) => pageTarget({ facs: pb.getAttribute('facs'), corresp: pb.getAttribute('corresp') }, map, teiUrl));
    const places = new Map<string, PlaceImages>();
    // z-0001 などの zone を o-0001 / y-0001 / ja-0001 / z-0001 から引けるようにする
    for (const [zid, target] of map.entries()) {
      if (!target.region) continue;
      const zm = /^z-0*(\d+)$/.exec(zid);
      const n = zm ? Number(zm[1]) : places.size + 1;
      places.set(zid, { n, targets: [target] });
      if (zm) {
        const suffix = zid.slice(2); // "0001"
        for (const prefix of ['o', 'y', 'ja']) {
          places.set(`${prefix}-${suffix}`, { n, targets: [target] });
        }
      }
    }
    if (places.size > 0) {
      textEntities(doc).forEach((el, i) => {
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
    return { pages, labels: pbs.map((pb) => pb.getAttribute('n')), places };
  }, [doc, teiUrl]);

  const hasFacs = facs !== null;
  const hasSpeech = useMemo(() => (doc ? textSpeeches(doc).length > 0 : false), [doc]);
  const hasEntities = useMemo(() => (doc ? hasEntitiesData(doc) : false), [doc]);
  const hasMap = useMemo(() => (doc ? hasMapData(doc) : false), [doc]);

  // 地図データがある文書（蒋洲咨文など）や発話データがある文書（走れメロス・三つの宝など）では、panes 未指定なら対応するパネルを自動で開く
  const activePanes = useMemo(
    () =>
      parseSidePanes(
        rawPanes,
        hasMap && hasFacs,
        hasSpeech,
        !isSupportView && (hasMap || hasSpeech) && hasEntities,
        hasMap,
      ),
    [rawPanes, hasMap, hasFacs, hasSpeech, hasEntities, isSupportView],
  );
  const showImage = hasFacs && activePanes.has('image');
  const showSpeech = hasSpeech && activePanes.has('speech');
  const showEntities = hasEntities && activePanes.has('entities');
  const showMap = hasMap && activePanes.has('map');

  const toggleSidePane = (pane: SidePane) => {
    const next = new Set(activePanes);
    if (next.has(pane)) next.delete(pane);
    else next.add(pane);
    go({ panes: serializeSidePanes(next) }, false);
  };

  // iframe からのメッセージ（セグメント・固有表現の選択、縦書き切り替え）を受ける
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'awase:focus' && typeof e.data.id === 'string') {
        go({ id: e.data.id }, false);
      } else if (e.data.type === 'awase:dir' && (e.data.dir === 'v' || e.data.dir === 'h')) {
        go({ dir: e.data.dir }, false);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, pathname]);

  // focusId や isVert が変わったとき、iframe を再読み込みせずに postMessage で伝える
  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'awase:focus', id: focusId }, '*');
  }, [focusId]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'awase:dir', dir: isVert ? 'v' : 'h' }, '*');
  }, [isVert]);

  const frameSrcDoc = useMemo(() => {
    if (state.status !== 'ready' || state.html === null) return '';
    return setFrameHtmlAttrs(state.html, {
      dark: resolvedTheme === 'dark',
      vertical: isReadingView && isVert,
    });
  }, [state, resolvedTheme, isReadingView, isVert]);

  const selected = choice.kind === 'catalog' ? choice.id : choice.kind === 'sef' ? '__custom' : '';
  const hasRightAside = showMap || showSpeech || showEntities;
  const colCount = 1 + (showImage && facs ? 1 : 0) + (hasRightAside ? 1 : 0);
  const gridColsClass = colCount === 3 ? 'lg:grid-cols-3' : colCount === 2 ? 'lg:grid-cols-2' : '';

  return (
    <>
      {!embed && (
        <form
          className="flex flex-wrap items-center gap-2 border-b border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-2 text-sm"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) go({ u: draft.trim(), url: null, tei: null }, true);
          }}
        >
          <label className="flex items-center gap-1.5">
            <span className="font-medium text-[var(--ds-fg)]">{t('xslLabel')}</span>
            <select
              value={selected}
              onChange={(e) => go({ xsl: e.target.value || null }, false)}
              className="rounded-lg border border-[var(--ds-border)] bg-[var(--ds-bg)] px-2.5 py-1 text-[var(--ds-fg)]"
            >
              <option value="">{t('auto')}</option>
              {choice.kind === 'sef' && <option value="__custom">{choice.url.split('/').pop()}</option>}
              {XSL_CATALOG.map((x) => (
                <option key={x.id} value={x.id}>
                  {xslTitle(x, locale)}
                </option>
              ))}
            </select>
          </label>

          {isReadingView && (
            <Toggle pressed={isVert} onClick={() => go({ dir: isVert ? 'h' : 'v' }, false)}>
              {t('verticalToggle')}
            </Toggle>
          )}
          {hasFacs && (
            <Toggle pressed={showImage} onClick={() => toggleSidePane('image')}>
              {t('imageToggle')}
            </Toggle>
          )}
          {hasSpeech && (
            <Toggle pressed={showSpeech} onClick={() => toggleSidePane('speech')}>
              {t('speechToggle')}
            </Toggle>
          )}
          {hasEntities && (
            <Toggle pressed={showEntities} onClick={() => toggleSidePane('entities')}>
              {t('entitiesToggle')}
            </Toggle>
          )}
          {hasMap && (
            <Toggle pressed={showMap} onClick={() => toggleSidePane('map')}>
              {t('mapToggle')}
            </Toggle>
          )}

          <label className="flex min-w-[12rem] flex-1 items-center gap-1">
            <span className="sr-only">{t('urlLabel')}</span>
            <input
              type="url"
              required
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-bg)] px-2.5 py-1 text-[var(--ds-fg)]"
            />
          </label>
          <button type="submit" className="rounded-lg bg-[var(--ds-primary)] px-3.5 py-1 font-medium text-white">
            {t('open')}
          </button>
          <Link
            href={`/viewer?u=${encodeURIComponent(teiUrl)}${selected && selected !== '__custom' ? `&xsl=${encodeURIComponent(selected)}` : ''}`}
            className="rounded-full border border-[var(--ds-border)] bg-[var(--ds-bg)] px-3 py-1 text-xs font-medium text-[var(--ds-primary)] hover:border-[var(--ds-primary)] transition-colors"
          >
            {t('openInViewer')} →
          </Link>
          <button
            type="button"
            onClick={() => go({ u: null, url: null, tei: null, xsl: null, dir: null, panes: null, id: null }, true)}
            className="rounded-full border border-[var(--ds-border)] bg-[var(--ds-bg)] px-3 py-1 text-xs font-medium text-[var(--ds-fg-muted)] hover:border-[var(--ds-primary)] hover:text-[var(--ds-fg)] transition-colors"
          >
            ← {t('changeSource')}
          </button>
        </form>
      )}

      {state.status === 'error' ? (
        <p role="alert" className="m-4 text-[var(--ds-fg)]">
          {state.kind === 'fetch'
            ? state.httpStatus
              ? t('errorStatus', { status: state.httpStatus })
              : t('errorFetch')
            : state.kind === 'parse'
              ? t('errorParse')
              : t('errorTransform')}
        </p>
      ) : (
        <div
          className={`awase-xsl-grid relative grid min-h-0 flex-1 grid-cols-1 grid-rows-1 ${gridColsClass}`}
          data-cols={colCount}
        >
          {state.status === 'loading' && (
            <p className="absolute left-4 top-4 z-10 text-sm text-[var(--ds-fg-muted)]">{t('loading')}</p>
          )}
          {state.status === 'ready' && (
            <>
              <div className="flex h-full min-h-0 min-w-0 flex-col">
                {isLineView ? (
                  <LineView
                    tei={state.doc}
                    focusId={focusId}
                    onSelect={(id) => go({ id }, false)}
                  />
                ) : isReadingSupportView ? (
                  <ReadingSupportView
                    tei={state.doc}
                    baseUrl={teiUrl}
                    focusId={focusId}
                    onSelect={(id) => go({ id }, false)}
                  />
                ) : isVideoSupportView ? (
                  <VideoSupportView
                    tei={state.doc}
                    baseUrl={teiUrl}
                    focusId={focusId}
                    onSelect={(id) => go({ id }, false)}
                  />
                ) : (
                  state.html !== null && (
                    <iframe
                      ref={iframeRef}
                      data-testid="xsl-frame"
                      title={t('frameTitle')}
                      sandbox="allow-scripts allow-popups"
                      srcDoc={frameSrcDoc}
                      onLoad={() => {
                        if (focusId) {
                          iframeRef.current?.contentWindow?.postMessage({ type: 'awase:focus', id: focusId }, '*');
                        }
                      }}
                      className="min-h-0 w-full flex-1 border-0 bg-[var(--ds-bg)]"
                    />
                  )
                )}
              </div>

              {showImage && facs && (
                <div className="h-full min-h-0 min-w-0 border-t border-[var(--ds-border)] bg-[var(--ds-bg)] p-2.5 lg:border-l lg:border-t-0">
                  <ImagePane
                    pages={facs.pages}
                    labels={facs.labels}
                    index={pageIdx}
                    place={focusId ? facs.places.get(focusId) : null}
                    onGo={setPageIdx}
                  />
                </div>
              )}

              {hasRightAside && (
                <aside
                  data-testid="xsl-side-panes"
                  className="flex h-full min-h-0 min-w-0 flex-col gap-2.5 border-t border-[var(--ds-border)] bg-[var(--ds-bg)] p-2.5 lg:border-l lg:border-t-0"
                >
                  {showMap && (
                    <div className="min-h-0 flex-1">
                      <MapPane
                        tei={state.doc}
                        baseUrl={teiUrl}
                        focusId={focusId}
                        onSelect={(id) => go({ id }, false)}
                      />
                    </div>
                  )}
                  {showSpeech && (
                    <div className="min-h-0 flex-1">
                      <SpeechPane
                        tei={state.doc}
                        focusId={focusId}
                        onSelect={(id) => go({ id }, false)}
                      />
                    </div>
                  )}
                  {showEntities && (
                    <div className="min-h-0 flex-1">
                      <EntitiesPane
                        tei={state.doc}
                        focusId={focusId}
                        onSelect={(id) => go({ id }, false)}
                      />
                    </div>
                  )}
                </aside>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}

function Entry() {
  const t = useTranslations('Xsl');
  const router = useRouter();
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
          if (url.trim()) router.push({ pathname: '/xsl', query: { u: url.trim() } });
        }}
      >
        <label className="sr-only" htmlFor="xsl-tei-url">
          {t('urlLabel')}
        </label>
        <input
          id="xsl-tei-url"
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
              <Link
                href={{ pathname: '/xsl', query: s.xsl ? { u: s.u, xsl: s.xsl } : { u: s.u } }}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] px-4 py-3 text-sm font-medium text-[var(--ds-primary)] hover:border-[var(--ds-primary)] transition-colors"
              >
                <span>{t(s.key)}</span>
                <span aria-hidden="true" className="text-[var(--ds-fg-muted)]">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </PageContainer>
  );
}

function Xsl() {
  const search = useSearchParams();
  const teiUrl = getTeiUrl(search);
  const embed = search.get('embed') === '1';
  if (!teiUrl) return embed ? <Entry /> : <CommonLayout><Entry /></CommonLayout>;
  const choice = parseXslChoice(search.get('xsl'));
  // 画面の高さに収め、変換した表示は枠の中でスクロールさせる
  return embed ? (
    <div className="flex h-[100dvh] flex-col">
      <Workspace key={teiUrl} teiUrl={teiUrl} choice={choice} embed />
    </div>
  ) : (
    <CommonLayout fullScreen>
      <Workspace key={teiUrl} teiUrl={teiUrl} choice={choice} embed={false} />
    </CommonLayout>
  );
}

export default function XslContent() {
  // useSearchParams は静的書き出しでは Suspense の中で使う
  return (
    <Suspense fallback={null}>
      <Xsl />
    </Suspense>
  );
}
