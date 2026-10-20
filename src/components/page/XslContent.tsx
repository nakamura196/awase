'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Link, usePathname, useRouter } from '@/i18n/routing';
import CommonLayout from '@/components/layout/Common';
import PageContainer from '@/components/layout/PageContainer';
import { withBasePath } from '@/lib/basePath';
import { XSL_CATALOG, xslTitle } from '@/lib/xsl/catalog';
import { absolutizeGraphics, transformTei } from '@/lib/xsl/engine';
import { getTeiUrl, injectBase, parseXslChoice, sefLocation, type XslChoice } from '@/lib/xsl/params';

// URL で受け取るパラメータ。TEI は u（url・tei も受ける）、変換は xsl、embed=1 で帯と枠を隠す
export const XSL_PARAMS = ['u', 'url', 'tei', 'xsl', 'embed'] as const;

const SAMPLES = [
  { key: 'sampleKoui', u: 'https://w3id.org/kouigenjimonogatari/tei/01.xml', xsl: 'reading' },
  { key: 'sampleGuide', u: 'https://tei-tools.toyobunko-lab.jp/xml/tei-guide/tei.xml', xsl: 'analysis' },
  { key: 'sampleOcr', u: 'https://tei-tools.toyobunko-lab.jp/xml/ocr-sample/tei.xml', xsl: null },
] as const;

type Failure = 'fetch' | 'parse' | 'transform';
type State =
  | { status: 'loading' }
  | { status: 'ready'; html: string }
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

function Frame({ teiUrl, choice }: { teiUrl: string; choice: XslChoice }) {
  const t = useTranslations('Xsl');
  const [state, setState] = useState<State>({ status: 'loading' });
  const choiceKey = JSON.stringify(choice);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const absUrl = new URL(teiUrl, window.location.href).href;
        if (cache?.url !== absUrl) {
          const { text, doc } = await fetchTei(absUrl, ctrl.signal);
          absolutizeGraphics(doc, absUrl);
          cache = { url: absUrl, text, doc };
        }
        const { text, doc } = cache;
        let sef = sefLocation(choice, text, withBasePath);
        sef = new URL(sef, window.location.href).href;
        let html: string;
        try {
          html = await transformTei(sef, doc);
        } catch {
          throw { kind: 'transform' };
        }
        const base = new URL(withBasePath('/xsl-assets/'), window.location.href).href;
        if (!ctrl.signal.aborted) setState({ status: 'ready', html: injectBase(html, base) });
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

  if (state.status === 'error') {
    const text =
      state.kind === 'fetch'
        ? state.httpStatus
          ? t('errorStatus', { status: state.httpStatus })
          : t('errorFetch')
        : state.kind === 'parse'
          ? t('errorParse')
          : t('errorTransform');
    return (
      <p role="alert" className="m-4 text-[var(--ds-fg)]">
        {text}
      </p>
    );
  }
  return (
    <div className="relative min-h-0 flex-1">
      {state.status === 'loading' && (
        <p className="absolute left-4 top-4 text-sm text-[var(--ds-fg-muted)]">{t('loading')}</p>
      )}
      {state.status === 'ready' && (
        <iframe
          data-testid="xsl-frame"
          title={t('frameTitle')}
          sandbox="allow-scripts allow-popups"
          srcDoc={state.html}
          className="h-full w-full border-0 bg-white"
        />
      )}
    </div>
  );
}

function Toolbar({ teiUrl, choice }: { teiUrl: string; choice: XslChoice }) {
  const t = useTranslations('Xsl');
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [draft, setDraft] = useState(teiUrl);

  // 共有できるように、いまの URL の引数を書き換える
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

  const selected = choice.kind === 'catalog' ? choice.id : choice.kind === 'sef' ? '__custom' : '';
  return (
    <form
      className="flex flex-wrap items-center gap-2 border-b border-[var(--ds-border)] bg-[var(--ds-surface)] px-3 py-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim()) go({ u: draft.trim(), url: null, tei: null }, true);
      }}
    >
      <label className="flex items-center gap-1">
        <span>{t('xslLabel')}</span>
        <select
          value={selected}
          onChange={(e) => go({ xsl: e.target.value || null }, false)}
          className="rounded border border-[var(--ds-border)] bg-[var(--ds-bg)] px-2 py-1 text-[var(--ds-fg)]"
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
      <label className="flex min-w-[12rem] flex-1 items-center gap-1">
        <span className="sr-only">{t('urlLabel')}</span>
        <input
          type="url"
          required
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-w-0 flex-1 rounded border border-[var(--ds-border)] bg-[var(--ds-bg)] px-2 py-1 text-[var(--ds-fg)]"
        />
      </label>
      <button type="submit" className="rounded bg-[var(--ds-primary)] px-3 py-1 text-white">
        {t('open')}
      </button>
      <Link
        href={`/viewer?u=${encodeURIComponent(teiUrl)}`}
        className="underline text-[var(--ds-primary)]"
      >
        {t('openInViewer')}
      </Link>
    </form>
  );
}

function Entry() {
  const t = useTranslations('Xsl');
  const router = useRouter();
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
              <Link
                href={{ pathname: '/xsl', query: s.xsl ? { u: s.u, xsl: s.xsl } : { u: s.u } }}
                className="underline text-[var(--ds-primary)]"
              >
                {t(s.key)}
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
      <Frame key={`${teiUrl}|${search.get('xsl')}`} teiUrl={teiUrl} choice={choice} />
    </div>
  ) : (
    <CommonLayout fullScreen>
      <Toolbar key={teiUrl} teiUrl={teiUrl} choice={choice} />
      <Frame key={`${teiUrl}|${search.get('xsl')}`} teiUrl={teiUrl} choice={choice} />
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
