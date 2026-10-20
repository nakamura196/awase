import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { withBasePath } from './basePath';

describe('withBasePath', () => {
  const original = process.env.NEXT_PUBLIC_BASE_PATH;
  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_BASE_PATH;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_BASE_PATH;
    else process.env.NEXT_PUBLIC_BASE_PATH = original;
  });

  it('ルート配信 (basePath なし) では path をそのまま返す', () => {
    expect(withBasePath('/samples/sample.xml')).toBe(
      '/samples/sample.xml'
    );
  });

  it('GH Pages (basePath あり) では path に basePath を前置する', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/awase';
    expect(withBasePath('/samples/sample.xml')).toBe(
      '/awase/samples/sample.xml'
    );
  });

  it('既に basePath で始まっていれば二重付与しない', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/awase';
    expect(withBasePath('/awase/samples/x.xml')).toBe(
      '/awase/samples/x.xml'
    );
  });

  it('絶対 URL (http/https) はそのまま返す', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/awase';
    expect(withBasePath('https://example.com/m.json')).toBe(
      'https://example.com/m.json'
    );
  });

  it('先頭スラッシュなしの相対パスでも正しく結合する', () => {
    process.env.NEXT_PUBLIC_BASE_PATH = '/awase';
    expect(withBasePath('samples/x.xml')).toBe(
      '/awase/samples/x.xml'
    );
  });
});
