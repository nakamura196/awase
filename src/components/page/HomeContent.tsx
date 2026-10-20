'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Link } from '@/i18n/routing';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import PageContainer from '@/components/layout/PageContainer';
import { SectionHeading, News } from '@nakamura196/react-ui';
import { NEWS, NEWS_ON_HOME } from '@/lib/news';

const SCREENS = [
  { key: 'viewer', href: '/viewer', ready: true },
  { key: 'compare', href: '/compare', ready: false },
  { key: 'xsl', href: '/xsl', ready: false },
  { key: 'dts', href: '/dts', ready: false },
] as const;

export default function HomeContent() {
  const t = useTranslations('Home');
  const tNews = useTranslations('News');
  const locale = useLocale();

  // お知らせは content/news/<id>.md（src/lib/news.ts が読む）。トップには新しいものから NEWS_ON_HOME 件
  const lang = locale === 'en' ? 'en' : 'ja';
  const newsItems = NEWS.slice(0, NEWS_ON_HOME).map((n) => ({
    date: n.date,
    title: n.title[lang],
    href: `/news/${n.id}`,
  }));

  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      <main className="flex-1">
        <PageContainer>
          <section className="text-center mb-10 pt-10 md:pt-14">
            <h1
              className="text-4xl md:text-5xl font-bold text-[var(--ds-fg)] mb-4"
              style={{ fontFamily: 'var(--ds-font-serif)' }}
            >
              {t('title')}
            </h1>
            <p className="text-lg md:text-xl text-[var(--ds-fg-muted)]">{t('subtitle')}</p>
            <p className="mt-4 text-[var(--ds-fg-muted)]">{t('intro')}</p>
          </section>

          <section className="mb-16">
            <SectionHeading>{t('screens')}</SectionHeading>
            <div className="grid md:grid-cols-2 gap-6">
              {SCREENS.map((s) => (
                <Link
                  key={s.key}
                  href={s.href}
                  className="block bg-[var(--ds-surface)] border border-[var(--ds-border)] p-6 rounded-lg shadow-md hover:border-[var(--ds-primary)] transition-colors"
                >
                  <h3 className="text-lg font-semibold mb-2 text-[var(--ds-primary)]">{t(`${s.key}Title`)}</h3>
                  <p className="text-[var(--ds-fg-muted)]">{t(`${s.key}Description`)}</p>
                  {!s.ready && <p className="mt-3 text-xs text-[var(--ds-fg-muted)]">{t('comingSoon')}</p>}
                </Link>
              ))}
            </div>
          </section>

          <News
            heading={tNews('heading')}
            items={newsItems}
            emptyText={tNews('empty')}
            LinkComponent={Link}
            className="!px-0 !py-0"
          />
          <p className="mt-3 mb-16 text-right text-sm">
            <Link href="/news" className="text-[var(--ds-primary)] hover:underline">
              {tNews('viewAll')} →
            </Link>
          </p>
        </PageContainer>
      </main>
      <Footer />
    </div>
  );
}
