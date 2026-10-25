import { describe, expect, it } from 'vitest';
import { getSources, isVertical, paneShown, resolveLegacyRedirect, togglePane } from './viewerParams';

describe('getSources', () => {
  it('u と tei を書いた順に集める', () => {
    expect(getSources(new URLSearchParams('u=a&dir=v&tei=b&u=c'))).toEqual(['a', 'b', 'c']);
  });

  it('config と url も同じ並びに入れる', () => {
    expect(getSources(new URLSearchParams('config=x&u=a&url=b'))).toEqual(['x', 'a', 'b']);
  });
  it('url に JSON 配列が来たら展開する（TEI-EAJ/app・書簡地図の互換）', () => {
    expect(getSources(new URLSearchParams('url=%5B%22https%3A%2F%2Fe.org%2F1.xml%22%2C%22https%3A%2F%2Fe.org%2F2.xml%22%5D'))).toEqual([
      'https://e.org/1.xml',
      'https://e.org/2.xml',
    ]);
  });
  it('空の値は飛ばす', () => {
    expect(getSources(new URLSearchParams('u=&u=%20&u=a'))).toEqual(['a']);
  });
  it('同じ URL を 2 度書けば 2 つ並べる', () => {
    expect(getSources(new URLSearchParams('u=a&u=a'))).toEqual(['a', 'a']);
  });
  it('無ければ空', () => {
    expect(getSources(new URLSearchParams('dir=v'))).toEqual([]);
  });
});

describe('isVertical', () => {
  it('dir=v と旧 tei_viewer の textDirection=vertical を縦書きと判定する', () => {
    expect(isVertical(new URLSearchParams('dir=v'))).toBe(true);
    expect(isVertical(new URLSearchParams('textDirection=vertical'))).toBe(true);
    expect(isVertical(new URLSearchParams('dir=h&textDirection=vertical'))).toBe(false);
    expect(isVertical(new URLSearchParams(''))).toBe(false);
  });
});

describe('resolveLegacyRedirect', () => {
  it('引数も # のクエリも無ければ転送しない', () => {
    expect(resolveLegacyRedirect('', '')).toBeNull();
    expect(resolveLegacyRedirect('', '#/v2')).toBeNull();
  });

  it('PTV の /#/v2?u=... を viewer へ移す', () => {
    expect(resolveLegacyRedirect('', '#/v2?u=https%3A%2F%2Fe.org%2Fconfig.json')).toEqual({
      path: '/viewer/',
      search: '?u=https%3A%2F%2Fe.org%2Fconfig.json',
    });
  });

  it('トップの ?u=...（koui・tei_viewer・letter）を viewer へ移す', () => {
    expect(resolveLegacyRedirect('?u=https%3A%2F%2Fe.org%2Fa.xml&textDirection=vertical', '')).toEqual({
      path: '/viewer/',
      search: '?u=https%3A%2F%2Fe.org%2Fa.xml&textDirection=vertical',
    });
  });

  it('text-comparison の ?manifest1=...&manifest2=... を compare へ移す', () => {
    expect(resolveLegacyRedirect('?manifest1=https%3A%2F%2Fe.org%2Fm1.json&manifest2=https%3A%2F%2Fe.org%2Fm2.json', '')).toEqual({
      path: '/compare/',
      search: '?manifest1=https%3A%2F%2Fe.org%2Fm1.json&manifest2=https%3A%2F%2Fe.org%2Fm2.json',
    });
  });

  it('dts-viewer の ?base=... を dts へ移す', () => {
    expect(resolveLegacyRedirect('?base=https%3A%2F%2Fdts.ldas.jp%2Fapi%2Fdts', '')).toEqual({
      path: '/dts/',
      search: '?base=https%3A%2F%2Fdts.ldas.jp%2Fapi%2Fdts',
    });
  });

  it('tei-tools の ?url=...&xsl=... を xsl へ移す', () => {
    expect(resolveLegacyRedirect('?url=https%3A%2F%2Fe.org%2Fa.xml&xsl=reading', '')).toEqual({
      path: '/xsl/',
      search: '?url=https%3A%2F%2Fe.org%2Fa.xml&xsl=reading',
    });
  });
});

describe('paneShown', () => {
  it('panes を書かなければ全部出す', () => {
    expect(paneShown(null, 'image')).toBe(true);
    expect(paneShown(null, 'model')).toBe(true);
    expect(paneShown(null, 'apparatus')).toBe(true);
    expect(paneShown(null, 'entities')).toBe(true);
    expect(paneShown(null, 'speech')).toBe(true);
    expect(paneShown(null, 'map')).toBe(true);
    expect(paneShown(null, 'timeline')).toBe(true);
  });
  it('書いたら、含むものだけ出す（koui の互換 panes=text,apparatus）', () => {
    expect(paneShown('text,apparatus', 'apparatus')).toBe(true);
    expect(paneShown('text,apparatus', 'image')).toBe(false);
    expect(paneShown('text,model', 'model')).toBe(true);
    expect(paneShown('text,entities', 'entities')).toBe(true);
    expect(paneShown('text,speech', 'speech')).toBe(true);
    expect(paneShown('text,map,timeline', 'map')).toBe(true);
    expect(paneShown('text,map,timeline', 'timeline')).toBe(true);
  });
});

describe('togglePane', () => {
  it('全部出ているところから 1 つ消す', () => {
    expect(togglePane(null, 'image')).toBe('text,model,apparatus,entities,speech,map,timeline');
    expect(togglePane(null, 'entities')).toBe('text,image,model,apparatus,speech,map,timeline');
  });
  it('消したものを戻して全部そろえば書かない', () => {
    expect(togglePane('text,model,apparatus,entities,speech,map,timeline', 'image')).toBeNull();
  });
  it('指定のペインだけを出し入れする', () => {
    expect(togglePane('text', 'apparatus')).toBe('text,apparatus');
    expect(togglePane('text,apparatus', 'apparatus')).toBe('text');
  });
});

describe('vrm（明示したときだけ出すペイン）', () => {
  it('panes を書かなければ出さない', () => {
    expect(paneShown(null, 'vrm')).toBe(false);
  });
  it('panes に書いたら出す', () => {
    expect(paneShown('text,vrm', 'vrm')).toBe(true);
    expect(paneShown('text,speech', 'vrm')).toBe(false);
  });
  it('書いていない状態から出すと、ほかのペインも全部書き出す', () => {
    expect(togglePane(null, 'vrm')).toBe('text,image,model,apparatus,entities,speech,map,timeline,vrm');
  });
  it('消すと、ほかが全部出ていれば書かない', () => {
    expect(togglePane('text,image,model,apparatus,entities,speech,map,timeline,vrm', 'vrm')).toBeNull();
  });
  it('vrm だけが付いたままほかを消しても書く', () => {
    expect(togglePane('text,image,model,apparatus,entities,speech,map,timeline,vrm', 'image')).toBe(
      'text,model,apparatus,entities,speech,map,timeline,vrm',
    );
  });
  it('vrm を足しても、ほかのペインの出し入れは変わらない', () => {
    expect(togglePane('text', 'vrm')).toBe('text,vrm');
    expect(togglePane('text,vrm', 'vrm')).toBe('text');
  });
});
