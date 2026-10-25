import { expect, test } from '@playwright/test';

const TEI = 'https://raw.githubusercontent.com/TEI-EAJ/aozora_tei/master/data/complete/tei_lib_lv3/1126_tei.xml';
const url = `/ja/viewer?u=${encodeURIComponent(TEI)}&panes=text,vrm&dir=v&json=${encodeURIComponent('/data/vrm/mitsu-no-takara-act1.json')}`;

test.describe('読み上げペイン（台本 JSON）', () => {
  test('json= の台詞が一覧になり、本文の発話と対応づく', async ({ page }) => {
    await page.goto(url);
    const pane = page.locator('[data-testid="vrm-pane"]');
    await expect(pane).toHaveAttribute('data-source', 'json');
    await expect(pane).toHaveAttribute('data-lines', '37');
    const matched = Number(await pane.getAttribute('data-matched'));
    expect(matched).toBeGreaterThanOrEqual(30);
    // 最初の台詞は本文に無いト書き。次の台詞から本文と対応する
    await pane.getByRole('button', { name: '次へ' }).click();
    await expect(page.locator('[data-testid="vrm-speaker"]')).toHaveText('第一の盗人');
    await expect(page).toHaveURL(/[?&]id=/);
  });

  test('再生すると次の行へ進み、本文のハイライトも動く（音声が無くても止まらない）', async ({ page }) => {
    await page.goto(url);
    const pane = page.locator('[data-testid="vrm-pane"]');
    await expect(pane).toHaveAttribute('data-lines', '37');
    await pane.getByRole('button', { name: '再生' }).click();
    await expect(pane).toHaveAttribute('data-status', 'playing');
    await expect(pane).not.toHaveAttribute('data-index', '0', { timeout: 40_000 });
    await expect(pane).not.toHaveAttribute('data-index', '1', { timeout: 40_000 });
    await expect(page).toHaveURL(/[?&]id=/);
    await pane.getByRole('button', { name: '停止', exact: true }).click();
    await expect(pane).toHaveAttribute('data-status', 'idle');
  });

  test('自動で次へ進むを切ると、1 行で止まる', async ({ page }) => {
    await page.goto(url);
    const pane = page.locator('[data-testid="vrm-pane"]');
    await expect(pane).toHaveAttribute('data-lines', '37');
    await pane.getByTestId('vrm-auto-advance').uncheck();
    await pane.getByRole('button', { name: '次へ' }).click();
    await pane.getByRole('button', { name: '再生' }).click();
    await expect(pane).toHaveAttribute('data-status', 'idle', { timeout: 40_000 });
    await expect(pane).toHaveAttribute('data-index', '1');
  });

  test('json= が無ければ従来どおり本文の発話を読む', async ({ page }) => {
    await page.goto(`/ja/viewer?u=${encodeURIComponent(TEI)}&panes=text,vrm&dir=v`);
    const pane = page.locator('[data-testid="vrm-pane"]');
    await expect(pane).toHaveAttribute('data-source', 'tei');
    expect(Number(await pane.getAttribute('data-lines'))).toBeGreaterThan(100);
  });
});
