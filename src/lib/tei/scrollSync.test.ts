import { describe, expect, it } from 'vitest';
import { followOffset } from './scrollSync';

describe('followOffset', () => {
  it('共通の点が無ければ合わせない', () => {
    expect(followOffset([])).toBeNull();
  });

  it('2 点の間の割合を、合わせる列でも保つ', () => {
    // 動かした列: 端は 1 つ目の点の 100px 先、2 つ目の点の 300px 手前（4 分の 1）
    // 合わせる列: 同じ 2 点が 50px と 850px → 4 分の 1 の所は 250px
    expect(followOffset([{ source: -100, target: 50 }, { source: 300, target: 850 }])).toBe(250);
  });

  it('点の並びが文書の順でなくても、端をはさむ 2 点を選ぶ', () => {
    const pairs = [
      { source: 500, target: 900 },
      { source: -200, target: -400 },
      { source: 0, target: 120 },
    ];
    expect(followOffset(pairs)).toBe(120);
  });

  it('最初の点より手前なら、その点と端との間をそろえる', () => {
    expect(followOffset([{ source: 40, target: 300 }, { source: 400, target: 900 }])).toBe(260);
  });

  it('最後の点より先なら、その点と端との間をそろえる', () => {
    expect(followOffset([{ source: -400, target: 0 }, { source: -100, target: 200 }])).toBe(300);
  });
});
