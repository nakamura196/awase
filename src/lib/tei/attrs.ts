// TEI の属性を、ページの部品（tei-* 要素）に写すときの決まり。
// DOM を使わない純粋な関数だけを置き、単体テストで確かめる。

/** 写した部品の属性名。null なら写さない */
export function htmlAttrName(name: string): string | null {
  if (name === 'xml:id') return 'id';
  if (name === 'xml:lang') return 'lang';
  // 名前空間の宣言は写さない
  if (name === 'xmlns' || name.startsWith('xmlns:')) return null;
  // 外から読んだ TEI なので、スクリプトや見た目を差し込める属性は落とす
  if (/^on/i.test(name) || name === 'style') return null;
  // 接頭辞付き（xml:space、xlink:href など）は data-<接頭辞>-<名前> に
  const colon = name.indexOf(':');
  if (colon >= 0) return `data-${name.slice(0, colon)}-${name.slice(colon + 1)}`;
  return name;
}

/**
 * リンクや画像に使ってよい URL に直す。使えなければ null。
 * - 相対 URL は TEI の URL を基準に解決する
 * - http(s) と、ページ内の参照（#id）だけを通す
 */
export function safeUrl(value: string, base?: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith('#')) return v.length > 1 ? v : null;
  try {
    const url = new URL(v, base);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
  } catch {
    // 解決できない値（未登録の接頭辞 "pers:xxx" など）は使わない
  }
  return null;
}

/** TEI の要素名を、ページの部品名に。CETEIcean と同じく小文字にして tei- を付ける */
export function htmlTagName(localName: string): string {
  return `tei-${localName.toLowerCase()}`;
}

/**
 * 字下げのためだけの空白（改行を含む空白だけの文字列）か。
 * 縦書きの日本語で、要素の間に余計な空きが出るのを防ぐために落とす
 */
export function isIndentation(text: string): boolean {
  return /^\s*$/.test(text) && /[\r\n]/.test(text);
}
