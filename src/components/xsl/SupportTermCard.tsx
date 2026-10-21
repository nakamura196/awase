'use client';
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { SupportCategory, SupportTerm } from '@/lib/tei/videoSupport';

export interface WikiSummary {
  thumbnail?: string;
  description?: string;
  extract?: string;
  url?: string;
}

const wikiCache = new Map<string, Promise<WikiSummary | null>>();

export function fetchWikiSummary(wikiKey: string): Promise<WikiSummary | null> {
  const key = wikiKey.trim();
  if (!key) return Promise.resolve(null);
  const cached = wikiCache.get(key);
  if (cached) return cached;

  const p = (async (): Promise<WikiSummary | null> => {
    try {
      const res = await fetch(`https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(key)}`);
      if (!res.ok) return null;
      const data = (await res.json()) as {
        thumbnail?: { source?: string };
        description?: string;
        extract?: string;
        content_urls?: { desktop?: { page?: string } };
      };
      return {
        thumbnail: data.thumbnail?.source,
        description: data.description,
        extract: data.extract,
        url: data.content_urls?.desktop?.page,
      };
    } catch {
      return null;
    }
  })();

  wikiCache.set(key, p);
  return p;
}

export const CATEGORY_STROKE_COLORS: Record<SupportCategory, string> = {
  person: '#1976D2',
  place: '#388E3C',
  org: '#D32F2F',
  keyword: '#7B1FA2',
  date: '#F57C00',
};

export const CATEGORY_CHIP_STYLES: Record<SupportCategory, { bg: string; text: string; border: string }> = {
  person: {
    bg: 'rgba(25, 118, 210, 0.14)',
    text: '#1565C0',
    border: '#1976D2',
  },
  place: {
    bg: 'rgba(56, 142, 60, 0.14)',
    text: '#2E7D32',
    border: '#388E3C',
  },
  org: {
    bg: 'rgba(211, 47, 47, 0.12)',
    text: '#C62828',
    border: '#D32F2F',
  },
  keyword: {
    bg: 'rgba(123, 31, 162, 0.12)',
    text: '#6A1B9A',
    border: '#7B1FA2',
  },
  date: {
    bg: 'rgba(245, 124, 0, 0.14)',
    text: '#E65100',
    border: '#F57C00',
  },
};

export default function SupportTermCard({
  term,
  selected = false,
  showCount = false,
  onClick,
}: {
  term: SupportTerm;
  selected?: boolean;
  showCount?: boolean;
  onClick?: () => void;
}) {
  const t = useTranslations('Xsl');
  const [wiki, setWiki] = useState<WikiSummary | null>(null);

  useEffect(() => {
    let alive = true;
    fetchWikiSummary(term.wikiKey).then((res) => {
      if (alive) setWiki(res);
    });
    return () => {
      alive = false;
    };
  }, [term.wikiKey]);

  const stroke = CATEGORY_STROKE_COLORS[term.category];
  const thumb = wiki?.thumbnail ?? term.image;
  const desc = wiki?.description ?? term.description;
  const extract = wiki?.extract;
  const wikiUrl = wiki?.url ?? (term.href && /^https?:\/\//i.test(term.href) ? term.href : undefined);

  const categoryLabel =
    term.category === 'person'
      ? t('supportCatPerson')
      : term.category === 'place'
        ? t('supportCatPlace')
        : term.category === 'org'
          ? t('supportCatOrg')
          : term.category === 'date'
            ? t('supportCatDate')
            : t('supportCatKeyword');

  return (
    <div
      data-testid="support-term-card"
      data-key={term.key}
      data-type={term.category}
      onClick={onClick}
      style={{ borderLeftWidth: '4px', borderLeftColor: stroke }}
      className={`support-card group relative cursor-pointer overflow-hidden rounded-lg border border-[var(--ds-border)] bg-[var(--ds-surface)] p-3 shadow-xs transition-all hover:border-[var(--ds-primary)] ${
        selected ? 'ring-2 ring-[var(--ds-primary)]' : ''
      }`}
    >
      <div className="flex items-start gap-2.5">
        {thumb && (
          <img
            src={thumb}
            alt={term.label}
            loading="lazy"
            className="h-14 w-14 shrink-0 rounded object-cover border border-[var(--ds-border)]"
          />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-1.5">
            <h4 className="truncate text-sm font-semibold text-[var(--ds-fg)] group-hover:text-[var(--ds-primary)]">
              {term.label}
            </h4>
            {term.wikiKey !== term.label && (
              <span className="shrink-0 rounded bg-[var(--ds-bg)] px-1.5 py-0.5 text-[10px] text-[var(--ds-fg-muted)]">
                {term.wikiKey}
              </span>
            )}
          </div>
          {desc && (
            <p className="line-clamp-2 text-xs font-medium text-[var(--ds-fg-muted)]">
              {desc}
            </p>
          )}
        </div>
      </div>

      {extract && (
        <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-[var(--ds-fg-muted)]">
          {extract}
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-[var(--ds-fg-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: stroke }}
          />
          <span>{categoryLabel}</span>
          {showCount && (
            <span className="font-mono font-medium text-[var(--ds-fg)]">
              · {t('supportCount', { count: term.count })}
            </span>
          )}
        </span>
        {wikiUrl && (
          <a
            href={wikiUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="rounded bg-[var(--ds-primary)]/10 px-2 py-0.5 font-medium text-[var(--ds-primary)] hover:underline"
          >
            Wikipedia
          </a>
        )}
      </div>
    </div>
  );
}
