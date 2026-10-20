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

## 2026-10-20 訂正と追記: OCR ビューの影印が黒い件

Vercel のプレビューで、OCR ビューの右側（影印）が黒いままだと報告があった。手元では再現できなかった。

- 同じ TEI（`https://tei-tools.toyobunko-lab.jp/xml/ocr-sample/tei.xml`）を、next dev と書き出した静的ファイル（`out/`）の両方で開いた。どちらも影印の画像とゾーンの枠が出た。
- iframe の中では、OpenSeadragon（CDN）の読み込みも画像（f1.png）の取得も 200 で通った。canvas は 639×527 で描かれた。
- 頁送り（`tei-pager.js`）も動いた。srcdoc の中では `location` が `about:srcdoc` になり、`?page=1` が付く（`replaceState` が通る）。`allow-same-origin` は要らなかった。
- 手元で外れていた候補は、sandbox、`graphic@url` の書き換え、CORS、`<base>` の四つ。ブラウザは Chromium だけで確かめた（Firefox・WebKit は手元の Playwright で起動できなかった）。
- 原因は特定できていない。プレビュー側だけの要因（古いデプロイ、ブラウザの違い、画像の取得先が github.io のリダイレクト経由だった時期）が残る。
- 再発を捕まえるため、e2e に OCR ビューの確認を足した（`e2e/xsl.spec.ts`、画像は `page.route` で返す）。画像が描かれることと、次へで 2 頁目の画像が出ることを見る。OpenSeadragon は CDN から読むので、この確認にはネットワークが要る。

## 2026-10-20 プレビューで影印が黒かった原因（訂正・追記）

- 手元で再現しなかった黒い影印は、Vercel のプレビューにだけ起きる現象だった。
- プレビューには Vercel のログイン保護が掛かっている。ページ自体はブラウザのクッキーで開ける。
- sandbox の srcdoc は持ち主の無い出どころ（opaque origin）になるので、中からの読み込みにクッキーが付かない。
- そのため `xsl-assets/` の JS と CSS が 302 で Vercel のログインへ回され、枠の中のスクリプトが 1 つも動いていなかった（頁送りも出ず、2 頁目の本文まで並んでいた）。`curl` で 302 と `location: https://vercel.com/sso-api…` を確かめた。
- 本番（awase-kappa.vercel.app）は保護が無く 200 を返すので、起きない見込み。マージ後に本番で目視する。
- 同じ Chrome で tei-tools 本家の view.html は画像も頁送りも出た。
