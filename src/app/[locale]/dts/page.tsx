import DtsContent from '@/components/page/DtsContent';
import { setRequestLocale } from 'next-intl/server';
import { alternatesFor } from '@/lib/site';
import type { Metadata } from 'next';

export default async function DtsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <DtsContent />;
}

export function generateStaticParams() {
  return [{ locale: 'en' }, { locale: 'ja' }];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return { alternates: alternatesFor(locale, 'dts/') };
}
