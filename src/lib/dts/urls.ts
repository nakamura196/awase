// 入口のテンプレートから、取りに行く URL と、viewer / xsl に渡す URL を組み立てる。
import { expandTemplate } from './uriTemplate';
import { resolveUrl, looksLikeUrl } from './url';
import type { DtsEntry } from './entry';

/** 既定の入口 */
export const DEFAULT_BASE = 'https://dts.ldas.jp/api/v2/dts';

/** Collection を取りに行く URL。url が URL ならそれ、id ならテンプレートに入れる、無ければ根のコレクション */
export function collectionUrl(entry: DtsEntry, entryUrl: string, target: string | null, page?: string): string {
  if (target && looksLikeUrl(target)) return resolveUrl(target, entryUrl);
  return resolveUrl(expandTemplate(entry.collection, { id: target ?? undefined, page }), entryUrl);
}

/** 資料の Navigation を取りに行く URL。ref を渡すと、その単位とすぐ下の単位が返る */
export function navigationUrl(template: string, entryUrl: string, resource: string, ref?: string): string {
  return resolveUrl(expandTemplate(template, { resource, ref, down: 1 }), entryUrl);
}

/** 本文（TEI）を取る URL。ref を付けると、その単位だけ */
export function documentUrl(template: string, entryUrl: string, resource: string, ref?: string): string {
  return resolveUrl(expandTemplate(template, { resource, ref }), entryUrl);
}

/** 画面の url に書く値。Collection の窓口のテンプレートを展開した絶対 URL（無ければ id） */
export function nodeTarget(node: { id: string; collection?: string }, entryUrl: string): string {
  if (!node.collection) return node.id;
  return resolveUrl(expandTemplate(node.collection, {}), entryUrl);
}
