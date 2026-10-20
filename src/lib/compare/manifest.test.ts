import { describe, expect, it } from 'vitest';
import { canvasText, pickLabel, readManifest } from './manifest';

const canvas = (id: string, label: unknown, values?: string[]) => ({
  id,
  type: 'Canvas',
  label,
  items: [],
  ...(values && { annotations: [{ id: `${id}/annos`, type: 'AnnotationPage', items: values.map((value) => ({ type: 'Annotation', body: { type: 'TextualBody', value } })) }] }),
});

describe('pickLabel', () => {
  it('文字列・言語ごとの配列・v2 の組を読む', () => {
    expect(pickLabel('源氏')).toBe('源氏');
    expect(pickLabel({ ja: ['桐壺'], en: ['Kiritsubo'] })).toBe('桐壺');
    expect(pickLabel([{ '@value': 'v2', '@language': 'ja' }])).toBe('v2');
    expect(pickLabel(undefined)).toBe('');
  });
});

describe('canvasText', () => {
  it('注釈の値を改行でつなぐ', () => {
    expect(canvasText(canvas('c', 'x', ['一行目', '二行目']) as never)).toBe('一行目\n二行目');
  });
  it('注釈が無ければ空', () => {
    expect(canvasText(canvas('c', 'x') as never)).toBe('');
  });
});

describe('readManifest', () => {
  it('Presentation 3 の Canvas と文字を読む', () => {
    const m = readManifest({ type: 'Manifest', label: { none: ['見本'] }, items: [canvas('c1', { none: ['1'] }, ['あ']), canvas('c2', undefined)] });
    expect(m).toEqual({
      label: '見本',
      canvases: [
        { id: 'c1', label: '1', text: 'あ' },
        { id: 'c2', label: '2', text: '' },
      ],
    });
  });
  it('Presentation 2 は Canvas だけ読む（文字は空）', () => {
    const m = readManifest({ '@type': 'sc:Manifest', label: 'v2', sequences: [{ canvases: [{ '@id': 'c1', label: 'p1' }] }] });
    expect(m?.canvases).toEqual([{ id: 'c1', label: 'p1', text: '' }]);
  });
  it('Canvas が無い・JSON でないものは null', () => {
    expect(readManifest({ items: [] })).toBeNull();
    expect(readManifest('x')).toBeNull();
    expect(readManifest(null)).toBeNull();
  });
});
