import { describe, expect, it } from 'vitest';
import { defaultXslId, getTeiUrl, injectBase, parseXslChoice, sefLocation, toSefUrl } from './params';
import { XSL_CATALOG, xslTitle } from './catalog';

const q = (s: string) => new URLSearchParams(s);
const site = (p: string) => `/awase${p}`;

describe('getTeiUrl', () => {
  it('u・url・tei の順に、空でない最初のものを使う', () => {
    expect(getTeiUrl(q('u=a&url=b'))).toBe('a');
    expect(getTeiUrl(q('url=b&tei=c'))).toBe('b');
    expect(getTeiUrl(q('tei=c'))).toBe('c');
    expect(getTeiUrl(q('u=%20&url=b'))).toBe('b');
    expect(getTeiUrl(q(''))).toBe('');
  });
});

describe('parseXslChoice', () => {
  it('目録の id', () => expect(parseXslChoice('notes')).toEqual({ kind: 'catalog', id: 'notes' }));
  it('.sef.json の URL はそのまま', () => {
    expect(parseXslChoice('https://e.org/x.sef.json')).toEqual({ kind: 'sef', url: 'https://e.org/x.sef.json' });
  });
  it('.xsl の URL は隣の .sef.json にする', () => {
    expect(parseXslChoice('https://e.org/x/a.xsl')).toEqual({ kind: 'sef', url: 'https://e.org/x/a.sef.json' });
    expect(toSefUrl('a.xslt')).toBe('a.sef.json');
  });
  it('空・知らない id は auto', () => {
    expect(parseXslChoice(null)).toEqual({ kind: 'auto' });
    expect(parseXslChoice('nope')).toEqual({ kind: 'auto' });
  });
});

describe('既定の XSL', () => {
  it('影印の画像があれば ocr', () => {
    expect(defaultXslId('<TEI><facsimile><surface><graphic url="a"/></surface></facsimile></TEI>')).toBe('ocr');
  });
  it('なければ reading', () => {
    expect(defaultXslId('<TEI><text/></TEI>')).toBe('reading');
    expect(defaultXslId('<TEI><facsimile><surface/></facsimile></TEI>')).toBe('reading');
  });
  it('SEF の場所を決める', () => {
    expect(sefLocation({ kind: 'auto' }, '<TEI/>', site)).toBe('/awase/xsl/tei-reading.sef.json');
    expect(sefLocation({ kind: 'catalog', id: 'ner' }, '', site)).toBe('/awase/xsl/tei-ner.sef.json');
    expect(sefLocation({ kind: 'sef', url: 'https://e.org/a.sef.json' }, '', site)).toBe('https://e.org/a.sef.json');
  });
});

describe('injectBase', () => {
  it('head の直後に入れる', () => {
    expect(injectBase('<!DOCTYPE html><html><head><meta charset="utf-8"></head>', 'https://x/')).toBe(
      '<!DOCTYPE html><html><head><base href="https://x/"><meta charset="utf-8"></head>',
    );
  });
  it('head が無ければ先頭に入れる', () => expect(injectBase('<p>a</p>', 'https://x/')).toBe('<base href="https://x/"><p>a</p>'));
});

describe('目録', () => {
  it('10 件で、題名は言語ごとに分かれている', () => {
    expect(XSL_CATALOG).toHaveLength(10);
    for (const x of XSL_CATALOG) expect(x.file).toMatch(/^tei-.+\.sef\.json$/);
    const manchu = XSL_CATALOG.find((x) => x.id === 'manchu')!;
    expect(xslTitle(manchu, 'ja')).toBe('清語老乞大 縦書きビュー');
    expect(xslTitle(manchu, 'en')).toMatch(/^Cing/);
  });
});
