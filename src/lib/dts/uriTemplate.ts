// URI テンプレート（RFC 6570）を展開する。DTS が使う範囲（レベル 3）だけ。
// 例: "/collection{?id,page,nav}" に { id: "urn:x" } → "/collection?id=urn%3Ax"

export type TemplateValue = string | number | undefined | null;

// 演算子ごとの決まり: 先頭の文字・区切り・名前を付けるか・予約文字をそのまま通すか
const OPERATORS: Record<string, { first: string; sep: string; named: boolean; allowReserved: boolean }> = {
  '': { first: '', sep: ',', named: false, allowReserved: false },
  '+': { first: '', sep: ',', named: false, allowReserved: true },
  '#': { first: '#', sep: ',', named: false, allowReserved: true },
  '.': { first: '.', sep: '.', named: false, allowReserved: false },
  '/': { first: '/', sep: '/', named: false, allowReserved: false },
  ';': { first: ';', sep: ';', named: true, allowReserved: false },
  '?': { first: '?', sep: '&', named: true, allowReserved: false },
  '&': { first: '&', sep: '&', named: true, allowReserved: false },
};

// 予約文字を通すときも、% と空白などは符号化する
function encode(value: string, allowReserved: boolean): string {
  if (!allowReserved) return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return encodeURI(value).replace(/%5B/g, '[').replace(/%5D/g, ']');
}

/** テンプレートの {…} を values で置き換える。値の無い変数は書かない */
export function expandTemplate(template: string, values: Record<string, TemplateValue>): string {
  return template.replace(/\{([^}]*)\}/g, (_, expr: string) => {
    const op = '+#./;?&'.includes(expr[0]) ? expr[0] : '';
    const names = (op ? expr.slice(1) : expr).split(',').map((n) => n.trim()).filter(Boolean);
    const { first, sep, named, allowReserved } = OPERATORS[op];
    const parts: string[] = [];
    for (const name of names) {
      const v = values[name];
      if (v === undefined || v === null || v === '') continue;
      const text = encode(String(v), allowReserved);
      parts.push(named ? `${name}=${text}` : text);
    }
    return parts.length ? first + parts.join(sep) : '';
  });
}

/** テンプレートに含まれる変数の名前 */
export function templateVariables(template: string): string[] {
  const out: string[] = [];
  for (const m of template.matchAll(/\{([^}]*)\}/g)) {
    const expr = m[1];
    const body = '+#./;?&'.includes(expr[0]) ? expr.slice(1) : expr;
    for (const n of body.split(',')) if (n.trim()) out.push(n.trim());
  }
  return out;
}
