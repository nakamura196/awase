import { expect, test, type Page } from '@playwright/test';

const SPEECH_XML = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>対話テスト</title></titleStmt>
      <publicationStmt><p>Awase</p></publicationStmt>
      <sourceDesc><p>見本</p></sourceDesc>
    </fileDesc>
    <profileDesc>
      <particDesc>
        <listPerson>
          <person xml:id="p1"><persName>太郎</persName></person>
          <person xml:id="p2"><persName>花子</persName></person>
        </listPerson>
      </particDesc>
    </profileDesc>
  </teiHeader>
  <text>
    <body>
      <sp who="#p1">
        <speaker>太郎</speaker>
        <stage>笑顔で</stage>
        <p>おはようございます。</p>
      </sp>
      <p>すると彼女は言った。<said who="#p2">いい天気ですね。</said></p>
      <sp who="#p1">
        <speaker>太郎</speaker>
        <p>散歩に行きましょう。</p>
      </sp>
    </body>
  </text>
</TEI>`;

const LETTER_XML = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>夏目漱石書簡</title></titleStmt>
      <publicationStmt><p>Awase</p></publicationStmt>
      <sourceDesc><p>見本</p></sourceDesc>
    </fileDesc>
    <profileDesc>
      <correspDesc xml:id="letter1">
        <correspAction type="sent">
          <persName>夏目漱石</persName>
          <placeName ref="#tokyo">東京</placeName>
          <date when="1914-08-01">大正三年八月一日</date>
        </correspAction>
        <correspAction type="received">
          <persName>正岡子規</persName>
          <placeName ref="#matsuyama">松山</placeName>
          <date when="1914-08-04">大正三年八月四日</date>
        </correspAction>
      </correspDesc>
      <settingDesc>
        <listPlace>
          <place xml:id="tokyo">
            <placeName>東京</placeName>
            <location><geo>35.6895 139.6917</geo></location>
          </place>
          <place xml:id="matsuyama">
            <placeName>松山</placeName>
            <location><geo>33.8392 132.7657</geo></location>
          </place>
        </listPlace>
      </settingDesc>
    </profileDesc>
  </teiHeader>
  <text>
    <body>
      <p><date when="1914-07-20">七月二十日</date>に<placeName ref="#tokyo">東京</placeName>を発ち、<placeName ref="#matsuyama">松山</placeName>へ向かった。</p>
    </body>
  </text>
</TEI>`;

async function openXml(page: Page, url: string, xml: string, extra = '') {
  await page.route(url, (route) =>
    route.fulfill({ status: 200, contentType: 'application/xml; charset=utf-8', body: xml }),
  );
  await page.goto(`/ja/viewer/?u=${encodeURIComponent(url)}${extra}`);
  await expect(page.getByTestId('text-pane')).toBeVisible();
}

test('発話（sp・said）を話者ごとに集計し、本文と行き来できる', async ({ page }) => {
  await openXml(page, 'https://example.org/tei/speech.xml', SPEECH_XML, '&panes=text,speech');
  const pane = page.getByTestId('speech-pane');
  await expect(pane).toBeVisible();
  await expect(pane).toContainText('発話 3 箇所');
  await expect(pane).toContainText('話者（2）');
  await expect(pane.getByTestId('speech-timeline')).toBeVisible();
  await expect(pane.getByRole('button', { name: '文字数順' })).toBeVisible();

  const items = pane.getByTestId('speech-item');
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText('太郎');
  await expect(items.nth(0)).toContainText('笑顔で');
  await expect(items.nth(0)).toContainText('おはようございます。');
  await expect(items.nth(1)).toContainText('花子');
  await expect(items.nth(1)).toContainText('いい天気ですね。');

  // 発話の行を押すと本文の要素に印が付く
  await items.nth(1).click();
  await expect(page).toHaveURL(/id=awase-speech-2/);
  await expect(page.locator('#awase-speech-2')).toHaveClass(/is-selected/);

  // 本文の最初の sp を押すと一覧の 1 番目が選ばれる
  await page.locator('#awase-speech-1').click();
  await expect(items.nth(0)).toHaveAttribute('aria-current', 'true');
});

test('書簡（correspDesc）と座標（geo）・日付（date）から地図・年表ペインを出し、本文と結ぶ', async ({ page }) => {
  await openXml(page, 'https://example.org/tei/letter.xml', LETTER_XML, '&panes=text,map,timeline');

  const mapPane = page.getByTestId('map-pane');
  await expect(mapPane).toBeVisible();
  await expect(mapPane).toContainText('地点 2 箇所');
  await expect(mapPane.getByTestId('corresp-summary')).toContainText('夏目漱石');
  await expect(mapPane.getByTestId('corresp-summary')).toContainText('正岡子規');

  // 地点の一覧から「松山」を押すと本文の placeName が選ばれる
  const placeList = mapPane.getByTestId('map-place-list');
  await placeList.getByRole('button', { name: /松山/ }).click();
  await expect(page).toHaveURL(/id=awase-entity-3/);
  await expect(page.locator('#awase-entity-3')).toHaveClass(/is-selected/);

  // 年表ペインは時系列順（1914-07-20 → 1914-08-01 → 1914-08-04）に並ぶ
  const timelinePane = page.getByTestId('timeline-pane');
  await expect(timelinePane).toBeVisible();
  await expect(timelinePane).toContainText('年表 3 件');
  const tlItems = timelinePane.getByTestId('timeline-item');
  await expect(tlItems).toHaveCount(3);
  await expect(tlItems.nth(0)).toContainText('1914-07-20');
  await expect(tlItems.nth(1)).toContainText('1914-08-01');
  await expect(tlItems.nth(2)).toContainText('1914-08-04');

  // 本文の日付（1914-07-20）の行を押すと本文の date 要素が選ばれる
  await tlItems.nth(0).getByRole('button').click();
  await expect(page).toHaveURL(/id=awase-entity-1/);
  await expect(page.locator('#awase-entity-1')).toHaveClass(/is-selected/);
});
