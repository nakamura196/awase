import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// 並べた列どうしの対応（@corresp）と、PTV の config.json。TEI は見本（e2e/fixtures/linked-*.xml）を返す
const BASE = 'https://example.org/ptv/';
const FILES: Record<string, { body: string; type: string }> = {
  'config.json': {
    body: JSON.stringify({ url_main: 'main.xml', url_sub: `${BASE}sub.xml`, direction: 'horizontal', query_main: 'line[*|id]' }),
    type: 'application/json',
  },
  'main.xml': { body: readFileSync(path.join(__dirname, 'fixtures/linked-main.xml'), 'utf-8'), type: 'application/xml' },
  'sub.xml': { body: readFileSync(path.join(__dirname, 'fixtures/linked-sub.xml'), 'utf-8'), type: 'application/xml' },
};

test.beforeEach(async ({ page }) => {
  await page.route(`${BASE}*`, (route) => {
    const f = FILES[new URL(route.request().url()).pathname.split('/').pop() ?? ''];
    return f
      ? route.fulfill({ body: f.body, contentType: f.type, headers: { 'access-control-allow-origin': '*' } })
      : route.fulfill({ status: 404 });
  });
});

const highlighted = (page: Page) =>
  page.evaluate(() => [...(CSS.highlights.get('awase-link') ?? [])].map((r) => (r as Range).toString().trim()));

test('config.json を、束ねている本文と訳の列に開く', async ({ page }) => {
  await page.goto(`/ja/viewer/?u=${encodeURIComponent(`${BASE}config.json`)}`);
  await expect(page.getByRole('heading', { level: 2, name: '対応の見本・本文' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: '対応の見本・訳' })).toBeVisible();
  // 開いた形を URL に残す（相対の url_main は config の場所で解決）
  const params = new URL(page.url()).searchParams;
  expect(params.getAll('u')).toEqual([`${BASE}main.xml`, `${BASE}sub.xml`]);
  expect(params.get('dir')).toBe('h');
});

test('訳の文を押すと、本文の目印から次の目印までが光る', async ({ page }) => {
  await page.goto(`/ja/viewer/?u=${encodeURIComponent(`${BASE}main.xml`)}&u=${encodeURIComponent(`${BASE}sub.xml`)}`);
  const [main, sub] = [page.getByTestId('text-pane').nth(0), page.getByTestId('text-pane').nth(1)];
  await sub.locator('tei-s#t1').click();
  await expect(page).toHaveURL(/id=t1/);
  await expect(sub.locator('tei-s#t1')).toHaveClass(/is-selected/);
  await expect(main.locator('tei-anchor[corresp$="#t1"]')).toHaveClass(/is-selected/);
  // 次の目印（t2）の手前まで。行をまたぐ
  expect(await highlighted(page)).toEqual([expect.stringMatching(/^一つ目の本文。\s*続き。$/)]);

  // 要素ごと対応しているものは、要素に印が付く
  await sub.locator('tei-s#t3').click();
  await expect(main.locator('tei-seg[corresp="#t3"]')).toHaveClass(/is-selected/);
  await expect(main.locator('tei-anchor.is-selected')).toHaveCount(0);
});

test('本文を押すと、直前の目印が指す訳の文が光る', async ({ page }) => {
  await page.goto(`/ja/viewer/?u=${encodeURIComponent(`${BASE}main.xml`)}&u=${encodeURIComponent(`${BASE}sub.xml`)}`);
  const [main, sub] = [page.getByTestId('text-pane').nth(0), page.getByTestId('text-pane').nth(1)];
  await expect(sub.locator('tei-s#t2')).toBeVisible();
  // 「二つ目の本文。」は t2 の目印の後
  await main.getByText('二つ目の本文。').click({ position: { x: 60, y: 5 } });
  await expect(page).toHaveURL(/id=t2/);
  await expect(sub.locator('tei-s#t2')).toHaveClass(/is-selected/);

  await main.locator('tei-seg[corresp="#t3"]').click();
  await expect(sub.locator('tei-s#t3')).toHaveClass(/is-selected/);

  // 最初の目印より前は、対応が無いので行の id を選ぶ
  await main.getByText('はじめの前置き。').click({ position: { x: 5, y: 5 } });
  await expect(page).toHaveURL(/id=m1/);
  await expect(sub.locator('.is-selected')).toHaveCount(0);
});
