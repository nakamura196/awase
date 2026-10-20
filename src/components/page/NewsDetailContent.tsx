'use client';

import { useLocale, useTranslations } from 'next-intl';
import { VideoEmbed, buttonClass } from '@nakamura196/react-ui';
import { Link } from '@/i18n/routing';
import CommonLayout from '@/components/layout/Common';
import PageContainer from '@/components/layout/PageContainer';
import { actionHrefOf, newsById, newsVideoOf } from '@/lib/news';

const linkClass = 'text-[var(--ds-primary)] hover:underline';

// /news/<id>: お知らせ 1 件。見出し・日付・動画・本文・「試す」
export default function NewsDetailContent({ id }: { id: string }) {
  const t = useTranslations('News');
  const locale = useLocale() === 'en' ? 'en' : 'ja';
  const n = newsById(id);
  if (!n) return null;

  const videoId = newsVideoOf(n, locale);
  const action = n.action;

  return (
    <CommonLayout>
      <PageContainer width="text" className="space-y-8">
        <p className="text-sm">
          <Link href="/news" className={linkClass}>
            ← {t('back')}
          </Link>
        </p>
        <header className="space-y-2">
          <time className="text-sm tabular-nums text-[var(--ds-fg-muted)]">{n.date}</time>
          <h1 className="text-2xl font-bold text-[var(--ds-fg)]">{n.title[locale]}</h1>
        </header>

        {videoId && <VideoEmbed videoId={videoId} title={n.title[locale]} className="w-full" />}

        <p className="leading-relaxed text-[var(--ds-fg)]">{n.body[locale]}</p>

        {action &&
          (action.external ? (
            <a
              href={actionHrefOf(action, locale)}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonClass('primary', 'md')}
            >
              {t(action.label ?? 'tryIt')}
            </a>
          ) : (
            <Link href={actionHrefOf(action, locale)} className={buttonClass('primary', 'md')}>
              {t(action.label ?? 'tryIt')}
            </Link>
          ))}

      </PageContainer>
    </CommonLayout>
  );
}
