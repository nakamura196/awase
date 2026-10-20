// 公開 URL はここ 1 か所で決める(canonical・OGP・robots・sitemap が参照する)。
// 当面は GitHub Pages(プロジェクトページ)で配る。独自ドメインを付けたらここだけ直す。
export const SITE_URL = 'https://nakamura196.github.io/awase';

export const LOCALES = ['ja', 'en'] as const;

// sitemap に載せるページ(ロケールの後ろのパス。trailingSlash: true)
export const PUBLIC_PATHS = ['', 'viewer/', 'compare/', 'xsl/', 'dts/', 'news/', 'help/', 'privacy/', 'terms/'];

/**
 * ページの canonical と言語の組。metadataBase (SITE_URL) からの相対で返す。
 * path はロケールの後ろ (例 'help/'、トップは '')。
 */
export function alternatesFor(locale: string, path: string) {
  return {
    canonical: `/${locale}/${path}`,
    languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/${path}`])),
  };
}
