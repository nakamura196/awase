import { test, expect, type Page } from '@playwright/test';

// 異文の箇所の画像（app@facs、koui の互換 4/4）と、Canvas id の www の有無の違い（src/lib/tei/facs.ts の matchCanvas）。
// koui の見本（01_with_wit_images.xml）に合わせ、TEI の側の manifest と graphic@n は www 付き、マニフェストの Canvas id は www 無しにする。
// 2 つ目の異文は、2 つの資料（別のマニフェスト）の範囲を指す
const BASE = 'https://example.org/appfacs/';
const IIIF = 'https://example.org/iiif/';
const WWW = 'https://www.example.org/iiif/';
const OTHER = 'https://example.org/other/';
const para = (s: string) => `<p>${s.repeat(40)}</p>`;
const TEI = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader><fileDesc><titleStmt><title>異文の画像の見本</title></titleStmt><publicationStmt><p/></publicationStmt>
    <sourceDesc><listWit><witness xml:id="甲">甲本</witness><witness xml:id="乙">乙本</witness></listWit></sourceDesc></fileDesc></teiHeader>
  <facsimile>
    <surfaceGrp facs="${WWW}manifest.json">
      <surface>
        <graphic n="${WWW}canvas/1" url="${WWW}a/full/full/0/default.jpg"/>
        <zone xml:id="z1" ulx="0" uly="0" lrx="200" lry="150"/>
      </surface>
      <surface>
        <graphic n="${WWW}canvas/2" url="${WWW}b/full/full/0/default.jpg"/>
        <zone xml:id="z2" ulx="0" uly="0" lrx="200" lry="150"/>
        <zone xml:id="zone_app_a" ulx="10" uly="20" lrx="40" lry="80"/>
      </surface>
    </surfaceGrp>
    <surfaceGrp facs="${OTHER}manifest.json">
      <surface>
        <graphic n="${OTHER}canvas/1" url="${OTHER}c/full/full/0/default.jpg"/>
        <zone xml:id="zone_app_b" ulx="50" uly="60" lrx="70" lry="100"/>
      </surface>
    </surfaceGrp>
  </facsimile>
  <text><body>
    <pb n="1" facs="#z1"/>${para('一の頁の本文。')}
    <p><app><lem wit="#甲">いづれの</lem><rdg wit="#乙">いつれの</rdg></app>御時にか</p>
    <pb n="2" facs="#z2"/>${para('二の頁の本文。')}
    <p><app facs="#zone_app_a #zone_app_b #nothing"><lem wit="#甲">事ある時</lem><rdg wit="#乙">ことゝある時</rdg></app>は</p>
  </body></text>
</TEI>`;

// 1×1 の PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const canvas = (base: string, n: number, image: string) => ({
  id: `${base}canvas/${n}`,
  type: 'Canvas',
  width: 200,
  height: 150,
  items: [
    {
      id: `${base}canvas/${n}/page`,
      type: 'AnnotationPage',
      items: [
        {
          id: `${base}canvas/${n}/page/image`,
          type: 'Annotation',
          motivation: 'painting',
          target: `${base}canvas/${n}`,
          body: {
            id: `${base}${image}/full/max/0/default.jpg`,
            type: 'Image',
            format: 'image/jpeg',
            width: 200,
            height: 150,
            service: [{ id: `${base}${image}`, type: 'ImageService3', profile: 'level0' }],
          },
        },
      ],
    },
  ],
});
const manifest = (base: string, canvases: ReturnType<typeof canvas>[]) => ({
  '@context': 'http://iiif.io/api/presentation/3/context.json',
  id: `${base}manifest.json`,
  type: 'Manifest',
  label: { none: ['異文の画像の見本'] },
  items: canvases,
});
// www 付きの URL で頼まれても、中の id は www 無し（国立国会図書館と同じ）
const MANIFEST = manifest(IIIF, [canvas(IIIF, 1, 'a'), canvas(IIIF, 2, 'b')]);
const OTHER_MANIFEST = manifest(OTHER, [canvas(OTHER, 1, 'c')]);

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  const headers = { 'access-control-allow-origin': '*' };
  await page.route(`${BASE}*`, (route) =>
    route.request().url().endsWith('/app.xml')
      ? route.fulfill({ body: TEI, contentType: 'application/xml', headers })
      : route.fulfill({ status: 404 }),
  );
  for (const [host, json] of [
    [IIIF, MANIFEST],
    [WWW, MANIFEST],
    [OTHER, OTHER_MANIFEST],
  ] as const) {
    await page.route(`${host}**`, (route) =>
      route.request().url().endsWith('/manifest.json')
        ? route.fulfill({ json, headers })
        : route.fulfill({ body: PNG, contentType: 'image/png', headers }),
    );
  }
});

const open = (page: Page, extra = '') => page.goto(`/ja/viewer/?u=${encodeURIComponent(`${BASE}app.xml`)}${extra}`);
const pane = (page: Page) => page.getByTestId('image-pane');
const shows = async (page: Page, content: string, canvasId: string, xywh: string) => {
  await expect(pane(page)).toHaveAttribute('data-iiif-content', content);
  await expect(pane(page)).toHaveAttribute('data-canvas', canvasId);
  await expect(pane(page)).toHaveAttribute('data-xywh', xywh);
};
const apparatus = (page: Page) => page.getByTestId('apparatus-pane');

test('www 付きの graphic@n でも、マニフェストの Canvas を引いて開く', async ({ page }) => {
  await open(page);
  await shows(page, `${WWW}manifest.json`, `${IIIF}canvas/1`, '0,0,200,150');
  await page.locator('tei-pb[n="2"] .awase-pb-label').click();
  await shows(page, `${WWW}manifest.json`, `${IIIF}canvas/2`, '0,0,200,150');
  // ビューアが Canvas を見つけている（1 枚目のままにならない）
  await expect(pane(page).getByText('2 / 2')).toBeVisible({ timeout: 30_000 });
});

test('画像のある異文の箇所を選ぶと、その範囲を出し、資料ごとに切り替えられる', async ({ page }) => {
  await open(page);
  const rows = apparatus(page).locator('[data-awase-entry]');
  // 画像の範囲がある箇所にだけ印を付ける
  await expect(rows.nth(0).locator('[data-awase-imaged]')).toHaveCount(0);
  await expect(rows.nth(1).locator('[data-awase-imaged]')).toHaveCount(1);
  await rows.nth(1).getByRole('button').click();

  const place = page.getByTestId('place-images');
  // 引けない参照（#nothing）は数えない
  await expect(place).toContainText('異文 2 の画像（1 / 2）');
  await expect(pane(page)).toHaveAttribute('data-place', '2');
  await shows(page, `${WWW}manifest.json`, `${IIIF}canvas/2`, '10,20,30,60');

  await place.getByRole('button', { name: '次の画像' }).click();
  await expect(place).toContainText('（2 / 2）');
  await shows(page, `${OTHER}manifest.json`, `${OTHER}canvas/1`, '50,60,20,40');
  await expect(pane(page).getByRole('link')).toHaveAttribute('href', `${OTHER}manifest.json`);

  // 頁の画像に戻し、もう一度開ける
  await place.getByRole('button', { name: '頁の画像に戻る' }).click();
  await expect(pane(page)).not.toHaveAttribute('data-place', /.*/);
  await expect(pane(page)).toHaveAttribute('data-xywh', '0,0,200,150');
  await place.getByRole('button', { name: /異文 2 の画像/ }).click();
  await expect(pane(page)).toHaveAttribute('data-place', '2');
});

test('画像の無い箇所を選ぶと頁の画像のまま。URL の id で開いても箇所の画像を出す', async ({ page }) => {
  await open(page, '&id=awase-app-1');
  await expect(page.getByTestId('place-images')).toHaveCount(0);
  await expect(pane(page)).not.toHaveAttribute('data-place', /.*/);

  await open(page, '&id=awase-app-2');
  await expect(pane(page)).toHaveAttribute('data-place', '2');
  // 頁を送ると、箇所の画像は閉じる
  await pane(page).getByRole('button', { name: '前の頁' }).click();
  await expect(pane(page)).not.toHaveAttribute('data-place', /.*/);
  await expect(page.getByTestId('image-page')).toHaveText('1 頁');
});
