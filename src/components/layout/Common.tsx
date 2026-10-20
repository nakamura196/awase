import Header from '@/components/Header';
import Footer from '@/components/Footer';

// fullScreen: ビューアのように画面の高さに収めるページ。帯を細くし、フッターを出さない。
// ページ全体はスクロールさせず、中の枠（本文・画像・異文）がそれぞれスクロールする
export default function CommonLayout({ children, fullScreen = false }: { children: React.ReactNode; fullScreen?: boolean }) {
  if (fullScreen) {
    return (
      <div className="flex h-[100dvh] flex-col overflow-hidden">
        <Header compact />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    );
  }
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      {/* overflow-hidden だとスクロールの枠になり、中の sticky が効かない。clip は切るだけで枠にならない */}
      <main className="flex-1 flex overflow-clip">
        <div className="w-full flex flex-col">
          <div className="flex-1">{children}</div>
          <div className="hidden sm:block">
            <Footer />
          </div>
        </div>
      </main>
      <div className="sm:hidden">
        <Footer />
      </div>
    </div>
  );
}
