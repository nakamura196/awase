'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/routing';
import CommonLayout from '@/components/layout/Common';
import PageContainer from '@/components/layout/PageContainer';
import { fetchJson } from '@/lib/dts/fetch';
import { parseEntry, type DtsEntry } from '@/lib/dts/entry';
import { parseCollection, type DtsCollection, type DtsNode } from '@/lib/dts/collection';
import { buildTree, parseNavigation, shortLabel, type CitableUnit, type UnitNode } from '@/lib/dts/navigation';
import { collectionUrl, documentUrl, navigationUrl, nodeTarget, DEFAULT_BASE } from '@/lib/dts/urls';
import { nextPage } from '@/lib/dts/json';
import { resolveUrl } from '@/lib/dts/url';
import DtsMetadata from '@/components/dts/DtsMetadata';

// URL で受け取るパラメータ（docs/notes/dts.md）。base は入口、url は開くコレクションか資料
export const DTS_PARAMS = ['base', 'url'] as const;

export const DTS_EXAMPLES = [
  {
    key: 'exampleKoui',
    descKey: 'exampleKouiDesc',
    url: DEFAULT_BASE,
  },
  {
    key: 'exampleDracor',
    descKey: 'exampleDracorDesc',
    url: 'https://dracor.org/api/v1/dts',
  },
  {
    key: 'exampleAlpheios',
    descKey: 'exampleAlpheiosDesc',
    url: 'https://texts.alpheios.net/api/dts',
  },
  {
    key: 'examplePerseids',
    descKey: 'examplePerseidsDesc',
    url: 'https://dts.perseids.org/',
  },
  {
    key: 'exampleEdh',
    descKey: 'exampleEdhDesc',
    url: 'https://edh.ub.uni-heidelberg.de/api/dts/',
  },
] as const;

type Failure = 'entry' | 'collection' | 'notDts';
type State =
  | { status: 'loading' }
  | { status: 'error'; kind: Failure; code?: number }
  | { status: 'ready'; entry: DtsEntry; entryUrl: string; collection: DtsCollection; collectionUrl: string };

/** この画面の中の移動（base は既定のときは書かない） */
function dtsHref(base: string, url: string | null) {
  const query: Record<string, string> = {};
  if (base !== DEFAULT_BASE) query.base = base;
  if (url) query.url = url;
  return { pathname: '/dts' as const, query };
}

function ErrorMessage({ kind, code }: { kind: Failure; code?: number }) {
  const t = useTranslations('Dts');
  const text =
    kind === 'notDts' ? t('errorNotDts') : code ? t('errorStatus', { status: code }) : t('errorFetch');
  const lead = kind === 'collection' ? t('errorCollection') : t('errorEntry');
  return (
    <p role="alert" className="rounded border border-[var(--ds-border)] px-3 py-2 text-sm">
      {lead} {text}
    </p>
  );
}

function BaseForm({ base }: { base: string }) {
  const t = useTranslations('Dts');
  const router = useRouter();
  // 呼び出し側で key={base} を付けて、base が変わったら作り直す
  const [value, setValue] = useState(base);
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim();
        if (v) router.push(dtsHref(v, null));
      }}
    >
      <input
        type="url"
        aria-label={t('baseLabel')}
        placeholder={DEFAULT_BASE}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="min-w-0 flex-1 rounded border border-[var(--ds-border)] bg-transparent px-2 py-1 font-mono text-sm"
      />
      <button type="submit" className="rounded border border-[var(--ds-border)] px-3 py-1 text-sm hover:bg-[var(--ds-surface)]">
        {t('open')}
      </button>
    </form>
  );
}

function Breadcrumbs({ base, collection, entryUrl }: { base: string; collection: DtsCollection; entryUrl: string }) {
  const t = useTranslations('Dts');
  return (
    <nav aria-label={t('breadcrumbs')} className="flex flex-wrap items-center gap-1 text-sm text-[var(--ds-fg-muted)]">
      <Link href={dtsHref(base, null)} className="text-[var(--ds-primary)] hover:underline">
        {t('root')}
      </Link>
      {collection.parents.map((p) => (
        <span key={p.id} className="flex items-center gap-1">
          <span aria-hidden>/</span>
          <Link href={dtsHref(base, nodeTarget(p, entryUrl))} className="text-[var(--ds-primary)] hover:underline">
            {p.title}
          </Link>
        </span>
      ))}
      {collection.id !== 'default' && (
        <>
          <span aria-hidden>/</span>
          <span className="text-[var(--ds-fg)]">{collection.title}</span>
        </>
      )}
    </nav>
  );
}

function MemberList({
  base,
  members,
  entryUrl,
}: {
  base: string;
  members: DtsNode[];
  entryUrl: string;
}) {
  const t = useTranslations('Dts');
  return (
    <ul className="divide-y divide-[var(--ds-border)] rounded border border-[var(--ds-border)]">
      {members.map((m) => (
        <li key={m.id}>
          <Link
            href={dtsHref(base, nodeTarget(m, entryUrl))}
            className="block px-3 py-2 hover:bg-[var(--ds-surface)]"
          >
            <span className="mr-2 rounded border border-[var(--ds-border)] px-1 text-xs text-[var(--ds-fg-muted)]">
              {m.type === 'Resource' ? t('typeResource') : t('typeCollection')}
            </span>
            <span className="font-medium text-[var(--ds-primary)]">{m.title}</span>
            {m.totalChildren > 0 && (
              <span className="ml-2 text-xs text-[var(--ds-fg-muted)]">{t('children', { count: m.totalChildren })}</span>
            )}
            {m.description && m.description !== m.title && (
              <span className="block text-sm text-[var(--ds-fg-muted)]">{m.description}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** 開く先の URL（viewer / xsl に渡す u） */
function OpenLinks({ u }: { u: string }) {
  const t = useTranslations('Dts');
  const cls = 'rounded border border-[var(--ds-border)] px-2 py-0.5 text-xs text-[var(--ds-primary)] hover:bg-[var(--ds-surface)]';
  return (
    <span className="inline-flex gap-1">
      <Link href={{ pathname: '/viewer', query: { u } }} className={cls}>
        {t('openViewer')}
      </Link>
      <Link href={{ pathname: '/xsl', query: { u } }} className={cls}>
        {t('openXsl')}
      </Link>
    </span>
  );
}

// Navigation を、ページ送りがあれば最大 10 ページまで続けて取る
async function loadUnits(url: string, entryUrl: string): Promise<CitableUnit[] | { error: number | undefined }> {
  const units: CitableUnit[] = [];
  let next: string | undefined = url;
  for (let i = 0; next && i < 10; i++) {
    const res = await fetchJson(next);
    if (!res.ok) return { error: res.status };
    units.push(...parseNavigation(res.json));
    const np = nextPage(res.json);
    next = np ? resolveUrl(np, entryUrl) : undefined;
  }
  return units;
}

function UnitItem({
  unit,
  resource,
  entry,
  entryUrl,
  navTemplate,
  docTemplate,
}: {
  unit: UnitNode;
  resource: string;
  entry: DtsEntry;
  entryUrl: string;
  navTemplate: string;
  docTemplate: string;
}) {
  const t = useTranslations('Dts');
  const [open, setOpen] = useState(false);
  const [children, setChildren] = useState<UnitNode[] | null>(unit.children.length ? unit.children : null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function toggle() {
    if (open) return setOpen(false);
    setOpen(true);
    if (children !== null) return;
    setBusy(true);
    const got = await loadUnits(navigationUrl(navTemplate, entryUrl, resource, unit.identifier), entryUrl);
    setBusy(false);
    if (!Array.isArray(got)) return setFailed(true);
    // 応答には自分自身も入っている。直接の子だけを取る
    setChildren(got.filter((u) => u.parent === unit.identifier).map((u) => ({ ...u, children: [] })));
  }

  return (
    <li className="py-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={t('toggleUnits', { name: shortLabel(unit) })}
          className="w-5 text-[var(--ds-fg-muted)]"
        >
          {open ? '▾' : '▸'}
        </button>
        <span className="font-mono text-sm break-all">{shortLabel(unit)}</span>
        <OpenLinks u={documentUrl(docTemplate, entryUrl, resource, unit.identifier)} />
      </div>
      {open && (
        <div className="ml-5">
          {busy && <p className="text-xs text-[var(--ds-fg-muted)]">{t('loading')}</p>}
          {failed && <p className="text-xs">{t('errorFetch')}</p>}
          {children && children.length === 0 && <p className="text-xs text-[var(--ds-fg-muted)]">{t('noChildren')}</p>}
          {children && children.length > 0 && (
            <ul>
              {children.map((c) => (
                <UnitItem
                  key={c.identifier}
                  unit={c}
                  resource={resource}
                  entry={entry}
                  entryUrl={entryUrl}
                  navTemplate={navTemplate}
                  docTemplate={docTemplate}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

function ResourceView({ resource, entry, entryUrl }: { resource: DtsCollection; entry: DtsEntry; entryUrl: string }) {
  const t = useTranslations('Dts');
  const navTemplate = resource.navigation ?? entry.navigation;
  const docTemplate = resource.document ?? entry.document;
  const [units, setUnits] = useState<UnitNode[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!navTemplate) return;
    let alive = true;
    loadUnits(navigationUrl(navTemplate, entryUrl, resource.id), entryUrl).then((got) => {
      if (!alive) return;
      if (Array.isArray(got)) setUnits(buildTree(got));
      else setError(true);
    });
    return () => {
      alive = false;
    };
  }, [navTemplate, entryUrl, resource.id]);

  return (
    <div className="space-y-4">
      {docTemplate && (
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span>{t('wholeText')}</span>
          <OpenLinks u={documentUrl(docTemplate, entryUrl, resource.id)} />
        </p>
      )}
      {resource.citationTrees.length > 0 && (
        <p className="text-sm text-[var(--ds-fg-muted)]">
          {t('citationTrees')}: {resource.citationTrees.join(' / ')}
        </p>
      )}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">{t('units')}</h2>
        {error && <p role="alert" className="text-sm">{t('errorNavigation')}</p>}
        {!error && units === null && <p className="text-sm text-[var(--ds-fg-muted)]">{t('loading')}</p>}
        {units && units.length === 0 && <p className="text-sm text-[var(--ds-fg-muted)]">{t('noUnits')}</p>}
        {units && units.length > 0 && (
          <ul className="divide-y divide-[var(--ds-border)] rounded border border-[var(--ds-border)] px-3">
            {units.map((u) => (
              <UnitItem
                key={u.identifier}
                unit={u}
                resource={resource.id}
                entry={entry}
                entryUrl={entryUrl}
                navTemplate={navTemplate}
                docTemplate={docTemplate}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// 開く先（base と url）が変わったら作り直す。読み込み中の状態に戻すための key
function DtsScreen() {
  const search = useSearchParams();
  const base = search.get('base')?.trim() || DEFAULT_BASE;
  const target = search.get('url')?.trim() || null;
  return <DtsBody key={`${base}\n${target ?? ''}`} base={base} target={target} />;
}

function DtsBody({ base, target }: { base: string; target: string | null }) {
  const t = useTranslations('Dts');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [more, setMore] = useState<{ members: DtsNode[]; next?: string } | null>(null);
  const [moreBusy, setMoreBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const e = await fetchJson(base);
      if (!alive) return;
      if (!e.ok) return setState({ status: 'error', kind: 'entry', code: e.status });
      const entry = parseEntry(e.json);
      if (!entry) return setState({ status: 'error', kind: 'notDts' });
      const url = collectionUrl(entry, e.url, target);
      const c = await fetchJson(url);
      if (!alive) return;
      if (!c.ok) return setState({ status: 'error', kind: 'collection', code: c.status });
      const collection = parseCollection(c.json);
      if (!collection) return setState({ status: 'error', kind: 'notDts' });
      setState({ status: 'ready', entry, entryUrl: e.url, collection, collectionUrl: c.url });
      const np = nextPage(c.json);
      if (np) setMore({ members: [], next: resolveUrl(np, c.url) });
    })();
    return () => {
      alive = false;
    };
  }, [base, target]);

  async function loadMore() {
    if (!more?.next) return;
    setMoreBusy(true);
    const res = await fetchJson(more.next);
    setMoreBusy(false);
    const page = res.ok ? parseCollection(res.json) : null;
    if (!res.ok || !page) return setMore({ ...more, next: undefined });
    const np = nextPage(res.json);
    setMore({ members: [...more.members, ...page.members], next: np ? resolveUrl(np, res.url) : undefined });
  }

  return (
    <CommonLayout>
      <PageContainer width="text" className="space-y-6">
        <header className="space-y-3">
          <h1 className="text-2xl font-bold text-[var(--ds-fg)]" style={{ fontFamily: 'var(--ds-font-serif)' }}>{t('title')}</h1>
          <p className="text-sm sm:text-base text-[var(--ds-fg-muted)]">{t('lead')}</p>
          <BaseForm key={base} base={base} />
        </header>

        {!target && (
          <section data-testid="dts-examples" className="space-y-2.5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--ds-fg-muted)]">
              {t('examples')}
            </h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {DTS_EXAMPLES.map((item) => {
                const isActive = base.replace(/\/+$/, '') === item.url.replace(/\/+$/, '');
                return (
                  <li key={item.key}>
                    <Link
                      href={dtsHref(item.url, null)}
                      data-testid="dts-example-link"
                      aria-current={isActive ? 'true' : undefined}
                      className={`block h-full rounded-lg border p-3 transition-colors ${
                        isActive
                          ? 'border-[var(--ds-primary)] bg-[var(--ds-primary)]/10'
                          : 'border-[var(--ds-border)] bg-[var(--ds-surface)] hover:border-[var(--ds-primary)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-[var(--ds-primary)]">
                          {t(item.key)}
                        </span>
                        <span aria-hidden="true" className="text-xs text-[var(--ds-fg-muted)]">
                          {isActive ? '✓' : '→'}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--ds-fg-muted)]">
                        {t(item.descKey)}
                      </p>
                      <p className="mt-1 truncate font-mono text-[11px] text-[var(--ds-fg-muted)]/80">
                        {item.url}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
        {state.status === 'loading' && <p className="text-sm text-[var(--ds-fg-muted)]">{t('loading')}</p>}
        {state.status === 'error' && <ErrorMessage kind={state.kind} code={state.code} />}
        {state.status === 'ready' && (
          <>
            <Breadcrumbs base={base} collection={state.collection} entryUrl={state.entryUrl} />
            <section className="space-y-2">
              <h2 className="text-xl font-semibold">{state.collection.title}</h2>
              {state.collection.description && state.collection.description !== state.collection.title && (
                <p className="text-sm text-[var(--ds-fg-muted)]">{state.collection.description}</p>
              )}
              <DtsMetadata fields={state.collection.dublinCore} />
            </section>
            {state.collection.type === 'Resource' ? (
              <ResourceView resource={state.collection} entry={state.entry} entryUrl={state.entryUrl} />
            ) : (
              <section className="space-y-2">
                <h2 className="text-lg font-semibold">
                  {t('members')}{' '}
                  <span className="text-sm font-normal text-[var(--ds-fg-muted)]">
                    {t('children', { count: state.collection.totalChildren || state.collection.members.length })}
                  </span>
                </h2>
                {state.collection.members.length === 0 && more === null ? (
                  <p className="text-sm text-[var(--ds-fg-muted)]">{t('noMembers')}</p>
                ) : (
                  <MemberList
                    base={base}
                    members={[...state.collection.members, ...(more?.members ?? [])]}
                    entryUrl={state.entryUrl}
                  />
                )}
                {more?.next && (
                  <button
                    type="button"
                    onClick={loadMore}
                    disabled={moreBusy}
                    className="rounded border border-[var(--ds-border)] px-3 py-1 text-sm hover:bg-[var(--ds-surface)]"
                  >
                    {moreBusy ? t('loading') : t('loadMore')}
                  </button>
                )}
              </section>
            )}
          </>
        )}
      </PageContainer>
    </CommonLayout>
  );
}

export default function DtsContent() {
  // useSearchParams は静的書き出しでは Suspense の中で使う
  return (
    <Suspense fallback={null}>
      <DtsScreen />
    </Suspense>
  );
}
