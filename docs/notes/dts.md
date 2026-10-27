# DTS 画面の実験ノート

## 2026-10-20

### やったこと

`/[locale]/dts/` を作った。
DTS の入口からコレクションをたどり、資料の書誌情報と引用できる単位を見せる。
本文は描かない。全体にも各単位にも「viewer で開く」「XSL で開く」のリンクを付けた。
元は dts-viewer（`nakamura196/dts-viewer`）。画面と URL の考え方だけ移し、UI の部品は移していない。

### 実際の応答（https://dts.ldas.jp/api/dts）

- `/api/dts` は `/api/v2/dts` へ 302 で転送される。CORS は `*`。
- 入口は DTS 1.0（`dtsVersion: "1.0"`）。窓口は三つで、どれも URI テンプレートで返る。
  - `collection`: `/api/v2/dts/collection{?id,page,nav}`
  - `navigation`: `/api/v2/dts/navigation{?resource,ref,start,end,down,tree,page}`
  - `document`: `/api/v2/dts/document{?resource,ref,start,end,tree,mediaType}`
- URL は相対（`/api/v2/dts/...`）で返る。転送後の最終 URL を基準に絶対にした。
- 根のコレクションは `id` を付けずに取る。応答の `@id` は `default` だが、`collection?id=default` は 404（ResourceNotFound）になる。
- 根は 54 件（校異源氏物語の各巻）で、`view`（ページ送り）は付かなかった。
- 資料（`@type: Resource`）の `collection` / `navigation` / `document` は、`resource=urn:...` が書き込み済みのテンプレートで返る（残る変数は `{&ref,...}`）。
- `nav=parents` を付けても、資料の応答に親（`member`）は入らなかった。
- Navigation は `down` か `ref` が無いと 400（`down, ref, or start/end is required`）。
- 桐壺で `down=1` は 24 件（頁、level 1）、`ref=5&down=1` は頁 5 とその行（level 2、`parent` が `5`）、`down=-1` は 352 件。
  どれも `view` は付かなかった。
- 引用の単位の `identifier` は頁なら `5`、行なら `https://w3id.org/kouigenjimonogatari/api/items/0005-01.json`（URL）。`ref` には符号化して渡す。
- Document は `application/tei+xml` で、`access-control-allow-origin: *`。`ref=5` では頁 5 だけの TEI（8,687 バイト）が返る。
  行の identifier（URL）を `ref` に渡しても 200 で返る。

### 決めたこと

- URL は `base`（入口、既定は `https://dts.ldas.jp/api/v2/dts`）と `url`（開くコレクションか資料、書かなければ根）。
  画面の中の移動は普通のリンクにして、戻るボタンと共有がそのまま使えるようにした。
- `url` には、窓口のテンプレートを展開した絶対 URL を書く。`urn:...` のような id だけでも受ける。
  理由: 絶対 URL なら、入口の形が違っても（`id` 以外の引数名でも）そのまま取りに行ける。
- URI テンプレートは自前で展開する（`src/lib/dts/uriTemplate.ts`）。RFC 6570 のレベル 3 まで。新しい依存を増やさないため。
- 引用できる単位は、最初に `down=1` で 1 段だけ取り、開いたときにその単位の `ref` で次の 1 段を取る。
  `down=-1` で全部取る案は、長い資料で数千件になりうるのでやめた。
- 単位に子があるかは分からないので、全部に開閉ボタンを付けた。開いて空なら「これより下の単位はありません」と出す。
- ページ送り（`view.next`）は、コレクションは「続きを読む」ボタン、Navigation は最大 10 ページまで続けて取る。
  今の入口では、どちらも `view` が付かなかったので、この部分は実際の応答では確かめていない。
- 本文のリンク先は、viewer / xsl とも `?u=<Document の URL>`。`ref` や `&` を含むので符号化して渡す。
- 通信は `src/lib/dts/fetch.ts` に分け、JSON の読み取りは `src/lib/dts/` の純粋な関数にした。

### 確かめたこと

- 手元の dev サーバ（3852）で、実際の入口から根（54 件）→ 桐壺 → 単位 24 件が出た。ブラウザの JS エラーは 0 件。
- 実際の Document の URL を `viewer/?u=` に渡すと、全体も `ref=5` も本文が出た（先頭は「いつれの御時にか…」）。
- vitest: `src/lib/dts` に 26 件（URI テンプレートの展開、入口・コレクション・Navigation の読み取り、URL の組み立て）。
  見本は実際の応答を短くしたもの（`src/lib/dts/fixtures/`）。
- e2e: `e2e/dts.spec.ts` に 3 件。通信は `page.route` で見本を返す。
  根の一覧 → 資料へ移って `url=` が変わる → 戻る、単位と viewer / XSL のリンクの `u=`、単位を開く、viewer で本文が出る、入口が 500 のときのメッセージ。

### まだしていないこと・限界

- 親へのパンくずは、応答の `parent`（`nav=parents`）があるときだけ出る。dts.ldas.jp はこれを返さないので、今は「最上位 / 資料名」だけ。
- `view` によるページ送りは、実際の応答で確かめていない（見本もない）。
- DTS 1.0 の `tree`、`start`/`end` による範囲の指定は使っていない。
- DTS 0.x（`dts:references` など）の入口は、窓口の名前の揺れを一部受けるだけで、実物では試していない。
- 資料の `download` や `dublinCore` 以外の `extensions` は出していない。

## 2026-10-26 以前の DTS Viewer から引き継いだもの（tree・XML/JSON・Navigation の URL）

dtsview.ldas.jp（nakamura196/dts-viewer）をこの画面へ転送するにあたり、コードを突き合わせて抜けを洗い出し、使う人の作業が止まる 3 つを埋めた。

- **引用構造の選択（`tree=`）。** 資料の `citationTrees` が 2 つ以上あると、選ぶ欄を出す。選ぶと画面の URL に `tree=` が付き、Navigation と本文（viewer・XSL・XML）の URL にも同じ `tree` を渡す。
  校異源氏物語の API では「頁・行」と「和歌（`tree=waka`、waka > ku）」の 2 つ。桐壺は waka-001〜009 の 9 首。
- **応答そのものへのリンク。** 資料・コレクションの見出しと「引用できる単位」の見出しに JSON（Collection と Navigation の応答）を置いた。
  本文は「XML」（テンプレートが `mediaType` を受けるときは `mediaType=application/xml` を付け、ブラウザで表示できる形にする）と「ダウンロード」（付けない URL）。以前の Viewer の挙動に合わせた。
  genji.ldas.jp は既定で `application/tei+xml` を返し、`mediaType=application/xml` で `application/xml` を返す（実測）。
- **`url=` に Navigation の URL を書いた旧リンク。** 以前の Viewer は単位の一覧を開くとき `url` に Navigation の URL を書いていた。
  応答の `@type` が `Navigation` なら、`resource` の Collection の URL に置き換えて開き直す（`tree` は Navigation の URL から引き継ぐ）。
- 試験: vitest 2 件、e2e 3 件を追加。本物の genji.ldas.jp でも、旧形式の URL → 桐壺の和歌 9 首 → waka-001 を viewer で開く、まで目で確かめた。

残り（後回しにしたもの）: Navigation の表（identifier・citeType・level の一覧）、Dublin Core の項目名の翻訳、最初・前・最後のページ送り、エラーの詳しい区別、`@id` の表示。いずれも見え方の違いで、たどれない資料は出ない。
