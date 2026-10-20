import { describe, expect, it } from 'vitest';
import { correspIds } from './link';

describe('correspIds', () => {
  it('# の後の id だけを取る（ファイル名は見ない）', () => {
    expect(correspIds('yosano_genji_ids.xml#YG0000000100')).toEqual(['YG0000000100']);
    expect(correspIds('#a')).toEqual(['a']);
  });

  it('空白区切りの参照をすべて取る', () => {
    expect(correspIds(' #a  other.xml#b ')).toEqual(['a', 'b']);
  });

  it('# の無い参照・空の値は捨てる', () => {
    expect(correspIds('person.xml')).toEqual([]);
    expect(correspIds('x.xml#')).toEqual([]);
    expect(correspIds(null)).toEqual([]);
  });
});
