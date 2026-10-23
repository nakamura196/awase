#!/usr/bin/env node
/**
 * トップのカードやユースケース一覧に出す、短い操作デモ動画（音なし・数秒・くり返し再生）を撮る。
 * 各ユースケースを Awase で開き、見どころの操作（異文を選んで伝本を切り替える、対訳を連動スクロールする、
 * 紙面領域へズームする、発話・呼称をたどる、など）を自動で行って録画し、
 * ヘッダーを除いた画面を public/clips/usecases/<id>.<ja|en>.mp4 に書き出す。
 * GIF ではなく動画にするのは、同じ長さで 1/10 ほどの大きさで済むため。
 *
 * 使い方:
 *   node scripts/capture-usecase-clips.mjs                             # 全部撮る（本番 https://awase.ldas.jp を開く）
 *   node scripts/capture-usecase-clips.mjs --only koui-genji-apparatus --locale ja
 *   node scripts/capture-usecase-clips.mjs --base http://localhost:3839
 *   node scripts/capture-usecase-clips.mjs --missing                   # まだ無いものだけ撮る
 *
 * 前提: Playwright の Chromium（npx playwright install chromium）と ffmpeg（libx264 入り）。Node 23.6 以降。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

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

const OUT_WIDTH = 640;
const FPS = 15;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ヘッダーの下から画面全体を取得し、16:10（または 16:9）で偶数ピクセルにそろえる
const stageRect = async (page) => {
  const r = await page.evaluate(() => {
    const header = document.querySelector('header')?.getBoundingClientRect();
    const top = Math.round(header?.bottom ?? 44);
    return { x: 0, y: top, width: innerWidth, height: innerHeight - top };
  });
  const even = (n) => n - (n % 2);
  const w = even(r.width);
  const h = even(Math.min(r.height, Math.round(w / 1.6)));
  return { x: 0, y: even(r.y), width: w, height: h };
};

// ユースケースごとの撮り方。wait: 開いてから操作を始めるまで。act: 見どころの操作。seconds: 書き出す動画の長さ
const CLIPS = {
  'koui-genji-apparatus': {
    wait: 4000,
    seconds: 6,
    prepare: async (page) => {
      await page.locator('[data-testid="apparatus-pane"]').waitFor({ timeout: 25000 });
      await sleep(1500);
    },
    act: async (page) => {
      const items = page.locator('[data-testid="apparatus-pane"] [data-awase-entry] button');
      await items.nth(0).click({ timeout: 10000 });
      await sleep(1400);
      await items.nth(2).click({ timeout: 10000 });
      await sleep(1400);
      await page.locator('[data-testid="witness-distances"] > summary').click({ timeout: 10000 });
      await sleep(1200);
      const sel = page.locator('[data-testid="apparatus-pane"] select');
      const val = await sel.locator('option').nth(2).getAttribute('value');
      if (val) {
        await sel.selectOption(val);
        await sleep(1500);
      }
    },
  },
  'eiri-yosano-parallel': {
    wait: 4000,
    seconds: 6,
    prepare: async (page) => {
      await page.locator('.awase-text tei-s[id]').first().waitFor({ timeout: 25000 });
      await sleep(1500);
    },
    act: async (page) => {
      const sents = page.locator('.awase-text tei-s[id]');
      for (const idx of [1, 4, 8, 12]) {
        await sents.nth(idx).click({ timeout: 10000 });
        await sleep(1300);
      }
    },
  },
  'annan-kokusho-diplomatic': {
    wait: 4000,
    seconds: 6,
    prepare: async (page) => {
      await page.locator('.awase-text [id^="o-"]').first().waitFor({ timeout: 25000 });
      await sleep(1500);
    },
    act: async (page) => {
      const lines = page.locator('.awase-text [id^="o-"]');
      for (const idx of [0, 1, 2]) {
        await lines.nth(idx).click({ timeout: 10000 });
        await sleep(1800);
      }
    },
  },
  'melos-speech': {
    wait: 4000,
    seconds: 6,
    prepare: async (page) => {
      await page.locator('[data-testid="entities-pane"]').waitFor({ timeout: 25000 });
      await sleep(1000);
    },
    act: async (page) => {
      await page.locator('[data-testid="entity-variants"] button').nth(1).click({ timeout: 10000 });
      await sleep(1500);
      await page.locator('[data-testid="speech-speakers"] ul li button').nth(1).click({ timeout: 10000 });
      await sleep(1500);
      await page.locator('[data-testid="speech-item"]').first().click({ timeout: 10000 });
      await sleep(1500);
      await page.locator('[data-testid="entities-pane"] [data-awase-entity-group] > div > button').nth(1).click({ timeout: 10000 });
      await sleep(1500);
    },
  },
  'video-support-news': {
    wait: 4000,
    seconds: 6,
    prepare: async (page) => {
      await page.locator('[data-testid="video-support-view"]').waitFor({ timeout: 25000 });
      await sleep(2500);
    },
    act: async (page) => {
      const utts = page.locator('[data-testid="video-support-caption-item"]');
      for (const idx of [1, 2, 4]) {
        await utts.nth(idx).click({ timeout: 10000 });
        await sleep(1400);
      }
      await page.locator('[data-testid="video-support-viz-btn"]').click({ timeout: 10000 });
      await sleep(1600);
    },
  },
  'genji-compare': {
    wait: 4000,
    seconds: 6,
    prepare: async (page) => {
      await page.locator('[data-testid="diff-result"]').waitFor({ timeout: 25000 });
      await sleep(1000);
    },
    act: async (page) => {
      await sleep(1200);
      await page.locator('[data-testid="pager-left"] button').nth(1).click({ timeout: 10000 });
      await sleep(1800);
      await page.locator('[data-testid="pager-right"] button').nth(1).click({ timeout: 10000 });
      await sleep(1800);
      await page.locator('[data-testid="pager-left"] button').nth(0).click({ timeout: 10000 });
      await sleep(1400);
    },
  },
  'three-treasures-line': {
    wait: 4000,
    seconds: 5,
    prepare: async (page) => {
      await page.locator('[data-testid="xsl-line-view"]').waitFor({ timeout: 25000 });
      await sleep(1000);
    },
    act: async (page) => {
      const bubbles = page.locator('[data-testid="line-bubble"]');
      for (const idx of [1, 4, 8]) {
        await bubbles.nth(idx).click({ timeout: 10000 });
        await sleep(1300);
      }
      await page.locator('[data-testid="speech-speakers"] ul li button').first().click({ timeout: 10000 });
      await sleep(1400);
    },
  },
  'reading-support-news': {
    wait: 4000,
    seconds: 6,
    prepare: async (page) => {
      await page.locator('[data-testid="reading-support-view"]').waitFor({ timeout: 25000 });
      await sleep(2500);
    },
    act: async (page) => {
      const cards = page.locator('[data-testid="support-term-card"]');
      for (const idx of [0, 2, 4]) {
        await cards.nth(idx).click({ timeout: 10000 });
        await sleep(1500);
      }
      await page.locator('[data-testid="reading-support-viz-btn"]').click({ timeout: 10000 });
      await sleep(1500);
    },
  },
  'ocr-facsimile-xsl': {
    wait: 4000,
    seconds: 5,
    prepare: async (page) => {
      await page.locator('[data-testid="xsl-frame"]').waitFor({ timeout: 25000 });
      const frame = page.frameLocator('[data-testid="xsl-frame"]');
      await frame.locator('.osd-viewer canvas').first().waitFor({ timeout: 25000 });
      await sleep(2000);
    },
    act: async (page) => {
      const frame = page.frameLocator('[data-testid="xsl-frame"]');
      const lines = frame.locator('li[id^="line-"]');
      for (const idx of [1, 3, 5, 7]) {
        await lines.nth(idx).click({ timeout: 10000 });
        await sleep(1200);
      }
    },
  },
  'dts-koui-genji': {
    wait: 4000,
    seconds: 5,
    prepare: async (page) => {
      await page.locator('main section:not([data-testid="dts-examples"]) ul li a').first().waitFor({ timeout: 25000 });
      await sleep(1000);
    },
    act: async (page) => {
      await page.locator('main section:not([data-testid="dts-examples"]) ul li a').first().click({ timeout: 10000 });
      await page.locator('main section ul li button').first().waitFor({ timeout: 20000 });
      await sleep(1500);
      await page.evaluate(() => window.scrollTo({ top: 220, behavior: 'smooth' }));
      await sleep(1500);
    },
  },
};

const work = mkdtempSync(path.join(tmpdir(), 'awase-clips-'));
const browser = await chromium.launch({ args: ['--mute-audio', '--hide-scrollbars'] });
let failed = 0;

for (const u of USE_CASES) {
  const clip = CLIPS[u.id];
  if (!clip || (only && !only.includes(u.id))) continue;
  for (const locale of locales) {
    const out = path.join(ROOT, `public/clips/usecases/${u.id}.${locale}.mp4`);
    if (missingOnly && existsSync(out)) continue;
    const href = base === SITE ? hrefOf(u.open) : hrefOf(u.open).replaceAll(encodeURIComponent(SITE), encodeURIComponent(base));
    const url = `${base}/${locale}${href}`;
    const viewport = { width: 1440, height: 944 };
    const dir = path.join(work, `${u.id}.${locale}`);
    const context = await browser.newContext({ viewport, recordVideo: { dir, size: viewport } });
    const t0 = Date.now();
    const page = await context.newPage();
    try {
      await page.addInitScript(() => {
        const style = document.createElement('style');
        style.textContent = 'nextjs-portal { display: none !important; }';
        document.documentElement.appendChild(style);
      });
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await sleep(clip.wait);
      if (clip.prepare) await clip.prepare(page);
      await page.evaluate(() => {
        document.querySelectorAll('nextjs-portal, [data-nextjs-toast], [data-nextjs-dialog-overlay]').forEach((el) => el.remove());
      });
      const rect = await (clip.rect ?? stageRect)(page);
      const start = (Date.now() - t0) / 1000;
      await clip.act(page, rect);
      const end = (Date.now() - t0) / 1000;
      await context.close();
      const raw = path.join(dir, readdirSync(dir)[0]);
      mkdirSync(path.dirname(out), { recursive: true });
      const dur = Math.max(0.5, end - start);
      // prettier-ignore
      execFileSync('ffmpeg', [
        '-y', '-loglevel', 'error', '-ss', start.toFixed(2), '-i', raw, '-t', dur.toFixed(2),
        '-vf', `crop=${rect.width}:${rect.height}:${rect.x}:${rect.y},scale=${OUT_WIDTH}:-2,setpts=PTS*${(clip.seconds / dur).toFixed(4)},fps=${FPS}`,
        '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out,
      ]);
      console.log(`${path.relative(ROOT, out)}  ${dur.toFixed(1)} 秒 → ${clip.seconds} 秒  ${Math.round(statSync(out).size / 1024)} KB  ← ${url}`);
    } catch (e) {
      failed++;
      console.error(`失敗: ${u.id} ${locale} (${url}): ${e.message}`);
      await context.close().catch(() => {});
    }
  }
}

await browser.close();
rmSync(work, { recursive: true, force: true });
console.log('目で見て、読み込み途中のものは --only で撮り直してください');
process.exit(failed ? 1 : 0);
