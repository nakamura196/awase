import { describe, expect, it } from 'vitest';
import { htmlAttrName, htmlTagName, isIndentation, safeUrl } from './attrs';

describe('htmlAttrName', () => {
  it('xml:id と xml:lang は id と lang に', () => {
    expect(htmlAttrName('xml:id')).toBe('id');
    expect(htmlAttrName('xml:lang')).toBe('lang');
  });
  it('TEI の属性はそのまま', () => {
    expect(htmlAttrName('corresp')).toBe('corresp');
    expect(htmlAttrName('rend')).toBe('rend');
  });
  it('スクリプト・見た目・名前空間の宣言は落とす', () => {
    expect(htmlAttrName('onclick')).toBeNull();
    expect(htmlAttrName('ONload')).toBeNull();
    expect(htmlAttrName('style')).toBeNull();
    expect(htmlAttrName('xmlns')).toBeNull();
    expect(htmlAttrName('xmlns:tei')).toBeNull();
  });
  it('接頭辞付きは data- に', () => {
    expect(htmlAttrName('xml:space')).toBe('data-xml-space');
  });
});

describe('safeUrl', () => {
  it('http(s) は通す', () => {
    expect(safeUrl('https://example.org/a')).toBe('https://example.org/a');
  });
  it('相対 URL は TEI の URL を基準に', () => {
    expect(safeUrl('img/1.jpg', 'https://example.org/tei/01.xml')).toBe('https://example.org/tei/img/1.jpg');
  });
  it('ページ内の参照はそのまま', () => {
    expect(safeUrl('#waka-001')).toBe('#waka-001');
    expect(safeUrl('#')).toBeNull();
  });
  it('javascript: などは通さない', () => {
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl(' JavaScript:alert(1)', 'https://example.org/')).toBeNull();
    expect(safeUrl('data:text/html,x')).toBeNull();
    expect(safeUrl('')).toBeNull();
  });
  it('基準が無い相対 URL は使わない', () => {
    expect(safeUrl('img/1.jpg')).toBeNull();
  });
});

describe('htmlTagName / isIndentation', () => {
  it('小文字にして tei- を付ける', () => {
    expect(htmlTagName('teiHeader')).toBe('tei-teiheader');
  });
  it('改行を含む空白だけが字下げ', () => {
    expect(isIndentation('\n        ')).toBe(true);
    expect(isIndentation(' ')).toBe(false);
    expect(isIndentation('\n a')).toBe(false);
  });
});
