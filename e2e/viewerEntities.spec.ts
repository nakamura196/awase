import { test, expect } from '@playwright/test';

// 固有名・日付の一覧（entities ペイン、tei_viewer・aozora_tei の人物・地名集計の互換）
const URL_TEI = 'https://example.org/entities/sample.xml';
const filler = '本文の続き。'.repeat(60);
const TEI = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc><titleStmt><title>固有名の見本</title></titleStmt><publicationStmt><p/></publicationStmt><sourceDesc><p/></sourceDesc></fileDesc>
    <profileDesc>
      <particDesc>
        <listPerson>
          <person xml:id="p_genji" sameAs="https://www.wikidata.org/entity/Q1049773">
            <persName>光源氏</persName>
          </person>
        </listPerson>
      </particDesc>
    </profileDesc>
  </teiHeader>
  <text><body><p>
    <persName corresp="#p_genji">源氏の君</persName>は<placeName>二条院</placeName>にゐたまふ。
    ${filler}
    <rs type="person" corresp="#p_genji" xml:id="e_hikaru">光君</rs>は<date when="1008-11-01">寛弘五年十一月一日</date>に参りたまふ。
  </p></body></text>
</TEI>`;

test.beforeEach(async ({ page }) => {
  await page.route(URL_TEI, (route) =>
    route.fulfill({ body: TEI, contentType: 'application/xml', headers: { 'access-control-allow-origin': '*' } }),
  );
});

const open = (page: import('@playwright/test').Page, extra = '') =>
  page.goto(`/ja/viewer/?u=${encodeURIComponent(URL_TEI)}${extra}`);

test('人名・地名・日付があれば、名寄せして頻度順に一覧を出し、種別で絞り込める', async ({ page }) => {
  await open(page);
  const pane = page.getByTestId('entities-pane');
  await expect(pane.getByText('固有名・日付 4 箇所')).toBeVisible();

  // 光源氏は 2 箇所（persName「源氏の君」と rs「光君」が #p_genji で名寄せされ、teiHeader の標準名になる）
  const items = pane.getByRole('listitem');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText('光源氏');
  await expect(items.nth(0)).toContainText('2 箇所');
  // 複数の呼称（「源氏の君」「光君」）の内訳と出現順シーケンスが出る
  await expect(pane.getByTestId('entity-variants')).toContainText('源氏の君');
  await expect(pane.getByTestId('entity-variants')).toContainText('光君');
  await expect(pane.getByTestId('entity-sequence')).toContainText('#1');
  await expect(pane.getByTestId('entity-sequence')).toContainText('#2');
  await expect(items.nth(0).getByRole('link', { name: '外部の典拠を開く' })).toHaveAttribute(
    'href',
    'https://www.wikidata.org/entity/Q1049773',
  );

  // 種別フィルタ
  await pane.getByRole('button', { name: '地名 (1)' }).click();
  await expect(items).toHaveCount(1);
  await expect(items.nth(0)).toContainText('二条院');

  await pane.getByRole('button', { name: 'すべて (3)' }).click();
  await expect(items).toHaveCount(3);
});

test('一覧の行を押すと出現箇所を順送りし、本文の固有名を押すと一覧の行が選ばれる', async ({ page }) => {
  await open(page);
  const pane = page.getByTestId('entities-pane');
  const text = page.getByTestId('text-pane');

  // 光源氏の行を 1 回押すと 1 つ目（xml:id 無し → awase-entity-1）へ、もう一度押すと 2 つ目（xml:id="e_hikaru"）へ移る
  const genjiBtn = pane.getByRole('button', { name: /光源氏/ });
  await genjiBtn.click();
  await expect(page).toHaveURL(/id=awase-entity-1/);
  await expect(text.locator('#awase-entity-1')).toHaveClass(/is-selected/);

  await genjiBtn.click();
  await expect(page).toHaveURL(/id=e_hikaru/);
  await expect(text.locator('#e_hikaru')).toHaveClass(/is-selected/);

  // 本文の「二条院」（2 番目の固有表現 → awase-entity-2）を押すと、一覧で二条院が選ばれる
  await text.locator('tei-placename[data-awase-entity="2"]').click();
  await expect(page).toHaveURL(/id=awase-entity-2/);
  await expect(pane.getByRole('button', { name: /二条院/ })).toHaveAttribute('aria-pressed', 'true');
});

test('ツールバーの「固有名・日付」と panes で出し入れできる', async ({ page }) => {
  await open(page, '&panes=text');
  await expect(page.getByTestId('entities-pane')).toHaveCount(0);
  await page.getByRole('toolbar').getByRole('button', { name: '固有名・日付' }).click();
  await expect(page.getByTestId('entities-pane')).toBeVisible();
});
