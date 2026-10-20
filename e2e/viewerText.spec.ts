import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// viewer の本文ペイン。TEI は外のサイトに取りに行かず、見本（e2e/fixtures/sample.xml）を返す
const FIXTURE = readFileSync(path.join(__dirname, 'fixtures/sample.xml'), 'utf-8');
const TEI_URL = 'https://example.org/tei/sample.xml';
const open = (q: string) => `/ja/viewer/?u=${encodeURIComponent(TEI_URL)}${q}`;

test.beforeEach(async ({ page }) => {
  await page.route(TEI_URL, (route) =>
    route.fulfill({ body: FIXTURE, contentType: 'application/xml', headers: { 'access-control-allow-origin': '*' } }),
  );
});

test('TEI の本文と書誌を表示する', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(open(''));
  await expect(page.getByRole('heading', { level: 1, name: '見本の本文' })).toBeVisible();
  await expect(page.getByText('作者不詳')).toBeVisible();

  const pane = page.getByTestId('text-pane');
  await expect(pane.locator('tei-seg#s1')).toHaveText('一行目の本文。');
  // 改行と頁の目印
  await expect(pane.locator('tei-lb > br')).toHaveCount(4);
  await expect(pane.locator('tei-pb .awase-pb-label')).toHaveText('1');
  // 選択は直した方、異文は lem を見せる
  await expect(pane.locator('tei-corr')).toBeVisible();
  await expect(pane.locator('tei-sic')).toBeHidden();
  await expect(pane.locator('tei-rdg')).toBeHidden();
  await expect(pane.locator('tei-app')).toHaveAttribute('title', /#B 乙/);
  // ヘッダーと画像の定義は本文に出さない
  await expect(pane.locator('tei-teiheader, tei-facsimile')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('外から読んだ TEI のスクリプトは動かさない', async ({ page }) => {
  await page.goto(open(''));
  const pane = page.getByTestId('text-pane');
  const s2 = pane.locator('tei-seg#s2');
  await expect(s2).toBeVisible();
  await expect(s2).not.toHaveAttribute('onclick', /.*/);
  await expect(s2).not.toHaveAttribute('style', /.*/);
  // javascript: のリンクは作らず、ページ内の参照は作る
  await expect(pane.locator('a[href^="javascript"]')).toHaveCount(0);
  await expect(pane.getByRole('link', { name: '一行目へ' })).toHaveAttribute('href', '#s1');
});

test('縦書き・改行・頁を切り替え、URL に残す', async ({ page }) => {
  await page.goto(open(''));
  const pane = page.getByTestId('text-pane');
  await expect(pane.locator('tei-seg#s1')).toBeVisible();

  await page.getByRole('button', { name: '縦書き' }).click();
  await expect(pane).toHaveClass(/is-vertical/);
  await expect(page).toHaveURL(/dir=v/);

  await page.getByRole('button', { name: '改行' }).click();
  await expect(pane.locator('tei-lb > br').first()).toBeHidden();
  await expect(page).toHaveURL(/lb=0/);

  await page.getByRole('button', { name: '頁' }).click();
  await expect(pane.locator('tei-pb')).toBeHidden();
  await expect(page).toHaveURL(/pb=0/);
});

test('id で開くと、その要素に印を付ける。押すと URL の id が変わる', async ({ page }) => {
  await page.goto(open('&id=s3'));
  const pane = page.getByTestId('text-pane');
  await expect(pane.locator('tei-seg#s3')).toHaveClass(/is-selected/);

  await pane.locator('tei-seg#s1').click();
  await expect(page).toHaveURL(/id=s1/);
  await expect(pane.locator('tei-seg#s1')).toHaveClass(/is-selected/);
  await expect(pane.locator('tei-seg#s3')).not.toHaveClass(/is-selected/);
});

test('読めないときは理由を言い分ける', async ({ page }) => {
  await page.route('https://example.org/missing.xml', (route) =>
    route.fulfill({ status: 404, body: '', headers: { 'access-control-allow-origin': '*' } }),
  );
  await page.goto(`/ja/viewer/?u=${encodeURIComponent('https://example.org/missing.xml')}`);
  await expect(page.getByTestId('load-error')).toContainText('404');

  await page.route('https://example.org/config.json', (route) =>
    route.fulfill({ body: '{"urlMain":"x"}', contentType: 'application/json', headers: { 'access-control-allow-origin': '*' } }),
  );
  await page.goto(`/ja/viewer/?u=${encodeURIComponent('https://example.org/config.json')}`);
  await expect(page.getByTestId('load-error')).toContainText('config.json');
});

test('入口から見本を開ける', async ({ page }) => {
  await page.goto('/ja/viewer/');
  await page.getByLabel('TEI の URL').fill(TEI_URL);
  await page.getByRole('button', { name: '開く' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '見本の本文' })).toBeVisible();
});

test('u を複数渡すと本文を横に並べ、閉じたり足したりできる', async ({ page }) => {
  const second = 'https://example.org/tei/second.xml';
  await page.route(second, (route) =>
    route.fulfill({
      body: FIXTURE.replace('見本の本文', '二つめの本文'),
      contentType: 'application/xml',
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${open('')}&tei=${encodeURIComponent(second)}&id=s1`);
  const columns = page.getByTestId('text-column');
  await expect(columns).toHaveCount(2);
  await expect(columns.nth(0).getByRole('heading', { level: 2, name: '見本の本文' })).toBeVisible();
  await expect(columns.nth(1).getByRole('heading', { level: 2, name: '二つめの本文' })).toBeVisible();
  // 横に並ぶ（2 列目が 1 列目の右にある）
  const [a, b] = [await columns.nth(0).boundingBox(), await columns.nth(1).boundingBox()];
  expect(b!.x).toBeGreaterThan(a!.x + a!.width - 1);
  // 表示の切り替えと id は両方の列に効く
  await expect(page.getByTestId('text-pane').locator('tei-seg#s1.is-selected')).toHaveCount(2);
  await page.getByRole('button', { name: '縦書き' }).click();
  await expect(page.getByTestId('text-pane').and(page.locator('.is-vertical'))).toHaveCount(2);

  // 閉じると URL から外れ、1 つのときの見出しに戻る
  await columns.nth(0).getByRole('button', { name: 'この本文を閉じる' }).click();
  await expect(columns).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1, name: '二つめの本文' })).toBeVisible();
  expect(new URL(page.url()).searchParams.getAll('u')).toEqual([second]);

  // 欄から足す
  await page.getByLabel('並べる TEI の URL').fill(TEI_URL);
  await page.getByRole('button', { name: '並べる' }).click();
  await expect(columns).toHaveCount(2);
  expect(new URL(page.url()).searchParams.getAll('u')).toEqual([second, TEI_URL]);
});
