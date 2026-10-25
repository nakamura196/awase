import type { HTMLAttributes, ReactNode } from 'react';

/** ペインの帯に置くボタンの見た目（頁送り・切り替えなど） */
export const paneButton = 'rounded border border-[var(--ds-border)] px-2 py-0.5 text-[var(--ds-fg)] disabled:opacity-40';

interface Props extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** 上の帯の左に置くもの（題名・頁送り・選択など） */
  bar: ReactNode;
  /** 上の帯の右に出す、元の資料を開くリンク */
  link?: { href: string; label: string };
  /** 上の帯の下に置く帯（異文の箇所の切り替えなど） */
  subBar?: ReactNode;
  /** 本体の下に置く帯 */
  footer?: ReactNode;
  children: ReactNode;
}

// 画像・3D のように、上に帯を持ち、本体が残りいっぱいに広がるペインの枠
export default function PaneCard({ bar, link, subBar, footer, children, className = '', ...rest }: Props) {
  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden rounded border border-[var(--ds-border)] bg-[var(--ds-surface)] ${className}`}
      {...rest}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--ds-border)] px-3 py-1.5 text-sm">
        <div className="flex min-w-0 items-center gap-2">{bar}</div>
        {link && (
          <a
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 truncate text-xs underline text-[var(--ds-fg-muted)] hover:text-[var(--ds-fg)]"
          >
            {link.label}
          </a>
        )}
      </div>
      {subBar}
      <div className="relative min-h-0 flex-1 overflow-hidden">{children}</div>
      {footer}
    </div>
  );
}
