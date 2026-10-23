import { test, expect } from '@playwright/test';
import { USE_CASES, byNewest, usecaseById } from '@/lib/usecases';
import { newsAboutUseCase } from '@/lib/news';

const LOCALE_LABELS = {
  ja: {
    title: 'ユースケース',
    filter: '札で絞り込む',
    all: 'すべて',
    sort: '並べ方',
    sortDefault: 'おすすめ順',
    sortNewest: '新しい順',
    open: 'Awase で開く',
    parallelTag: '対訳・並置',
  },
  en: {
    title: 'Use cases',
    filter: 'Filter by tag',
    all: 'All',
    sort: 'Order',
    sortDefault: 'Recommended',
    sortNewest: 'Newest first',
    open: 'Open in Awase',
    parallelTag: 'Parallel texts',
  },
} as const;

for (const locale of ['ja', 'en'] as const) {
  const L = LOCALE_LABELS[locale];

  test(`/${locale}/usecases/ に見出し・絞り込み札・並べ替え・全カードが出る`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto(`/${locale}/usecases/`);

    await expect(page.getByRole('heading', { level: 1, name: L.title })).toBeVisible();

    const filterGroup = page.getByRole('group', { name: L.filter });
    await expect(filterGroup).toBeVisible();
    const allButton = filterGroup.getByRole('button', { name: `${L.all} (${USE_CASES.length})` });
    await expect(allButton).toHaveAttribute('aria-pressed', 'true');

    const sortGroup = page.getByRole('group', { name: L.sort });
    await expect(sortGroup).toBeVisible();
    const defaultSortBtn = sortGroup.getByRole('button', { name: L.sortDefault });
    const newestSortBtn = sortGroup.getByRole('button', { name: L.sortNewest });
    await expect(defaultSortBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(newestSortBtn).toHaveAttribute('aria-pressed', 'false');

    const cards = page.locator('main section[id]');
    await expect(cards).toHaveCount(USE_CASES.length);

    for (const u of USE_CASES) {
      const card = page.locator(`section#${u.id}`);
      await expect(card.getByRole('heading', { level: 2, name: u.title[locale] })).toBeVisible();
      await expect(card.locator(`img[src*="/thumbnails/usecases/${u.id}.${locale}.webp"]`)).toBeVisible();
      await expect(card.getByRole('link', { name: L.open })).toBeVisible();
    }

    // 機能札で絞り込むと aria-pressed と表示カードが切り替わる
    const expectedParallel = USE_CASES.filter((u) => u.features.includes('parallel'));
    const parallelBtn = filterGroup.getByRole('button', {
      name: `${L.parallelTag} (${expectedParallel.length})`,
    });
    await parallelBtn.click();
    await expect(parallelBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(allButton).toHaveAttribute('aria-pressed', 'false');
    await expect(cards).toHaveCount(expectedParallel.length);
    const filteredIds = await cards.evaluateAll((els) => els.map((el) => el.id));
    expect(filteredIds).toEqual(expectedParallel.map((u) => u.id));

    // 「すべて」に戻す
    await allButton.click();
    await expect(allButton).toHaveAttribute('aria-pressed', 'true');
    await expect(cards).toHaveCount(USE_CASES.length);

    // 「新しい順」で added の降順に並ぶ
    await newestSortBtn.click();
    await expect(newestSortBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(defaultSortBtn).toHaveAttribute('aria-pressed', 'false');
    const sortedIds = await cards.evaluateAll((els) => els.map((el) => el.id));
    expect(sortedIds).toEqual(byNewest(USE_CASES).map((u) => u.id));

    expect(errors).toEqual([]);
  });
}

test('詳細ページ /ja/usecases/koui-genji-apparatus/ に各要素が出る', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  const u = usecaseById('koui-genji-apparatus')!;
  const relatedNews = newsAboutUseCase(u.id);

  await page.goto('/ja/usecases/');
  await page
    .locator(`section#${u.id}`)
    .getByRole('link', { name: u.title.ja })
    .click();
  await expect(page).toHaveURL(/\/ja\/usecases\/koui-genji-apparatus\/?$/);

  // 題名と機能札
  await expect(page.getByRole('heading', { level: 1, name: u.title.ja })).toBeVisible();
  for (const tag of ['本文', '画像・IIIF', '校異・異文']) {
    await expect(page.locator('header li', { hasText: tag })).toBeVisible();
  }

  // メディア枠（サムネイル画像）
  await expect(
    page.locator('img[src*="/thumbnails/usecases/koui-genji-apparatus.ja.webp"]').first(),
  ).toBeVisible();

  // 資料・元のプロジェクトへのリンク
  const xmlLink = page.getByRole('link', { name: 'TEI/XML' });
  await expect(xmlLink).toHaveAttribute('href', 'https://tei-eaj.github.io/koui/data/01_with_wit_images.xml');
  const siteLink = page.getByRole('link', { name: '元のプロジェクト' });
  await expect(siteLink).toHaveAttribute('href', 'https://kouigenjimonogatari.github.io/');

  // 「Awase で開く」と「リンクをコピー」
  const openLink = page.getByRole('link', { name: 'Awase で開く' });
  await expect(openLink).toBeVisible();
  await expect(openLink).toHaveAttribute(
    'href',
    /\/ja\/viewer\/?\?u=https%3A%2F%2Ftei-eaj\.github\.io%2Fkoui%2Fdata%2F01_with_wit_images\.xml&dir=v$/,
  );
  await expect(page.getByRole('button', { name: 'リンクをコピー' })).toBeVisible();

  // この例を取り上げたお知らせ
  await expect(
    page.getByRole('heading', { level: 2, name: 'この例を取り上げたお知らせ' }),
  ).toBeVisible();
  expect(relatedNews.length).toBeGreaterThan(0);
  for (const n of relatedNews) {
    await expect(page.getByRole('link', { name: n.title.ja })).toBeVisible();
  }

  // ほかのユースケース
  const othersSection = page.locator('section', {
    has: page.getByRole('heading', { level: 2, name: 'ほかのユースケース' }),
  });
  await expect(othersSection).toBeVisible();
  await expect(othersSection.locator('li')).toHaveCount(USE_CASES.length - 1);

  expect(errors).toEqual([]);
});
