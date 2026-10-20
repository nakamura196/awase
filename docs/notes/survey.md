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

## 2026-10-19 決定（本人）

- GitHub に nakamura196/awase を **private** で作った（push 済み）
- 画像の部品は、kasane の `packages/iiif-viewer` を **npm に公開して使う**（案 A）。公開はまだ
- 注意: 無料プランでは private リポジトリから GitHub Pages を出せない。配るときは public にするか、
  Cloudflare Pages など別の無料枠に出す

## 2026-10-19 訂正: archivebase の text アプリは XSLTProcessor を使っていなかった

上の「archivebase の text アプリは `XSLTProcessor` を使っているので、同じ対応が要る」は誤り。
2026-07-13（archivebase c607292f）から、TEI→HTML の変換はサーバ側（libxslt の `xsltproc`、`/api/tei/{id}/html`）で行っている。
`public/tei/view.html` は使われずに残っていた旧部品で、これを見て誤認した。本番の `/html` が 200 を返すことを確認した。
旧部品の削除と、サーバ側に移ってから 404 になっていた `theme.css` の参照の修正は archivebase PR #643。
awase で SaxonJS を使う方針は変えない（静的配信でサーバが無いため）。

## 2026-10-19 土台を写した

iiif-kasane c1769bb から、git 管理のファイルだけを写した（871a030・e92c9d6・79b3e1c）。
設計案で「外す」とした機能に加えて、samples と usecases も外した。中身が IIIF の見本に結びついているため、TEI の見本で作り直す。
`packages/iiif-viewer` は写していない。地図の部品がそこから借りていた型と関数は、`src/components/map/geo.ts` に小さく写した。
viewer・compare・xsl・dts は、受け取る URL の引数を表に出すだけの仮のページ。
lint（警告 13 件は写した MapView のもの）・test 29 件・build・basepath・export は通る。
npm audit の high 1 件は開発用の部品（braces、eslint-config-next 経由）。
GitHub Pages 用の書き出しは、`/awase` を付けた 1 回だけにした（kasane は 2 回書き出していた）。
LICENSE の著作権者は kasane のまま（中村・小川）。awase で変えるかは未決。

## 2026-10-19 viewer の text ペイン（ブランチ text-pane、0a0496b）

- 作り: TEI の要素を `tei-<小文字の名前>` の部品にし、属性はそのまま写す（CETEIcean と同じ）。見た目は CSS（`src/components/viewer/tei.css`）。
  手を足したのは lb（`<br>`）・pb（@n の目印）・ref/ptr（リンク）・graphic（画像）・choice と app（見せない方を指を置いたときに出す）だけ
- **React で部品を作らず、DOM で直接作った。** 理由: TEI には `ref`・`key` という属性があり、React ではこの 2 つが特別な意味を持つので、
  属性をそのまま写せない。あわせて、校異源氏 01 で部品が 1,137 個あり、React に持たせると重い
- **CETEIcean そのものは入れなかった。** 中身は「名前を付け替えて CSS で見せる」だけで、自前でも 150 行で済む。
  入れると、外から読んだ TEI の属性（`onclick` など）をそのまま写す既定の動きを抑える手間のほうが大きい
- 安全: innerHTML は使わない。`on*` と `style` の属性は落とす。リンク・画像の URL は http(s) とページ内の `#id` だけ
- 字下げの空白（改行を含む空白だけの文字列）は落とした。縦書きで部品の間に空きが出るため。
  英文で `<persName>A</persName>\n <persName>B</persName>` のように改行をはさむと、語の間の空白も消える（未対処）
- 落とし穴: 縦書き（`writing-mode: vertical-rl`）の枠は、幅を `100%` と決めないと中身の長さ（校異源氏 01 で 12,479px）まで広がり、
  横にスクロールしない。最初は本文の終わりが見えていた
- 校異源氏の和歌は `seg` の中の `lg` なので、行の中では改行せずに句を空けて流す（`tei-seg tei-lg` を inline に）
- 確かめたこと: e2e 6 件（見本 `e2e/fixtures/sample.xml` を route で返す）と入口 28 件、build・basepath・export。
  校異源氏 01（縦）と与謝野訳（横）を 1280px と 390px で目視
- まだ: `?u=` を複数受ける（書簡の横断）、config.json（PTV）、pb@facs と画像ペインの連動、`?panes=`

## 2026-10-19 `?u=` を複数受ける（ブランチ multi-u）

- `u` と `tei` はどちらも繰り返してよく、URL に書いた順に列を並べる（`src/lib/viewerParams.ts`）。画面から足す・閉じるときは `u` にそろえて書き直す
- 列ごとに書誌と本文を持つ。縦書き・改行・頁の切り替えと `id` は全部の列に効く。`id` は列ごとに探すので、同じ `xml:id` を持つ列が複数あれば、どれにも印が付く
- 1 つのときは本文の題名が h1。並べるときは列の題名を h2 にし、画面に出さない h1（「2 つの本文を並べて表示」）を置いた
- 広い画面（lg、1024px 以上）は横に等分、狭い画面は縦に積む。列の数に上限は付けていない
- 確かめたこと: e2e に 1 件足して 35 件（入口を含む）、vitest 44 件。校異源氏 01 と与謝野訳を 1280px（横・縦）と 390px で目視
- まだ: 列どうしのスクロールの連動（PTV は段落の対応で合わせる。対応を何で取るかは config.json と一緒に考える）

## 2026-10-19 列どうしの対応（ブランチ corresp-link）

- 見本: PTV の `data/pt/config.json`（絵入源氏 桐壺 `pt/01.xml` と与謝野訳 `yosano.xml`）。
  絵入源氏は `<line>` の途中に `<anchor corresp="yosano_genji_ids.xml#YG0000000100"/>` が 199 個あり、与謝野訳の `<s xml:id="YG…">`（138 個）を指す
- **指す先のファイル名（`yosano_genji_ids.xml`）は、与謝野訳の URL と一致しない。** そこで `#` の後の id だけで突き合わせた（`src/lib/tei/link.ts`）
- URL の `id` に「指される側の id」を持つ。どの列も、その id を xml:id に持つ要素、または `@corresp` で指す要素を探して印を付ける。
  どちらの列から押しても同じ id になるので、双方向になる。訳の文を押せば `id=YG…`、本文を押しても直前の anchor が指す `YG…` になる
- anchor は中身の無い目印なので、「その目印から次の目印の手前まで」を対応する範囲とみなした。範囲は行（`line`）をまたぐので要素に印を付けられない。
  要素を足さずに色を付ける CSS Custom Highlight（`CSS.highlights`）を使った（Chrome 105・Safari 17.2・Firefox 140 から）
- 本文を押した位置が、行の中で anchor の前か後かは、押した座標から文字の位置を取って決める（`caretPositionFromPoint`、無ければ `caretRangeFromPoint`）
- 対応の無い所（最初の anchor より前など）を押したときは、これまでどおり押した所の xml:id を選ぶ。指す先がほかの列に無い `@corresp` は使わない
- 押した列は動かさず、ほかの列だけを対応する所へ動かす
- config.json は `url_main`・`url_sub`・`direction` だけを使い、読んだら `?u=本文&u=訳&dir=` に書き直す（履歴は増やさない）。`?config=` でも受ける。
  `url_map`・`image_map`・`query_main`・`query_sub` は画像ペインを作るときに使う
- 確かめたこと: vitest 51 件、e2e 3 件を足して（見本 `e2e/fixtures/linked-*.xml`）viewer 10 件・入口 28 件、build・basepath・export。
  実データで、与謝野訳 YG0000000300 を押すと絵入源氏の「おなしほど。それより下らうの更衣たちはましてやすからず」が光る。1280px と 390px で目視
- 気づいたこと: 絵入源氏の anchor は所々に間が空く。YG0000005000 の次の anchor まで本文が長く続くので、光る範囲も長い（データの側の事情）
- まだ: 範囲の終わりを「次の目印」以外で決める書き方（`@corresp` を持つ `seg` で囲む、`spanTo`）への対応は、要素ごとの対応（`seg@corresp`）だけ。
  スクロールの連動（押さずに読み進めたとき、もう片方もついてくる）は未実装

## 2026-10-19 スクロールの連動（ブランチ scroll-sync）

- 合わせ方: 両方の列に共通する対応点（同じ xml:id、または片方の `@corresp` が指す、もう片方の xml:id。`#` の後の id で突き合わせる）を使う。
  動かした列で、枠の読み始めの端（横書きは上、縦書きは右）をはさむ 2 点を探し、その間の割合を出す。ほかの列も、同じ 2 点の間の同じ割合の所を端に合わせる
  （`src/lib/tei/scrollSync.ts`）。点と点の間は直線で補うので、本文と訳とで段落の長さが違っても滑らかに付いてくる。
  最初の点より手前・最後の点より先は、いちばん近い点と端との間をそろえる
- 位置は枠の端からの距離（`getBoundingClientRect`）で測り、動かすのは差だけ（横書きは scrollTop を足す、縦書きは scrollLeft を引く）。
  縦書きの scrollLeft はブラウザによって 0 から負に進むものと正のものがあるが、差だけを使うのでどちらでも同じに動く
- **行き来の止め方**: どの列を動かしたかは、スクロールの前の操作（ホイール・指・マウス・キー）で決め、その列のスクロールだけを手本にする（`useScrollSync.ts`）。
  付いていった列のスクロールは無視するので、動かし返しが起きない。押して選んだときの scrollIntoView も、手本にはならない
- 並べたときは横書きでも列の高さを決め、列ごとにスクロールさせた（それまでは横書きはページ全体が動き、列ごとには動かなかった）。
  枠はキーでも動かせるよう tabIndex を付けた
- URL は `sync=0` で連動を切る（既定は入り。lb・pb と同じ書き方）
- 却下した案: 対応点を使わず、スクロールの割合（全体の何 % か）でそろえる。本文と訳とで長さの配分が違うと、すぐずれる。
  対応点が 1 つも無い組み合わせ（校異源氏 01 と与謝野訳など）は、今は連動しない。割合でそろえる動きを、その場合だけの予備にするかは未決
- 測ったこと: 実データ（絵入源氏 `pt/01.xml` と与謝野訳）で本文の列をホイールで動かし、両方の列の端が同じ文の中にあるかを見た。
  縦 1280px で YG0000004600、横 1280px で YG0000003200、横 390px で YG0000002000、縦 390px で YG0000004500。どれも同じ文にそろった
- 確かめたこと: vitest 56 件（`followOffset` 5 件を足した）、e2e 41 件（連動 3 件を足した。横・縦・切ったとき）、lint、build・basepath・export
- ついでに直した: 狭い画面でツールバーのボタンが 1 つ増え、「並べる」の欄がつぶれてはみ出したので、欄を次の行へ折り返すようにした
- まだ: 対応点の多い組み合わせ（同じ xml:id が数千ある 2 本）では、スクロールのたびに全部の点の位置を測る（1 フレーム 1 回にまとめてある）。重ければ二分探索にする

## 2026-10-20 頁の目印（pb@facs）と画像ペイン（ブランチ pb-facs）

- **kasane の画像部品（`@nakamura196/iiif-viewer`）は npm に未公開だった**（`npm view` で 404。kasane 側に公開の作業も無い）。
  そのまま公開もできない。入口（exports）が TypeScript の元のファイルを指し、3D の部品（three ほか）を入れる側で用意する前提になっている。
  そこで、画像ペインは仮の作り（IIIF の画像を 1 枚出すだけ）にし、TEI から頁の画像を引く側を先に作った。部品を公開したら、表示だけを差し替える
- facsimile の書き方は資料ごとに違い、3 通りを読む（`src/lib/tei/facs.ts`）
  - koui・tei_viewer（`TEI-EAJ/koui/static/data/01_with_wit_images.xml`）: `surfaceGrp@facs` が manifest、`graphic@n` が canvas、`graphic@url` が IIIF の画像、`pb@facs="#zone"`
  - 校異源氏 w3id（`https://w3id.org/kouigenjimonogatari/tei/01.xml`）: `facsimile@sameAs` が manifest、`surface@sameAs` が canvas、`graphic@sameAs` が IIIF Image の base。
    **`pb@corresp="#zone"` で範囲を指し、`pb@facs` には切り出した画像の URL を直接書いている**
  - TEI の標準: `pb@facs="#surface"`、または `pb@facs` に画像の URL
  - 引く順: facs と corresp の `#id` を先に見て、無ければ facs の URL。IIIF の URL なら base と範囲に分ける
- 画像は、頁の範囲（zone）だけを IIIF で切り出して取る。校異源氏・koui は見開き 1 枚に 2 頁の範囲があるので、片方の頁だけが出る
- **国立国会図書館の IIIF は、大きさの指定 `!w,h` に 500 を返す**（`.../R0000022/0,0,3445,4706/!1600,1600/0/default.jpg`）。`1600,`（幅だけ）は 200。
  幅だけの指定から始め、読めなければ `max`、`full` の順に取り直す。範囲の幅より大きくは取らない（v3 は `^` が無いと拡大を断る）
- 読んでいる頁: 読み始めの端（横書きは上、縦書きは右）から 4 分の 1 の所を、最後に越えた pb。頁の目印を消しても（`pb=0`）測れるよう、
  消すのは目印の札だけにし、pb は中身の無い部品として残した
- 落とし穴 2 つ
  - 縦書きの本文を grid に入れると、列が中身の長さまで広がり、狭い画面で画面からはみ出した。`grid-cols-1`（minmax(0,1fr)）で収めた
  - 横書きの 1 列では画像を画面に留めたい（sticky）が、共通のレイアウトの `main` の `overflow-hidden` がスクロールの枠になって効かなかった。
    `overflow-clip`（切るだけで枠にならない）に替えた
- URL: `panes` に `image` を含まなければ画像を出さない（ツールバーの「画像」で `panes=text` を書く）。見ている頁は URL に残していない
- 確かめたこと: vitest 67 件（facs 11 件を足した）、e2e 48 件（画像の 7 件を足した。見本は e2e の中に書き、画像は 1×1 の PNG を返す）、lint、build・basepath・export。
  実データ: 校異源氏 w3id 01 を縦 1280px・横 1280px・縦 390px、koui の見本を縦 1280px で。次の頁を 2 回押すと 7 頁になり、
  本文の 7 頁の書き出し「この御方の御いさめをのみぞ猶わづらはしう」が画像の右端の行と一致した
- まだ: 拡大・移動（kasane の部品）、PTV の config.json の url_map・image_map（行ごとの画像の位置）、並べた列それぞれの画像、見ている頁を URL に残すか

## 2026-10-20 画像ペインを kasane の Viewer（v0.1.1）に差し替えた（ブランチ pb-facs）

- kasane の Release `iiif-viewer-v0.1.1` の tgz を URL で入れた（npm には未公開のまま）。peer の three などは前の版のときに入れたものをそのまま使う
- 渡し方（`src/components/viewer/ImagePane.tsx`）
  - 頁にマニフェストがあれば、それを開き、`target` に Canvas と範囲（zone）を渡す。範囲は枠で囲まれる
  - マニフェストが無く IIIF の画像だけなら、`<base>/info.json` を開く。kasane が画像 1 枚のマニフェストにし、Canvas の id は `<base>/canvas/1` になる（kasane の `imageInfoManifest.ts`）。範囲はこれに当てる
  - IIIF でない画像の URL だけのときは、前と同じく `<img>` で 1 枚出す
- 逆向き: ビューアの側でめくると `onSelect` で Canvas が来る。同じマニフェストのその Canvas を指す最初の頁へ本文を動かす。見開き（1 Canvas に 2 頁）で、いまの頁がその Canvas にあれば動かさない
- three.js を使うので `next/dynamic` の `ssr: false` で読む。静的書き出し（build・basepath・export）は通った
- 確かめたこと: e2e の画像の 8 件（見本にマニフェストと info.json を足し、5 頁目を 2 枚目の Canvas にした。ビューアの「›」で 5 頁へ本文が動くのを足した）、e2e 全 49 件、vitest 67 件、lint。
  実データ: 校異源氏 w3id 01 で、5 頁は NDL の canvas/22 の左半分が枠で囲まれる。次の頁で canvas/23 の右半分。ビューアの「›」を 2 回押すと canvas/24 になり、本文は 8 頁へ動く
- 気になる点: ビューアの右の資料情報の欄が、画像ペインの半分ほどを取る。閉じるボタンがあり、閉じた状態はブラウザに覚えられる。最初から閉じて出す指定は v0.1.1 には無い

## 2026-10-20 画像ペインの資料情報の欄を閉じて始める

- 右の資料情報の欄が画像ペインの半分近くを取っていた。kasane の iiif-viewer v0.1.2 で `panelOpen` が入ったので（kasane #266）、`panelOpen={false}` を渡した。読む人はボタンで開ける
- 確かめたこと: e2e 49 件、build。校異源氏 w3id の 01.xml を開き、欄が閉じて始まり、画像が広く出ることを画面で確認した。コンソールのエラーなし

## 2026-10-20 PTV の絵入源氏で画像を出した（ブランチ ptv-map）

- 当初は config.json の `url_map`（map.json）と `image_map`（image_map.json）を読んで画像を出すつもりだった。中身を見ると、どちらも要らなかった
  - `image_map.json` は IIIF Curation（Range 1 つ）で、members 50 件。各 member は Canvas の半分（`#xywh=` が見開きの片側）と、その頁の最初の行の id（`line_id`）
  - `map.json` は与謝野訳の文の id（YG…、255 件）→ 絵入源氏の行の id と文字の範囲（`…0000000001#0:22`）。画像の位置ではない（10/19 のメモの「画像の位置」は誤り）
  - 本文 `pt/01.xml` には `<text>` も pb も無く、`<sourceDoc><surfaceGrp facs="manifest"><surface><graphic n="canvas"/><zone ulx… xml:id>` の中に `<line>` が入っている。
    zone は 50 個で、image_map の 50 件と同じ。つまり画像との対応は本文の中に既にある
- そこで、pb が 1 つも無く sourceDoc の zone に本文があるときは、本文を含む zone の頭に `<pb facs="#zone" type="awase-zone"/>` を足すことにした（`addZonePageBreaks`、読み込みの直後）。
  あとは pb@facs の文書と同じ仕組みで動く。本文の無い zone と、zone の中の zone は頁にしない
- 与謝野訳との対応は、本文の `<anchor corresp="…#YG…"/>`（199 件）で既に取れている（10/19 の corresp-link）。map.json の文字の範囲のほうが細かいが、今回は使わない
- 確かめたこと: e2e 50 件（sourceDoc の見本を 1 件足した）、vitest 67 件、lint（警告 13 件は触っていないファイル）、build・basepath・export。
  実データ: `?u=<PTV の config.json>` を幅 1400px で開き、絵入源氏の列が 50 頁になり、2 頁目で Canvas 3 の右半分（2808,0,2808,3744）が枠で囲まれた
- まだ: map.json の文字の範囲で、訳の文を押したときに原文の行の一部だけを光らせるか

## 2026-10-20 異文の一覧（apparatus ペイン、koui の互換。ブランチ apparatus）

- koui（TEI-EAJ/koui、pages/index.vue）の機能を 4 つの PR に分けて写す。この PR はその 1 つ目で、異文の一覧と本文との行き来
  - 2: `?wit=` で本文を伝本の読みに入れ替える（koui の `target`）
  - 3: 伝本ごとの一致度。koui の Chart.vue（lem との編集距離の合計）を、グラフの部品を入れずに CSS の横棒で出す
  - 4: app@facs の画像。zone を引いて画像ペインに渡す
  - 作らない: 異文表のダイアログ、箇所ごとの異なり数のグラフ（Chart4Diff.vue）。一覧と一致度で足りるため
- 読み方（`src/lib/tei/apparatus.ts`）。koui と同じ決まり
  - 伝本は listWit の witness@xml:id と、その中身を名前にする
  - 箇所は本文として描く範囲の app を文書の順に数える（render.ts と同じ範囲）。rdgGrp の中の lem・rdg も拾う
  - lem・rdg の @wit に名前の無い伝本は、lem と同じ読みとみなす。一覧では lem の行に薄く出す
- 本文との結び方: app に xml:id があればそれ、無ければ `awase-app-<番号>` を id にし、URL の `id=` で結ぶ。
  一覧の行を押すと本文のその箇所に枠が付き、本文の箇所を押すと一覧のその行が選ばれる。一覧は枠の中だけを動かし、ページ全体は動かさない
- `?panes=` に `apparatus` を足した。書かなければ全部出す。ツールバーの「異文」で出し入れする。異文の無い TEI ではボタンも出さない
- 確かめたこと: vitest 65 件、e2e 全 53 件（異文の 4 件を含む）。
  実データ: koui の 01_with_wit_images.xml（縦書き）で「異文 557 箇所」「伝本（18）」。ファイルの中の app も 557 個で一致した。
  40 番を選ぶと本文の「大納言はなくなりて」に枠が付く。del は本文と同じく取り消し線で出る
- 気づいたこと（画像、前からあるもの）: 同じファイルで、頁の表示は「5 頁」「10 頁」と動くのに、画像は 1/218 のまま動かない。
  TEI の graphic@n は `https://www.dl.ndl.go.jp/api/iiif/3437686/canvas/22`（www 付き）で、NDL のマニフェストの Canvas の id は `https://dl.ndl.go.jp/…/canvas/22`（www 無し）。
  文字列が一致しないのでビューアが Canvas を見つけられない。校異源氏 w3id では一致しているので動いていた。PR 4（app@facs）で同じファイルを使うので、そこで直す

## 2026-10-20 ビューアを画面の高さに収める（ブランチ viewer-fullscreen）

- 本人と相談して、機能（koui 互換の 2〜4）より先に画面の作りを替えた。横書きの 1 列はページ全体を動かして読む作りで、画像が付いてくる仕組みもそれを前提にしていたため、後から替えると直す量が増える
- 本文を開いたら、帯（ヘッダー）を細くし、フッターを出さず、画面の高さ（100dvh）に収める。ページ全体はスクロールさせず、本文・画像・異文がそれぞれの枠の中で動く。引数なしの入口は前のまま
- 1 列は広い画面（lg 以上）で横に並べる。狭い画面と、本文を並べて読むときは「画像・本文・異文」のタブで 1 つずつ出す。並べて読むときに枠を縦に積むと、どれも低くなって読めないため
- 書誌の詳細は、開くと本文の上に重ねる（押し下げるとペインが縮む）
- 落とし穴: 本文を枠の中で動かすと、文書の終わり近くでは最後の頁の目印が「読んでいる位置」（上から 4 分の 1）まで上がらない。
  画像ペインで最後の頁へ移っても、本文の側が前の頁と判定して戻していた（ページ全体を動かしていたときは、下にフッターがあって届いていた）。
  端まで動かしきったときは、枠に見えている最後の目印を読んでいる頁にした（`TextPane.tsx` の currentPage）
- 確かめたこと: e2e 56 件（画面の作りの 3 件を足した。ページのスクロールが 0、フッターが無い、書誌を開いても本文の枠の高さが同じ、狭い画面のタブ）、vitest 77 件、lint、build。
  koui の 01_with_wit_images.xml を 1600×1000 の縦書き・横書き、390×844、校異源氏と与謝野訳の 2 本並べで撮り、どれもページのスクロールが 0

## 2026-10-20 伝本の読みに入れ替える（?wit=、koui の互換 2/4。ブランチ apparatus-wit）

- 一覧の行の形: koui の見本（01_with_wit_images.xml、伝本 18）では、lem の @wit に 10 本前後の名前が並ぶ（557 箇所のうち 554 箇所が 10 本）。
  rdg は 1 本が 614、2 本が 124 で、多くても 8 本。lem の行が略号で 2〜3 行に折れ、読みが探しにくかった。
  選んでいない行は先頭の 3 本だけ見せ、残りを「ほか N 本」にまとめた（名前は title に出す）。畳んでも 1 本しか減らないときは畳まない。選んだ行はすべて出す
- `?wit=<略号>`: 異文の箇所ごとに、その伝本の読みを本文に見せる。@wit に名前の無い伝本は lem（koui と同じ、黙っている伝本は lem と同じとみなす）。
  lem と違う読みになった箇所は橙で示す。一覧の上の「本文の読み」で選び替え、底本に戻すと URL から wit が消える
- 本文は描き直さず、読みの要素に印（data-awase-chosen）を付け替えて CSS で出し分ける。描き直すと読んでいる位置が先頭へ戻るため
- 青横を選ぶと、557 箇所のうち 35 箇所が lem と違う読みになった（画面で数えた）
- 落とし穴: main に入った Dependabot の #2（TypeScript 5.9 → 7.0.2）で、typescript-eslint が動かず（7 に未対応）、build の型の検査も MapView で落ちていた（GeoJSON の名前空間が見えない）。
  別の PR で 5.9.3 に戻し、Dependabot の typescript の大きな版上げを止める（ブランチ pin-typescript-5）
- 確かめたこと: e2e 58 件、vitest 82 件、変えたファイルの lint（手元だけ TypeScript 5.9.3 を入れて）

## 2026-10-20 伝本ごとの lem との違い（koui の互換 3/4。ブランチ wit-agreement）

- koui の Chart.vue は、箇所ごとに「lem の文字」と「rdg の文字」の編集距離を取り、その rdg の伝本に足して棒グラフにする。グラフの部品（chart.js）は入れず、apparatus ペインの「伝本（N）」の欄に CSS の横棒で出した。棒の長さはいちばん大きい伝本を 100% にする
- 箇所ごとにどの読みを使うかは `?wit=` と同じ決まり（`readingFor`）にした。@wit に名前の無い伝本は lem と同じ（0）。lem の無い箇所は数えない。行を押すとその伝本の読みで本文を出す（もう一度押すと底本に戻る）
- 数は「字」（編集距離の合計）と「箇所」（距離が 1 以上の箇所の数）を並べた。koui は字だけ
- koui との違い:
  - koui は del・add を HTML の文字列（`<del style=…>`）のまま距離に入れていた。ここでは文字だけを数える（del の中の字は数える）
  - **読みの中に入れ子の app があると、textContent では中の lem と rdg の字が両方入る。** koui の見本では 31 個（lem の中 26、rdg の中 5）。
    例: 外の lem が「のたまはするに日〻にをもり**日にそへてよはり**給てたゝ」になっていた。中の app は、数えている伝本の読み（lem 側は lem）だけを取るようにした（`readingText`）。
    これで別陽は 1090 → 1049 字、別國は 1044 → 990 字に下がった
- 実データ（koui の 01_with_wit_images.xml、伝本 18・557 箇所）の結果、多い順に: 別陽 1049 字・278 箇所、別國 990・277、別麥 491・163、河 383・120、御 325・133。少ないのは 靑池 6・3、校異 0。
  別本系が大きく、靑表紙本系・河内本系の個々の本は小さい（lem は校異源氏物語の本文で、ほぼ靑表紙本系）
- 検算: 同じファイルを Python（ElementTree）で別に数え、18 本すべて字・箇所とも画面と一致した。
  靑横の「32 箇所」は、`?wit=` で lem と違う読みになる 35 箇所（前の節）より 3 少ない。3 つは rdg が `<add>いと</add>` のように lem と同じ字を書き入れたもので、距離が 0
- 確かめたこと: vitest 85 件、e2e 60 件（一致度 1 件と入れ子 1 件を足した）、変えたファイルの lint、build

## 2026-10-20 異文の箇所の画像（app@facs、koui の互換 4/4。ブランチ app-facs）

- koui の見本で app@facs を持つ箇所は 1 つだけ（48 番「事ある時」）。`#zone_koui_0001 #zone_ndl_0001 #zone_nijl_0001` の 3 つで、
  それぞれ別の資料（NDL 3437686、NDL 1240757、国文研 200003803 を束ねた jpsearch のマニフェスト）の範囲を指す。
  facs を持つ要素は app 1・pb 24・surfaceGrp 3 で、lem・rdg には無い
- koui は、その箇所の IIIF の印を押すと 3 つを並べて Mirador で開いていた（pages/index.vue の show_iiif）。
  awase の画像ペインはビューアが 1 つなので、1 つずつ出して「前の画像・次の画像」で切り替える。「頁の画像に戻る」で頁の画像へ。
  頁を送っても閉じる。箇所の画像を出しているあいだにビューアをめくっても、本文は動かさない
- 一覧の行には、画像の範囲が引ける箇所にだけ印（▣）を付ける。引けない参照（facsimile に無い #id）は数えない
- Canvas id の www の違い（前の節で見つけたもの）: ビューアに渡す前にマニフェストを読み、Canvas id を突き合わせる（`matchCanvas`）。
  そのまま一致するものを先に見て、無ければ http・https とホスト名の頭の www. を無視して比べる。
  マニフェストを読み終えるまではビューアを開かない（見つからない Canvas を渡すと 1 枚目を開いてしまうため）。読めなければ書かれた id をそのまま使う
- 実データで確かめたこと: koui の見本の 6 頁が「23 / 218」で開く（前は 1 / 218 のまま）。48 番の 1・2 つ目（NDL の 2 資料）は範囲に寄せて枠が付く
- 残る問題（kasane の側）: 3 つ目の国文研は、マニフェストが `viewingHint: paged`（見開き）で、ビューアが 2 枚並べて出す。
  このとき target の範囲に寄らず、枠も画像の外（下）にずれて描かれる。Canvas は 5616×3744、範囲は 2371,2100,117,532。kasane の Viewer で直す
- 確かめたこと: vitest 92 件、e2e 63 件（www の違い 1 件と異文の画像 2 件を足した。照合を外すと www の 1 件が落ちることも確かめた）、lint、build

## 2026-10-20 見開きのマニフェストで範囲に寄る（iiif-viewer 0.1.3）

- kasane #267 を 0.1.3 として Release に置き、依存を差し替えた。koui の見本の 48 番「事ある時」の 3 つ目（国文研 200003803、canvas/3、範囲 2371,2100,117,532）で、
  そのページ 1 枚に寄り、枠が「ことある時」の行を囲むことを目で確かめた。1・2 つ目（NDL の 2 資料）も前と同じく枠が合う
- 確かめ方: PR #10（app-facs）の作業ツリーに 0.1.3 を保存せずに入れ、Playwright で 3 枚を撮った
- 分かったこと: 国文研の画像（kotenseki.nijl.ac.jp/api/iiif/…）は kokusho.nijl.ac.jp へ 301 で転送される。kokusho はカナダの回線からは接続拒否（日本の mdx からは 200）。
  海外から確かめるときは `ssh -N -D <port> mdx-cpu` の SOCKS を自動ブラウザに通す。海外の利用者には国文研の画像が出ない、という制約でもある
- 確かめたこと: vitest 85 件、build。e2e はこの差し替えでは回していない

## 2026-10-20 見た目の整理（トグル・異文の印・画像の灰色・頁送り）

- トグル: 入のときの塗りつぶしの青が「並べる」のような押すボタンと同じに見えた。入は淡い地に ✓、切は枠だけに +
- 本文の異文: 557 箇所すべてに水色の地を塗ると本文が読みにくい。点線の傍線だけにし、指を置いたときだけ地を付ける。伝本を選んだときの橙はそのまま
- 画像の上下の灰色: kasane のビューアが、target の範囲に黄色い枠を描き、枠の外を `0 0 0 9999px rgba(0,0,0,.25)` の影で暗くしていた。
  頁の画像では範囲が頁全体なので、余白が暗い帯に見えていた。頁の画像は `highlight: false`、異文の箇所の画像だけ枠を描く
- 頁送り 2 組: awase の組（本文の頁の順。別の画像・マニフェストにもまたがる）だけを残し、「‹ 5 頁 ›」に縮めた。
  ビューアの組は kasane に `pager={false}` を足して隠す（kasane PR #268、iiif-viewer 0.1.4）。ビューアの中では矢印キー・PageDown でめくれて、本文が付いてくる
- e2e の 2 件（ビューアの「1 / 2」「2 / 2」の表示を見ていた）を、ステージの画像の URL とキー操作で確かめる形に直した
- 確かめたこと: vitest 92 件、e2e 63 件（0.1.4 の tgz を保存せずに入れて）、koui の見本を横書き・縦書きで撮って目視
- 気づいたが直していないこと: 画像ペインの右端に、資料情報の欄を開く細い帯があり、頁の画像の右が少し隠れる
