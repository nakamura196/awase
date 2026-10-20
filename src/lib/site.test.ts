// 公開 URL と、sitemap・robots・各ページの canonical の整合を固定するテスト。
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES, PUBLIC_PATHS, SITE_URL, alternatesFor } from './site';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import { NEWS } from './news';

const root = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('公開 URL', () => {
  it('GitHub Pages のプロジェクトページ', () => {
    expect(SITE_URL).toBe('https://nakamura196.github.io/awase');
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
    expect(urls).toHaveLength(LOCALES.length * (PUBLIC_PATHS.length + NEWS.length));
    expect(urls).toContain(`${SITE_URL}/ja/`);
    expect(urls).toContain(`${SITE_URL}/en/viewer/`);
    expect(urls).toContain(`${SITE_URL}/ja/news/${NEWS[0].id}/`);
    for (const p of PUBLIC_PATHS) {
      expect(existsSync(join(root, 'src/app/[locale]', p, 'page.tsx'))).toBe(true);
    }
  });
});
