#!/usr/bin/env node
/**
 * ユースケース（/usecases、トップページの見本）のサムネイルを撮る。
 * 各ユースケースを Awase で開き、その画面をヘッドレスの Chromium で撮って、
 * public/thumbnails/usecases/<id>.<ja|en>.webp（1280×720）に書き出す。
 * 資料の画像ではなくビューアの画面を撮るのは、「開くと何ができるか」（校異・対訳・発話集計・映像連動など）を見せたいため。
 *
 * 使い方:
 *   node scripts/capture-thumbnails.mjs                             # 全部撮る（本番 https://awase.ldas.jp を開く）
 *   node scripts/capture-thumbnails.mjs --only koui-genji-apparatus
 *   node scripts/capture-thumbnails.mjs --base http://localhost:3839 # 手元の開発サーバを開く
 *   node scripts/capture-thumbnails.mjs --missing                   # まだ無いものだけ撮る（ユースケースを足したとき）
 */
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import sharp from 'sharp';

await import('./lib/ts-hooks.mjs');
const { USE_CASES, hrefOf } = await import('../src/lib/usecases.ts');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SITE = 'https://awase.ldas.jp';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
};
const base = (arg('base') ?? SITE).replace(/\/$/, '');
const only = arg('only')?.split(',');
const missingOnly = process.argv.includes('--missing');
const locales = arg('locale')?.split(',') ?? ['ja', 'en'];
const waitArg = arg('wait') ? Number(arg('wait')) : undefined;

const WIDTH = 1440;
const HEIGHT = 810;
const OUT_WIDTH = 1280;
const OUT_HEIGHT = 720;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 撮る前にページで行う操作（id ごと）。見どころの状態にしてから撮る
const PREPARE = {
  'koui-genji-apparatus': async (page) => {
    await page.locator('[data-testid="apparatus-pane"] [data-awase-entry] button').first().click({ timeout: 15000 }).catch(() => {});
    await page.locator('[data-testid="witness-distances"] > summary').click({ timeout: 10000 }).catch(() => {});
    await sleep(1500);
  },
  'eiri-yosano-parallel': async (page) => {
    await page.locator('[data-corresp-key]').nth(2).click({ timeout: 15000 }).catch(() => {});
    await sleep(1500);
  },
  'annan-kokusho-diplomatic': async (page) => {
    await page.locator('[data-corresp-key]').nth(1).click({ timeout: 15000 }).catch(() => {});
    await sleep(2500);
  },
  'melos-speech': async (page) => {
    await page.locator('[data-testid="entity-item"]').first().click({ timeout: 15000 }).catch(() => {});
    await sleep(1500);
  },
  'video-support-news': async (page) => {
    await page.locator('[data-testid="video-utterance"]').nth(2).click({ timeout: 15000 }).catch(() => {});
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) {
        v.pause();
        v.currentTime = 14;
      }
    });
    await sleep(2500);
  },
  'genji-compare': async (page) => {
    await page.locator('[data-testid="compare-diff"]').waitFor({ timeout: 15000 }).catch(() => {});
    await sleep(1500);
  },
  'three-treasures-line': async (page) => {
    await page.locator('[data-testid="line-view"]').waitFor({ timeout: 15000 }).catch(() => {});
    await sleep(1000);
  },
  'reading-support-news': async (page) => {
    await page.locator('[data-testid="reading-support-term"]').nth(1).click({ timeout: 15000 }).catch(() => {});
    await sleep(1500);
  },
  'ocr-facsimile-xsl': async (page) => {
    await page.locator('[data-testid="xsl-output"]').waitFor({ timeout: 20000 }).catch(() => {});
    await sleep(3000);
  },
  'dts-koui-genji': async (page) => {
    await page.locator('[data-testid="dts-units"]').waitFor({ timeout: 20000 }).catch(() => {});
    await sleep(1500);
  },
};

const targets = USE_CASES.flatMap((u) =>
  locales.map((locale) => ({
    id: u.id,
    locale,
    file: `public/thumbnails/usecases/${u.id}.${locale}.webp`,
    href: hrefOf(u.open),
    wait: 8000,
  })),
).filter((t) => (!only || only.includes(t.id)) && (!missingOnly || !existsSync(path.join(ROOT, t.file))));

const browser = await chromium.launch({ args: ['--mute-audio', '--hide-scrollbars'] });
let failed = 0;

for (const t of targets) {
  const href = base === SITE ? t.href : t.href.replaceAll(encodeURIComponent(SITE), encodeURIComponent(base));
  const url = `${base}/${t.locale}${href}`;
  const context = await browser.newContext({
    viewport: { width: WIDTH, height: HEIGHT + 56 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.addInitScript(() => {
      const style = document.createElement('style');
      style.textContent = 'nextjs-portal { display: none !important; }';
      document.documentElement.appendChild(style);
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await sleep(waitArg ?? t.wait);
    if (PREPARE[t.id]) {
      await PREPARE[t.id](page);
    }
    const headerBottom = await page.evaluate(() => {
      const h = document.querySelector('header')?.getBoundingClientRect();
      return h ? Math.round(h.bottom) : 44;
    });
    const png = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: headerBottom, width: WIDTH, height: HEIGHT },
    });
    const out = path.join(ROOT, t.file);
    mkdirSync(path.dirname(out), { recursive: true });
    const info = await sharp(png)
      .resize({ width: OUT_WIDTH, height: OUT_HEIGHT, fit: 'cover', position: 'top' })
      .webp({ quality: 78 })
      .toFile(out);
    console.log(`${t.file}  ${OUT_WIDTH}x${OUT_HEIGHT}  ${Math.round(info.size / 1024)} KB  ← ${url}`);
  } catch (e) {
    failed++;
    console.error(`失敗: ${t.id} ${t.locale} (${url}): ${e.message}`);
  } finally {
    await context.close();
  }
}

await browser.close();
console.log(`${targets.length - failed} / ${targets.length} 枚を書き出しました。目で見て、読み込み途中のものは --only で撮り直してください`);
process.exit(failed ? 1 : 0);
