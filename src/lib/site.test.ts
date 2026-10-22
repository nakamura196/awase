// 公開 URL と、sitemap・robots・各ページの canonical の整合を固定するテスト。
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES, PUBLIC_PATHS, SITE_URL, alternatesFor } from './site';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { NEWS } from './news';
import { USE_CASES } from './usecases';

const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('公開 URL', () => {
  it('独自ドメイン awase.ldas.jp', () => {
    expect(SITE_URL).toBe('https://awase.ldas.jp');
  });

  it('canonical はページ自身、言語の組は同じパス', () => {
    expect(alternatesFor('ja', '')).toEqual({ canonical: '/ja/', languages: { ja: '/ja/', en: '/en/' } });
    expect(alternatesFor('en', 'help/')).toEqual({
      canonical: '/en/help/',
      languages: { ja: '/ja/help/', en: '/en/help/' },
    });
  });

  it('下層ページはすべて自分の canonical を持つ', () => {
    for (const p of PUBLIC_PATHS.filter(Boolean)) {
      const src = read(`src/app/[locale]/${p}page.tsx`);
      expect(src).toContain(`alternatesFor(locale, '${p}')`);
    }
  });

  it('robots は sitemap を示す', () => {
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
  });

  it('sitemap は全ロケール×全ページで、ページは実在する', () => {
    const urls = sitemap().map((e) => e.url);
    expect(urls).toHaveLength(LOCALES.length * (PUBLIC_PATHS.length + NEWS.length + USE_CASES.length));
    expect(urls).toContain(`${SITE_URL}/ja/`);
    expect(urls).toContain(`${SITE_URL}/en/viewer/`);
    expect(urls).toContain(`${SITE_URL}/ja/news/${NEWS[0].id}/`);
    expect(urls).toContain(`${SITE_URL}/ja/usecases/${USE_CASES[0].id}/`);
    for (const p of PUBLIC_PATHS) {
      expect(existsSync(join(root, 'src/app/[locale]', p, 'page.tsx'))).toBe(true);
    }
  });
});

describe('本番 (awase.ldas.jp) はホスト直下で配る', () => {
  it('配布するビルドは basePath を付けない (GITHUB_PAGES を立てない)', () => {
    const wf = read('.github/workflows/deploy-pages.yml');
    const step = wf.split('- name: Build static export')[1]?.split('- name:')[0];
    expect(step).toBeTruthy();
    expect(step).not.toMatch(/GITHUB_PAGES/);
    // 配布される out/ はこのステップで作り直したもの (サブパスの検査用ビルドは消してある)
    expect(wf).toMatch(/check-basepath\.sh[\s\S]*rm -rf out \.next[\s\S]*- name: Build static export/);
  });
  it('PWA の manifest はホスト直下', () => {
    const m = JSON.parse(read('public/manifest.json'));
    expect([m.scope, m.start_url]).toEqual(['/', '/']);
  });
});
