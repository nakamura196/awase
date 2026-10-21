import { describe, expect, it } from 'vitest';
import { parseConfig, TeiLoadError } from './load';

describe('parseConfig（PTV の config.json）', () => {
  it('url_main と url_sub（または camelCase の urlMain・urlSub）を並べ、相対 URL は config の URL で解決する', () => {
    const text = JSON.stringify({ url_main: 'pt/01.xml', url_sub: 'https://example.org/sub.xml', direction: 'vertical' });
    expect(parseConfig(text, 'https://example.org/data/config.json')).toEqual({
      sources: ['https://example.org/data/pt/01.xml', 'https://example.org/sub.xml'],
      vertical: true,
    });
    const camel = JSON.stringify({ urlMain: 'pt/01.xml', urlSub: 'https://example.org/sub.xml' });
    expect(parseConfig(camel, 'https://example.org/data/config.json').sources).toEqual([
      'https://example.org/data/pt/01.xml',
      'https://example.org/sub.xml',
    ]);
  });

  it('direction が無ければ縦横を決めない', () => {
    expect(parseConfig('{"url_main":"https://e.org/a.xml"}').vertical).toBeUndefined();
  });

  it('url_main も url_sub も無ければ config の誤りにする', () => {
    expect(() => parseConfig('{"label_main":"x"}')).toThrow(TeiLoadError);
  });
});
