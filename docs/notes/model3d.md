# 3D ペイン（3D モデルと本文をつなぐ）

## 2026-10-24 元アプリの TEI の書き方と、組み込み方

元にしたのは、Sketchfab のモデルと TEI の本文を並べる Next.js のアプリ（非公開リポジトリ）。見本の TEI 7 件を読んだ。

座標の持ち方は 3 通りだった。

- **Sketchfab（5 件）**: `surface@corresp` にモデルの uid（32 桁の 16 進。`#sketchfab-<uid>` の形も 1 件）、または `graphic@url` に `https://sketchfab.com/3d-models/<uid>`。
  zone は Sketchfab 側に登録した注記の番号だけを持ち、書き方が `zone@n`・`zone@idno`・`note/idno` と揺れている。位置そのものは TEI に無い
- **GLB（1 件）**: `surface type="threejs" corresp="<file>.glb"`、zone は `type="polygon" points="x,y,z x,y,z …"`。
  元アプリは `zone@x @y @z`（1 点）も読むが、見本には無い
- **3D なし（1 件）**

本文とのつなぎも向きが揃っていない。本文の `@corresp`・`@facs` が zone を指すもの、`zone@corresp` が本文の要素を指すものの両方がある。
元アプリは、どの TEI にどのモデルを付けるかを TEI の外の JSON（`tei-files.json`）で決めていたが、Awase では TEI だけで決まるようにする（`surface@corresp` と `graphic@url` を読む）。

決めたこと:

- 画像ペインには混ぜず、`panes=` に `model` を足して別のペインにする。画像ペインは頁（pb）単位の作りで、3D には頁が無い。
  地図ペインと同じく、本文との連動は URL の `id=` に乗せる
- 最初は Sketchfab だけを描く（見本の 5/7）。GLB はモデルのファイルを置く場所（CORS の許された置き場）が決まってから足す。読み取りは最初から両方に対応させる
- 元アプリの、モデル一覧をサーバ側で取る仕組み（Sketchfab の API トークンが要る）は持ち込まない。公開モデルの埋め込みはトークン無しで動く
- 見本の TEI は非公開リポジトリのものなので、Awase（公開）には写さない。テスト用の TEI は書き方だけを真似て新しく作る
