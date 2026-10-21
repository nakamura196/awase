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
  await expect(page.getByRole('heading', { level: 1, name: /表示スタイル|XSL/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /校異源氏物語/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /三つの宝/ })).toBeVisible();
});

// OCR の翻刻ビュー。影印の画像を OpenSeadragon（CDN）で出す。iframe の srcdoc の中で動くかを見る。
// 画像は TEI の置き場所を基準に解決される（images/f1.png → https://example.org/tei/images/f1.png）
test('OCR ビューは影印の画像を出し、頁送りで次の画像に替わる', async ({ page }) => {
  const OCR_URL = 'https://example.org/tei/ocr.xml';
  const asked: string[] = [];
  await page.route(OCR_URL, (route) =>
    route.fulfill({
      body: readFileSync(path.join(__dirname, 'fixtures/ocr.xml'), 'utf-8'),
      contentType: 'application/xml',
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
  for (const n of [1, 2]) {
    await page.route(`https://example.org/tei/images/f${n}.png`, (route) => {
      asked.push(`f${n}`);
      return route.fulfill({
        body: readFileSync(path.join(__dirname, `fixtures/ocr-f${n}.png`)),
        contentType: 'image/png',
        headers: { 'access-control-allow-origin': '*' },
      });
    });
  }
  await page.goto(`/ja/xsl/?u=${encodeURIComponent(OCR_URL)}`);
  const frame = page.frameLocator('[data-testid="xsl-frame"]');
  // xsl を書かなくても、影印つきなので ocr になる。画像が描かれると canvas ができる
  await expect(frame.locator('.facsimile canvas').first()).toBeVisible();
  await expect.poll(() => asked).toContain('f1');
  await frame.getByRole('button', { name: /次へ/ }).click();
  await expect(frame.locator('.tei-page-active .facsimile canvas')).toBeVisible();
  await expect.poll(() => asked).toContain('f2');
});

test('LINE風 対話ビュー（xsl=line）を選択でき、東洋文庫固有の XSL（urenja / vellum / manchu）は選択肢に出ない', async ({ page }) => {
  await page.goto(open('&xsl=line'));
  const select = page.getByLabel('変換');
  await expect(select).toHaveValue('line');
  const optionValues = await select.locator('option').evaluateAll((opts) => opts.map((o) => (o as HTMLOptionElement).value));
  expect(optionValues).toContain('line');
  expect(optionValues).not.toContain('urenja');
  expect(optionValues).not.toContain('vellum');
  expect(optionValues).not.toContain('manchu');
  await expect(page.locator('[data-testid="xsl-line-view"]')).toBeVisible();
  await expect(page.locator('[data-testid="xsl-line-view"]')).toContainText('一行目の本文。');
});

test('固有表現・地図のサイドパネルを XSL 画面で切り替えられる', async ({ page }) => {
  const MAP_TEI_URL = 'https://example.org/tei/wakozukan-like.xml';
  const mapTeiXml = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc><titleStmt><title>蒋洲咨文</title></titleStmt><publicationStmt><p>p</p></publicationStmt><sourceDesc><p>s</p></sourceDesc></fileDesc>
    <profileDesc>
      <particDesc>
        <listPerson>
          <person xml:id="徳陽">
            <persName>徳陽</persName>
            <note type="schema:description">日本僧</note>
          </person>
        </listPerson>
      </particDesc>
      <settingDesc>
        <listPlace>
          <place xml:id="五島">
            <placeName>五島</placeName>
            <location><geo>32.695 128.84</geo></location>
            <note type="schema:description">五島列島</note>
          </place>
        </listPlace>
      </settingDesc>
    </profileDesc>
  </teiHeader>
  <text>
    <body>
      <div type="釈文">
        <p><persName corresp="徳陽">徳陽</persName>が<placeName corresp="#五島">五島</placeName>に至る。</p>
      </div>
    </body>
  </text>
</TEI>`;
  await page.route(MAP_TEI_URL, (route) =>
    route.fulfill({ body: mapTeiXml, contentType: 'application/xml', headers: { 'access-control-allow-origin': '*' } }),
  );
  await page.goto(`/ja/xsl/?u=${encodeURIComponent(MAP_TEI_URL)}&xsl=reading`);
  await expect(page.locator('[data-testid="xsl-side-panes"]')).toBeVisible();
  await expect(page.locator('[data-testid="map-pane"]')).toBeVisible();
  await expect(page.locator('[data-testid="entities-pane"]')).toBeVisible();
  await expect(page.locator('[data-testid="entities-pane"]')).toContainText('日本僧');
  // 縦書き切り替えボタンがあり、初期状態で有効（日本語テキスト）になっている
  const vBtn = page.getByRole('button', { name: '縦書き' });
  await expect(vBtn).toHaveAttribute('aria-pressed', 'true');
  const frame = page.frameLocator('[data-testid="xsl-frame"]');
  await expect(frame.locator('html')).toHaveClass(/is-vertical/);
  await vBtn.click();
  await expect(vBtn).toHaveAttribute('aria-pressed', 'false');
  await expect(frame.locator('html')).not.toHaveClass(/is-vertical/);
});
