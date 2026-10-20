import { test, expect, type Page } from '@playwright/test';

// 頁の目印（pb@facs）と画像ペインの連動。facsimile の書き方を 2 通り混ぜてある（src/lib/tei/facs.ts）
// - 1・2 頁: koui の書き方（surfaceGrp@facs が manifest、graphic@url が IIIF の画像、pb@facs="#zone"）
// - 3 頁: facsimile に無く、pb@facs に IIIF の切り出しの URL を直接書く（ビューアは info.json を開く）
// - 5 頁: koui の書き方で、マニフェストの 2 枚目の Canvas
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
      <surface>
        <graphic n="${IIIF}canvas/2" url="${IIIF}b/full/full/0/default.jpg"/>
        <zone xml:id="z5" ulx="0" uly="0" lrx="200" lry="150"/>
      </surface>
    </surfaceGrp>
  </facsimile>
  <text><body>
    <pb n="1" facs="#z1"/>${para('一の頁の本文。')}
    <pb n="2" facs="#z2"/>${para('二の頁の本文。')}
    <pb n="3" facs="${IIIF}c/0,0,50,50/full/0/default.jpg"/>${para('三の頁の本文。')}
    <pb n="4"/>${para('四の頁の本文。')}
    <pb n="5" facs="#z5"/>${para('五の頁の本文。')}
  </body></text>
</TEI>`;
const PLAIN = TEI.replace(/<facsimile>[\s\S]*<\/facsimile>/, '').replace(/ facs="[^"]*"/g, '');

// 1×1 の PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const canvas = (n: number, image: string) => ({
  id: `${IIIF}canvas/${n}`,
  type: 'Canvas',
  width: 200,
  height: 150,
  items: [
    {
      id: `${IIIF}canvas/${n}/page`,
      type: 'AnnotationPage',
      items: [
        {
          id: `${IIIF}canvas/${n}/page/image`,
          type: 'Annotation',
          motivation: 'painting',
          target: `${IIIF}canvas/${n}`,
          body: {
            id: `${IIIF}${image}/full/max/0/default.jpg`,
            type: 'Image',
            format: 'image/jpeg',
            width: 200,
            height: 150,
            service: [{ id: `${IIIF}${image}`, type: 'ImageService3', profile: 'level0' }],
          },
        },
      ],
    },
  ],
});
const MANIFEST = {
  '@context': 'http://iiif.io/api/presentation/3/context.json',
  id: `${IIIF}manifest.json`,
  type: 'Manifest',
  label: { none: ['画像の見本'] },
  items: [canvas(1, 'a'), canvas(2, 'b')],
};
const info = (id: string) => ({
  '@context': 'http://iiif.io/api/image/3/context.json',
  id,
  type: 'ImageService3',
  protocol: 'http://iiif.io/api/image',
  profile: 'level0',
  width: 200,
  height: 150,
});

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route(`${BASE}*`, (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const body = name === 'facs.xml' ? TEI : name === 'plain.xml' ? PLAIN : null;
    return body
      ? route.fulfill({ body, contentType: 'application/xml', headers: { 'access-control-allow-origin': '*' } })
      : route.fulfill({ status: 404 });
  });
  await page.route(`${IIIF}**`, (route) => {
    const url = route.request().url();
    const headers = { 'access-control-allow-origin': '*' };
    if (url.endsWith('/manifest.json')) return route.fulfill({ json: MANIFEST, headers });
    if (url.endsWith('/info.json')) return route.fulfill({ json: info(url.replace(/\/info\.json$/, '')), headers });
    return route.fulfill({ body: PNG, contentType: 'image/png', headers });
  });
});

const open = (page: Page, extra = '') => page.goto(`/ja/viewer/?u=${encodeURIComponent(`${BASE}facs.xml`)}${extra}`);
const pane = (page: Page) => page.getByTestId('image-pane');
// ビューアに渡したもの（開いた IIIF と、寄せる Canvas・範囲）
const shows = async (page: Page, content: string, canvas: string, xywh: string) => {
  await expect(pane(page)).toHaveAttribute('data-iiif-content', content);
  await expect(pane(page)).toHaveAttribute('data-canvas', canvas);
  await expect(pane(page)).toHaveAttribute('data-xywh', xywh);
};
const label = (page: Page) => page.getByTestId('image-page');

test('開いたときは最初の頁の画像を、その範囲だけ出す', async ({ page }) => {
  await open(page);
  await expect(label(page)).toHaveText('1 頁');
  await shows(page, `${IIIF}manifest.json`, `${IIIF}canvas/1`, '100,0,100,150');
  await expect(page.getByTestId('image-pane').getByRole('link')).toHaveAttribute('href', `${IIIF}manifest.json`);
  await expect(page.locator('tei-pb[n="1"]')).toHaveClass(/is-current/);
  // 画像の無い頁の目印は、押せる見た目にしない
  await expect(page.locator('tei-pb[n="4"]')).not.toHaveAttribute('data-awase-facs', '');
});

test('頁の目印を押すと、その頁の画像に替わる', async ({ page }) => {
  await open(page);
  await page.locator('tei-pb[n="2"] .awase-pb-label').click();
  await expect(label(page)).toHaveText('2 頁');
  await shows(page, `${IIIF}manifest.json`, `${IIIF}canvas/1`, '0,0,100,150');
  await expect(page.locator('tei-pb[n="2"]')).toHaveClass(/is-current/);
});

test('画像ペインで次の頁へ移ると、本文もその頁へ動く（pb@facs に直接書いた画像）', async ({ page }) => {
  await open(page);
  const next = page.getByTestId('image-pane').getByRole('button', { name: '次の頁' });
  await next.click();
  await next.click();
  await expect(label(page)).toHaveText('3 頁');
  await shows(page, `${IIIF}c/info.json`, `${IIIF}c/canvas/1`, '0,0,50,50');
  // 3 頁の目印が画面の上の方に来ている
  await expect.poll(() => page.locator('tei-pb[n="3"]').evaluate((el) => el.getBoundingClientRect().top)).toBeLessThan(200);
  // 4 頁は画像が無いので飛ばし、5 頁へ移る。その先は無い
  await next.click();
  await expect(label(page)).toHaveText('5 頁');
  await expect(next).toBeDisabled();
});

test('ビューアの側で次の画像へめくると、その画像の頁へ本文も動く', async ({ page }) => {
  await open(page);
  // ビューアの頁送りは隠してある（頁送りは awase の 1 組だけ）。ビューアの中でめくるのはキーで
  await expect(pane(page).locator('[data-iiif-stage] img')).toBeVisible({ timeout: 30_000 });
  await expect(pane(page).getByRole('group', { name: '頁送り' })).toHaveCount(1);
  await pane(page).locator('[data-iiif-stage]').click();
  await page.keyboard.press('PageDown');
  await expect(label(page)).toHaveText('5 頁');
  await expect(page.locator('tei-pb[n="5"]')).toHaveClass(/is-current/);
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

test('横書きで本文を読み進めると、画像も付いてくる。ページ全体は動かない', async ({ page }) => {
  await open(page);
  const pane = page.getByTestId('text-pane');
  const imageTop = await page.getByTestId('image-pane').evaluate((el) => el.getBoundingClientRect().top);
  // 2 頁の目印を、枠の上端（読み始め）に寄せる
  await pane.evaluate((el) => {
    const pb = el.querySelector('tei-pb[n="2"]')!;
    el.scrollTop += pb.getBoundingClientRect().top - el.getBoundingClientRect().top - 10;
  });
  await expect(label(page)).toHaveText('2 頁');
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await page.getByTestId('image-pane').evaluate((el) => el.getBoundingClientRect().top)).toBe(imageTop);
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

// PTV の絵入源氏の書き方。pb が無く、本文の行が sourceDoc の範囲（zone）に収まっている。範囲を頁として扱う
const SOURCE_DOC = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader><fileDesc><titleStmt><title>範囲ごとの本文</title></titleStmt><publicationStmt><p/></publicationStmt><sourceDesc><p/></sourceDesc></fileDesc></teiHeader>
  <sourceDoc>
    <surfaceGrp facs="${IIIF}manifest.json">
      <surface>
        <graphic n="${IIIF}canvas/1" url="${IIIF}a/full/full/0/default.jpg"/>
        <zone xml:id="zone_1" ulx="100" uly="0" lrx="200" lry="150">${'<lb/><line>一の範囲の行。</line>'.repeat(20)}</zone>
        <zone xml:id="zone_2" ulx="0" uly="0" lrx="100" lry="150">${'<lb/><line>二の範囲の行。</line>'.repeat(20)}</zone>
      </surface>
      <surface>
        <graphic n="${IIIF}canvas/2" url="${IIIF}b/full/full/0/default.jpg"/>
        <zone xml:id="zone_3" ulx="0" uly="0" lrx="200" lry="150"/>
        <zone xml:id="zone_4" ulx="0" uly="0" lrx="200" lry="150">${'<lb/><line>三の範囲の行。</line>'.repeat(20)}</zone>
      </surface>
    </surfaceGrp>
  </sourceDoc>
</TEI>`;

test('pb が無く本文が範囲（zone）ごとに書かれていれば、範囲を頁にして画像を出す（PTV の絵入源氏）', async ({ page }) => {
  await page.route(`${BASE}sourcedoc.xml`, (route) =>
    route.fulfill({ body: SOURCE_DOC, contentType: 'application/xml', headers: { 'access-control-allow-origin': '*' } }),
  );
  await page.goto(`/ja/viewer/?u=${encodeURIComponent(`${BASE}sourcedoc.xml`)}`);
  await expect(page.getByTestId('text-pane')).toContainText('一の範囲の行');
  // 本文の無い範囲（zone_3）は頁にしない
  await expect(page.locator('tei-pb')).toHaveCount(3);
  await expect(label(page)).toHaveText('1 / 3');
  await shows(page, `${IIIF}manifest.json`, `${IIIF}canvas/1`, '100,0,100,150');
  const next = pane(page).getByRole('button', { name: '次の頁' });
  await next.click();
  await shows(page, `${IIIF}manifest.json`, `${IIIF}canvas/1`, '0,0,100,150');
  await next.click();
  await shows(page, `${IIIF}manifest.json`, `${IIIF}canvas/2`, '0,0,200,150');
  await expect(next).toBeDisabled();
});
