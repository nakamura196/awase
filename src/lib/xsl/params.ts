// xsl 画面の URL の引数を読む（tei-tools の view.js と同じ受け方）。
import { XSL_CATALOG } from './catalog';

/** TEI の URL。u を先に、次に url（tei-tools の書き方）、tei の順で、空でない最初のもの */
export function getTeiUrl(params: Pick<URLSearchParams, 'get'>): string {
  for (const k of ['u', 'url', 'tei']) {
    const v = params.get(k)?.trim();
    if (v) return v;
  }
  return '';
}

/** 使う XSL の指定。auto は TEI の中身から選ぶ */
export type XslChoice = { kind: 'auto' } | { kind: 'catalog'; id: string } | { kind: 'sef'; url: string };

const looksLikeUrl = (s: string) => /^https?:/i.test(s) || s.includes('/') || /\.(xslt?|sef\.json)$/i.test(s);

/** .xsl の URL は、隣のコンパイル済み .sef.json の URL にする */
export function toSefUrl(url: string): string {
  return /\.sef\.json$/i.test(url) ? url : url.replace(/\.xslt?$/i, '.sef.json');
}

/** xsl の値。目録の id、.sef.json の URL、.xsl の URL のどれか。知らない id は auto として扱う */
export function parseXslChoice(value: string | null): XslChoice {
  const v = value?.trim();
  if (!v) return { kind: 'auto' };
  if (looksLikeUrl(v)) return { kind: 'sef', url: toSefUrl(v) };
  if (XSL_CATALOG.some((x) => x.id === v)) return { kind: 'catalog', id: v };
  return { kind: 'auto' };
}

/**
 * xsl を指定しないとき。影印の画像があり、頁（pb@facs="#…"）が surface を指していれば OCR の翻刻ビュー、
 * そうでなければ本文ビュー。OCR ビューは pb@facs で頁と画像を結ぶので、
 * 校異源氏のように pb@facs が画像の URL の TEI では行が空になる
 */
export function defaultXslId(xmlText: string): 'ocr' | 'reading' {
  return /<facsimile[\s>]/.test(xmlText) && /<graphic[\s>]/.test(xmlText) && /<pb\s[^>]*facs="#/.test(xmlText)
    ? 'ocr'
    : 'reading';
}

/** 変換に使う SEF の URL（basePath つきのサイト内パスか、外の URL） */
export function sefLocation(choice: XslChoice, xmlText: string, sitePath: (p: string) => string): string {
  if (choice.kind === 'sef') return choice.url;
  const id = choice.kind === 'catalog' ? choice.id : defaultXslId(xmlText);
  const file = XSL_CATALOG.find((x) => x.id === id)!.file;
  return sitePath(`/xsl/${file}`);
}

/** 出力の HTML に <base> を入れる。iframe の srcdoc には自分の URL が無いので、相対パスの CSS や JS が探せるようにする */
export function injectBase(html: string, baseHref: string): string {
  const tag = `<base href="${baseHref.replace(/"/g, '&quot;')}">`;
  const head = /<head(\s[^>]*)?>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length);
  return tag + html;
}

/** 出力の <html> に dark を付ける（または外す）。awase のダークに合わせて theme.css の .dark を効かせる */
export function setDarkClass(html: string, dark: boolean): string {
  const m = /<html(\s[^>]*)?>/i.exec(html);
  if (!m) return html;
  let attrs = (m[1] ?? '').replace(/\sclass="([^"]*)"/i, (_, c: string) => {
    const rest = c.split(/\s+/).filter((x) => x && x !== 'dark');
    return rest.length ? ` class="${rest.join(' ')}"` : '';
  });
  if (dark) {
    const had = /\sclass="/i.test(m[1] ?? '') && /\sclass="[^"]*"/i.test(attrs);
    attrs = had ? attrs.replace(/\sclass="([^"]*)"/i, ' class="$1 dark"') : `${attrs} class="dark"`;
  }
  return html.slice(0, m.index) + `<html${attrs}>` + html.slice(m.index + m[0].length);
}
