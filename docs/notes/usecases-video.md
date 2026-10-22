# ユースケースと紹介動画の作り方

Awase のユースケース（`/usecases`、`/usecases/<id>`、およびトップページの見本カード）は、
以下 3 段階のメディアを組み合わせて紹介する（IIIF Kasane と同じ構成）。

1. **サムネイル画像（必須）**: `public/thumbnails/usecases/<id>.<ja|en>.webp`（1280×720）
2. **短尺の操作デモ動画（音なしループ・MP4）**: `public/clips/usecases/<id>.<ja|en>.mp4`（幅 640px・5〜7 秒）
3. **YouTube ナレーション解説動画（任意）**: `UseCase.video`（`{ ja?: string; en?: string }`、11 文字の YouTube videoId）

---

## 1. ユースケース定義の追加（`src/lib/usecases.ts`）

`src/lib/usecases.ts` の `USE_CASES` 配列に 1 件追加する。

- `id`: URL（`/usecases/<id>`）とファイル名に使う識別子（英小文字・数字・ハイフン）
- `added`: 追加日（`YYYY-MM-DD`）
- `title` / `note`: 日英の題名と 2〜3 文の説明
- `open`: 「Awase で開く」の遷移先（`page: 'viewer' | 'xsl' | 'compare' | 'dts'` と各パラメータ）
- `features`: 絞り込み用の機能タグ（`USE_CASE_FEATURES`）
- `clip`: 短尺 MP4 動画（`public/clips/usecases/<id>.<ja|en>.mp4`）があるとき `true`
- `video`: YouTube のナレーション動画 ID（`{ ja: '...', en: '...' }`）
- `featured` / `headline`: トップページの見本（最大 6 件）に出す場合は `featured: true` と日英の短い見出し `headline` を書く

---

## 2. サムネイル画像の撮影（`scripts/capture-thumbnails.mjs`）

資料の元画像ではなく、**Awase で実際に開いて操作した状態の画面**を言語ごと（`ja` / `en`）に撮る。
英語のページに日本語 UI の画面が写らないよう、常に日英 2 枚を用意する。

```sh
# すべて撮り直す（本番 https://awase.ldas.jp を開く）
node scripts/capture-thumbnails.mjs

# まだ無いものだけ撮る
node scripts/capture-thumbnails.mjs --missing

# 手元の開発サーバ（port 3839）で特定のユースケースだけ撮る
node scripts/capture-thumbnails.mjs --base http://localhost:3839 --only koui-genji-apparatus,melos-speech
```

- 開いた直後では見どころ（ハイライトや選択状態）が出ない場合は、`scripts/capture-thumbnails.mjs` の `PREPARE[<id>]` にクリックやシークの操作を足す。
- 出力先は `public/thumbnails/usecases/<id>.ja.webp` と `public/thumbnails/usecases/<id>.en.webp`（1280×720）。
- 詳細ページ（`/usecases/<id>`）の OGP 画像（`og:image` / `twitter:image`）としてもそのまま使われる。

---

## 3. 短尺の操作デモ動画の録画（`scripts/capture-usecase-clips.mjs`）

トップページの見本カード（`UseCaseClip`）および YouTube 動画が未登録のときの `/usecases` カード（`UseCaseMedia`）で再生する、
5〜7 秒の無音ループ動画（H.264 MP4）を Playwright の画面録画と `ffmpeg` で生成する。

```sh
# すべて録画する（本番 https://awase.ldas.jp を開く）
node scripts/capture-usecase-clips.mjs

# まだ無いものだけ録画する
node scripts/capture-usecase-clips.mjs --missing

# 手元の開発サーバで特定のユースケース・言語だけ録画する
node scripts/capture-usecase-clips.mjs --base http://localhost:3839 --only koui-genji-apparatus --locale ja
```

### 仕組み

1. Playwright の `recordVideo` で 1440×944 の画面を録画開始し、ページを開いて読み込み完了まで待つ（`clip.wait`）。
2. `start` 時刻を記録してから `clip.act(page)`（異文を押して伝本を切り替える、対訳の対応箇所を順に押す、動画の発話を押してシークする等）を実行し、`end` 時刻を記録する。
3. `ffmpeg` で `start`〜`end` の区間だけを切り出し（読み込み待ちを除外）、ヘッダー下を切り抜いて幅 640px に縮小し、`setpts` で `clip.seconds`（5〜6 秒）に収めて `public/clips/usecases/<id>.<ja|en>.mp4` に書き出す。

---

## 4. YouTube ナレーション解説動画（Kokoro TTS + Playwright 4K 録画）

音声ナレーションと字幕付きの解説動画を YouTube に公開し、ユースケースの `video: { ja, en }` に設定する場合は、以下の手順で作る。

### 4.1 構成と原則

- **声を先に作り、その長さで画面を撮る**: 各セリフの音声ファイル（WAV）を先に合成し、`字幕の長さ = 声の長さ + 0.5 秒` だけ待ってから次の操作へ進む。声と画面の操作がずれない。
- **1 本の台本で日英を別撮りする**: 台本には `await say('日本語のナレーション', 'English narration')` と書き、日本語版は `/ja/...`、英語版は `/en/...` の画面をそれぞれ録画する。
- **4K（3840×2160・30fps）で出力する**: ブラウザの viewport は `1920×1080`、`deviceScaleFactor: 2`（ヘッドレス時は `--force-device-scale-factor=2`）で録画し、縮小せず 3840×2160 のまま書き出す。

### 4.2 設定ファイル（`video.json`）の例

```json
{
  "name": "awase-koui-genji",
  "title": {
    "ja": "Awase で『校異源氏物語』の異文と伝本を読み比べる",
    "en": "Comparing Variant Readings of The Tale of Genji in Awase"
  },
  "spokenName": {
    "ja": "アワセで校異源氏物語の異文と伝本を読み比べる",
    "en": "Comparing Variant Readings of The Tale of Genji in Awase"
  },
  "base": {
    "ja": "https://awase.ldas.jp/ja",
    "en": "https://awase.ldas.jp/en"
  },
  "channel": "chrome",
  "chapters": [
    {
      "id": "ch01",
      "title": { "ja": "本文・画像・校異の連動", "en": "Linking text, images, and apparatus" },
      "script": "scripts/chapters/ch01-apparatus.mjs"
    }
  ]
}
```

### 4.3 章スクリプト（`scripts/chapters/ch01-apparatus.mjs`）の例

```js
import { startChapter, L } from '../../../common/kokoro/chapter.mjs';

const c = await startChapter(
  'ch01',
  '/viewer?u=https%3A%2F%2Fw3id.org%2Fkouigenjimonogatari%2Ftei%2F01.xml&dir=v',
);
const { page, say } = c;

await say(
  '校異源氏物語の桐壺の巻を、縦書きの本文と大島本の画像、校異の一覧を並べて開いています。',
  'Here we open the Kiritsubo chapter of the Kōi Genji Monogatari with the vertical text, Ōshima-bon images, and critical apparatus side by side.',
);

await Promise.all([
  say(
    '右の校異から項目を選ぶと、本文の該当箇所が光り、各伝本の読みを見比べられます。',
    'Selecting an entry in the apparatus highlights the passage in the text and shows the readings across witnesses.',
  ),
  (async () => {
    await page.waitForTimeout(1000);
    await page.locator('[data-testid="apparatus-item"]').nth(2).click();
  })(),
]);

await Promise.all([
  say(
    '上のメニューから伝本を選ぶと、本文の異文箇所がその伝本の読みにその場で切り替わります。',
    'Choosing a witness from the menu swaps the variant readings directly in the main text.',
  ),
  (async () => {
    await page.waitForTimeout(1000);
    const sel = page.locator('[data-testid="witness-select"]');
    const val = await sel.locator('option').nth(2).getAttribute('value');
    if (val) await sel.selectOption(val);
  })(),
]);

await c.end();
```

### 4.4 合成・録画・YouTube ID の登録

1. `synth.py --lang ja` / `--lang en` で音声を合成し、`readings.txt` の音素を確認して読み誤りがあれば `narration/readings.csv`（例: `Awase,アワセ`、`校異源氏物語,コーイゲンジモノガタリ`）に追記する。
2. `record-all.zsh ja` / `record-all.zsh en`（裏で回すときは `REC_HEADLESS=1`）で録画・結合し、`check-frames.py` で白画面やエラー表示がないか点検する。
3. YouTube にアップロードして発行された 11 文字の `videoId` を `src/lib/usecases.ts` の対象ユースケースの `video: { ja: '...', en: '...' }` に記入する。
   `video` が設定されると、`/usecases` と `/usecases/<id>` の再生ボタン（▶）は自動的に YouTube プレーヤーに切り替わる。

---

## 5. テストによる検査

`npm test`（`src/lib/usecases.test.ts`）と `npm run test:export`（`scripts/check-export.mjs`）が次を自動で検査する。

- すべてのユースケースに日英の `title`・`note` があること
- `featured: true` のユースケースに日英の `headline` があること
- すべてのユースケースの `public/thumbnails/usecases/<id>.<ja|en>.webp` が存在すること
- `clip: true` のユースケースの `public/clips/usecases/<id>.<ja|en>.mp4` が存在すること
- `video` が設定されている場合、11 文字の YouTube ID 形式であること
