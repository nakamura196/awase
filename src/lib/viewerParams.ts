// viewer の URL の引数を読む（docs/notes/survey.md「viewer の URL」）。

// 読む TEI の一覧。u・tei・config はどれも繰り返してよく、URL に書いた順に並べる（書簡の横断・対訳）。
// config（PTV の config.json）は、読んだあとで束ねている本文の URL に開く
export function getSources(params: Pick<URLSearchParams, 'forEach'>): string[] {
  const out: string[] = [];
  params.forEach((v, k) => {
    if ((k === 'u' || k === 'tei' || k === 'config') && v.trim()) out.push(v.trim());
  });
  return out;
}

// 本文の横に出せるペイン。panes を書かなければ、使えるものを全部出す
export const OPTIONAL_PANES = ['image', 'apparatus'] as const;
export type OptionalPane = (typeof OPTIONAL_PANES)[number];

/** panes の値（null は書いていない）で、そのペインを出すか */
export function paneShown(panes: string | null, name: OptionalPane): boolean {
  return panes === null || panes.split(',').map((p) => p.trim()).includes(name);
}

/** ペインの出し入れを切り替えた後の panes の値。全部出すときは書かない（null） */
export function togglePane(panes: string | null, name: OptionalPane): string | null {
  const shown = OPTIONAL_PANES.filter((p) => (p === name ? !paneShown(panes, p) : paneShown(panes, p)));
  if (shown.length === OPTIONAL_PANES.length) return null;
  return ['text', ...shown].join(',');
}
