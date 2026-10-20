'use client';

import { useTranslations } from 'next-intl';
import { safeUrl } from '@/lib/tei/attrs';
import type { TeiHeaderSummary } from '@/lib/tei/header';

// 本文の上に出す書誌の欄。題名と著者は常に見せ、残りは開いたときだけ見せる
export default function HeaderPanel({ header, sourceUrl }: { header: TeiHeaderSummary; sourceUrl: string }) {
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
    <div className="space-y-1">
      <h1 className="text-xl font-bold text-[var(--ds-fg)]" style={{ fontFamily: 'var(--ds-font-serif)' }}>
        {header.title || t('untitled')}
      </h1>
      {header.authors.length > 0 && <p className="text-sm text-[var(--ds-fg-muted)]">{header.authors.join(', ')}</p>}
      <details className="text-sm">
        <summary className="cursor-pointer text-[var(--ds-fg-muted)]">{t('headerDetails')}</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-[var(--ds-fg-muted)]">{k}</dt>
              <dd className="text-[var(--ds-fg)] min-w-0">{v}</dd>
            </div>
          ))}
        </dl>
      </details>
    </div>
  );
}
