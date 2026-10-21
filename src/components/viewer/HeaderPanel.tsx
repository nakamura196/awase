'use client';

import { useTranslations } from 'next-intl';
import { safeUrl } from '@/lib/tei/attrs';
import type { TeiHeaderSummary } from '@/lib/tei/header';

// 本文の上に出す書誌の欄。題名と著者は常に見せ、残りは開いたときだけ見せる
export default function HeaderPanel({
  header,
  sourceUrl,
  headingLevel = 1,
}: {
  header: TeiHeaderSummary;
  sourceUrl: string;
  /** 本文を並べるときは、ページの見出しの下に置くので h2 にする */
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 1 ? 'h1' : 'h2';
  const t = useTranslations('Viewer');
  const license = header.licenseUrl ? safeUrl(header.licenseUrl) : null;
  const rows: [string, React.ReactNode][] = [];
  if (header.altTitles.length) rows.push([t('altTitle'), header.altTitles.join(' / ')]);
  if (header.resp.length) rows.push([t('resp'), header.resp.map((r, i) => <div key={i}>{r}</div>)]);
  if (header.publisher) rows.push([t('publisher'), header.publisher]);
  if (header.date) rows.push([t('date'), header.date]);
  if (header.availability)
    rows.push([
      t('availability'),
      license ? (
        <a href={license} target="_blank" rel="noopener noreferrer" className="underline text-[var(--ds-primary)]">
          {header.availability}
        </a>
      ) : (
        header.availability
      ),
    ]);
  if (header.source) rows.push([t('source'), header.source]);
  rows.push([
    t('teiUrl'),
    <a key="u" href={sourceUrl} target="_blank" rel="noopener noreferrer" className="underline break-all text-[var(--ds-primary)]">
      {sourceUrl}
    </a>,
  ]);

  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <Heading className="text-base sm:text-lg font-bold text-[var(--ds-fg)]" style={{ fontFamily: 'var(--ds-font-serif)' }}>
        {header.title || t('untitled')}
      </Heading>
      {header.authors.length > 0 && <p className="text-xs sm:text-sm text-[var(--ds-fg-muted)]">{header.authors.join(', ')}</p>}
      {/* 開いた中身は本文の上に重ねる。ビューアは画面の高さに収めているので、押し下げるとペインが縮む */}
      <details className="relative text-xs sm:text-sm">
        <summary className="cursor-pointer rounded border border-[var(--ds-border)] bg-[var(--ds-surface)] px-2 py-0.5 text-xs text-[var(--ds-fg-muted)] hover:border-[var(--ds-primary)] hover:text-[var(--ds-fg)] transition-colors">
          {t('headerDetails')}
        </summary>
        <dl className="absolute left-0 top-full z-30 mt-1.5 grid max-h-[60dvh] w-[min(40rem,calc(100vw-2rem))] grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 overflow-auto rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] p-4 shadow-xl">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-medium text-[var(--ds-fg-muted)]">{k}</dt>
              <dd className="text-[var(--ds-fg)] min-w-0">{v}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
