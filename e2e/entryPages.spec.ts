import { test, expect } from '@playwright/test';

// 各ページを、URL の引数を何も付けずに開いたときの画面（入口）の簡単な点検。
// 見ること: 画面の JS がエラーを出さない / 最初の見出しが見える / 横にスクロールしない。
// 日英 × パソコン幅・スマートフォン幅。ページの一覧は、ページを足したらここにも足す。

const PAGES = ['', 'viewer', 'compare', 'xsl', 'dts', 'usecases', 'help', 'news'];
const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone', width: 390, height: 844 },
];

for (const locale of ['ja', 'en'] as const) {
  for (const page of PAGES) {
    for (const vp of VIEWPORTS) {
      const path = `/${locale}/${page ? `${page}/` : ''}`;
      test(`入口 ${path} (${vp.name})`, async ({ page: tab }) => {
        await tab.setViewportSize({ width: vp.width, height: vp.height });
        const errors: string[] = [];
        tab.on('pageerror', (e) => errors.push(`JS のエラー: ${e.message}`));

        await tab.goto(path);
        // 上部の帯（header）のサイト名は除き、ページの中身の最初の見出しを見る
        await expect(tab.locator('h1:not(header *), h2:not(header *)').first()).toBeVisible();
        if (page === '') {
          // 4 画面がすべて揃ったので、トップに「準備中 / Coming soon」が出ないこと
          await expect(tab.getByText(/^(準備中|Coming soon)$/)).toHaveCount(0);
        }

        const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow, '横にスクロールする').toBeLessThanOrEqual(1);
        expect(errors).toEqual([]);
      });
    }
  }
}
