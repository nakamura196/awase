import { describe, expect, it } from 'vitest';
import { expandTemplate, templateVariables } from './uriTemplate';

describe('expandTemplate', () => {
  it('{?a,b} は値のあるものだけ ? と & でつなぐ', () => {
    const t = '/api/v2/dts/collection{?id,page,nav}';
    expect(expandTemplate(t, { id: 'urn:x' })).toBe('/api/v2/dts/collection?id=urn%3Ax');
    expect(expandTemplate(t, { id: 'a', page: 2 })).toBe('/api/v2/dts/collection?id=a&page=2');
    expect(expandTemplate(t, {})).toBe('/api/v2/dts/collection');
  });
  it('{&a,b} は既にある ? の後ろに足す', () => {
    const t = '/collection?id=urn:x{&page,nav}';
    expect(expandTemplate(t, {})).toBe('/collection?id=urn:x');
    expect(expandTemplate(t, { page: 3 })).toBe('/collection?id=urn:x&page=3');
  });
  it('値は符号化する（URL や日本語、& を含んでもよい）', () => {
    const t = '/nav{?resource,ref}';
    expect(expandTemplate(t, { resource: 'r', ref: 'https://e.org/a?b=1&c=2' })).toBe(
      '/nav?resource=r&ref=https%3A%2F%2Fe.org%2Fa%3Fb%3D1%26c%3D2',
    );
    expect(expandTemplate(t, { resource: '桐壺' })).toBe('/nav?resource=%E6%A1%90%E5%A3%BA');
  });
  it('{var} と {+var}（予約文字を通す）と {#var}', () => {
    expect(expandTemplate('/a/{id}', { id: 'x/y' })).toBe('/a/x%2Fy');
    expect(expandTemplate('{+base}/a', { base: 'https://e.org/p' })).toBe('https://e.org/p/a');
    expect(expandTemplate('/a{#frag}', { frag: 'top' })).toBe('/a#top');
  });
  it('{/a,b} {.a} {;a}', () => {
    expect(expandTemplate('/x{/a,b}', { a: '1', b: '2' })).toBe('/x/1/2');
    expect(expandTemplate('/x{.ext}', { ext: 'json' })).toBe('/x.json');
    expect(expandTemplate('/x{;k}', { k: 'v' })).toBe('/x;k=v');
  });
  it('値が空文字や undefined の変数は書かない', () => {
    expect(expandTemplate('/n{?a,b}', { a: '', b: undefined })).toBe('/n');
  });
  it('数値も渡せる（down=-1）', () => {
    expect(expandTemplate('/n{?down}', { down: -1 })).toBe('/n?down=-1');
  });
});

describe('templateVariables', () => {
  it('変数名を並べる', () => {
    expect(templateVariables('/n{?resource,ref,start}{&down}')).toEqual(['resource', 'ref', 'start', 'down']);
  });
});
