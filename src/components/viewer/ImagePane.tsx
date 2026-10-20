'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import type { ViewerSelection, ViewerTarget } from '@nakamura196/iiif-viewer';
import '@nakamura196/iiif-viewer/style.css';
import { canvasKey, imageSrcs, manifestCanvasIds, matchCanvas, type FacsTarget } from '@/lib/tei/facs';

// IIIF Kasane の画像ビューア（three.js で描く）。サーバでの書き出しでは描けないので、画面の側でだけ読む
const Viewer = dynamic(() => import('@nakamura196/iiif-viewer').then((m) => m.Viewer), { ssr: false });

/** 異文の箇所の画像（app@facs） */
export interface PlaceImages {
  /** 箇所の番号（一覧の番号） */
  n: number;
  targets: FacsTarget[];
}

interface Props {
  /** 頁ごとの画像。引けない頁は null */
  pages: (FacsTarget | null)[];
  /** 頁の目印の @n */
  labels: (string | null)[];
  /** いま見ている頁（pages の何番目か） */
  index: number;
  /** 頁を移る。本文もその頁へ動かす */
  onGo: (index: number) => void;
  /** 選んでいる異文の箇所の画像。あれば、頁の画像の代わりに出す */
  place?: PlaceImages | null;
}

// マニフェストの Canvas id。書かれた Canvas id と www の有無などが違うことがあるので、マニフェストを読んで突き合わせる。
// 同じマニフェストを頁ごとに読み直さないよう、読んだものを取っておく
const canvasIdCache = new Map<string, Promise<string[]>>();
function canvasIdsOf(manifest: string): Promise<string[]> {
  let ids = canvasIdCache.get(manifest);
  if (!ids) {
    ids = fetch(manifest)
      .then((r) => (r.ok ? r.json() : null))
      .then(manifestCanvasIds)
      // 読めなければ、書かれた Canvas id をそのまま使う
      .catch(() => []);
    canvasIdCache.set(manifest, ids);
  }
  return ids;
}

/** マニフェストの Canvas id の一覧。読み終わるまでは null */
function useCanvasIds(manifest: string | undefined): string[] | null {
  const [state, setState] = useState<{ manifest: string; ids: string[] } | null>(null);
  useEffect(() => {
    if (!manifest) return;
    let live = true;
    canvasIdsOf(manifest).then((ids) => live && setState({ manifest, ids }));
    return () => {
      live = false;
    };
  }, [manifest]);
  return manifest && state?.manifest === manifest ? state.ids : null;
}

/** ビューアに渡すもの。マニフェストがあればそれを、無ければ IIIF の画像 1 枚（info.json）を開く */
function viewerOf(page: FacsTarget | null, canvasIds: string[] | null = null): { content: string; target?: ViewerTarget } | null {
  if (!page) return null;
  const xywh = page.region;
  if (page.manifest) {
    const canvasId = page.canvas && ((canvasIds && matchCanvas(canvasIds, page.canvas)) ?? page.canvas);
    return { content: page.manifest, target: canvasId ? { canvasId, xywh } : undefined };
  }
  if (page.service) {
    // info.json から作られるマニフェストの Canvas は「<base>/canvas/1」（kasane の imageInfoManifest.ts）
    return { content: `${page.service}/info.json`, target: { canvasId: `${page.service}/canvas/1`, xywh } };
  }
  return null;
}

const button = 'rounded border border-[var(--ds-border)] px-2 py-0.5 text-[var(--ds-fg)] disabled:opacity-40';

// 画像ペイン。本文で読んでいる頁（pb@facs）の画像を、IIIF Kasane のビューアで出す。
// その頁の範囲（zone）に寄せ、ビューアの側で頁をめくったら、その Canvas の頁へ本文を動かす。
// 異文の箇所を選び、その箇所に画像の範囲（app@facs）があれば、頁の画像の代わりにそれを出す（koui と同じ）。
// 範囲が複数（伝本ごとの資料）なら、1 つずつ切り替える。
// IIIF でない画像（pb@facs に画像の URL だけを書いたもの）は、そのまま 1 枚出す
export default function ImagePane({ pages, labels, index, onGo, place }: Props) {
  const t = useTranslations('Viewer');
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const page = pages[index] ?? null;
  const label = labels[index];
  // 画像の引ける頁だけを、前後へ移る先にする
  const prev = pages.findLastIndex((p, i) => i < index && p);
  const next = pages.findIndex((p, i) => i > index && p);

  // 異文の箇所の画像を、何番目まで見たか・閉じたか。別の箇所を選んだら、1 つ目から出し直す
  const placeN = place?.targets.length ? place.n : null;
  const [placeState, setPlaceState] = useState<{ n: number; k: number; off: boolean } | null>(null);
  const cur = placeN === null ? null : placeState?.n === placeN ? placeState : { n: placeN, k: 0, off: false };
  const placeTarget = place && cur && !cur.off ? (place.targets[cur.k] ?? null) : null;

  const shown = placeTarget ?? page;
  const canvasIds = useCanvasIds(shown?.manifest);
  // マニフェストの Canvas を引き終えてからビューアを開く（書かれた Canvas が見つからず、1 枚目を開いてしまわないように）
  const waiting = Boolean(shown?.manifest && shown.canvas && !canvasIds);
  const view = useMemo(() => (waiting ? null : viewerOf(shown, canvasIds)), [shown, canvasIds, waiting]);

  const go = (i: number) => {
    // 頁を送ったら、異文の箇所の画像は閉じる
    if (cur) setPlaceState({ ...cur, off: true });
    onGo(i);
  };

  // ビューアで見ている Canvas が替わったら、その Canvas を指す頁へ本文を動かす。
  // 1 つの Canvas に頁が 2 つある（見開き）ときは、いまの頁が入っていればそのまま。
  // 異文の箇所の画像を出しているあいだは、本文を動かさない
  const onSelect = ({ canvasId }: ViewerSelection) => {
    if (!view || placeTarget) return;
    const same = (i: number) => {
      const p = pages[i];
      return Boolean(p?.manifest === shown?.manifest && p?.canvas && canvasKey(p.canvas) === canvasKey(canvasId));
    };
    if (!shown?.manifest) return;
    if (same(index)) return;
    const i = pages.findIndex((_, j) => same(j));
    if (i >= 0) onGo(i);
  };

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-2"
      data-testid="image-pane"
      data-iiif-content={view?.content}
      data-canvas={view?.target?.canvasId}
      data-xywh={view?.target?.xywh?.join(',')}
      data-place={placeTarget ? place?.n : undefined}
    >
      <div className="flex items-center gap-2 text-sm">
        <button type="button" disabled={prev < 0} onClick={() => go(prev)} className={button}>
          {t('prevPage')}
        </button>
        <span className="flex-1 text-center text-[var(--ds-fg-muted)]" data-testid="image-page" aria-live="polite">
          {label ? t('pageLabel', { n: label }) : t('pageIndex', { index: index + 1, total: pages.length })}
        </span>
        <button type="button" disabled={next < 0} onClick={() => go(next)} className={button}>
          {t('nextPage')}
        </button>
      </div>
      {place && cur && (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="place-images">
          {cur.off ? (
            <button type="button" onClick={() => setPlaceState({ ...cur, off: false })} className={button}>
              {t('placeImage', { n: place.n, index: cur.k + 1, total: place.targets.length })}
            </button>
          ) : (
            <>
              <span className="font-bold text-[var(--ds-fg)]" aria-live="polite">
                {t('placeImage', { n: place.n, index: cur.k + 1, total: place.targets.length })}
              </span>
              {place.targets.length > 1 && (
                <>
                  <button type="button" disabled={cur.k === 0} onClick={() => setPlaceState({ ...cur, k: cur.k - 1 })} className={button}>
                    {t('prevPlaceImage')}
                  </button>
                  <button
                    type="button"
                    disabled={cur.k >= place.targets.length - 1}
                    onClick={() => setPlaceState({ ...cur, k: cur.k + 1 })}
                    className={button}
                  >
                    {t('nextPlaceImage')}
                  </button>
                </>
              )}
              <button type="button" onClick={() => setPlaceState({ ...cur, off: true })} className={`${button} ml-auto`}>
                {t('backToPage')}
              </button>
            </>
          )}
        </div>
      )}
      <div className="relative min-h-0 flex-1 overflow-hidden rounded bg-[var(--ds-surface)]">
        {view ? (
          // 別のマニフェスト・画像に替わったら、ビューアを作り直す（中の状態を前の画像から持ち越さない）
          <Viewer
            key={view.content}
            iiifContent={view.content}
            target={view.target}
            onSelect={onSelect}
            // 本文と並べるので、資料情報の欄は閉じて始める（読む人は開ける）
            panelOpen={false}
            locale={locale === 'en' ? 'en' : 'ja'}
            theme={resolvedTheme === 'dark' ? 'dark' : resolvedTheme === 'light' ? 'light' : 'auto'}
            className="h-full"
          />
        ) : waiting ? (
          <p className="p-4 text-sm text-[var(--ds-fg-muted)]">{t('loading')}</p>
        ) : shown && imageSrcs(shown)[0] ? (
          // 外の画像を、大きさを決めずにそのまま出す（next/image の最適化は静的書き出しでは使えない）
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrcs(shown)[0]}
            alt={label ? t('pageLabel', { n: label }) : ''}
            className="h-full w-full object-contain"
          />
        ) : (
          <p className="p-4 text-sm text-[var(--ds-fg-muted)]">{t('noImage')}</p>
        )}
      </div>
      {shown && (shown.manifest || shown.image) && (
        <p className="truncate text-xs">
          <a
            href={shown.manifest ?? shown.image}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[var(--ds-fg-muted)]"
          >
            {shown.manifest ? t('openManifest') : t('openImage')}
          </a>
        </p>
      )}
    </div>
  );
}
