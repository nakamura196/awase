# ユースケースの紹介動画（YouTube）・サムネイル・カード用クリップの作成手順

Awase のユースケース紹介（`/[locale]/usecases` および `/[locale]/usecases/[id]`）では、IIIF Kasane と同じ構成で以下の 3 種類のメディアを使い分けます。

1. **YouTube 紹介動画（音声ナレーション・字幕つき 4K 動画）**:
   - 各ユースケースの詳細ページ（`/[locale]/usecases/[id]`）およびユースケース一覧（`/[locale]/usecases`）のカードで `▶` を押したときに再生される本編動画です（`src/lib/usecases.ts` の `video: { ja: '<videoId>', en: '<videoId>' }`）。
   - Kokoro TTS（日本語 `jf_alpha`、英語 `af_heart`）による音声ナレーションと、Netflix Timed Text Style Guide 準拠で分割・焼き込みされた字幕（および WebVTT 字幕トラック・チャプター目次）を備え、4K（`3840×2160`・30fps）で収録して YouTube にアップロードします。
2. **サムネイル静止画（WebP）**:
   - `public/thumbnails/usecases/<id>.{ja,en}.webp`（`1280×800` → 幅 `640px` WebP）。
   - YouTube 動画を再生する前のポスター画像や、詳細ページ下部の「ほかのユースケース」一覧で使用します。
3. **トップページ用の短尺プレビュー動画（MP4、無音ループ）**:
   - `public/clips/usecases/<id>.{ja,en}.mp4`（幅 `640px`、15fps、6〜8 秒）。
   - トップページ（`/[locale]/`）の「ユースケース（利用例）」に並ぶ代表カード（`featured: true`）でのみ、ホバー／スクロール時の無音プレビュー（`UseCaseClip.tsx`）として使用します。

---

## 1. YouTube 紹介動画（音声・字幕つき 4K チュートリアル動画）の作り方

各ユースケースの紹介動画は、動画制作リポジトリの共通 Kokoro パイプライン（`common/kokoro/`）を使って章単位で制作します。

### 構成ファイル

```text
awase-<id>/
  video.json                    # タイトル・spokenName・base URL・章一覧・YouTube メタデータとサムネイル設定
  scripts/lib.mjs               # 共通ヘルパー（point, showClicks, viewerReady など）
  scripts/chapters/ch01-*.mjs   # 章ごとの Playwright 台本（startChapter, say('日本語', 'English')）
  narration/readings.csv        # 日本語の読み辞書（Kokoro の音素補正）
  narration-en/readings.csv     # 英語の読み辞書
```

### 制作・収録・YouTube アップロードの手順

1. **音声の先行合成と読みの点検**
   - `synth.py --lang ja` および `--lang en` を実行し、`say('日本語', 'English')` から音声（WAV）を生成します。
   - `narration/kokoro/readings.txt`（3 行目の音素列）を確認し、固有名詞や専門用語（`Awase`、`TEI`、`IIIF`、`校異源氏物語`、`異文`、`伝本` など）の読み誤りを `readings.csv` で補正します。
2. **章ごとの 4K 録画と字幕焼き込みビルド**
   - `record-all.zsh ja` / `record-all.zsh en` で全章を `1920×1080`（`deviceScaleFactor: 2` = `3840×2160`）で録画し、各章の音声長（`声の長さ + 0.5 秒`）に合わせて映像・音声・焼き込み字幕（WebVTT 自動分割）を合成します。
   - `build-all.mjs` で全章を結合し、ラウドネス正規化（`-16 LUFS`）済みの `<name>-tutorial-voice-2160.mp4`・`.vtt`・`chapters.txt` を出力します。
   - `check-frames.py` で各字幕タイミングのフレーム画像を一覧し、読み込み待ちや白画面がないか目視確認します。
3. **YouTube へのアップロードと `videoId` の登録**
   - `upload.py --lang ja --dry-run` / `--lang en --dry-run` でサムネイル画像（`thumbnail.{ja,en}.png`）を生成して確認したうえで、`upload.py --lang ja` / `--lang en` で YouTube にアップロードします。
   - 発行された日英それぞれの YouTube `videoId` を `src/lib/usecases.ts` の該当エントリの `video: { ja: '...', en: '...' }` に記入します。

---

## 2. サムネイル静止画とトップページ用クリップの更新コマンド

ローカル開発サーバ（`http://localhost:3839`）または公開サイト（`https://awase.ldas.jp`）を対象に撮影します。

```bash
# 1. サムネイル静止画（WebP）の生成
npm run thumbnails

# 特定のユースケースのみ再撮影する場合
node scripts/capture-thumbnails.mjs --base http://localhost:3839 --only koui-genji-apparatus

# 2. トップページの featured カード用短尺クリップ（MP4）の生成
npm run clips

# 特定のユースケース・言語のみ再収録する場合
node scripts/capture-usecase-clips.mjs --base http://localhost:3839 --only koui-genji-apparatus --locale ja
```
