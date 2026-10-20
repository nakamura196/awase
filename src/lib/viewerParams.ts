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
