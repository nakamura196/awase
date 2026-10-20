// compare の URL の引数（text-comparison と同じ名前と意味）。
// mode は text-comparison の数字をそのまま受ける: 0 = 画像、1 = 文字の差分（既定）、2 = 編集距離のネットワーク図

export type CompareMode = 'image' | 'diff';

/** 引数なしのときに開く画面 */
export const DEFAULT_MODE: CompareMode = 'diff';

/** 2（ネットワーク図）は未対応なので、文字の差分で開く。ネットワーク図を開こうとしたかは networkMode で分かる */
export function parseMode(raw: string | null): CompareMode {
  const v = raw?.trim();
  if (v === '0' || v === 'image') return 'image';
  return DEFAULT_MODE;
}

/** 古い mode=2（ネットワーク図）か */
export function networkMode(raw: string | null): boolean {
  return raw?.trim() === '2';
}

/** URL に書く mode の値。text-comparison の数字にそろえる */
export function modeValue(mode: CompareMode): string {
  return mode === 'image' ? '0' : '1';
}

export interface Side {
  manifest: string;
  canvas: string;
  label: string;
}

/** 左（1）と右（2）の引数を読む。どちらかのマニフェストが無ければ null（入口を出す） */
export function readSides(params: Pick<URLSearchParams, 'get'>): [Side, Side] | null {
  const side = (n: 1 | 2): Side => ({
    manifest: params.get(`manifest${n}`)?.trim() ?? '',
    canvas: params.get(`canvas${n}`)?.trim() ?? '',
    label: params.get(`label${n}`)?.trim() ?? '',
  });
  const sides: [Side, Side] = [side(1), side(2)];
  return sides[0].manifest && sides[1].manifest ? sides : null;
}

/** 左右の指定から URL の引数を作る。空の canvas・label は書かない */
export function buildParams(sides: [Side, Side], mode?: CompareMode, embed = false): URLSearchParams {
  const p = new URLSearchParams();
  sides.forEach((s, i) => {
    const n = i + 1;
    p.set(`manifest${n}`, s.manifest);
    if (s.canvas) p.set(`canvas${n}`, s.canvas);
    if (s.label) p.set(`label${n}`, s.label);
  });
  if (mode) p.set('mode', modeValue(mode));
  if (embed) p.set('embed', '1');
  return p;
}
