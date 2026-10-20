import { test, expect } from '@playwright/test';

// 異文の一覧（apparatus ペイン、koui の互換）。koui の見本と同じ書き方（listWit と app/lem/rdg@wit）
const URL_TEI = 'https://example.org/koui/01.xml';
const filler = '本文の続き。'.repeat(80);
const TEI = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader><fileDesc><titleStmt><title>異文の見本</title></titleStmt><publicationStmt><p/></publicationStmt>
    <sourceDesc><listWit>
      <witness xml:id="底">底本</witness>
      <witness xml:id="甲">甲本</witness>
      <witness xml:id="乙">乙本</witness>
      <witness xml:id="丙">丙本</witness>
    </listWit></sourceDesc></fileDesc></teiHeader>
  <text><body><p>いつれの御時にか<app>
      <lem wit="#底 #甲">給ける</lem>
      <rdg wit="#乙">たまふ</rdg>
    </app>${filler}<app xml:id="v2">
      <lem wit="#底">ありけり</lem>
      <rdg wit="#甲"><del>おはし</del>けり</rdg>
      <rdg wit="#乙"/>
    </app>${filler}<app>
      <lem wit="#底 #甲 #乙 #丙">はじめ</lem>
    </app></p></body></text>
</TEI>`;

test.beforeEach(async ({ page }) => {
  await page.route(URL_TEI, (route) =>
    route.fulfill({ body: TEI, contentType: 'application/xml', headers: { 'access-control-allow-origin': '*' } }),
  );
});

const open = (page: import('@playwright/test').Page, extra = '') => page.goto(`/ja/viewer/?u=${encodeURIComponent(URL_TEI)}${extra}`);

test('listWit と app があれば、異文の一覧を本文の横に出す', async ({ page }) => {
  await open(page);
  const pane = page.getByTestId('apparatus-pane');
  await expect(pane.getByText('異文 3 箇所')).toBeVisible();
  const rows = pane.getByRole('listitem');
  await expect(rows).toHaveCount(3);
  // 1 箇所目: lem に名前の無い丙は、lem の行に薄く出る
  await expect(rows.nth(0)).toContainText('給ける');
  await expect(rows.nth(0)).toContainText('たまふ');
  await expect(rows.nth(0).getByTitle('丙本（名前の無い伝本。底本と同じ読みとみなす）')).toBeVisible();
  // 2 箇所目: del は本文と同じ部品で写し、空の rdg は（なし）
  await expect(rows.nth(1).locator('tei-del')).toHaveText('おはし');
  await expect(rows.nth(1)).toContainText('（なし）');
  // 伝本の一覧
  await pane.getByText('伝本（4）').click();
  await expect(pane.locator('dd', { hasText: '乙本' })).toBeVisible();
});

test('一覧の行を押すと本文のその箇所に印が付き、本文の箇所を押すと一覧の行が選ばれる', async ({ page }) => {
  await open(page);
  const pane = page.getByTestId('apparatus-pane');
  const text = page.getByTestId('text-pane');
  // xml:id のある app はその id、無い app は番号の id で結ぶ
  await pane.getByRole('button', { name: /ありけり/ }).click();
  await expect(page).toHaveURL(/id=v2/);
  await expect(text.locator('#v2')).toHaveClass(/is-selected/);
  await expect(text.locator('#v2')).toBeInViewport();

  await text.locator('tei-app[data-awase-app="3"]').click();
  await expect(page).toHaveURL(/id=awase-app-3/);
  await expect(pane.getByRole('button', { name: /はじめ/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(pane.getByRole('button', { name: /はじめ/ })).toBeInViewport();
});

test('panes を書けば、含むものだけ出す。ツールバーの「異文」で出し入れする', async ({ page }) => {
  await open(page, '&panes=text');
  await expect(page.getByTestId('text-pane')).toBeVisible();
  await expect(page.getByTestId('apparatus-pane')).toHaveCount(0);
  await page.getByRole('button', { name: '異文' }).click();
  await expect(page.getByTestId('apparatus-pane')).toBeVisible();
  expect(new URL(page.url()).searchParams.get('panes')).toBe('text,apparatus');
  // koui の旧 URL の読み替え（panes=text,apparatus）もそのまま開く
  await open(page, '&panes=text,apparatus');
  await expect(page.getByTestId('apparatus-pane')).toBeVisible();
});

test('異文の無い TEI では、一覧もボタンも出ない', async ({ page }) => {
  await page.route('https://example.org/plain.xml', (route) =>
    route.fulfill({
      body: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><p>異文なし</p></body></text></TEI>',
      contentType: 'application/xml',
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
  await page.goto(`/ja/viewer/?u=${encodeURIComponent('https://example.org/plain.xml')}`);
  await expect(page.getByTestId('text-pane')).toContainText('異文なし');
  await expect(page.getByTestId('apparatus-pane')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '異文' })).toHaveCount(0);
});

test('伝本の多い読みは「ほか N 本」に畳み、行を選ぶとすべて出す', async ({ page }) => {
  const url = 'https://example.org/koui/many.xml';
  const ids = ['A', 'B', 'C', 'D', 'E', 'F'];
  await page.route(url, (route) =>
    route.fulfill({
      body: `<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><sourceDesc><listWit>${ids
        .map((id) => `<witness xml:id="${id}">${id}本</witness>`)
        .join('')}</listWit></sourceDesc></fileDesc></teiHeader>
        <text><body><p>はじめ<app><lem wit="#A #B #C #D">給ける</lem><rdg wit="#E">たまふ</rdg></app></p></body></text></TEI>`,
      contentType: 'application/xml',
      headers: { 'access-control-allow-origin': '*' },
    }),
  );
  await page.goto(`/ja/viewer/?u=${encodeURIComponent(url)}`);
  const row = page.getByTestId('apparatus-pane').getByRole('listitem').first();
  // lem の 4 本と、名前の無い F の 5 本のうち、先頭の 3 本だけ見せる
  const more = row.getByText('ほか 2 本');
  await expect(more).toBeVisible();
  await expect(more).toHaveAttribute('title', 'D本、F本（名前の無い伝本。底本と同じ読みとみなす）');
  await expect(row.getByTitle('D本', { exact: true })).toHaveCount(0);
  await row.getByRole('button').click();
  await expect(row.getByText('ほか 2 本')).toHaveCount(0);
  await expect(row.getByTitle('D本', { exact: true })).toBeVisible();
  await expect(row.getByTitle('F本（名前の無い伝本。底本と同じ読みとみなす）')).toBeVisible();
});

test('伝本を選ぶと、本文の異文の箇所がその伝本の読みに替わる（?wit=）', async ({ page }) => {
  await open(page);
  const pane = page.getByTestId('apparatus-pane');
  const text = page.getByTestId('text-pane');
  const first = text.locator('tei-app[data-awase-app="1"]');
  await expect(first.locator('tei-lem')).toBeVisible();
  await expect(first.locator('tei-rdg')).toBeHidden();

  await pane.getByRole('combobox').selectOption('乙');
  await expect(page).toHaveURL(/wit=%E4%B9%99/);
  // 1 箇所目は 乙 の読み、lem と違うので印が付く
  await expect(first.locator('tei-rdg')).toBeVisible();
  await expect(first.locator('tei-lem')).toBeHidden();
  await expect(first).toHaveAttribute('data-awase-variant', '');
  // 3 箇所目は lem に 乙 の名前があるので lem のまま
  const third = text.locator('tei-app[data-awase-app="3"]');
  await expect(third.locator('tei-lem')).toBeVisible();
  await expect(third).not.toHaveAttribute('data-awase-variant');
  // 一覧でも、本文に見せている読みに印が付く
  await expect(pane.getByRole('listitem').first().locator('[data-awase-chosen]')).toContainText('たまふ');

  // 丙は名前が無いので、どこも lem のまま。URL から直に開いても同じ
  await open(page, `&wit=${encodeURIComponent('丙')}`);
  await expect(pane.getByRole('combobox')).toHaveValue('丙');
  await expect(first.locator('tei-lem')).toBeVisible();
  await expect(text.locator('[data-awase-variant]')).toHaveCount(0);

  // 底本に戻すと、URL から wit が消える
  await pane.getByRole('combobox').selectOption('');
  await expect(page).not.toHaveURL(/wit=/);
});
