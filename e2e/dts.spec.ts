import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// DTS の画面。DTS の応答は外に取りに行かず、実際の応答を短くした見本（e2e/fixtures/dts-*.json）を返す
const fx = (name: string) => readFileSync(path.join(__dirname, 'fixtures', name), 'utf-8');
const SAMPLE_TEI = fx('sample.xml');
const BASE = 'https://dts.example.org/api/v2/dts';
const RES = 'urn:kouigenjimonogatari.1';
const RES_URL = `${BASE}/collection?id=${RES}`;
const CORS = { 'access-control-allow-origin': '*' };

const open = (q = '') => `/ja/dts/?base=${encodeURIComponent(BASE)}${q}`;

test.beforeEach(async ({ page }) => {
  await page.route('https://dts.example.org/**', (route) => {
    const u = new URL(route.request().url());
    const json = (name: string) =>
      route.fulfill({ body: fx(name), contentType: 'application/json', headers: CORS });
    switch (u.pathname) {
      case '/api/v2/dts':
        return json('dts-entry.json');
      case '/api/v2/dts/collection':
        return json(u.searchParams.get('id') === RES ? 'dts-resource.json' : 'dts-collection-root.json');
      case '/api/v2/dts/navigation':
        return json(u.searchParams.get('ref') === '5' ? 'dts-navigation-ref.json' : 'dts-navigation-top.json');
      case '/api/v2/dts/document':
        return route.fulfill({ body: SAMPLE_TEI, contentType: 'application/tei+xml', headers: CORS });
      default:
        return route.fulfill({ status: 404, body: '{}', headers: CORS });
    }
  });
});

test('根のコレクションが子を並べ、たどると url= が変わる', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(open());
  // トップには移行元（dts-viewer）と同様に見本エンドポイント（Examples）が並ぶ
  const examples = page.getByTestId('dts-examples');
  await expect(examples).toBeVisible();
  await expect(examples.getByRole('link', { name: /校異源氏物語テキストDB/ })).toBeVisible();
  await expect(examples.getByRole('link', { name: /DraCor/ })).toBeVisible();
  await expect(examples.getByRole('link', { name: /Alpheios/ })).toBeVisible();
  await expect(examples.getByRole('link', { name: /Perseids/ })).toBeVisible();
  await expect(examples.getByRole('link', { name: /Epigraphische Datenbank Heidelberg/ })).toBeVisible();

  await expect(page.getByRole('heading', { level: 2, name: '校異源氏物語テキストDB' })).toBeVisible();
  await expect(page.getByRole('link', { name: /桐壺/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /帚木/ })).toBeVisible();
  // 書誌情報（作成者）
  await expect(page.getByText('裏源氏勉強会')).toBeVisible();

  await page.getByRole('link', { name: /桐壺/ }).click();
  await expect(page).toHaveURL(new RegExp(`url=${encodeURIComponent(RES_URL).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  await expect(page.getByRole('heading', { level: 2, name: '桐壺' })).toBeVisible();

  // 戻るで根に帰る
  await page.goBack();
  await expect(page.getByRole('link', { name: /帚木/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('資料は引用できる単位と viewer / XSL への入口を出す', async ({ page }) => {
  await page.goto(open(`&url=${encodeURIComponent(RES_URL)}`));
  await expect(page.getByRole('heading', { level: 2, name: '桐壺' })).toBeVisible();
  await expect(page.getByText('page > line')).toBeVisible();
  const items = page.locator('li', { hasText: 'page 5' }).first();
  await expect(items).toBeVisible();
  await expect(page.getByText('page 6').first()).toBeVisible();

  // 全体を viewer で開く
  const whole = `${BASE}/document?resource=${RES}`;
  const viewerLink = page.getByRole('link', { name: 'viewer で開く' }).first();
  await expect(viewerLink).toHaveAttribute('href', new RegExp(`/viewer/\\?u=${encodeURIComponent(whole).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
  await expect(page.getByRole('link', { name: 'XSL で開く' }).first()).toHaveAttribute('href', /\/xsl\/\?u=/);

  // 単位 5 の viewer リンクは ref=5 付き
  const unit5 = items.getByRole('link', { name: 'viewer で開く' }).first();
  await expect(unit5).toHaveAttribute('href', new RegExp(encodeURIComponent(`${whole}&ref=5`).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  // 下の単位を開く
  await items.getByRole('button').click();
  await expect(items.getByText('line 0005-01.json')).toBeVisible();

  // viewer のリンクをたどると本文が出る
  await unit5.click();
  await expect(page).toHaveURL(/\/viewer\/\?u=/);
  await expect(page.getByTestId('text-pane')).toBeVisible();
  await expect(page.getByTestId('text-pane').locator('tei-seg#s1')).toHaveText('一行目の本文。');
});

test('入口が壊れているときはメッセージを出す', async ({ page }) => {
  await page.route('https://broken.example.org/**', (route) =>
    route.fulfill({ status: 500, body: 'x', headers: CORS }),
  );
  await page.goto('/ja/dts/?base=https%3A%2F%2Fbroken.example.org%2Fdts');
  await expect(page.getByText('サーバが 500 を返しました')).toBeVisible();
});
