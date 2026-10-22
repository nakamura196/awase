'use client';

import { Link } from '@/i18n/routing';
import { useTranslations } from 'next-intl';
import { Footer as DsFooter } from '@nakamura196/react-ui';

// 共有デザインシステム (@nakamura196/react-ui) の4列フッター。
// 左ブロック (title + description) ＋ columns (最大3列) = 計4列。
// next-intl の Link を LinkComponent に渡してロケール付きリンクを描画する。

export default function Footer() {
  const t = useTranslations('Footer');

  return (
    <DsFooter
      title={t('title')}
      description={t('description')}
      LinkComponent={Link}
      copyright={`© ${new Date().getFullYear()} ${t('developers')}`}
      columns={[
        // 2列目: 主な画面
        {
          heading: t('screensHeading'),
          links: [
            { label: t('viewer'), href: '/viewer' },
            { label: t('compare'), href: '/compare' },
            { label: t('dts'), href: '/dts' },
            { label: t('usecases'), href: '/usecases' },
          ],
        },
        // 3列目: 説明系（ヘルプ・お知らせ・規約）
        {
          heading: t('guideHeading'),
          links: [
            { label: t('help'), href: '/help' },
            { label: t('news'), href: '/news' },
            { label: t('privacy'), href: '/privacy' },
            { label: t('terms'), href: '/terms' },
          ],
        },
        // 4列目: 関連サイト
        {
          heading: t('relatedHeading'),
          links: [
            { label: t('relatedTei'), href: 'https://tei-c.org/', external: true },
            { label: t('relatedDts'), href: 'https://distributed-text-services.github.io/specifications/', external: true },
            { label: t('relatedSource'), href: 'https://github.com/nakamura196/awase', external: true },
          ],
        },
      ]}
    />
  );
}
