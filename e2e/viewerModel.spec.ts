import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

interface SketchfabStub {
  uid: string;
  gotos: number[];
  select: (index: number) => void;
}

declare global {
  interface Window {
    __sketchfab?: SketchfabStub;
  }
}

const MODEL_XML = readFileSync(path.join(__dirname, 'fixtures/model-sketchfab.xml'), 'utf-8');
const PLAIN_XML = `<?xml version="1.0" encoding="UTF-8"?>
<TEI xmlns="http://www.tei-c.org/ns/1.0">
  <teiHeader>
    <fileDesc>
      <titleStmt><title>3Dなしの本文</title></titleStmt>
      <publicationStmt><p>Awase</p></publicationStmt>
      <sourceDesc><p>見本</p></sourceDesc>
    </fileDesc>
  </teiHeader>
  <text>
    <body>
      <p>3Dモデルを持たない普通の本文。</p>
    </body>
  </text>
</TEI>`;

// Sketchfab Viewer API のスタブ（契約どおりの window.Sketchfab を定義する）
const SKETCHFAB_SCRIPT = `
window.Sketchfab = function Sketchfab(iframe) {
  this.iframe = iframe;
};
window.Sketchfab.prototype.init = function (uid, opts) {
  const listeners = {};
  const state = {
    uid,
    gotos: [],
    select(index) {
      for (const cb of listeners.annotationSelect || []) cb(index);
    },
  };
  window.__sketchfab = state;
  const api = {
    start() {},
    addEventListener(name, cb) {
      (listeners[name] = listeners[name] || []).push(cb);
      if (name === 'viewerready') {
        setTimeout(() => cb(), 0);
      }
    },
    gotoAnnotation(index, _opts, cb) {
      state.gotos.push(index);
      if (typeof _opts === 'function') _opts(null, index);
      else if (typeof cb === 'function') cb(null, index);
    },
  };
  if (opts && typeof opts.success === 'function') {
    opts.success(api);
  }
};
`;

test.beforeEach(async ({ page }) => {
  await page.route('https://static.sketchfab.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript; charset=utf-8', body: SKETCHFAB_SCRIPT }),
  );
  await page.route('https://sketchfab.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><title>stub</title>' }),
  );
});

async function openXml(page: Page, url: string, xml: string, extra = '') {
  await page.route(url, (route) =>
    route.fulfill({ status: 200, contentType: 'application/xml; charset=utf-8', body: xml }),
  );
  await page.goto(`/ja/viewer/?u=${encodeURIComponent(url)}${extra}`);
  await expect(page.getByTestId('text-pane')).toBeVisible();
}

test('3Dモデルのある TEI で 3D ペインと切り替えボタンを出し、panes=text で隠す', async ({ page }) => {
  await openXml(page, 'https://example.org/tei/model.xml', MODEL_XML);
  await expect(page.getByTestId('model-pane')).toBeVisible();
  const toggle = page.getByRole('toolbar').getByRole('button', { name: '3D' });
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  // panes=text で開くと 3D ペインは隠れる
  await openXml(page, 'https://example.org/tei/model.xml', MODEL_XML, '&panes=text');
  await expect(page.getByTestId('model-pane')).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');

  // 3D の無い TEI ではペインもボタンも出さない
  await openXml(page, 'https://example.org/tei/plain.xml', PLAIN_XML);
  await expect(page.getByTestId('model-pane')).toHaveCount(0);
  await expect(page.getByRole('toolbar').getByRole('button', { name: '3D' })).toHaveCount(0);
});

test('本文の行と Sketchfab の注記を双方向に結ぶ', async ({ page }) => {
  await openXml(page, 'https://example.org/tei/model.xml', MODEL_XML);
  await expect(page.getByTestId('model-pane')).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__sketchfab?.uid)).toBe('0123456789abcdef0123456789abcdef');

  // 本文の l@corresp="#zone1" を押すと URL の id= が変わり、gotoAnnotation が呼ばれる
  await page.getByTestId('text-pane').locator('tei-l[corresp="#zone1"]').click();
  await expect(page).toHaveURL(/id=zone1/);
  await expect.poll(() => page.evaluate(() => window.__sketchfab?.gotos)).toContain(0);

  // Sketchfab 側で注記 1（zone2 → sec2）を選ぶと URL の id= が変わる
  await page.evaluate(() => window.__sketchfab?.select(1));
  await expect(page).toHaveURL(/id=sec2/);
  await expect(page.locator('#sec2')).toHaveClass(/is-selected/);
});
