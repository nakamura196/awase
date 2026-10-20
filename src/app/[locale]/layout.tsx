import type { Metadata } from 'next';
import '../globals.css';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { SITE_URL, alternatesFor } from '@/lib/site';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  // 公開 URL は src/lib/site.ts
  const baseUrl = SITE_URL;

  const title = 'Awase';
  const description =
    locale === 'ja'
      ? 'TEI をまとめて読む統合ビューア。本文・注釈・画像・地図を一つの画面に合わせて表示します'
      : 'An integrated TEI viewer that brings text, annotations, images and maps together in one view';

  return {
    title: {
      default: title,
      template: `%s | ${title}`,
    },
    description,
    keywords: ['TEI', 'viewer', 'XSLT', 'DTS', 'digital humanities'],
    authors: [{ name: 'Satoru Nakamura' }],
    creator: 'Satoru Nakamura',
    publisher: 'Satoru Nakamura',
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    metadataBase: new URL(baseUrl),
    // 既定はロケールのトップ (/ja/, /en/)。下層ページは各 page.tsx の generateMetadata で上書きする。
    // / はブラウザ側で /ja/ へ移るだけのページ
    alternates: alternatesFor(locale, ''),
    openGraph: {
      title,
      description,
      url: `${baseUrl}/${locale}/`,
      siteName: title,
      images: [
        {
          url: '/opengraph-image.png',
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
      locale: locale === 'ja' ? 'ja_JP' : 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      site: '@satoru196',
      images: ['/twitter-image.png'],
      creator: '@satoru196',
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
    // No explicit `icons` here: that would override Next's file-based icon
    // convention. We rely on src/app/icon.svg + apple-icon.png, which Next links
    // automatically with the basePath applied.
  };
}

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;

  // Ensure that the incoming `locale` is valid
  if (!routing.locales.includes(locale as 'en' | 'ja')) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
  );
}

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'ja' }];
}
