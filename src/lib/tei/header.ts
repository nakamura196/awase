// teiHeader から、本文の上に出す書誌の欄に使う項目を取り出す。

export interface TeiHeaderSummary {
  title: string;
  /** 別名（title@type="alt" など） */
  altTitles: string[];
  authors: string[];
  /** 「役割: 名前」 */
  resp: string[];
  publisher?: string;
  date?: string;
  availability?: string;
  /** availability の中のライセンスへのリンク */
  licenseUrl?: string;
  source?: string;
}

function clean(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim();
}

function first(root: Element, selector: string): Element | null {
  return root.querySelector(selector);
}

export function summarizeHeader(tei: Document): TeiHeaderSummary | null {
  const header = tei.querySelector('teiHeader');
  if (!header) return null;
  const titles = Array.from(header.querySelectorAll('fileDesc > titleStmt > title'));
  const main = titles.find((t) => !t.getAttribute('type') || t.getAttribute('type') === 'main') ?? titles[0];
  const availability = first(header, 'publicationStmt > availability');
  const licenseEl = availability?.querySelector('licence[target], ref[target]');
  return {
    title: clean(main?.textContent),
    altTitles: titles.filter((t) => t !== main).map((t) => clean(t.textContent)).filter(Boolean),
    authors: Array.from(header.querySelectorAll('fileDesc > titleStmt > author')).map((a) => clean(a.textContent)),
    resp: Array.from(header.querySelectorAll('fileDesc > titleStmt > respStmt')).map((r) => {
      const resp = clean(first(r, 'resp')?.textContent);
      const names = Array.from(r.querySelectorAll('name, persName, orgName')).map((n) => clean(n.textContent));
      return resp ? `${resp}: ${names.join(', ')}` : names.join(', ');
    }),
    publisher: clean(first(header, 'publicationStmt > publisher, publicationStmt > distributor')?.textContent) || undefined,
    date: clean(first(header, 'publicationStmt > date')?.textContent) || undefined,
    availability: clean(availability?.textContent) || undefined,
    licenseUrl: licenseEl?.getAttribute('target') ?? undefined,
    source: clean(first(header, 'sourceDesc')?.textContent) || undefined,
  };
}
