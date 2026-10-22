// ユースケースの一覧を書き足したときに、書き漏れ（片方の言語・札の表示名・重複した id）を見つけるテスト。
import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import ja from '@/messages/ja.json';
import en from '@/messages/en.json';
import {
  FEATURED_USE_CASES,
  USE_CASES,
  USE_CASE_FEATURES,
  byNewest,
  hrefOf,
  sourcesOf,
  usecaseById,
  videoOf,
} from './usecases';

describe('USE_CASES', () => {
  it('id は重複せず、ページ内リンクに使える形', () => {
    const ids = USE_CASES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('見出しと説明が日英とも書いてある', () => {
    for (const u of USE_CASES) {
      for (const s of [u.title.ja, u.title.en, u.note.ja, u.note.en]) expect(s.trim()).not.toBe('');
    }
  });

  it('トップに出す例には、日英の見出しがある', () => {
    for (const u of FEATURED_USE_CASES) {
      for (const s of [u.headline?.ja, u.headline?.en]) expect(s?.trim(), u.id).toBeTruthy();
    }
  });

  it('資料と元のページは https の URL', () => {
    for (const u of USE_CASES) {
      for (const s of sourcesOf(u.open)) expect(new URL(s).protocol).toBe('https:');
      if (u.site) expect(new URL(u.site).protocol).toBe('https:');
    }
  });

  it('動画の videoId は YouTube の 11 文字', () => {
    for (const u of USE_CASES) {
      for (const v of Object.values(u.video ?? {})) expect(v).toMatch(/^[A-Za-z0-9_-]{11}$/);
    }
  });

  it('札が 1 つ以上あり、どの札にも日英の表示名がある', () => {
    for (const u of USE_CASES) expect(u.features.length).toBeGreaterThan(0);
    for (const f of USE_CASE_FEATURES) {
      expect(ja.UseCases.features[f]).toBeTruthy();
      expect(en.UseCases.features[f]).toBeTruthy();
    }
  });

  it('トップに出すのは多すぎない数', () => {
    expect(FEATURED_USE_CASES.length).toBeGreaterThan(0);
    expect(FEATURED_USE_CASES.length).toBeLessThanOrEqual(6);
  });
});

describe('hrefOf', () => {
  const u1 = 'https://example.org/a.xml';
  const u2 = 'https://example.org/b.xml';
  const enc1 = encodeURIComponent(u1);
  const enc2 = encodeURIComponent(u2);

  it('viewer は単数・複数の u と dir・panes・xsl を載せる', () => {
    expect(hrefOf({ page: 'viewer', u: u1, dir: 'v' })).toBe(`/viewer?u=${enc1}&dir=v`);
    expect(hrefOf({ page: 'viewer', u: [u1, u2], dir: 'v', panes: 'text,image', xsl: 'line' })).toBe(
      `/viewer?u=${enc1}&u=${enc2}&dir=v&panes=text,image&xsl=line`,
    );
  });

  it('xsl は u と xsl・panel を載せる', () => {
    expect(hrefOf({ page: 'xsl', u: u1, xsl: 'ocr', panel: 'entities' })).toBe(
      `/xsl?u=${enc1}&xsl=ocr&panel=entities`,
    );
  });

  it('compare は manifest1・manifest2 と canvas・label・mode を載せる', () => {
    const m1 = 'https://example.org/m1.json';
    const m2 = 'https://example.org/m2.json';
    expect(hrefOf({ page: 'compare', manifest1: m1, manifest2: m2, mode: '0' })).toBe(
      `/compare?manifest1=${encodeURIComponent(m1)}&manifest2=${encodeURIComponent(m2)}&mode=0`,
    );
    expect(sourcesOf({ page: 'compare', manifest1: m1, manifest2: m2 })).toEqual([m1, m2]);
  });

  it('dts は base と url を載せる', () => {
    const base = 'https://example.org/dts/entry.json';
    const col = 'https://example.org/dts/col.json';
    expect(hrefOf({ page: 'dts', base, url: col })).toBe(
      `/dts?base=${encodeURIComponent(base)}&url=${encodeURIComponent(col)}`,
    );
  });
});

describe('videoOf', () => {
  const base = USE_CASES[0];
  it('その言語の動画が無ければ、もう一方の言語の動画を出す', () => {
    const u = { ...base, video: { ja: 'aaaaaaaaaaa' } };
    expect(videoOf(u, 'en')).toBe('aaaaaaaaaaa');
    expect(videoOf({ ...base, video: undefined }, 'ja')).toBeUndefined();
  });
});

describe('usecaseById', () => {
  it('詳細ページの og:image になるサムネイルと短尺動画が日英とも public/ にある', () => {
    for (const u of USE_CASES) {
      for (const l of ['ja', 'en']) {
        expect(existsSync(join(__dirname, '../../public/thumbnails/usecases', `${u.id}.${l}.webp`)), `${u.id}.${l}.webp`).toBe(true);
        if (u.clip) {
          expect(existsSync(join(__dirname, '../../public/clips/usecases', `${u.id}.${l}.mp4`)), `${u.id}.${l}.mp4`).toBe(true);
        }
      }
    }
  });

  it('追加日は YYYY-MM-DD で、新しい順に並べられる', () => {
    for (const u of USE_CASES) expect(u.added, u.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const sorted = byNewest(USE_CASES);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i - 1].added >= sorted[i].added).toBe(true);
  });

  it('id で引ける。無い id は undefined', () => {
    for (const u of USE_CASES) expect(usecaseById(u.id)).toBe(u);
    expect(usecaseById('no-such-id')).toBeUndefined();
  });
});
