import { test, expect, type Locator, type Page } from '@playwright/test';

// 並べた列のスクロール連動。本文の目印 <anchor corresp="#tN"/> と、訳の <s xml:id="tN"> を突き合わせる。
// 本文と訳とで段落の長さを変えて、同じ割合で動かすだけでは合わないようにしてある
const BASE = 'https://example.org/scroll/';
const N = 20;
const wrap = (title: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader><fileDesc><titleStmt><title>${title}</title></titleStmt><publicationStmt><p/></publicationStmt><sourceDesc><p/></sourceDesc></fileDesc></teiHeader>
  <text><body>${body}</body></text>
</TEI>`;
const range = Array.from({ length: N }, (_, i) => i + 1);
const MAIN = wrap('連動の見本・本文', range.map((i) => `<p><anchor corresp="sub.xml#t${i}"/>${'本文の段落。'.repeat(i % 3 === 0 ? 40 : 8)}</p>`).join(''));
const SUB = wrap('連動の見本・訳', range.map((i) => `<p><s xml:id="t${i}">${'訳の文。'.repeat(i % 2 === 0 ? 30 : 5)}</s></p>`).join(''));

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.route(`${BASE}*`, (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    const body = name === 'main.xml' ? MAIN : name === 'sub.xml' ? SUB : null;
    return body
      ? route.fulfill({ body, contentType: 'application/xml', headers: { 'access-control-allow-origin': '*' } })
      : route.fulfill({ status: 404 });
  });
});

const url = (extra = '') => `/ja/viewer/?u=${encodeURIComponent(`${BASE}main.xml`)}&u=${encodeURIComponent(`${BASE}sub.xml`)}${extra}`;

// 要素が、ペインの読み始めの端（横書きは上、縦書きは右）から何 px 先にあるか
async function offset(pane: Locator, selector: string, vertical: boolean) {
  return pane.evaluate(
    (el, [sel, v]) => {
      const p = el.getBoundingClientRect();
      const r = el.querySelector(sel as string)!.getBoundingClientRect();
      return v ? p.right - r.right : r.top - p.top;
    },
    [selector, vertical] as const,
  );
}

// 本文の列をホイールで動かし、目印 t10 を端に寄せる
async function scrollMainTo(page: Page, main: Locator, vertical: boolean) {
  const box = (await main.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const d = await offset(main, 'tei-anchor[corresp$="#t10"]', vertical);
  if (vertical) await page.mouse.wheel(-d, 0);
  else await page.mouse.wheel(0, d);
  await expect.poll(() => offset(main, 'tei-anchor[corresp$="#t10"]', vertical)).toBeLessThan(2);
}

test('本文をスクロールすると、訳の列も対応する文まで付いてくる', async ({ page }) => {
  await page.goto(url());
  const [main, sub] = [page.getByTestId('text-pane').nth(0), page.getByTestId('text-pane').nth(1)];
  await expect(sub.locator('tei-s#t1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'スクロール連動' })).toHaveAttribute('aria-pressed', 'true');
  await scrollMainTo(page, main, false);
  await expect.poll(async () => Math.abs(await offset(sub, 'tei-s#t10', false))).toBeLessThan(3);
});

test('縦書きでも、右から左へ付いてくる', async ({ page }) => {
  await page.goto(url('&dir=v'));
  const [main, sub] = [page.getByTestId('text-pane').nth(0), page.getByTestId('text-pane').nth(1)];
  await expect(sub.locator('tei-s#t1')).toBeVisible();
  await scrollMainTo(page, main, true);
  await expect.poll(async () => Math.abs(await offset(sub, 'tei-s#t10', true))).toBeLessThan(3);
});

test('連動を切ると、訳の列は動かない', async ({ page }) => {
  await page.goto(url());
  const [main, sub] = [page.getByTestId('text-pane').nth(0), page.getByTestId('text-pane').nth(1)];
  await expect(sub.locator('tei-s#t1')).toBeVisible();
  await page.getByRole('button', { name: 'スクロール連動' }).click();
  await expect(page).toHaveURL(/sync=0/);
  await scrollMainTo(page, main, false);
  expect(await sub.evaluate((el) => el.scrollTop)).toBe(0);
});
