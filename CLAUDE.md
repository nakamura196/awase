@AGENTS.md

# Awase で作業するときの決まり

Awase は TEI の統合ビューア（Next.js の静的書き出し、GitHub Pages で配信）。
設計の検討は `docs/notes/survey.md`（「2026-10-19 設計案」の節）。IIIF Kasane の土台から作った。

## コミット・PR・Issue は英語で書く（日本語も可）

公開リポジトリなので、日本語を読まない人も経緯を追えるように、コミットメッセージ・PR のタイトルと本文・Issue は英語で書く。
外部の貢献者は日本語でもよい（`CONTRIBUTING.md` にそう書いてある）。

- コミットの 1 行目は命令形の短い英語（例: `Add TEI header panel`）。詳しくは `CONTRIBUTING.md`
- PR の本文は、利用者から見て何が変わるかを先に、作りはその後に書く
- 画面に出る文言は、日英の両方を用意する（`src/messages/`）

## 新しい機能を足したら、ユースケース・お知らせに載せるかを検討する

1. **ユースケース** — `src/lib/usecases.ts` に 1 件足す。実在の TEI 資料を、その機能が効く開き方（`panes=`・`xsl=` など）で開く。
   サムネイルは `node scripts/capture-thumbnails.mjs --missing`（`public/thumbnails/usecases/<id>.<ja|en>.webp`）、
   短尺デモ動画は `node scripts/capture-usecase-clips.mjs --missing`（`public/clips/usecases/<id>.<ja|en>.mp4`）で撮る。
   動画の撮り方と YouTube ナレーション動画の連携は `docs/notes/usecases-video.md`。
2. **お知らせ** — `content/news/<id>.md` を 1 つ置く（日英の見出しと 2〜3 文の本文、関連するユースケースの `usecases:`。書き方は `content/news/README.md`）。
   1 件 1 ファイルなので、並行する PR どうしがぶつからない。載せない判断（小さな修正・内部の作り替え）もよいが、PR の本文に理由を書く。

## ページを足したら、引数なしで開いたときの画面（入口）を確かめる

ページの一覧は `src/app/[locale]/` から自動で拾うので、テストを書き足す必要はない（`[id]` のような動的なページは対象外）。

    npx next dev -p <番号>   # 別の端末で。本体は 3839
    E2E_BASE_URL=http://localhost:<番号> npx playwright test e2e/entryPages.spec.ts

## 配信（awase.ldas.jp と GitHub Pages のサブパス検査）

本番は `https://awase.ldas.jp/`（ホスト直下）。フォーク先の `github.io/awase/` でも動くよう、クエリに乗せて後で取りに行くパスは `src/lib/basePath.ts` の `withBasePath` を通す。
`npm run test:basepath` と `npm run test:export` で参照の付け忘れを検査する。
