'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import type { ViewerSelection, ViewerTarget } from '@nakamura196/iiif-viewer';
import '@nakamura196/iiif-viewer/style.css';
import PaneCard, { paneButton as button } from './PaneCard';
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
  /** カードの上の帯に出す資料名（compare 画面など） */
  title?: string;
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

/**
 * ビューアに渡すもの。マニフェストがあればそれを、無ければ IIIF の画像 1 枚（info.json）を開く。
 * highlight: 範囲に枠を描くか。頁の画像では切る（頁全体の範囲に枠を描くと、外側が暗く塗られて灰色の帯に見える）
 */
function viewerOf(
  page: FacsTarget | null,
  canvasIds: string[] | null = null,
  highlight = true,
): { content: string; target?: ViewerTarget } | null {
  if (!page) return null;
  const xywh = page.region;
  if (page.manifest) {
    const canvasId = page.canvas && ((canvasIds && matchCanvas(canvasIds, page.canvas)) ?? page.canvas);
    return { content: page.manifest, target: canvasId ? { canvasId, xywh, highlight } : undefined };
  }
  if (page.service) {
    // info.json から作られるマニフェストの Canvas は「<base>/canvas/1」（kasane の imageInfoManifest.ts）
    return { content: `${page.service}/info.json`, target: { canvasId: `${page.service}/canvas/1`, xywh, highlight } };
  }
  return null;
}

// 画像ペイン。本文で読んでいる頁（pb@facs）の画像を、IIIF Kasane のビューアで出す。
// その頁の範囲（zone）に寄せ、ビューアの側で頁をめくったら、その Canvas の頁へ本文を動かす。
// 異文の箇所を選び、その箇所に画像の範囲（app@facs）があれば、頁の画像の代わりにそれを出す（koui と同じ）。
// 範囲が複数（伝本ごとの資料）なら、1 つずつ切り替える。
// IIIF でない画像（pb@facs に画像の URL だけを書いたもの）は、そのまま 1 枚出す
export default function ImagePane({ pages, labels, index, onGo, place, title }: Props) {
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
  // 枠を描くのは異文の箇所の範囲だけ
  const view = useMemo(
    () => (waiting ? null : viewerOf(shown, canvasIds, Boolean(placeTarget))),
    [shown, canvasIds, waiting, placeTarget],
  );

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
    <PaneCard
      data-testid="image-pane"
      data-iiif-content={view?.content}
      data-canvas={view?.target?.canvasId}
      data-xywh={view?.target?.xywh?.join(',')}
      data-place={placeTarget ? place?.n : undefined}
      link={
        shown && (shown.manifest || shown.image)
          ? { href: (shown.manifest ?? shown.image)!, label: shown.manifest ? t('openManifest') : t('openImage') }
          : undefined
      }
      bar={
        <>
          {title && <span className="truncate font-semibold text-[var(--ds-fg)]">{title}</span>}
          {/* 頁送りはこの 1 組だけ（ビューアの頁送りは pager={false} で隠す）。本文の頁の順に、別の画像にもまたがって移る */}
          <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label={t('pager')}>
            <button type="button" disabled={prev < 0} onClick={() => go(prev)} className={button} aria-label={t('prevPage')} title={t('prevPage')}>
              ‹
            </button>
            <span className="tabular-nums text-[var(--ds-fg)]" data-testid="image-page" aria-live="polite">
              {label ? t('pageLabel', { n: label }) : t('pageIndex', { index: index + 1, total: pages.length })}
            </span>
            <button type="button" disabled={next < 0} onClick={() => go(next)} className={button} aria-label={t('nextPage')} title={t('nextPage')}>
              ›
            </button>
          </div>
        </>
      }
      subBar={
        place && cur && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--ds-border)] px-3 py-1.5 text-sm" data-testid="place-images">
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
        )
      }
    >
      {view ? (
        // 別のマニフェスト・画像に替わったら、ビューアを作り直す（中の状態を前の画像から持ち越さない）
        <Viewer
          key={view.content}
          iiifContent={view.content}
          target={view.target}
          onSelect={onSelect}
          // 本文と並べるので、資料情報の欄は閉じて始める（読む人は開ける）
          panelOpen={false}
          // 頁送りは上の 1 組に任せる。矢印キーでめくれば、onSelect で本文が付いてくる
          pager={false}
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
    </PaneCard>
  );
}
