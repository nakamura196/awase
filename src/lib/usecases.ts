import { withBasePath } from '@/lib/basePath';
import { DEFAULT_BASE } from '@/lib/dts/urls';
import { SITE_URL } from '@/lib/site';

// ユースケース（実際の資料で Awase を使った例）。/usecases の一覧と、トップページの見本に出す。
// 1 件足すときは USE_CASES に 1 項目を書き足す。ページの部品は触らなくてよい。
// 開く先のページを増やすときは、UseCaseOpen に page の種類を足し、hrefOf に URL の組み立てを足す。

type Localized = { ja: string; en: string };
export type Locale = keyof Localized;

/**
 * 「Awase で開く」で開く先。開く画面ごとに、URL に載せられる引数が違うので分けて書く。
 * viewer は統合ビューア、xsl は XSL スタイルシート変換画面、compare は 2 資料比較画面、dts は資料目録画面。
 */
export type UseCaseOpen =
  | {
      page: 'viewer';
      // 1 つまたは複数の TEI/XML（または config.json）の URL
      u: string | string[];
      // 組方向（v = 縦書き、h = 横書き）
      dir?: 'v' | 'h';
      // 出すペイン（例: 'text,image' や 'text,entities,speech'）
      panes?: string;
      // 校異で選ぶ伝本の ID（# なし）
      wit?: string;
      // 表示スタイル（'line' | 'reading-support' | 'video' | 'analysis' | XSL カタログ ID）
      xsl?: string;
      // 開いたときにジャンプする要素の xml:id
      id?: string;
      // 読み上げペイン（vrm）が再生する台本 JSON（口形素・感情・動き入り）。/ で始まるサイト内パスも書ける
      json?: string;
    }
  | {
      page: 'xsl';
      u: string;
      xsl?: string;
      panel?: 'entities' | 'map';
    }
  | {
      page: 'compare';
      manifest1: string;
      manifest2: string;
      canvas1?: string;
      canvas2?: string;
      label1?: string;
      label2?: string;
      // 0 = 画像比較、1 = 文字の差分（既定）
      mode?: '0' | '1';
    }
  | {
      page: 'dts';
      base?: string;
      url?: string;
    };

/** 何を見せる例か。一覧に札として出す。表示名は messages の UseCases.features */
export const USE_CASE_FEATURES = [
  'text',
  'image',
  'parallel',
  'apparatus',
  'entities',
  'speech',
  'vrm',
  'map',
  'xsl',
  'video',
  'compare',
  'dts',
] as const;
export type UseCaseFeature = (typeof USE_CASE_FEATURES)[number];

export interface UseCase {
  // ページ内リンク（/usecases#<id>）にも使う。英小文字・数字・ハイフン
  id: string;
  // 一覧に足した日（YYYY-MM-DD）。一覧の「新しい順」と、カードの表示に使う
  added: string;
  title: Localized;
  // 2〜3 文。何の資料で、Awase で何ができるか
  note: Localized;
  open: UseCaseOpen;
  features: UseCaseFeature[];
  // 紹介動画（YouTube の videoId）。片方の言語しか無いときは、それを両方の言語で出す。
  // 押されるまでは Awase の画面（thumbnailOf）に ▶ を重ねて出し、YouTube は読み込まない
  video?: Partial<Localized>;
  // 短尺の操作デモ動画（public/clips/usecases/<id>.<locale>.mp4）があるか
  clip?: boolean;
  // 元のプロジェクトのページ
  site?: string;
  // トップページの見本にも出す
  featured?: boolean;
  // トップのカードの見出し。資料の名前ではなく「何ができるか」を短く（featured のときは必ず書く）
  headline?: Localized;
}

/** 開く資料そのものの URL（TEI/XML、compare なら IIIF マニフェスト、dts ならエンドポイント） */
export function sourcesOf(open: UseCaseOpen): string[] {
  switch (open.page) {
    case 'viewer':
      return typeof open.u === 'string' ? [open.u] : open.u;
    case 'xsl':
      return [open.u];
    case 'compare':
      return [open.manifest1, open.manifest2];
    case 'dts':
      return [open.url ?? open.base ?? DEFAULT_BASE];
  }
}

export function hrefOf(open: UseCaseOpen): string {
  switch (open.page) {
    case 'viewer': {
      const urls = typeof open.u === 'string' ? [open.u] : open.u;
      const q = urls.map((s) => `u=${encodeURIComponent(s)}`);
      if (open.dir) q.push(`dir=${open.dir}`);
      if (open.panes) q.push(`panes=${open.panes}`);
      if (open.wit) q.push(`wit=${encodeURIComponent(open.wit)}`);
      if (open.xsl) q.push(`xsl=${encodeURIComponent(open.xsl)}`);
      if (open.id) q.push(`id=${encodeURIComponent(open.id)}`);
      if (open.json) q.push(`json=${encodeURIComponent(open.json)}`);
      return `/viewer?${q.join('&')}`;
    }
    case 'xsl': {
      const q = [`u=${encodeURIComponent(open.u)}`];
      if (open.xsl) q.push(`xsl=${encodeURIComponent(open.xsl)}`);
      if (open.panel) q.push(`panel=${open.panel}`);
      return `/xsl?${q.join('&')}`;
    }
    case 'compare': {
      const q = [`manifest1=${encodeURIComponent(open.manifest1)}`];
      if (open.canvas1) q.push(`canvas1=${encodeURIComponent(open.canvas1)}`);
      if (open.label1) q.push(`label1=${encodeURIComponent(open.label1)}`);
      q.push(`manifest2=${encodeURIComponent(open.manifest2)}`);
      if (open.canvas2) q.push(`canvas2=${encodeURIComponent(open.canvas2)}`);
      if (open.label2) q.push(`label2=${encodeURIComponent(open.label2)}`);
      if (open.mode) q.push(`mode=${open.mode}`);
      return `/compare?${q.join('&')}`;
    }
    case 'dts': {
      const q: string[] = [];
      if (open.base) q.push(`base=${encodeURIComponent(open.base)}`);
      if (open.url) q.push(`url=${encodeURIComponent(open.url)}`);
      return q.length > 0 ? `/dts?${q.join('&')}` : '/dts';
    }
  }
}

// サムネイル（scripts/capture-thumbnails.mjs で撮ったビューアの画面）。言語ごとに撮ってある
// thumbnailPathOf は basePath なし（og:image など metadataBase からの URL 用）、thumbnailOf は画面の <img> 用
export const thumbnailPathOf = (u: UseCase, locale: Locale): string =>
  `/thumbnails/usecases/${u.id}.${locale}.webp`;
export const thumbnailOf = (u: UseCase, locale: Locale): string => withBasePath(thumbnailPathOf(u, locale));

// トップのカードや一覧で再生する短い動画（scripts/capture-usecase-clips.mjs で撮った、音なしの数秒の録画）
export const clipOf = (u: UseCase, locale: Locale): string =>
  withBasePath(`/clips/usecases/${u.id}.${locale}.mp4`);

export const videoOf = (u: UseCase, locale: Locale): string | undefined =>
  u.video?.[locale] ?? u.video?.[locale === 'ja' ? 'en' : 'ja'];

export const USE_CASES: UseCase[] = [
  {
    id: 'koui-genji-apparatus',
    added: '2026-10-20',
    title: {
      ja: '『校異源氏物語』桐壺（本文・画像・校異と伝本の一致度）',
      en: 'Kōi Genji Monogatari, Kiritsubo (text, IIIF images, critical apparatus, and witness agreement)',
    },
    note: {
      ja: '『校異源氏物語』第1帖「桐壺」の TEI/XML です。縦書きの本文と大島本の IIIF 画像を並べて読みながら、557 箇所の校異（app）と 18 伝本の本文一致度を確認できます。伝本を選ぶと、本文の異文箇所がその伝本の読みにその場で切り替わります。',
      en: 'TEI/XML of Chapter 1 “Kiritsubo” from the Kōi Genji Monogatari. Read the vertical text alongside Ōshima-bon IIIF facsimile images while inspecting 557 critical apparatus entries and agreement rates across 18 witnesses. Selecting a witness swaps the variant readings directly in the text.',
    },
    open: {
      page: 'viewer',
      u: 'https://tei-eaj.github.io/koui/data/01_with_wit_images.xml',
      dir: 'v',
    },
    features: ['text', 'image', 'apparatus'],
    video: { ja: 'kEi11XHVg-I', en: '18SnJHq1wqc' },
    site: 'https://kouigenjimonogatari.github.io/',
    clip: true,
    featured: true,
    headline: {
      ja: '異文を比べ、伝本で読みを入れ替える',
      en: 'Compare variant readings and switch witnesses',
    },
  },
  {
    id: 'eiri-yosano-parallel',
    added: '2026-10-19',
    title: {
      ja: '『絵入源氏物語』桐壺と与謝野晶子訳（原文・現代語訳・画像の連動）',
      en: 'Illustrated Tale of Genji (Eiri Genji) and Yosano Akiko’s translation (linked original, translation, and images)',
    },
    note: {
      ja: '承応 3 年（1654）刊『絵入源氏物語』桐壺の本文と、与謝野晶子による現代語訳を並べて表示します。文ごとの対応（@corresp）により、一方をスクロールすると他方も対応する箇所へ連動して動き、文を押すと対応する文がハイライトされます。',
      en: 'Displays the 1654 Illustrated Tale of Genji (Eiri Genji) alongside Yosano Akiko’s modern Japanese translation. Linked via @corresp attributes, scrolling one text brings the other along proportionally, and clicking a passage highlights its counterpart.',
    },
    open: {
      page: 'viewer',
      u: 'https://tei-eaj.github.io/parallel_text_viewer/data/pt/config.json',
      dir: 'v',
    },
    features: ['text', 'image', 'parallel'],
    video: { ja: 'bKqMuPRe4gg', en: 'uu-CFKSXHyg' },
    site: 'https://tei-eaj.github.io/parallel_text_viewer/',
    clip: true,
    featured: true,
    headline: {
      ja: '原文と現代語訳を並べ、対応箇所を連動させる',
      en: 'Read original and translation side by side in sync',
    },
  },
  {
    id: 'annan-kokusho-diplomatic',
    added: '2026-10-20',
    title: {
      ja: '『徳川家康復安南国書』（平出・台頭、紙面領域ズーム、送受信地図・年表）',
      en: 'Tokugawa Ieyasu’s Diplomatic Reply to Annam (elevated lines, facsimile zones, map & timeline)',
    },
    note: {
      ja: '慶長 11 年（1606）の外交文書『徳川家康復安南国書』の TEI/XML です。敬意を表す平出・台頭の組版を再現し、漢文原文・読み下し・現代語訳の段落が相互に対応します。文を選ぶと紙面画像上の該当ゾーンへ寄るほか、correspDesc から発送地（伏見城）と宛先（安南）の地図と年表を描画します。',
      en: 'TEI/XML of Tokugawa Ieyasu’s 1606 diplomatic reply to Annam. Reproduces traditional elevated-line layout (heishutsu and taitō) and links the classical Chinese original, kundoku reading, and modern translation. Selecting a passage zooms into its zone on the facsimile, while correspDesc drives a correspondence map and timeline.',
    },
    open: {
      page: 'viewer',
      u: `${SITE_URL}/samples/annan-kokusho.xml`,
      dir: 'v',
    },
    features: ['text', 'image', 'parallel', 'entities', 'map'],
    video: { ja: 'NkeA4RChLfk', en: 'XifSCJasd_0' },
    clip: true,
    featured: true,
    headline: {
      ja: '外交文書の組版・紙面領域・送受信地図を見る',
      en: 'Inspect diplomatic layout, facsimile zones, and map',
    },
  },
  {
    id: 'melos-speech',
    added: '2026-10-20',
    title: {
      ja: '太宰治『走れメロス』（発話の集計・登場人物への呼称の推移）',
      en: 'Dazai Osamu’s “Run, Melos!” (speech statistics and appellation transitions)',
    },
    note: {
      ja: '青空文庫 TEI の『走れメロス』です。発話（said）と人物参照（persName）から、話者ごとの発話回数・文字数、誰から誰への発話か、同一人物が場面によってどう呼び分けられているか（「メロス」「勇者」「悪心」など）の推移を集計し、本文の該当箇所へジャンプできます。',
      en: 'Aozora Bunko TEI edition of Dazai Osamu’s “Run, Melos!”. Aggregates speaker turn counts, character counts, speaker-to-addressee pairs, and how appellations for each character shift across the narrative, jumping directly to matching passages in the text.',
    },
    open: {
      page: 'viewer',
      u: 'https://raw.githubusercontent.com/TEI-EAJ/aozora_tei/master/data/complete/tei_lib_lv4/1567_tei.xml',
      dir: 'v',
      panes: 'text,entities,speech',
    },
    features: ['text', 'entities', 'speech'],
    video: { ja: 'gq_oIIVmM7w', en: 'rdnk0K62gL8' },
    site: 'https://github.com/TEI-EAJ/aozora_tei',
    clip: true,
    featured: true,
    headline: {
      ja: '誰が誰をどう呼んだか、発話と呼称をたどる',
      en: 'Trace who spoke and how characters addressed each other',
    },
  },
  {
    id: 'melos-vrm',
    added: '2026-10-25',
    title: {
      ja: '太宰治『走れメロス』（アバターによる読み上げ）',
      en: 'Dazai Osamu’s “Run, Melos!” (read aloud by an avatar)',
    },
    note: {
      ja: '青空文庫 TEI の『走れメロス』の発話（said）を、3D のアバターがブラウザの音声合成で読み上げます。読んでいる行は本文でハイライトされ、口が動き、まばたきをします。アバターは VRoid Project のサンプルです。',
      en: 'The speech (said) in the Aozora Bunko TEI of “Run, Melos!” is read aloud by a 3D avatar using the browser’s speech synthesis. The line being read is highlighted in the text, and the avatar moves its mouth and blinks. The avatar is a VRoid Project sample.',
    },
    open: {
      page: 'viewer',
      u: 'https://raw.githubusercontent.com/TEI-EAJ/aozora_tei/master/data/complete/tei_lib_lv4/1567_tei.xml',
      dir: 'v',
      panes: 'text,vrm',
    },
    features: ['text', 'vrm'],
    site: 'https://github.com/TEI-EAJ/aozora_tei',
  },
  {
    id: 'vrm-script-mitsu-no-takara',
    added: '2026-10-25',
    title: {
      ja: '芥川龍之介『三つの宝』（台本 JSON による表情・口形・動き付きの読み上げ）',
      en: 'Akutagawa Ryūnosuke’s “Mittsu no Takara” (read aloud with expressions, mouth shapes and motion from a script JSON)',
    },
    note: {
      ja: '青空文庫 TEI の『三つの宝』（第一幕）を、台詞ごとの感情・口形素・体の動きを持つ台本 JSON（json=）に沿ってアバターが読みます。台本の台詞は本文の発話に対応づけられ、読んでいる行が本文でハイライトされます。音声ファイルは付いていないため、声はブラウザの音声合成になります（話者ごとに声の高さを変えます）。表情と動きは台本のものです。',
      en: 'The avatar reads the first act of the Aozora Bunko TEI of “Mittsu no Takara” following a script JSON (json=) that carries emotion, mouth shapes and body motion for each line. Script lines are aligned to the speech in the text, so the line being read is highlighted. No audio files are included, so the voice is the browser’s speech synthesis (with a different pitch per speaker); the expressions and motion come from the script.',
    },
    open: {
      page: 'viewer',
      u: 'https://raw.githubusercontent.com/TEI-EAJ/aozora_tei/master/data/complete/tei_lib_lv3/1126_tei.xml',
      dir: 'v',
      panes: 'text,vrm',
      json: '/data/vrm/mitsu-no-takara-act1.json',
    },
    features: ['text', 'vrm'],
    site: 'https://github.com/TEI-EAJ/aozora_tei',
  },
  {
    id: 'video-support-news',
    added: '2026-10-21',
    title: {
      ja: '県立長野図書館 地域ニュース映像（映像・字幕・用語解説・出現タイムライン連動）',
      en: 'Nagano Prefectural Library local news reel (video, transcript, glossary, and timeline)',
    },
    note: {
      ja: '発話に開始・終了時刻（@start / @end）と用語解説（note）が付いた映像字幕の TEI/XML です。「映像・音声支援」スタイルで開くと、動画の再生位置に合わせて字幕と解説カードが自動で切り替わり、用語ごとの出現タイムラインや参照元の地図から該当箇所へ移動できます。',
      en: 'A TEI/XML transcript with time-aligned utterances (@start / @end) and glossary notes. Opened in the Video Support style, transcript lines and glossary cards follow video playback automatically, with an occurrence timeline and reference map for jumping to any mention.',
    },
    open: {
      page: 'viewer',
      u: 'https://video-support.vercel.app/data/sdcommons_npl-02FT0102974177/sdcommons_npl-02FT0102974177.xml',
      dir: 'h',
      xsl: 'video',
    },
    features: ['text', 'video', 'entities', 'xsl'],
    video: { ja: 'g7pQNuUexGU', en: '0XyDtHn2E9o' },
    site: 'https://video-support.vercel.app/',
    clip: true,
    featured: true,
    headline: {
      ja: '映像と字幕・用語解説・出現位置を連動させる',
      en: 'Link video playback with transcript, glossary, and timeline',
    },
  },
  {
    id: 'genji-compare',
    added: '2026-10-20',
    title: {
      ja: '源氏物語 2 伝本の比較（IIIF 画像と翻刻テキストの 1 字単位差分）',
      en: 'Comparing two Tale of Genji witnesses (IIIF images and character-level transcription diff)',
    },
    note: {
      ja: '『校異源氏物語』桐壺と国立国会図書館所蔵『源氏物語』（近世前期横本写本）の 2 つの IIIF マニフェストを比較画面（/compare）で並べて開きます。コマごとの翻刻テキストを 1 字単位で突き合わせて編集距離・類似度・挿入削除を色分け表示するほか、画像モードで紙面を左右に並べて見比べられます。',
      en: 'Opens two IIIF manifests of The Tale of Genji (Kōi Genji Monogatari and an early-modern manuscript held by the National Diet Library) side by side on the /compare screen. Inspect character-by-character diffs with edit distance and similarity scores, or switch to Image mode to compare the manuscript pages.',
    },
    open: {
      page: 'compare',
      manifest1: 'https://genji-ai.web.app/iiif/koui/koui-01/manifest.json',
      canvas1: 'https://genji-ai.web.app/iiif/koui/canvas/5',
      label1: '校異源氏物語',
      manifest2: 'https://genji-ai.web.app/iiif/ndl_2585098/ndl_2585098-01/manifest.json',
      canvas2: 'https://dl.ndl.go.jp/api/iiif/2585098/canvas/3',
      label2: '近世前期横本写本（国立国会図書館所蔵）',
    },
    features: ['text', 'image', 'compare'],
    video: { ja: 'yKnR_eyKju8', en: 'PnplueuuSVA' },
    clip: true,
    featured: true,
    headline: {
      ja: '2 つの伝本の画像と翻刻の差分を見比べる',
      en: 'Compare images and character-level diffs of two manuscripts',
    },
  },
  {
    id: 'three-treasures-line',
    added: '2026-10-21',
    title: {
      ja: '芥川龍之介『三つの宝』（戯曲のト書き・せりふ構造と LINE 風対話表示）',
      en: 'Akutagawa Ryūnosuke’s “The Three Treasures” (drama structure and LINE-style chat view)',
    },
    note: {
      ja: '青空文庫 TEI の戯曲『三つの宝』を、表示スタイル「LINE 風（発話）」で開いた例です。登場人物一覧（particDesc）と発話（sp / speaker）の構造をもとに、ト書きを地の案内、各人物のせりふを吹き出しとして対話形式で読み進められます。',
      en: 'Aozora Bunko TEI edition of Akutagawa Ryūnosuke’s play “The Three Treasures”, opened in the LINE-style dialogue view. Stage directions and character speeches (sp / speaker) are rendered as a chat thread using the cast list in particDesc.',
    },
    open: {
      page: 'viewer',
      u: 'https://raw.githubusercontent.com/TEI-EAJ/aozora_tei/master/data/complete/tei_lib_lv3/1126_tei.xml',
      dir: 'v',
      xsl: 'line',
    },
    features: ['text', 'speech', 'xsl'],
    video: { ja: 'oOFxtLus9tk', en: '4hL7YDl-2VU' },
    site: 'https://github.com/TEI-EAJ/aozora_tei',
    clip: true,
  },
  {
    id: 'reading-support-news',
    added: '2026-10-21',
    title: {
      ja: '用語解説・地図・出現チャートによる読解支援ビュー',
      en: 'Reading Support view with glossary cards, map, and occurrence chart',
    },
    note: {
      ja: '本文中の固有名詞や専門用語に付けた注釈（note）をもとに、画面下部に用語解説カード、右側に参照元の地図と語句の出現位置チャートを並べる「読解支援」スタイルです。本文中の語句と解説カード・地図・チャートが双方向に連動します。',
      en: 'The Reading Support style pairs annotated terms in the text with glossary cards at the bottom and a reference map and term-occurrence chart on the right. Clicking a term in the text or a card highlights and scrolls to its counterparts.',
    },
    open: {
      page: 'viewer',
      u: 'https://video-support.vercel.app/data/sdcommons_npl-02FT0102974177/sdcommons_npl-02FT0102974177.xml',
      dir: 'h',
      xsl: 'reading-support',
    },
    features: ['text', 'entities', 'map', 'xsl'],
    video: { ja: 'V3q2B5J5A_s', en: 'lkKppcXGo9I' },
    site: 'https://video-support.vercel.app/',
    clip: true,
  },
  {
    id: 'ocr-facsimile-xsl',
    added: '2026-10-20',
    title: {
      ja: '東洋文庫 OCR 影印ビュー（行と画像領域の双方向ハイライト・XSL 変換）',
      en: 'Toyo Bunko OCR facsimile view (bidirectional line-and-zone highlighting via XSL)',
    },
    note: {
      ja: '東洋文庫の tei-tools で作成された、紙面上の座標領域（surface / zone）と行（line）を持つ TEI/XML です。XSL 画面（/xsl）で SaxonJS によりブラウザ内でスタイルシートを適用し、画像の行領域にマウスを乗せると対応する翻刻行が光ります。',
      en: 'A TEI/XML document with facsimile surface zones and line transcriptions from Toyo Bunko’s tei-tools. Transformed in the browser via SaxonJS on the /xsl screen, hovering over a line region on the page image highlights the corresponding transcribed line.',
    },
    open: {
      page: 'xsl',
      u: 'https://tei-tools.toyobunko-lab.jp/xml/ocr-sample/tei.xml',
      xsl: 'ocr',
    },
    features: ['text', 'image', 'xsl'],
    video: { ja: 'ZD7OrqjACMo', en: 'tsspV54RNOM' },
    site: 'https://tei-tools.toyobunko-lab.jp/',
    clip: true,
  },
  {
    id: 'dts-koui-genji',
    added: '2026-10-20',
    title: {
      ja: '『校異源氏物語』全 54 帖の DTS コレクション（引用単位をたどりビューアで開く）',
      en: 'DTS collection of all 54 chapters of the Kōi Genji Monogatari (browse citable units and open in viewer)',
    },
    note: {
      ja: 'Distributed Text Services（DTS）の API 規約に沿って公開された『校異源氏物語』全 54 帖のコレクションを DTS 画面（/dts）でたどる例です。各帖の書誌情報や段落ごとの引用単位（Navigation）を一覧し、全体または任意の段落をそのまま Awase のビューアで開けます。',
      en: 'Browses all 54 chapters of the Kōi Genji Monogatari served via the Distributed Text Services (DTS) API specification on the /dts screen. Inspect metadata and paragraph-level citable units, and open either a full chapter or a specific passage directly in the Awase viewer.',
    },
    open: {
      page: 'dts',
      base: 'https://dts.ldas.jp/api/v2/dts',
    },
    features: ['text', 'dts'],
    video: { ja: 'vXdsOmzUvUM', en: 'ptVqn6iL7kg' },
    site: 'https://dts.ldas.jp/',
    clip: true,
  },
];

/** 新しく足した順。同じ日なら定義の順のまま */
export const byNewest = (list: UseCase[]): UseCase[] =>
  [...list].sort((a, b) => b.added.localeCompare(a.added));

export const FEATURED_USE_CASES = USE_CASES.filter((u) => u.featured);

// 名前を useCaseById にすると、React の規則の検査が Hook と取り違えるので usecaseById にしてある
export const usecaseById = (id: string): UseCase | undefined => USE_CASES.find((u) => u.id === id);
