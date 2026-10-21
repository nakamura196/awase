import { test, expect } from '@playwright/test';

// ビューアの画面の作り。本文を開いたら画面の高さに収め、ページ全体はスクロールさせない
const URL_TEI = 'https://example.org/layout/01.xml';
const filler = '本文の続き。'.repeat(400);
const TEI = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader><fileDesc><titleStmt><title>画面の見本</title></titleStmt><publicationStmt><publisher>見本の出版者</publisher></publicationStmt>
    <sourceDesc><listWit><witness xml:id="甲">甲本</witness><witness xml:id="乙">乙本</witness></listWit></sourceDesc></fileDesc></teiHeader>
  <text><body><p>はじめ<app><lem wit="#甲">給ける</lem><rdg wit="#乙">たまふ</rdg></app>${filler}</p></body></text>
</TEI>`;

test.beforeEach(async ({ page }) => {
  await page.route(URL_TEI, (route) =>
    route.fulfill({ body: TEI, contentType: 'application/xml', headers: { 'access-control-allow-origin': '*' } }),
  );
});

const open = (page: import('@playwright/test').Page) => page.goto(`/ja/viewer/?u=${encodeURIComponent(URL_TEI)}`);
const pageScroll = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);

test('本文を開くと画面の高さに収まり、フッターは出ない。本文は枠の中で動く', async ({ page }) => {
  await open(page);
  const text = page.getByTestId('text-pane');
  await expect(text).toContainText('はじめ');
  await expect(page.getByRole('contentinfo')).toHaveCount(0);
  expect(await pageScroll(page)).toBe(0);
  // 広い画面では本文と異文を横に並べ、タブは出さない
  await expect(page.getByTestId('apparatus-pane')).toBeVisible();
  await expect(page.getByRole('tablist')).toBeHidden();
  expect(await text.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
});

test('書誌の詳細を開いても、本文の枠の高さは変わらない', async ({ page }) => {
  await open(page);
  const text = page.getByTestId('text-pane');
  await expect(text).toContainText('はじめ');
  const before = await text.boundingBox();
  await page.getByText('書誌の詳細').click();
  await expect(page.getByText('見本の出版者')).toBeVisible();
  expect(await text.boundingBox()).toEqual(before);
  expect(await pageScroll(page)).toBe(0);
});

test('ビューア内で表示スタイル（標準・LINE風対話・XSL変換）を切り替えられる', async ({ page }) => {
  await open(page);
  const styleSelect = page.getByTestId('viewer-style-select');
  await expect(styleSelect).toHaveValue('');

  await styleSelect.selectOption('line');
  await expect(page).toHaveURL(/xsl=line/);
  await expect(page.getByTestId('xsl-line-view')).toBeVisible();
  await expect(page.getByTestId('apparatus-pane')).toBeVisible();

  await styleSelect.selectOption('reading-support');
  await expect(page).toHaveURL(/xsl=reading-support/);
  await expect(page.getByTestId('reading-support-view')).toBeVisible();

  await styleSelect.selectOption('video');
  await expect(page).toHaveURL(/xsl=video/);
  await expect(page.getByTestId('video-support-view')).toBeVisible();

  await styleSelect.selectOption('analysis');
  await expect(page).toHaveURL(/xsl=analysis/);
  await expect(page.frameLocator('[data-testid="xsl-frame"]').locator('body')).toContainText('app');

  await styleSelect.selectOption('');
  await expect(page).not.toHaveURL(/xsl=/);
  await expect(page.getByTestId('text-pane')).toContainText('はじめ');
});

test.describe('狭い画面', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('ペインはタブで 1 つずつ出す', async ({ page }) => {
    await open(page);
    const tabs = page.getByRole('tablist');
    await expect(tabs.getByRole('tab', { name: '本文' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('text-pane')).toBeVisible();
    await expect(page.getByTestId('apparatus-pane')).toBeHidden();
    await tabs.getByRole('tab', { name: '異文' }).click();
    await expect(page.getByTestId('apparatus-pane')).toBeVisible();
    await expect(page.getByTestId('text-pane')).toBeHidden();
    expect(await pageScroll(page)).toBe(0);
  });
});
