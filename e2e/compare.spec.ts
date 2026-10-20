import { test, expect, type Page } from '@playwright/test';

// 比較の画面（compare）。外のサイトは page.route で作り物のマニフェスト 2 つに差し替える。
// 左 A は 2 つの Canvas（文字は「いろはにほへと」と「ちりぬるを」）、右 B は 1 つ（「いるはにほへと」）
const A = 'https://example.org/cmp-a/';
const B = 'https://example.org/cmp-b/';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const canvas = (base: string, n: number, text: string) => ({
  id: `${base}canvas/${n}`,
  type: 'Canvas',
  label: { none: [`p${n}`] },
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
            id: `${base}img${n}/full/max/0/default.jpg`,
            type: 'Image',
            format: 'image/jpeg',
            width: 200,
            height: 150,
            service: [{ id: `${base}img${n}`, type: 'ImageService3', profile: 'level0' }],
          },
        },
      ],
    },
  ],
  annotations: [{ id: `${base}canvas/${n}/annos`, type: 'AnnotationPage', items: [{ id: `${base}canvas/${n}/annos/1`, type: 'Annotation', motivation: 'commenting', target: `${base}canvas/${n}`, body: { type: 'TextualBody', value: text } }] }],
});
const manifest = (base: string, title: string, texts: string[]) => ({
  '@context': 'http://iiif.io/api/presentation/3/context.json',
  id: `${base}manifest.json`,
  type: 'Manifest',
  label: { none: [title] },
  items: texts.map((t, i) => canvas(base, i + 1, t)),
});
const info = (id: string) => ({
  '@context': 'http://iiif.io/api/image/3/context.json',
  id,
  type: 'ImageService3',
  protocol: 'http://iiif.io/api/image',
  profile: 'level0',
  width: 200,
  height: 150,
});
const MANIFESTS: Record<string, unknown> = {
  [`${A}manifest.json`]: manifest(A, '資料A', ['いろはにほへと', 'ちりぬるを']),
  [`${B}manifest.json`]: manifest(B, '資料B', ['いるはにほへと']),
};

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  for (const base of [A, B]) {
    await page.route(`${base}**`, (route) => {
      const url = route.request().url();
      const headers = { 'access-control-allow-origin': '*' };
      if (MANIFESTS[url]) return route.fulfill({ json: MANIFESTS[url], headers });
      if (url.endsWith('/info.json')) return route.fulfill({ json: info(url.replace(/\/info\.json$/, '')), headers });
      if (url.endsWith('/missing.json')) return route.fulfill({ status: 404, headers });
      return route.fulfill({ body: PNG, contentType: 'image/png', headers });
    });
  }
});

const open = (page: Page, extra = '') =>
  page.goto(`/ja/compare/?manifest1=${encodeURIComponent(`${A}manifest.json`)}&manifest2=${encodeURIComponent(`${B}manifest.json`)}${extra}`);
const urlParam = (page: Page, name: string) => new URL(page.url()).searchParams.get(name);

test('既定は文字の差分。違う字が強調され、編集距離が出る', async ({ page }) => {
  await open(page);
  const result = page.getByTestId('diff-result');
  await expect(result).toContainText('いろるはにほへと');
  await expect(result.locator('del')).toHaveText('ろ');
  await expect(result.locator('ins')).toHaveText('る');
  await expect(page.getByTestId('similarity')).toContainText('編集距離 1');
  await expect(page.getByTestId('similarity')).toContainText('85.7%');
  await expect(page.getByRole('tab', { name: '文字の差分' })).toHaveAttribute('aria-selected', 'true');
});

test('左の Canvas を送ると差分が替わり、URL に canvas1 が入る', async ({ page }) => {
  await open(page);
  await page.getByTestId('pager-left').getByRole('button', { name: '次の Canvas' }).click();
  await expect(page.getByTestId('text-left')).toHaveText('ちりぬるを');
  // 右の「いるはにほへと」と共通の「る」だけが残り、あとは削除として強調される
  expect((await page.getByTestId('diff-result').locator('del').allTextContents()).join('')).toBe('ちりぬを');
  await expect.poll(() => urlParam(page, 'canvas1')).toBe(`${A}canvas/2`);
  // URL を直接開いても同じ Canvas が出る
  await page.reload();
  await expect(page.getByTestId('text-left')).toHaveText('ちりぬるを');
});

test('タブで画像に替えると、2 つの画像が出て、URL の mode が 0 になる', async ({ page }) => {
  await open(page);
  await page.getByRole('tab', { name: '画像' }).click();
  const panes = page.getByTestId('image-pane');
  await expect(panes).toHaveCount(2);
  await expect(panes.nth(0)).toHaveAttribute('data-iiif-content', `${A}manifest.json`);
  await expect(panes.nth(0)).toHaveAttribute('data-canvas', `${A}canvas/1`);
  await expect(panes.nth(1)).toHaveAttribute('data-iiif-content', `${B}manifest.json`);
  await expect.poll(() => urlParam(page, 'mode')).toBe('0');
  // 画像のほうの送りでも URL が替わる
  await panes.nth(0).getByRole('button', { name: '次の頁' }).click();
  await expect(panes.nth(0)).toHaveAttribute('data-canvas', `${A}canvas/2`);
  await expect.poll(() => urlParam(page, 'canvas1')).toBe(`${A}canvas/2`);
  await page.getByRole('tab', { name: '文字の差分' }).click();
  await expect.poll(() => urlParam(page, 'mode')).toBe('1');
  await expect.poll(() => urlParam(page, 'canvas1')).toBe(`${A}canvas/2`);
});

test('mode=0 は画像、mode=1 は差分、mode=2（ネットワーク図）は差分と断り書き', async ({ page }) => {
  await open(page, '&mode=0');
  await expect(page.getByTestId('image-pane')).toHaveCount(2);
  await open(page, '&mode=1');
  await expect(page.getByTestId('diff-result')).toBeVisible();
  await expect(page.getByTestId('network-note')).toHaveCount(0);
  await open(page, '&mode=2');
  await expect(page.getByTestId('diff-result')).toBeVisible();
  await expect(page.getByTestId('network-note')).toBeVisible();
});

test('canvas2 と label を URL から受ける', async ({ page }) => {
  await open(page, `&canvas1=${encodeURIComponent(`${A}canvas/2`)}&label1=${encodeURIComponent('左の名前')}`);
  await expect(page.getByTestId('text-left')).toHaveText('ちりぬるを');
  await expect(page.getByText('左の名前')).toBeVisible();
  await expect(page.getByText('資料B')).toBeVisible();
});

test('embed=1 ではサイトの帯を出さない', async ({ page }) => {
  await open(page);
  await expect(page.locator('header')).toHaveCount(1);
  await open(page, '&embed=1');
  await expect(page.getByTestId('diff-result')).toBeVisible();
  await expect(page.locator('header')).toHaveCount(0);
});

test('マニフェストが読めないときは、画面にそのことを出す', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`/ja/compare/?manifest1=${encodeURIComponent(`${A}missing.json`)}&manifest2=${encodeURIComponent(`${B}manifest.json`)}`);
  await expect(page.getByTestId('load-error')).toContainText('左');
  await expect(page.getByTestId('load-error')).toContainText('404');
  expect(errors).toEqual([]);
});

test('入口の欄に入れて「比べる」と、引数が URL に入って開く', async ({ page }) => {
  await page.goto('/ja/compare/');
  await page.locator('#manifest-0').fill(`${A}manifest.json`);
  await page.locator('#label-0').fill('左の名前');
  await page.locator('#manifest-1').fill(`${B}manifest.json`);
  await page.getByRole('button', { name: '比べる' }).click();
  await expect(page.getByTestId('diff-result')).toBeVisible();
  await expect.poll(() => urlParam(page, 'manifest1')).toBe(`${A}manifest.json`);
  await expect.poll(() => urlParam(page, 'label1')).toBe('左の名前');
});
