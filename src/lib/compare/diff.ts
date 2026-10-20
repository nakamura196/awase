// 2 つの文章の、文字ごとの差分。
// 共通の頭と尻を除き、残りを最長共通部分列（LCS）で突き合わせる。サロゲートペアの字も 1 字と数える

export type DiffOp = { type: 'equal' | 'delete' | 'insert'; text: string };

// 残りの長さの積がこれを超えたら、突き合わせず「全部入れ替え」にする（表が大きくなりすぎるため）
const MAX_CELLS = 16_000_000;

function push(out: DiffOp[], type: DiffOp['type'], text: string) {
  if (!text) return;
  const last = out[out.length - 1];
  if (last?.type === type) last.text += text;
  else out.push({ type, text });
}

/** a から b への差分。delete は a だけにある字、insert は b だけにある字。続く同じ種類はまとめる */
export function diffChars(a: string, b: string): DiffOp[] {
  const s = Array.from(a);
  const t = Array.from(b);
  let head = 0;
  while (head < s.length && head < t.length && s[head] === t[head]) head++;
  let tail = 0;
  while (tail < s.length - head && tail < t.length - head && s[s.length - 1 - tail] === t[t.length - 1 - tail]) tail++;
  const x = s.slice(head, s.length - tail);
  const y = t.slice(head, t.length - tail);

  const out: DiffOp[] = [];
  push(out, 'equal', s.slice(0, head).join(''));
  if (!x.length || !y.length || (x.length + 1) * (y.length + 1) > MAX_CELLS) {
    // 片方が空なら素直に、大きすぎるときは全部入れ替えとして出す
    push(out, 'delete', x.join(''));
    push(out, 'insert', y.join(''));
  } else {
    // lcs[i][j] = x[i..] と y[j..] の最長共通部分列の長さ
    const w = y.length + 1;
    const lcs = new Uint32Array((x.length + 1) * w);
    for (let i = x.length - 1; i >= 0; i--) {
      for (let j = y.length - 1; j >= 0; j--) {
        lcs[i * w + j] = x[i] === y[j] ? lcs[(i + 1) * w + j + 1] + 1 : Math.max(lcs[(i + 1) * w + j], lcs[i * w + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < x.length && j < y.length) {
      if (x[i] === y[j]) {
        push(out, 'equal', x[i]);
        i++;
        j++;
      } else if (lcs[(i + 1) * w + j] >= lcs[i * w + j + 1]) {
        push(out, 'delete', x[i++]);
      } else {
        push(out, 'insert', y[j++]);
      }
    }
    push(out, 'delete', x.slice(i).join(''));
    push(out, 'insert', y.slice(j).join(''));
  }
  push(out, 'equal', s.slice(s.length - tail).join(''));
  return out;
}

/** 似ている度合い（0〜1）。1 − 編集距離 ÷ 長いほうの字数。両方空なら 1 */
export function similarity(distance: number, a: string, b: string): number {
  const len = Math.max(Array.from(a).length, Array.from(b).length);
  return len ? 1 - distance / len : 1;
}
