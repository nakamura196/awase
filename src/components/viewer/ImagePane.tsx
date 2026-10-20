'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { imageSrcs, type FacsTarget } from '@/lib/tei/facs';

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

// 画像ペイン。本文で読んでいる頁（pb@facs）の画像を出す。
// 仮の作り: IIIF の画像を 1 枚出すだけ。拡大・移動は、IIIF Kasane の画像部品を npm から入れたら置き換える
export default function ImagePane({ pages, labels, index, onGo }: Props) {
  const t = useTranslations('Viewer');
  const target = pages[index] ?? null;
  const srcs = target ? imageSrcs(target) : [];
  // 読めなかった候補の数。頁が替わったら最初の候補から試し直す
  const [failed, setFailed] = useState({ index, count: 0 });
  const tried = failed.index === index ? failed.count : 0;
  const src = srcs[tried] ?? null;
  const label = labels[index];
  // 画像の引ける頁だけを、前後へ移る先にする
  const prev = pages.findLastIndex((p, i) => i < index && p);
  const next = pages.findIndex((p, i) => i > index && p);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2" data-testid="image-pane">
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
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded bg-[var(--ds-surface)]">
        {src ? (
          // 外の IIIF サーバの画像を、大きさを決めずにそのまま出す（next/image の最適化は静的書き出しでは使えない）
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            alt={label ? t('pageLabel', { n: label }) : ''}
            onError={() => setFailed({ index, count: tried + 1 })}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <p className="p-4 text-sm text-[var(--ds-fg-muted)]">{t('noImage')}</p>
        )}
      </div>
      {target && (target.manifest || target.image) && (
        <p className="truncate text-xs">
          <a
            href={target.manifest ?? target.image}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[var(--ds-fg-muted)]"
          >
            {target.manifest ? t('openManifest') : t('openImage')}
          </a>
        </p>
      )}
    </div>
  );
}
