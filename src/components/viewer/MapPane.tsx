'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';
import {
  computeGeoJsonCenter,
  extractCorrespHeaders,
  extractTeiPlaces,
  toGeoFeatures,
  type CorrespActionInfo,
  type TeiPlacePoint,
} from '@/lib/tei/corresp';

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false });

interface Props {
  tei: Document;
  baseUrl?: string;
  focusId?: string | null;
  onSelect?: (id: string) => void;
}

function formatActionSummary(action: CorrespActionInfo): string {
  const parts = [action.persName, action.placeName, action.dateText || action.dateWhen].filter(Boolean);
  return parts.join(' · ');
}

export default function MapPane({ tei, baseUrl, focusId = null, onSelect }: Props) {
  const t = useTranslations('Viewer');
  const rawPlaces = useMemo(() => extractTeiPlaces(tei, baseUrl), [tei, baseUrl]);
  const [resolvedGeoCoords, setResolvedGeoCoords] = useState<Record<string, [number, number]>>({});

  useEffect(() => {
    const toFetch = rawPlaces.filter((p) => !p.coords && p.geoJsonUrl);
    if (toFetch.length === 0) return;
    const ac = new AbortController();
    Promise.all(
      toFetch.map(async (p) => {
        try {
          const res = await fetch(p.geoJsonUrl!, { signal: ac.signal });
          if (!res.ok) return null;
          const json = (await res.json()) as unknown;
          const center = computeGeoJsonCenter(json);
          return center ? ([p.id, center] as const) : null;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (ac.signal.aborted) return;
      const next: Record<string, [number, number]> = {};
      for (const e of entries) {
        if (e) next[e[0]] = e[1];
      }
      if (Object.keys(next).length > 0) {
        setResolvedGeoCoords((prev) => ({ ...prev, ...next }));
      }
    });
    return () => ac.abort();
  }, [rawPlaces]);

  const places = useMemo(
    () =>
      rawPlaces.map((p) =>
        !p.coords && resolvedGeoCoords[p.id] ? { ...p, coords: resolvedGeoCoords[p.id] } : p,
      ),
    [rawPlaces, resolvedGeoCoords],
  );
  const correspHeaders = useMemo(() => extractCorrespHeaders(tei), [tei]);
  const features = useMemo(() => toGeoFeatures(places), [places]);
  const [manualPlaceId, setManualPlaceId] = useState<string | null>(null);

  const focusedPlace = useMemo(
    () => (focusId ? places.find((p) => p.mentionIds.includes(focusId)) : undefined),
    [focusId, places],
  );

  const selectedPlaceId = focusedPlace?.id ?? manualPlaceId;

  const handleFeatureClick = (fid: string) => {
    setManualPlaceId(fid);
    const place = places.find((p) => p.id === fid);
    if (place && place.mentionIds.length > 0) {
      onSelect?.(place.mentionIds[0]);
    }
  };

  const handlePlaceRowClick = (place: TeiPlacePoint) => {
    setManualPlaceId(place.id);
    if (!onSelect || place.mentionIds.length === 0) return;
    const idx = focusId ? place.mentionIds.indexOf(focusId) : -1;
    const nextId = idx >= 0 ? place.mentionIds[(idx + 1) % place.mentionIds.length] : place.mentionIds[0];
    onSelect(nextId);
  };

  return (
    <section
      className="awase-map flex h-full flex-col rounded border border-[var(--ds-border)] bg-[var(--ds-surface)]"
      aria-label={t('mapPlacesCount', { count: places.length })}
      data-testid="map-pane"
    >
      <div className="border-b border-[var(--ds-border)] px-3 py-2 text-sm">
        <p className="font-bold text-[var(--ds-fg)]">{t('mapPlacesCount', { count: places.length })}</p>
      </div>

      {correspHeaders.length > 0 && (
        <div
          className="border-b border-[var(--ds-border)] bg-[var(--ds-bg)] px-3 py-2 text-xs"
          data-testid="corresp-summary"
        >
          <p className="mb-1 font-semibold text-[var(--ds-fg)]">{t('correspTitle')}</p>
          <div className="flex flex-col gap-1.5">
            {correspHeaders.map((header) => {
              const sent = header.actions.find((a) => a.type === 'sent');
              const received = header.actions.find((a) => a.type === 'received');
              return (
                <div key={header.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--ds-fg)]">
                  {sent && (
                    <span className="inline-flex items-center gap-1">
                      <span className="rounded bg-[var(--ds-primary)] px-1.5 py-0.5 text-[10px] font-medium text-white">
                        {t('correspSent')}
                      </span>
                      <span>{formatActionSummary(sent)}</span>
                    </span>
                  )}
                  {sent && received && <span className="text-[var(--ds-fg-muted)]">→</span>}
                  {received && (
                    <span className="inline-flex items-center gap-1">
                      <span className="rounded border border-[var(--ds-border)] bg-[var(--ds-surface)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--ds-fg)]">
                        {t('correspReceived')}
                      </span>
                      <span>{formatActionSummary(received)}</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {features.length > 0 && (
        <div className="h-32 shrink-0 border-b border-[var(--ds-border)]">
          <MapView
            features={features}
            selectedId={selectedPlaceId}
            onFeatureClick={handleFeatureClick}
            clustering={false}
          />
        </div>
      )}

      <div className="min-h-[4rem] flex-1 overflow-auto p-2" data-testid="map-place-list">
        <ul className="flex flex-col gap-0.5">
          {places.map((place) => {
            const selected = place.id === selectedPlaceId;
            const roleBadge =
              place.role === 'sent'
                ? t('correspSent')
                : place.role === 'received'
                  ? t('correspReceived')
                  : null;
            return (
              <li
                key={place.id}
                data-awase-place={place.id}
                className={`rounded ${
                  selected
                    ? 'bg-[color-mix(in_srgb,var(--ds-primary)_20%,transparent)] outline outline-1 outline-[var(--ds-primary)]'
                    : 'hover:bg-[var(--ds-bg)]'
                }`}
              >
                <div className="flex items-center gap-1 px-2 py-1">
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => handlePlaceRowClick(place)}
                    className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate font-medium text-[var(--ds-fg)]">{place.label}</span>
                      {roleBadge && (
                        <span className="shrink-0 rounded bg-[var(--ds-bg)] px-1.5 py-0.5 text-[10px] text-[var(--ds-fg-muted)]">
                          {roleBadge}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 whitespace-nowrap tabular-nums text-[var(--ds-fg-muted)]">
                      {t('entityMentions', { count: place.count })}
                    </span>
                  </button>
                  {place.externalUrl && (
                    <a
                      href={place.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={t('entityExternalLink')}
                      aria-label={t('entityExternalLink')}
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 rounded px-1 text-xs text-[var(--ds-fg-muted)] hover:bg-[var(--ds-bg)] hover:text-[var(--ds-fg)]"
                    >
                      ↗
                    </a>
                  )}
                </div>
                {place.description && (
                  <p className={`px-2 pb-1.5 text-xs leading-relaxed text-[var(--ds-fg-muted)] ${selected ? 'text-[var(--ds-fg)]' : 'line-clamp-2'}`}>
                    {place.description}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
