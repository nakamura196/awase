'use client';

import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useLocale, useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import type { ViewerSelection, ViewerTarget } from '@nakamura196/iiif-viewer';
import '@nakamura196/iiif-viewer/style.css';
import { imageSrcs, type FacsTarget } from '@/lib/tei/facs';

// IIIF Kasane の画像ビューア（three.js で描く）。サーバでの書き出しでは描けないので、画面の側でだけ読む
const Viewer = dynamic(() => import('@nakamura196/iiif-viewer').then((m) => m.Viewer), { ssr: false });

interface Props {
  /** 頁ごとの画像。引けない頁は null */
  pages: (FacsTarget | null)[];
  /** 頁の目印の @n */
  labels: (string | null)[];
  /** いま見ている頁（pages の何番目か） */
  index: number;
  /** 頁を移る。本文もその頁へ動かす */
  onGo: (index: number) => void;
}

/** ビューアに渡すもの。マニフェストがあればそれを、無ければ IIIF の画像 1 枚（info.json）を開く */
function viewerOf(page: FacsTarget | null): { content: string; target?: ViewerTarget } | null {
  if (!page) return null;
  const xywh = page.region;
  if (page.manifest) {
    return { content: page.manifest, target: page.canvas ? { canvasId: page.canvas, xywh } : undefined };
  }
  if (page.service) {
    // info.json から作られるマニフェストの Canvas は「<base>/canvas/1」（kasane の imageInfoManifest.ts）
    return { content: `${page.service}/info.json`, target: { canvasId: `${page.service}/canvas/1`, xywh } };
  }
  return null;
}

// 画像ペイン。本文で読んでいる頁（pb@facs）の画像を、IIIF Kasane のビューアで出す。
// その頁の範囲（zone）に寄せ、ビューアの側で頁をめくったら、その Canvas の頁へ本文を動かす。
// IIIF でない画像（pb@facs に画像の URL だけを書いたもの）は、そのまま 1 枚出す
export default function ImagePane({ pages, labels, index, onGo }: Props) {
  const t = useTranslations('Viewer');
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const page = pages[index] ?? null;
  const view = useMemo(() => viewerOf(page), [page]);
  const label = labels[index];
  // 画像の引ける頁だけを、前後へ移る先にする
  const prev = pages.findLastIndex((p, i) => i < index && p);
  const next = pages.findIndex((p, i) => i > index && p);

  // ビューアで見ている Canvas が替わったら、その Canvas を指す頁へ本文を動かす。
  // 1 つの Canvas に頁が 2 つある（見開き）ときは、いまの頁が入っていればそのまま
  const onSelect = ({ canvasId }: ViewerSelection) => {
    if (!view) return;
    const same = (i: number) => {
      const v = viewerOf(pages[i] ?? null);
      return v?.content === view.content && v.target?.canvasId === canvasId;
    };
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
    >
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          disabled={prev < 0}
          onClick={() => onGo(prev)}
          className="rounded border border-[var(--ds-border)] px-2 py-0.5 text-[var(--ds-fg)] disabled:opacity-40"
        >
          {t('prevPage')}
        </button>
        <span className="flex-1 text-center text-[var(--ds-fg-muted)]" data-testid="image-page" aria-live="polite">
          {label ? t('pageLabel', { n: label }) : t('pageIndex', { index: index + 1, total: pages.length })}
        </span>
        <button
          type="button"
          disabled={next < 0}
          onClick={() => onGo(next)}
          className="rounded border border-[var(--ds-border)] px-2 py-0.5 text-[var(--ds-fg)] disabled:opacity-40"
        >
          {t('nextPage')}
        </button>
      </div>
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
        ) : page && imageSrcs(page)[0] ? (
          // 外の画像を、大きさを決めずにそのまま出す（next/image の最適化は静的書き出しでは使えない）
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageSrcs(page)[0]}
            alt={label ? t('pageLabel', { n: label }) : ''}
            className="h-full w-full object-contain"
          />
        ) : (
          <p className="p-4 text-sm text-[var(--ds-fg-muted)]">{t('noImage')}</p>
        )}
      </div>
      {page && (page.manifest || page.image) && (
        <p className="truncate text-xs">
          <a
            href={page.manifest ?? page.image}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[var(--ds-fg-muted)]"
          >
            {page.manifest ? t('openManifest') : t('openImage')}
          </a>
        </p>
      )}
    </div>
  );
}
