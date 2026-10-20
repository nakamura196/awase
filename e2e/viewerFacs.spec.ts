import { test, expect, type Page } from '@playwright/test';

// 頁の目印（pb@facs）と画像ペインの連動。facsimile の書き方を 2 通り混ぜてある（src/lib/tei/facs.ts）
// - 1・2 頁: koui の書き方（surfaceGrp@facs が manifest、graphic@url が IIIF の画像、pb@facs="#zone"）
// - 3 頁: facsimile に無く、pb@facs に IIIF の切り出しの URL を直接書く
const BASE = 'https://example.org/facs/';
const IIIF = 'https://example.org/iiif/';
const para = (s: string) => `<p>${s.repeat(60)}</p>`;
const TEI = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader><fileDesc><titleStmt><title>画像の見本</title></titleStmt><publicationStmt><p/></publicationStmt><sourceDesc><p/></sourceDesc></fileDesc></teiHeader>
  <facsimile>
    <surfaceGrp facs="${IIIF}manifest.json">
      <surface>
        <graphic n="${IIIF}canvas/1" url="${IIIF}a/full/full/0/default.jpg"/>
        <zone xml:id="z1" ulx="100" uly="0" lrx="200" lry="150"/>
        <zone xml:id="z2" ulx="0" uly="0" lrx="100" lry="150"/>
      </surface>
    </surfaceGrp>
  </facsimile>
  <text><body>
    <pb n="1" facs="#z1"/>${para('一の頁の本文。')}
    <pb n="2" facs="#z2"/>${para('二の頁の本文。')}
    <pb n="3" facs="${IIIF}c/0,0,50,50/full/0/default.jpg"/>${para('三の頁の本文。')}
    <pb n="4"/>${para('四の頁の本文。')}
  </body></text>
</TEI>`;
const PLAIN = TEI.replace(/<facsimile>[\s\S]*<\/facsimile>/, '').replace(/ facs="[^"]*"/g, '');

// 1×1 の PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route(`${BASE}*`, (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const body = name === 'facs.xml' ? TEI : name === 'plain.xml' ? PLAIN : null;
    return body
      ? route.fulfill({ body, contentType: 'application/xml', headers: { 'access-control-allow-origin': '*' } })
      : route.fulfill({ status: 404 });
  });
  await page.route(`${IIIF}**`, (route) => route.fulfill({ body: PNG, contentType: 'image/png' }));
});

const open = (page: Page, extra = '') => page.goto(`/ja/viewer/?u=${encodeURIComponent(`${BASE}facs.xml`)}${extra}`);
const image = (page: Page) => page.getByTestId('image-pane').locator('img');
const label = (page: Page) => page.getByTestId('image-page');

test('開いたときは最初の頁の画像を、その範囲だけ出す', async ({ page }) => {
  await open(page);
  await expect(label(page)).toHaveText('1 頁');
  await expect(image(page)).toHaveAttribute('src', `${IIIF}a/100,0,100,150/100,/0/default.jpg`);
  await expect(page.getByTestId('image-pane').getByRole('link')).toHaveAttribute('href', `${IIIF}manifest.json`);
  await expect(page.locator('tei-pb[n="1"]')).toHaveClass(/is-current/);
  // 画像の無い頁の目印は、押せる見た目にしない
  await expect(page.locator('tei-pb[n="4"]')).not.toHaveAttribute('data-awase-facs', '');
});

test('頁の目印を押すと、その頁の画像に替わる', async ({ page }) => {
  await open(page);
  await page.locator('tei-pb[n="2"] .awase-pb-label').click();
  await expect(label(page)).toHaveText('2 頁');
  await expect(image(page)).toHaveAttribute('src', `${IIIF}a/0,0,100,150/100,/0/default.jpg`);
  await expect(page.locator('tei-pb[n="2"]')).toHaveClass(/is-current/);
});

test('画像ペインで次の頁へ移ると、本文もその頁へ動く（pb@facs に直接書いた画像）', async ({ page }) => {
  await open(page);
  const next = page.getByTestId('image-pane').getByRole('button', { name: '次の頁' });
  await next.click();
  await next.click();
  await expect(label(page)).toHaveText('3 頁');
  await expect(image(page)).toHaveAttribute('src', `${IIIF}c/0,0,50,50/50,/0/default.jpg`);
  // 3 頁の目印が画面の上の方に来ている
  await expect.poll(() => page.locator('tei-pb[n="3"]').evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(200);
  // 4 頁は画像が無いので、その先へは進めない
  await expect(next).toBeDisabled();
});

test('縦書きで本文を読み進めると、画像も付いてくる', async ({ page }) => {
  await open(page, '&dir=v');
  await expect(label(page)).toHaveText('1 頁');
  const pane = page.getByTestId('text-pane');
  // 2 頁の目印を、枠の右端（読み始め）に寄せる
  await pane.evaluate((el) => {
    const pb = el.querySelector('tei-pb[n="2"]')!;
    el.scrollLeft -= el.getBoundingClientRect().right - pb.getBoundingClientRect().right - 10;
  });
  await expect(label(page)).toHaveText('2 頁');
});

test('横書きでページを読み進めると、画像も付いてきて、画面に留まる', async ({ page }) => {
  await open(page);
  await page.locator('tei-pb[n="2"]').evaluate((el) => window.scrollBy(0, el.getBoundingClientRect().top - 20));
  await expect(label(page)).toHaveText('2 頁');
  const top = await page.getByTestId('image-pane').evaluate((el) => el.getBoundingClientRect().top);
  expect(top).toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThan(100);
});

test('「画像」を切ると画像ペインを閉じ、URL に残る', async ({ page }) => {
  await open(page);
  await page.getByRole('toolbar').getByRole('button', { name: '画像' }).click();
  await expect(page.getByTestId('image-pane')).toHaveCount(0);
  await expect(page).toHaveURL(/panes=text/);
  await page.getByRole('toolbar').getByRole('button', { name: '画像' }).click();
  await expect(page.getByTestId('image-pane')).toBeVisible();
});

test('画像の無い TEI では「画像」を出さない', async ({ page }) => {
  await page.goto(`/ja/viewer/?u=${encodeURIComponent(`${BASE}plain.xml`)}`);
  await expect(page.getByTestId('text-pane')).toContainText('一の頁の本文');
  await expect(page.getByRole('toolbar').getByRole('button', { name: '画像' })).toHaveCount(0);
  await expect(page.getByTestId('image-pane')).toHaveCount(0);
});
