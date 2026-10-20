// お知らせを書き足したときに、書き漏れ（片方の言語・重複した id・存在しないユースケース）を見つけるテスト。
import { describe, expect, it } from 'vitest';
import { NEWS, actionHrefOf } from './news';

describe('NEWS', () => {
  it('id は重複せず、URL に使える形', () => {
    const ids = NEWS.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('新しいものが上（日付が降順）', () => {
    const dates = NEWS.map((n) => n.date);
    for (const d of dates) expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it('見出しと本文が日英とも書いてある', () => {
    for (const n of NEWS) {
      for (const s of [n.title.ja, n.title.en, n.body.ja, n.body.en]) expect(s.trim(), n.id).not.toBe('');
    }
  });

  it('「試す」はサイト内のパスか、外部なら https', () => {
    for (const n of NEWS) {
      if (!n.action) continue;
      for (const l of ['ja', 'en'] as const) {
        const href = actionHrefOf(n.action, l);
        if (n.action.external) expect(new URL(href).protocol).toBe('https:');
        else expect(href, n.id).toMatch(/^\//);
      }
    }
  });

  it('動画の videoId は YouTube の 11 文字', () => {
    for (const n of NEWS) {
      for (const v of Object.values(n.video ?? {})) expect(v).toMatch(/^[A-Za-z0-9_-]{11}$/);
    }
  });
});

describe('content/news/<id>.md の読み込み', () => {
  it('front matter の . は入れ子に、note は捨てる', async () => {
    const { parseNewsFile } = await import('../../scripts/build-news.mjs');
    const n = parseNewsFile('x', '---\ndate: 2026-10-18\norder: 2\ntitle.ja: 題\ntitle.en: Title\naction.viewer: https://example.org/m.json\naction.params: dir=rtl\nnote: 覚え書き\n---\n\n## ja\n\n本文。\n\n## en\n\nBody.\n');
    expect(n).toEqual({
      id: 'x', date: '2026-10-18', order: 2, title: { ja: '題', en: 'Title' },
      action: { viewer: 'https://example.org/m.json', params: 'dir=rtl' },
      body: { ja: '本文。', en: 'Body.' },
    });
  });

  it('公開時のお知らせがある', () => {
    expect(NEWS.find((n) => n.id === '2026-10-19-launch')?.action?.href).toBe('/viewer');
  });
});
