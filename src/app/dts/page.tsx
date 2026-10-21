import LocaleRedirect from '@/components/LocaleRedirect';
import type { Metadata } from 'next';

// 言語を含まない共有用の入口 (例: 論文やウェブページから貼るリンク)。
// /dts/?base=... を、開いた人の言語の /en/dts/ か /ja/dts/ に移す。
export const metadata: Metadata = {
  title: 'Awase',
  robots: { index: false },
};

export default function DtsRedirectPage() {
  return <LocaleRedirect path="/dts/" />;
}
