'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import CommonLayout from '@/components/layout/Common';
import PageContainer from '@/components/layout/PageContainer';

interface Props {
  /** messages の Placeholder.<screen> の名前（viewer / compare / xsl / dts） */
  screen: 'viewer' | 'compare' | 'xsl' | 'dts';
  /** この画面が受け取る予定の URL パラメータ */
  params: readonly string[];
}

function ParamsTable({ params }: { params: readonly string[] }) {
  const t = useTranslations('Placeholder');
  const search = useSearchParams();
  return (
    <table className="w-full text-sm border border-[var(--ds-border)]">
      <thead>
        <tr className="bg-[var(--ds-surface)] text-left">
          <th className="px-3 py-2 w-1/3">{t('param')}</th>
          <th className="px-3 py-2">{t('value')}</th>
        </tr>
      </thead>
      <tbody>
        {params.map((name) => {
          const value = search.get(name);
          return (
            <tr key={name} className="border-t border-[var(--ds-border)]">
              <td className="px-3 py-2 font-mono">{name}</td>
              <td className="px-3 py-2 font-mono break-all text-[var(--ds-fg-muted)]">
                {value === null ? '—' : value === '' ? t('empty') : value}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// 中身が出来るまでの仮の画面。受け取る予定の URL パラメータと、いま渡された値を並べて見せる。
export default function ParamsPlaceholder({ screen, params }: Props) {
  const t = useTranslations('Placeholder');
  return (
    <CommonLayout>
      <PageContainer width="text" className="space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold text-[var(--ds-fg)]">{t(`${screen}Title`)}</h1>
          <p className="text-[var(--ds-fg-muted)]">{t(`${screen}Lead`)}</p>
          <p className="inline-block rounded border border-[var(--ds-border)] px-2 py-1 text-sm text-[var(--ds-fg-muted)]">
            {t('comingSoon')}
          </p>
        </header>
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-[var(--ds-fg)]">{t('paramsHeading')}</h2>
          {/* useSearchParams は静的書き出しでは Suspense の中で使う */}
          <Suspense fallback={null}>
            <ParamsTable params={params} />
          </Suspense>
        </section>
      </PageContainer>
    </CommonLayout>
  );
}
