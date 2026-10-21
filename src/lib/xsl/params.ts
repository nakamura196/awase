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

/** 変換に使う SEF の URL（basePath つきのサイト内パスか、外の URL）。組み込みビュー（line など）は null */
export function sefLocation(choice: XslChoice, xmlText: string, sitePath: (p: string) => string): string | null {
  if (choice.kind === 'sef') return choice.url;
  const id = choice.kind === 'catalog' ? choice.id : defaultXslId(xmlText);
  const file = XSL_CATALOG.find((x) => x.id === id)?.file ?? null;
  return file ? sitePath(`/xsl/${file}`) : null;
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
  return setFrameHtmlAttrs(html, { dark });
}

/**
 * 出力の <html> に dark・is-vertical クラスおよび data-focus-id を設定する
 */
export function setFrameHtmlAttrs(
  html: string,
  opts: { dark?: boolean; vertical?: boolean; focusId?: string | null },
): string {
  const m = /<html(\s[^>]*)?>/i.exec(html);
  if (!m) return html;
  let attrs = (m[1] ?? '')
    .replace(/\sdata-focus-id="[^"]*"/gi, '')
    .replace(/\sclass="([^"]*)"/i, (_, c: string) => {
      const rest = c.split(/\s+/).filter((x) => x && x !== 'dark' && x !== 'is-vertical');
      return rest.length ? ` class="${rest.join(' ')}"` : '';
    });

  const addClasses: string[] = [];
  if (opts.dark) addClasses.push('dark');
  if (opts.vertical) addClasses.push('is-vertical');

  if (addClasses.length > 0) {
    const added = addClasses.join(' ');
    const had = /\sclass="[^"]*"/i.test(attrs);
    attrs = had ? attrs.replace(/\sclass="([^"]*)"/i, ` class="$1 ${added}"`) : `${attrs} class="${added}"`;
  }
  if (opts.focusId) {
    const escaped = opts.focusId.replace(/"/g, '&quot;');
    attrs = `${attrs} data-focus-id="${escaped}"`;
  }
  return html.slice(0, m.index) + `<html${attrs}>` + html.slice(m.index + m[0].length);
}

/**
 * リーディングビューで URL に dir が指定されていないとき、既定を縦書き（true）にするか判定する。
 * - 釈文／読み下し／大意（div@type="original" 等）や ab の平出・台頭がある日本語史料、
 *   および表（table）を含まない日本語文学・戯曲 TEI は縦書きを既定とする。
 */
export function defaultReadingVertical(doc: Document): boolean {
  const body = doc.getElementsByTagNameNS('*', 'body')[0];
  if (!body) return false;
  if (body.getElementsByTagNameNS('*', 'table').length > 0) return false;
  for (const div of Array.from(body.getElementsByTagNameNS('*', 'div'))) {
    const t = div.getAttribute('type')?.trim();
    if (t === 'original' || t === 'yomikudashi' || t === 'japanese') return true;
  }
  const text = body.textContent ?? '';
  return /[\u3040-\u30ff\u4e00-\u9faf]/.test(text);
}
