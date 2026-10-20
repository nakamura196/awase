# compare（比べる画面）の実験ノート

## 2026-10-20 第 1 段階: text-comparison の互換

### やったこと

`/[locale]/compare/` を作った。text-comparison と同じ URL の引数をそのまま受ける。
引数は `manifest1`・`manifest2`・`canvas1`・`canvas2`・`label1`・`label2`・`mode`・`embed` である。

画面は 2 つ。
1 つ目は画像で、左右に 1 つずつ、IIIF Kasane の画像ビューア（iiif-viewer）を置く。
viewer の ImagePane をそのまま使い、Canvas の送りも左右別々にある。
2 つ目は文字の差分で、左右の Canvas の文字を字ごとに突き合わせる。
左だけにある字は取り消し線、右だけにある字は緑で示す。編集距離と類似度も出す。

引数が無いときは、マニフェストの URL を 2 つ入れる欄と見本を出す。
Canvas の送りと表示の切り替えは URL に書く（履歴は増やさない）ので、そのまま共有できる。
読み込みの失敗は、例外にせず画面に理由を書く。

### 決めたこと

- `mode` は数字のまま受ける。0 が画像、1 が文字の差分（既定）。URL に書くときも数字にする。理由は、既に配ってある text-comparison のリンクを壊さないため。
- `mode=2`（編集距離のネットワーク図）は、文字の差分を出して「まだ作っていない」と断りを添える。
- 差分は新しい依存を足さず、`src/lib/compare/diff.ts` に書いた（共通の頭と尻を除き、残りを LCS で突き合わせる）。text-comparison は `diff` パッケージを使っていた。
- 編集距離は viewer の異文で使っている `levenshtein`（`src/lib/tei/apparatus.ts`）をそのまま使う。類似度は 1 − 距離 ÷ 長いほうの字数。
- 長い文章で表が大きくなりすぎないよう、残りの字数の積が 1,600 万を超えたら、突き合わせず「全部入れ替え」にする。1 頁の文字ならこの上限には届かない。
- 文字は Canvas の `annotations` の各注釈の `body.value` を改行でつなぐ（text-comparison と同じ）。Presentation 2 の Canvas には文字が付かないので、画像だけ比べられる。text-comparison は 2 に対応していなかった。
- 画像ビューアは、見ている頁だけを開く。タブを替えるたびに作り直す（text-comparison は隠して残していた）。three.js のビューアを、大きさ 0 の隠れた枠に置きたくないため。

### 確かめたこと

- 見本は text-comparison の組と同じ。校異源氏物語 `https://genji-ai.web.app/iiif/koui/koui-01/manifest.json`（24 Canvas）と、国立国会図書館の写本 `https://genji-ai.web.app/iiif/ndl_2585098/ndl_2585098-01/manifest.json`（43 Canvas）。
- 2026-10-20 に curl で、どちらも 200 で `access-control-allow-origin: *` が付くことを確かめた。
- 見本の Canvas の文字数は、koui の canvas/5 が 485 字、NDL の canvas/3 が 168 字。
- NDL の画像（info.json と切り出し）も 200 で、CORS が付く。
- vitest は diff・manifest・params で 22 件通った。
- e2e は compare.spec.ts の 8 件を含め、全体で 71 件通った（作り物のマニフェストを `page.route` で差し替え）。

### まだやっていないこと・確かめていないこと

- 編集距離のネットワーク図（vis-network）。依存を足さない方針なので見送った。
- 実際のブラウザで見本の組を開いた画面は、目では見ていない（e2e は作り物のマニフェストで確認した）。
- 左右の画像のズームや位置の連動はしていない。
- 類似度は 1 頁分の文字どうしの値で、資料全体の比較ではない。
