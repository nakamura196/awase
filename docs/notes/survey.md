# 既存 TEI ビューアの棚卸しと awase の方針

awase（合せ）は、TEI-EAJ ほかに散らばった TEI ビューアを 1 つにまとめる統合ビューア。
IIIF Kasane（~/git/iiif/iiif-kasane）の TEI 版として、同じ作り（Next.js の静的書き出し、
URL で資料を指定、日英、埋め込み）で作る。持ち主は nakamura196、置き場所は ~/git/genji/awase。

## 2026-10-19 棚卸し（コードの読み取り。実際の画面は一部しか見ていない）

### 対象と、それぞれにしか無いもの

| ビューア | 土台・最終更新 | 入力（後方互換で受ける URL） | 他に無いもの |
|---|---|---|---|
| TEI-EAJ/parallel_text_viewer（~/git/genji/parallel_text_viewer） | Nuxt 2・2026-10 | `/app/#/v2?u=<config.json>`、`/v2?u=`、`/?u=` | 本文・訳・画像の 3 者連動ハイライト。config.json で束ねる |
| TEI-EAJ/koui（校本風異文可視化） | Nuxt 2・2023-06 | `?u=<TEI>` | `app/lem/rdg@wit` の異文をその場で表示、異文表、伝本間の一致度グラフ、`pb@facs`→zone で画像 |
| TEI-EAJ/tei_viewer | Nuxt 2・2022-06 | `?u=&textDirection=vertical&area=<JSON>&feature=i&config=&c=` | 人物・地名・日付・地図（Wikidata）・ワードクラウド・年表などの部品、`area` で自由にペインを組む |
| nakamura196/dts-viewer（~/git/genji/dts-viewer） | Next 15・2026-05 | `/[locale]/?base=<DTS entry>&url=<endpoint>` | DTS の Collection / Navigation を辿る。本文の描画は無い。バックエンドは dts.ldas.jp（dts-typescript） |
| text-comparison（~/git/genji/text-comparison、iiif-text.vercel.app） | Next・2026-02 | `?manifest1&manifest2&canvas1&canvas2&label1&label2&mode&embed=1` | 画像の左右比較、文字単位の差分、編集距離のネットワーク図、`embed=1` |
| TEI-EAJ/letter | Nuxt 2・2021-02 | `?u=<TEI>` | `correspDesc/correspAction` から送受信地の地図・年表・表 |
| TEI-EAJ/app（実体は書簡の可視化、未公開） | Nuxt 2・2022-04 | `/letters?url=<TEI URL の配列 JSON>` | 複数 TEI を横断して 1 つの地図・年表・グラフにする |
| aozora_tei wiki「視覚化ツール」 | 素の HTML + jQuery | `performance_texts/line.html?url=`、`letters/map.html?url=<配列 JSON>`、`facs/?url=`（tei_viewer の `?u=…&feature=i` へ転送）、`display_dazai.html`、`cetei.html`、`said.html` | 台詞 `sp@who` を LINE 風に、`said@who`・`persName@corresp` の人物別集計（d3）、書簡地図 |
| aozora_tei wiki「視覚化例」 | — | 絵入源氏の PTV（`.../data/pt/config.json`）、dhii.jp genji2.html（大成の校異）、kanzaki.com image-annotator（IIIF v3 音声注釈、生死未確認） | 実例。awase のサンプル集の候補 |
| toyo-bunko/tei-tools（~/git/toyo/tei-tools、tei-tools.toyobunko-lab.jp） | 静的 HTML | `view.html`（XML × XSL を全画面）、`catalog.json` | **XSL の選び替えで見せ方を変える**（reading / vellum / bibliography / analysis / ner / notes / manchu / ocr-facsimile ほか）。SaxonJS で実行 |
| archivebase の text アプリ | Next | `/api/{account}/tei/{db}/{id}/xml` | XSL カタログ（DB ごと）、固有表現の集計、検索・権限との統合 |
| kuroshima/sketchfab-tei-viewer-next | Next 15・2026-01 | — | Sketchfab の 3D 注釈と TEI の地名の連動（特殊。別モジュール扱い） |

### TEI の書き方の前提（読めるようにする規約）

- PTV: 本文の `<seg corresp="…/items/0005-01.json">` と `<anchor corresp="…/yosano/01.xml#YG…"/>`、訳の `<s xml:id>`。
  画像は IIIF Curation（`selections[].members[]` に canvas と `lineId`）。config.json のキーは camelCase と snake_case の両方
  （urlMain/url_main、urlSub、imageMap、direction、returnUrl、labelMain/labelSub、layout）
- koui: `listWit/witness`、`facsimile/surfaceGrp@facs=<manifest>/surface/graphic@n=<canvas>/zone`、`pb@facs="#zone_…"`、
  parallel segmentation の `app/lem/rdg@wit`
- 書簡: `correspDesc/correspAction`（sender / addressee / date / placeName）
- 戯曲・人物: `sp@who`、`said@who`、`persName@corresp|@ref`、`rs`

### 途中で分かった、自明でない事実

- **Chrome 158（2026-11）でブラウザ内蔵の XSLT（`XSLTProcessor`）が消える。** Firefox・WebKit も追随。
  tei-tools は SaxonJS（XSL を事前に SEF へ変換して実行）に移し済み。
  **archivebase の text アプリは `XSLTProcessor` を使っているので、同じ対応が要る。** awase も最初から SaxonJS で作る
- 新サイト genji-api.ldas.jp の `public/data/vol/*/config.json` は、まだ旧ドメイン genji.dl.itc.u-tokyo.ac.jp を指している。
  awase に移すとき、新ドメインに直す
- 旧 AI 版の「文字列の類似度比較」（text-comparison を開くボタン）は genji-api に移っていない。
  awase の比較画面で受けられる（下の方針の 3）

## 方針（2026-10-19 決定分と案）

決定: 新しいリポジトリ awase（nakamura196、~/git/genji/awase）。iiif-kasane と同じ作り。

案（次のセッションで詰める）:

1. **描画の仕組みは 1 本にする。** 標準は CETEIcean 風（TEI の要素をそのままページの部品にする）。
   見せ方を変えたいときは tei-tools と同じく XSL を選び替える（SaxonJS）。独自のパーサや xml2json は持ち込まない
2. **見せ方は「表示モジュール」として足す。** 本文 / 画像（IIIF、kasane の部品を流用）/ 対訳 / 異文 / 人物・地名 /
   地図 / 年表 / 台詞 / XSL 表示。tei_viewer の `area` のようにペインへ並べ、URL で共有できるようにする
3. **比べる画面を核にする（名前の由来）。** 本文と訳（PTV）、伝本どうし（koui）、2 資料の画像と文字（text-comparison）
4. **入力は `?u=`（中身が config か TEI かを見て分ける）を中心にし、kasane の `?manifest=` に倣って `?tei=` を足す。**
   上の表の旧 URL はすべて受ける。tei-eaj.github.io 側の旧ビューアは awase へ転送する形にする
5. **データ源**: TEI の URL、URL の配列（書簡の横断）、DTS（dts.ldas.jp）
6. 持ち込まないもの: Nuxt 2 / Vuetify、Mirador を URL パラメータで操る iframe、jQuery の DOM 走査、Firebase 依存、
   青空文庫専用のパス

## 確かめていないこと

- 各ビューアの実際の画面（コードの読み取りだけ）
- PTV v2 の連動処理の細部（連動の処理は v1 側のファイルにある）
- kanzaki.com の image-annotator が今も動くか

## 2026-10-19 設計案（画面の構成と URL の形）

### 土台は iiif-kasane をそのまま写す（本人の指示）

kasane のリポジトリ（c1769bb, 2026-10-19）を写して始める。次はそのまま使う。

- 画面の枠: ヘッダー・フッター・テーマ切り替え（next-themes）・言語切り替え（next-intl、`/[locale]/`、ja/en）・`LocaleRedirect`
- 静的書き出し（`output: 'export'`、`trailingSlash`）と GitHub Pages 用の basePath の切り替え、`check-basepath.sh`・`check-export.mjs`
- リポジトリの備え: LICENSE・CODE_OF_CONDUCT・CONTRIBUTING・SECURITY・AGENTS.md・CLAUDE.md・`.github`
  （dependabot は cooldown 付き、deploy-pages は SHA で固定済み、Issue・PR のひな形）、eslint・vitest・playwright
- 中身の入れ物: news・help・terms・privacy・samples・usecases（文面は awase 用に書き直す）

外すもの: gallery・georef・search・inference-models・structure-share-embed・three（3D）・`public/` の IIIF 見本・
`scripts/align`・`scripts/inference`。map（maplibre）は書簡の地図に使うので残す。

### 画面

| パス | 役割 | 引き継ぐ旧ビューア |
|---|---|---|
| `/[locale]/` | できることの紹介と見本 | — |
| `/[locale]/viewer/` | 1 つ（または複数）の TEI を、表示モジュールを並べて見る | PTV・tei_viewer・koui・letter・app・aozora_tei の視覚化 |
| `/[locale]/compare/` | 2 資料を左右に並べ、画像と文字の差を見る | text-comparison |
| `/[locale]/xsl/` | XSL を選び替えて全画面で見る（SaxonJS、SEF） | tei-tools の view.html |
| `/[locale]/dts/` | DTS のコレクションをたどり、選んだ本文を viewer で開く | dts-viewer |

viewer の表示モジュール（ペイン）: `text`（本文、CETEIcean 風）、`image`（IIIF）、`parallel`（対訳の連動）、
`apparatus`（異文・伝本間の一致度）、`entities`（人物・地名の一覧）、`map`、`timeline`、`speech`（台詞・`said`）、`xsl`。
TEI の中身を見て、使えるペインだけを自動で出す（`listWit` があれば apparatus、`correspDesc` があれば map と timeline、など）。

### viewer の URL

| 引数 | 意味 |
|---|---|
| `u` | TEI か config.json。中身を見て分ける。繰り返し可（書簡の横断） |
| `tei` | TEI と明示するとき（kasane の `manifest` に倣う）。繰り返し可 |
| `config` | PTV 形式の config.json と明示するとき |
| `manifest` / `curation` | 画像を TEI の `facsimile` とは別に指定するとき |
| `panes` | 並べるペイン。例 `text,image`。省略時は自動 |
| `dir` | `v`（縦書き）/ `h` |
| `wit` | 異文で表に出す伝本 |
| `xsl` | xsl ペインのスタイルシート（カタログ id か `.sef.json` の URL） |
| `id` | 開いたときに移動・強調する `xml:id` |
| `embed` | `1` で枠を外す（text-comparison と同じ） |

### 旧 URL の受け方

| 旧 | 新 |
|---|---|
| PTV `/app/#/v2?u=` `/v2?u=` `/?u=` | `viewer/?u=` |
| tei_viewer `?u=&textDirection=vertical&feature=i&area=` | `viewer/?u=&dir=v&panes=text,image`（`area` はペインに読み替え、できる範囲で） |
| koui `?u=` | `viewer/?u=&panes=text,apparatus` |
| letter `?u=` | `viewer/?u=&panes=map,timeline,entities` |
| app `/letters?url=<配列 JSON>` | `viewer/?u=…&u=…&panes=map,timeline` |
| text-comparison `?manifest1&manifest2&…` | `compare/` で同じ引数名をそのまま受ける |
| dts-viewer `/[locale]/?base=&url=` | `dts/?base=&url=` |
| tei-tools `view.html?url=&xsl=` | `xsl/?u=&xsl=`（`url` も受ける） |

`#/v2` のような `#` 以降はサーバに届かない。静的書き出しでは、トップのページで JavaScript が読んで転送する。
tei-eaj.github.io の旧ビューアは、各リポジトリの入口を awase への転送ページに差し替える（awase が動いてから）。

### 配り方

GitHub Pages（nakamura196.github.io/awase）。kasane の deploy-pages.yml をそのまま使う。public リポジトリなら Actions は無料。

### 未決（本人の判断）

- 画像ペインに kasane の `packages/iiif-viewer` をどう持ってくるか。npm に出ていない（0.1.0、未公開）。
  案 A: kasane から npm に公開して awase はそれを入れる（推奨。2 か所で直さずに済む）。
  案 B: awase に写す（405 ファイル。直すたびに両方を直すことになる）

### 今日分かったこと（見本のデータ）

- genji-api の `public/data/vol/*/config.json` が指す `genji.dl.itc.u-tokyo.ac.jp/data/tei/koui/01.xml` と
  `…/yosano/01.xml` は 404。新ドメイン `genji-api.ldas.jp/data/tei/…` にも無い。上で「新ドメインに直す」と書いたが、直す先がそもそも無い
- 読める本文: `https://w3id.org/kouigenjimonogatari/tei/01.xml`（校異源氏）、
  `https://tei-eaj.github.io/parallel_text_viewer/data/yosano.xml`（与謝野訳）。どちらも CORS あり（`*`）
- `genji-api.ldas.jp/data/…` は CORS の応答ヘッダーが無い（`pt/map.json`、`vol/01/curation.json` で確認）。
  awase から直接読むなら genji-api 側（Cloudflare）で付ける必要がある
