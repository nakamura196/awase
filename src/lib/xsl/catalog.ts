// XSL の一覧（tei-tools の catalog.json の xsl から写した。MIT、nakamura196、コミット 839d787）。
// コンパイル済みの SEF（Stylesheet Export File）は public/xsl/ に同じものを置いている。
// 元の title は「English / 日本語」の形なので、言語ごとに分けて持つ。

export interface XslEntry {
  id: string;
  en: string;
  ja: string;
  /** public/xsl/ の中のファイル名 */
  file: string;
}

export const XSL_CATALOG: readonly XslEntry[] = [
  { id: 'analysis', en: 'Tag statistics', ja: 'タグ統計・可視化', file: 'tei-analysis.sef.json' },
  { id: 'bibliography', en: 'Bibliography table', ja: '書誌情報テーブル', file: 'tei-bibliography.sef.json' },
  { id: 'manchu', en: 'Cing gisun-i Lao Kida vertical view', ja: '清語老乞大 縦書きビュー', file: 'tei-manchu.sef.json' },
  { id: 'ner', en: 'Named-entity overview', ja: '固有表現の一覧・可視化', file: 'tei-ner.sef.json' },
  { id: 'notes', en: 'Notes list', ja: '注釈一覧', file: 'tei-notes.sef.json' },
  { id: 'ocr', en: 'OCR transcription view', ja: 'OCR 翻刻ビュー', file: 'tei-ocr-facsimile.sef.json' },
  { id: 'persname-split', en: 'Line-spanning entity view', ja: '行をまたぐエンティティのビュー', file: 'tei-persname-split.sef.json' },
  { id: 'reading', en: 'Reading view', ja: '本文リーディングビュー', file: 'tei-reading.sef.json' },
  { id: 'urenja', en: 'Yūrensha transcription view', ja: '酉蓮社 翻刻ビュー', file: 'tei-urenja.sef.json' },
  { id: 'vellum', en: 'Vellum contract document view', ja: 'Vellum 契約文書ビュー', file: 'tei-vellum.sef.json' },
];

/** 画面の言語での題名 */
export function xslTitle(entry: XslEntry, locale: string): string {
  return locale === 'ja' ? entry.ja : entry.en;
}
