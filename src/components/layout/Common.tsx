import Header from '@/components/Header';
import Footer from '@/components/Footer';

export default function CommonLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Header />
      {/* overflow-hidden だとスクロールの枠になり、中の sticky（viewer の画像ペイン）が効かない。clip は切るだけで枠にならない */}
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
