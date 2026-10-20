# xsl 画面（XSLT で TEI を変換して見せる）

## 2026-10-20 実装

`/[locale]/xsl/` を作った。TEI の URL と XSL を受け取り、変換した HTML を枠の中に出す。

### したこと

- tei-tools（MIT、nakamura196、コミット 839d787）から、次を写した。
  - コンパイル済みの XSL（SEF）10 本を `public/xsl/` へ（564KB）。
  - SaxonJS のランタイムとライセンスを `public/vendor/saxon/` へ（492KB）。
  - 変換結果が読む CSS 1 本と JS 7 本を `public/xsl-assets/` へ（64KB）。
- 変換は SaxonJS を画面を開いたときに `<script>` で読み込んで行う。npm の依存は足していない。
- 結果は `<iframe srcdoc>` に入れる。`sandbox="allow-scripts allow-popups"` で、same-origin は許していない。
- 引数は `u`（`url`・`tei` も受ける）、`xsl`、`embed=1`。`xsl` は目録の id、`.sef.json` の URL、`.xsl` の URL（隣の `.sef.json` にする）。
- `xsl` を省くと、TEI に `facsimile` と `graphic` があれば ocr、なければ reading を使う。tei-tools の view.js と同じ規則。
- 引数の解釈は `src/lib/xsl/params.ts` の純粋な関数にして、テストを付けた。

### 決めたことと理由

- SEF を自前で持つ。tei-tools の公開サイトは SEF を配っていない（404）ことを確かめたため。
- 結果の HTML は `css/theme.css` と `js/shared/*.js` を相対パスで読む。iframe の srcdoc には自分の URL が無いので、`<base href>` を入れて `public/xsl-assets/` を指させた。basePath（`/awase`）は `withBasePath` で付ける。
- 影印の `graphic@url` は、TEI の置き場所を基準にした絶対 URL に直してから変換する。iframe の中では相対パスが通じないため。
- 知らない `xsl` の id は、エラーにせず自動選択にした。tei-tools の挙動に合わせた。
- 同じ TEI で XSL だけ替えるときは、取得と解析をやり直さない。
- 失敗（取得・XML でない・変換）は、画面に短い文で出す。例外は投げない。
- 写した JS は外のコードなので、eslint の対象から外した（`public/vendor/**`、`public/xsl-assets/**`）。外さないと警告が 1,100 件出る。

### 確かめたこと

- 見本の URL は curl で確かめた。`w3id.org/kouigenjimonogatari/tei/01.xml` と tei-tools の `tei-guide`・`ocr-sample` は、どれも 200 で `access-control-allow-origin` が付く。
- vitest 全体で 13 ファイルが通った（このうち xsl の分は 1 ファイル）。
- e2e は全体で 68 件が通った。xsl の分は 6 件で、本物の SaxonJS で変換し、iframe の中の文字と、XSL を替えたときの URL の変化を見ている。
- `npm run build` で `/ja/xsl`・`/en/xsl` が書き出せた。

### まだしていないこと

- `npm run test:basepath`（`/awase` 配下の書き出し）は走らせていない。
- 結果の HTML の中の JS（頁送り・OpenSeadragon の影印）が、sandbox の中で動くかは確かめていない。頁送りは `location.search` を読むので、srcdoc では効かない可能性がある。
- 影印つきの TEI（ocr・vellum・urenja）を、実際の IIIF 画像で見ての確認はしていない。
- 外の SEF の URL を `xsl` に渡す場合、配信元の CORS が要る。
- tei-tools の XSL が更新されたときの取り込みは手作業。
