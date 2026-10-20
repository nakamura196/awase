import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// xsl 画面。TEI は外のサイトに取りに行かず、見本（e2e/fixtures/sample.xml）を返す。
// 変換は本物の SaxonJS とコンパイル済み SEF（public/xsl/）で行う
const FIXTURE = readFileSync(path.join(__dirname, 'fixtures/sample.xml'), 'utf-8');
const TEI_URL = 'https://example.org/tei/sample.xml';
const open = (q = '&xsl=reading') => `/ja/xsl/?u=${encodeURIComponent(TEI_URL)}${q}`;

test.beforeEach(async ({ page }) => {
  await page.route(TEI_URL, (route) =>
    route.fulfill({ body: FIXTURE, contentType: 'application/xml', headers: { 'access-control-allow-origin': '*' } }),
  );
});

test('変換した本文を iframe に出す', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(open());
  const frame = page.frameLocator('[data-testid="xsl-frame"]');
  await expect(frame.locator('body')).toContainText('一行目の本文。');
  await expect(page.locator('[data-testid="xsl-frame"]')).toHaveAttribute('sandbox', 'allow-scripts allow-popups');
  expect(errors).toEqual([]);
});

test('XSL を替えると URL が変わり、表示も変わる', async ({ page }) => {
  await page.goto(open());
  const frame = page.frameLocator('[data-testid="xsl-frame"]');
  await expect(frame.locator('body')).toContainText('一行目の本文。');
  await page.getByLabel('変換').selectOption('analysis');
  await expect(page).toHaveURL(/xsl=analysis/);
  // タグ統計には要素名 seg が出る
  await expect(frame.locator('body')).toContainText('seg');
  await expect(frame.locator('body')).not.toContainText('一行目の本文。');
});

test('xsl の指定を選択欄に反映する', async ({ page }) => {
  await page.goto(open('&xsl=notes'));
  await expect(page.getByLabel('変換')).toHaveValue('notes');
});

test('取得に失敗したらメッセージを出す', async ({ page }) => {
  await page.route('https://example.org/tei/missing.xml', (route) =>
    route.fulfill({ status: 404, body: '', headers: { 'access-control-allow-origin': '*' } }),
  );
  await page.goto(`/ja/xsl/?u=${encodeURIComponent('https://example.org/tei/missing.xml')}`);
  await expect(page.locator('p[role="alert"]')).toContainText('HTTP 404');
});

test('embed=1 は帯と選択欄を出さない', async ({ page }) => {
  await page.goto(open('&xsl=reading&embed=1'));
  await expect(page.frameLocator('[data-testid="xsl-frame"]').locator('body')).toContainText('一行目の本文。');
  await expect(page.getByLabel('変換')).toHaveCount(0);
  await expect(page.locator('header')).toHaveCount(0);
});

test('u が無いときは見本を出す', async ({ page }) => {
  await page.goto('/ja/xsl/');
  await expect(page.getByRole('heading', { level: 1, name: 'XSL' })).toBeVisible();
  await expect(page.getByRole('link', { name: /校異源氏物語/ })).toBeVisible();
});
