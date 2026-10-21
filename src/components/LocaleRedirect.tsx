'use client';

import { useEffect } from 'react';
import { localizedUrl, pickLocale } from '@/lib/locale';
import { resolveLegacyRedirect } from '@/lib/viewerParams';

// 静的書き出しなのでサーバ側で振り分けられない。ブラウザの希望言語を見て、
// 同じページの /en/ か /ja/ に移す。クエリ (?u=...) と # は引き継ぐ。
// トップ (/) に旧ビューア形式のクエリ (?u=... や #/v2?u=...) が付いて来たときは、対応する画面へ移す。
// replace にするのは、戻るボタンでこのページに戻って再び飛ばされないようにするため。
export default function LocaleRedirect({ path }: { path: string }) {
  useEffect(() => {
    const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
    const { search, hash } = window.location;
    const locale = pickLocale(languages);
    if (path === '/') {
      const legacy = resolveLegacyRedirect(search, hash);
      if (legacy) {
        window.location.replace(localizedUrl(locale, legacy.path, legacy.search));
        return;
      }
    }
    window.location.replace(localizedUrl(locale, path, search, hash));
  }, [path]);

  // JavaScript が動かない環境・検索エンジン向けに、両方の言語へのリンクを出しておく。
  return (
    <noscript>
      <p>
        <a href={localizedUrl('en', path)}>English</a> / <a href={localizedUrl('ja', path)}>日本語</a>
      </p>
    </noscript>
  );
}
