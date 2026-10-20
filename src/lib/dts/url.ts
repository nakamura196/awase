// DTS が返す URL（相対のことがある）を、取りに行ける形にする。

/** 展開したあとの URL を、基準の URL から見た絶対 URL にする。変換できなければそのまま返す */
export function resolveUrl(url: string, base: string): string {
  try {
    return new URL(url, base).href;
  } catch {
    return url;
  }
}

/** url に http(s) か / で始まる文字列が来たら URL とみなす。それ以外（urn:… など）は id */
export function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value) || value.startsWith('/');
}
