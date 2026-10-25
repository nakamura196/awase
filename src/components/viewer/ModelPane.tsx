'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { zoneForId, type Surface3D, type Zone3D } from '@/lib/tei/model3d';
import type { SketchfabApi, SketchfabConstructor } from '@/types/sketchfab';

interface Props {
  /** readModels で読んだ 3D モデル。1 つ以上 */
  surfaces: Surface3D[];
  /** 本文で選んでいる id（URL の id）。当たる範囲があれば、そこへカメラを寄せる */
  focusId?: string | null;
  /** 3D の側で範囲を選んだ。zone.selectId を渡す */
  onSelect?: (id: string) => void;
}

const SKETCHFAB_SCRIPT_URL = 'https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js';

// Sketchfab の Viewer API スクリプトをページごとに 1 度だけ読む。すでに window.Sketchfab があればそれを使う
let sketchfabPromise: Promise<SketchfabConstructor> | null = null;
function loadSketchfab(): Promise<SketchfabConstructor> {
  if (window.Sketchfab) return Promise.resolve(window.Sketchfab);
  if (!sketchfabPromise) {
    sketchfabPromise = new Promise<SketchfabConstructor>((resolve, reject) => {
      const fail = () => {
        sketchfabPromise = null;
        reject(new Error('Failed to load Sketchfab Viewer API'));
      };
      const script = document.createElement('script');
      script.src = SKETCHFAB_SCRIPT_URL;
      script.async = true;
      script.onload = () => {
        if (window.Sketchfab) resolve(window.Sketchfab);
        else fail();
      };
      script.onerror = fail;
      document.head.appendChild(script);
    });
  }
  return sketchfabPromise;
}

// URL の id から当たる範囲を引く（別ブランチの実装前でも動くよう、未実装なら手元で探す）
function findZone(surfaces: Surface3D[], id: string | null | undefined): { surface: number; zone: Zone3D } | null {
  if (!id) return null;
  try {
    return zoneForId(surfaces, id);
  } catch {
    for (let i = 0; i < surfaces.length; i++) {
      const zone = surfaces[i].zones.find((z) => z.id === id || z.ids.includes(id));
      if (zone) return { surface: i, zone };
    }
    return null;
  }
}

// Sketchfab の埋め込みビューア。uid が替わったら親の key で作り直す
function SketchfabViewer({
  uid,
  zones,
  focusedZone,
  onSelect,
}: {
  uid: string;
  zones: Zone3D[];
  focusedZone: Zone3D | null;
  onSelect?: (id: string) => void;
}) {
  const t = useTranslations('Model');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const apiRef = useRef<SketchfabApi | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  // ビューアのコールバックから最新の props を参照する
  const latestRef = useRef({ zones, focusedZone, onSelect });
  useEffect(() => {
    latestRef.current = { zones, focusedZone, onSelect };
  }, [zones, focusedZone, onSelect]);

  // こちらから gotoAnnotation した直後の annotationSelect を無視し、往復ループを防ぐ
  const lastAnnotationRef = useRef<number | null>(null);
  const inGotoRef = useRef<number | null>(null);

  const syncAnnotation = (api: SketchfabApi | null, annotation: number | undefined) => {
    if (annotation === undefined) {
      lastAnnotationRef.current = null;
      inGotoRef.current = null;
      return;
    }
    if (!api || lastAnnotationRef.current === annotation) return;
    lastAnnotationRef.current = annotation;
    inGotoRef.current = annotation;
    api.gotoAnnotation(annotation, { preventCameraAnimation: false }, () => {
      if (inGotoRef.current === annotation) inGotoRef.current = null;
    });
  };

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    let live = true;

    loadSketchfab()
      .then((Sketchfab) => {
        if (!live) return;
        const client = new Sketchfab(iframe);
        client.init(uid, {
          ui_infos: 0,
          ui_watermark: 0,
          ui_help: 0,
          ui_settings: 0,
          ui_vr: 0,
          ui_ar: 0,
          ui_inspector: 0,
          ui_stop: 0,
          ui_annotations: 1,
          annotations_visible: 1,
          success(api) {
            if (!live) return;
            api.start();
            api.addEventListener('viewerready', () => {
              if (!live) return;
              apiRef.current = api;
              api.addEventListener('annotationSelect', (index: number) => {
                if (!live) return;
                if (index < 0) {
                  lastAnnotationRef.current = null;
                  return;
                }
                if (inGotoRef.current === index) {
                  inGotoRef.current = null;
                  return;
                }
                inGotoRef.current = null;
                lastAnnotationRef.current = index;
                const { zones: curZones, focusedZone: curFocused, onSelect: curOnSelect } = latestRef.current;
                const zone = curZones.find((z) => z.annotation === index);
                if (!zone) return;
                if (curFocused?.id === zone.id || curFocused?.annotation === index) return;
                curOnSelect?.(zone.selectId);
              });
              setStatus('ready');
              syncAnnotation(api, latestRef.current.focusedZone?.annotation);
            });
          },
          error() {
            if (live) setStatus('error');
          },
        });
      })
      .catch(() => {
        if (live) setStatus('error');
      });

    return () => {
      live = false;
      apiRef.current = null;
    };
  }, [uid]);

  // 本文の側で選んだ範囲が替わったら、その注記へカメラを寄せる
  const targetAnnotation = focusedZone?.annotation;
  useEffect(() => {
    if (status !== 'ready') return;
    syncAnnotation(apiRef.current, targetAnnotation);
  }, [status, targetAnnotation]);

  return (
    <div className="relative h-full w-full">
      <iframe
        ref={iframeRef}
        title={t('viewerTitle')}
        allow="autoplay; fullscreen; xr-spatial-tracking"
        className={status === 'error' ? 'hidden' : 'h-full w-full border-0'}
      />
      {status === 'loading' && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[var(--ds-surface)] p-4 text-sm text-[var(--ds-fg-muted)]">
          {t('loading')}
        </p>
      )}
      {status === 'error' && (
        <p role="alert" className="p-4 text-sm text-[var(--ds-fg-muted)]">
          {t('error')}
        </p>
      )}
    </div>
  );
}

// 3D ペイン。Sketchfab のモデルを埋め込み、本文の箇所（focusId）と注記（annotation）を行き来する
export default function ModelPane({ surfaces, focusId = null, onSelect }: Props) {
  const t = useTranslations('Model');
  const focused = useMemo(() => findZone(surfaces, focusId), [surfaces, focusId]);

  // 手で選んだモデルと、そのときの focusId。別の範囲が本文で選ばれたら、その範囲のあるモデルへ切り替える
  const [picked, setPicked] = useState<{ index: number; atFocusId: string | null | undefined }>({
    index: 0,
    atFocusId: undefined,
  });
  const rawIndex = picked.atFocusId !== focusId && focused ? focused.surface : picked.index;
  const surfaceIndex = rawIndex >= 0 && rawIndex < surfaces.length ? rawIndex : 0;
  const surface = surfaces[surfaceIndex];
  const focusedZone = focused && focused.surface === surfaceIndex ? focused.zone : null;

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded border border-[var(--ds-border)] bg-[var(--ds-surface)]"
      data-testid="model-pane"
      data-model={surface?.model.kind}
      data-uid={surface?.model.kind === 'sketchfab' ? surface.model.uid : undefined}
      data-zone={focusedZone?.id}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--ds-border)] px-3 py-1.5 text-sm">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate font-semibold text-[var(--ds-fg)]">{surface?.label || t('title')}</span>
          {surfaces.length > 1 && (
            <select
              aria-label={t('selectModel')}
              value={String(surfaceIndex)}
              onChange={(e) => setPicked({ index: Number(e.target.value), atFocusId: focusId })}
              className="min-w-0 rounded border border-[var(--ds-border)] bg-[var(--ds-bg)] px-1.5 py-0.5 text-xs text-[var(--ds-fg)]"
            >
              {surfaces.map((s, i) => (
                <option key={s.id ?? i} value={String(i)}>
                  {s.label || t('modelIndex', { index: i + 1 })}
                </option>
              ))}
            </select>
          )}
        </div>
        {surface?.model.kind === 'sketchfab' && (
          <a
            href={`https://sketchfab.com/3d-models/${surface.model.uid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 truncate text-xs underline text-[var(--ds-fg-muted)] hover:text-[var(--ds-fg)]"
          >
            {t('openSketchfab')}
          </a>
        )}
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        {surface?.model.kind === 'sketchfab' ? (
          <SketchfabViewer
            key={surface.model.uid}
            uid={surface.model.uid}
            zones={surface.zones}
            focusedZone={focusedZone}
            onSelect={onSelect}
          />
        ) : surface?.model.kind === 'gltf' ? (
          <p className="p-4 text-sm text-[var(--ds-fg-muted)]">{t('unsupportedGltf')}</p>
        ) : null}
      </div>

      {surface && surface.zones.length > 0 && (
        <div
          className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-[var(--ds-border)] px-3 py-1.5 text-xs"
          role="group"
          aria-label={t('zones')}
          data-testid="model-zones"
        >
          {surface.zones.map((z, i) => {
            const active = focusedZone?.id === z.id;
            return (
              <button
                key={z.id}
                type="button"
                aria-pressed={active}
                data-zone-id={z.id}
                title={z.note ?? z.label ?? z.id}
                onClick={() => onSelect?.(z.selectId)}
                className={`rounded border px-2 py-0.5 transition-colors ${
                  active
                    ? 'border-[var(--ds-primary)] bg-[color-mix(in_srgb,var(--ds-primary)_20%,transparent)] font-semibold text-[var(--ds-fg)]'
                    : 'border-[var(--ds-border)] bg-[var(--ds-bg)] text-[var(--ds-fg)] hover:border-[var(--ds-fg-muted)]'
                }`}
              >
                {z.label || `#${z.annotation ?? i + 1}`}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
