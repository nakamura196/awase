import LocaleRedirect from '@/components/LocaleRedirect';
import type { Metadata } from 'next';

// 言語を含まない共有用の入口 (例: 論文やウェブページから貼るリンク)。
// /compare/?manifest1=... を、開いた人の言語の /en/compare/ か /ja/compare/ に移す。
export const metadata: Metadata = {
  title: 'Awase',
  robots: { index: false },
};

export default function CompareRedirectPage() {
  return <LocaleRedirect path="/compare/" />;
}
