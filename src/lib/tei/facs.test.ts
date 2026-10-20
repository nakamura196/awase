import { describe, expect, it } from 'vitest';
import { imageSrcs, localRefs, pageTarget, parseIiifImageUrl } from './facs';

describe('parseIiifImageUrl', () => {
  it('base と切り出しの範囲を取る（校異源氏の pb@facs）', () => {
    expect(parseIiifImageUrl('https://dl.ndl.go.jp/api/iiif/3437686/R0000022/0,0,3445,4706/full/0/default.jpg')).toEqual({
      service: 'https://dl.ndl.go.jp/api/iiif/3437686/R0000022',
      region: [0, 0, 3445, 4706],
    });
  });

  it('全体の画像なら範囲は無い', () => {
    expect(parseIiifImageUrl('https://example.org/iiif/a/full/full/0/default.jpg')).toEqual({
      service: 'https://example.org/iiif/a',
      region: undefined,
    });
    expect(parseIiifImageUrl('https://example.org/iiif/a/full/max/0/default.png')?.service).toBe('https://example.org/iiif/a');
  });

  it('IIIF でない画像の URL は null', () => {
    expect(parseIiifImageUrl('https://example.org/page1.jpg')).toBeNull();
  });
});

describe('localRefs', () => {
  it('# で始まる参照だけを取る', () => {
    expect(localRefs('#zone_1 https://example.org/a.jpg #s2')).toEqual(['zone_1', 's2']);
    expect(localRefs('#')).toEqual([]);
    expect(localRefs(null)).toEqual([]);
  });
});

describe('pageTarget', () => {
  const zone = { service: 'https://example.org/iiif/a', region: [100, 0, 100, 100] as [number, number, number, number] };
  const map = new Map([['zone_1', zone]]);

  it('facs の #id を引く（koui）', () => {
    expect(pageTarget({ facs: '#zone_1' }, map)).toBe(zone);
  });

  it('facs が画像の URL でも、corresp の #id を先に使う（校異源氏）', () => {
    expect(pageTarget({ facs: 'https://example.org/iiif/a/100,0,100,100/full/0/default.jpg', corresp: '#zone_1' }, map)).toBe(zone);
  });

  it('引けなければ facs の画像をそのまま使う', () => {
    expect(pageTarget({ facs: 'p1.jpg' }, map, 'https://example.org/tei/a.xml')).toEqual({ image: 'https://example.org/tei/p1.jpg' });
    expect(pageTarget({ facs: 'https://example.org/iiif/b/full/full/0/default.jpg' }, map)).toEqual({ service: 'https://example.org/iiif/b' });
  });

  it('何も無ければ null', () => {
    expect(pageTarget({ facs: '#nope' }, map)).toBeNull();
    expect(pageTarget({}, map)).toBeNull();
  });
});

describe('imageSrcs', () => {
  it('IIIF なら範囲だけを、幅を絞って取る。読めなければ元の大きさにする', () => {
    expect(imageSrcs({ service: 'https://example.org/iiif/a' }, 800)).toEqual([
      'https://example.org/iiif/a/full/800,/0/default.jpg',
      'https://example.org/iiif/a/full/max/0/default.jpg',
      'https://example.org/iiif/a/full/full/0/default.jpg',
    ]);
    expect(imageSrcs({ service: 'https://example.org/iiif/a', region: [3445, 0, 3445, 4706] }, 800)[0]).toBe(
      'https://example.org/iiif/a/3445,0,3445,4706/800,/0/default.jpg',
    );
  });

  it('範囲より大きくは取らない', () => {
    expect(imageSrcs({ service: 'https://example.org/iiif/a', region: [0, 0, 300, 400] }, 800)[0]).toBe(
      'https://example.org/iiif/a/0,0,300,400/300,/0/default.jpg',
    );
  });

  it('IIIF でない画像はそのまま', () => {
    expect(imageSrcs({ image: 'https://example.org/p.jpg' })).toEqual(['https://example.org/p.jpg']);
    expect(imageSrcs({})).toEqual([]);
  });
});
