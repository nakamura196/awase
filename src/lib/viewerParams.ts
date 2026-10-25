// viewer の URL の引数を読む（docs/notes/survey.md「viewer の URL」「旧 URL の受け方」）。

// 読む TEI の一覧。u・tei・config・url はどれも繰り返してよく、URL に書いた順に並べる（書簡の横断・対訳）。
// url に JSON 配列（["https://…","https://…"]、TEI-EAJ/app や aozora_tei の書簡地図の書き方）が来たときは要素を展開する。
// config（PTV の config.json）は、読んだあとで束ねている本文の URL に開く
export function getSources(params: Pick<URLSearchParams, 'forEach'>): string[] {
  const out: string[] = [];
  params.forEach((v, k) => {
    if (k !== 'u' && k !== 'tei' && k !== 'config' && k !== 'url') return;
    const trimmed = v.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('[')) {
      try {
        const parsed: unknown = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === 'string' && item.trim()) out.push(item.trim());
          }
          return;
        }
      } catch {
        // JSON 配列として読めないときはそのまま 1 件として扱う
      }
    }
    out.push(trimmed);
  });
  return out;
}

/** 縦書きか。dir=v または旧 tei_viewer の textDirection=vertical を受ける */
export function isVertical(params: Pick<URLSearchParams, 'get'>): boolean {
  const dir = params.get('dir')?.trim();
  if (dir === 'v') return true;
  if (dir === 'h') return false;
  return params.get('textDirection')?.trim() === 'vertical';
}

/**
 * 旧ビューア形式の URL（トップに ?u= や #/v2?u= が付いたものなど）を、
 * 対応する画面（/viewer/・/compare/・/dts/・/xsl/）のクエリに変換する。
 * 転送不要なら null を返す。
 */
export function resolveLegacyRedirect(search: string, hash: string): { path: '/viewer/' | '/compare/' | '/dts/' | '/xsl/'; search: string } | null {
  // PTV の /#/v2?u=... や /app/#/v2?u=... のように # の中にクエリがある場合
  const hashClean = hash.replace(/^#/, '');
  const hashQ = hashClean.includes('?') ? hashClean.slice(hashClean.indexOf('?') + 1) : '';
  const merged = new URLSearchParams(search.replace(/^\?/, ''));
  if (hashQ) {
    const hp = new URLSearchParams(hashQ);
    hp.forEach((v, k) => {
      if (!merged.has(k)) merged.append(k, v);
    });
  }
  if ([...merged.keys()].length === 0) return null;

  // text-comparison: ?manifest1=...&manifest2=...
  if (merged.get('manifest1')?.trim() && merged.get('manifest2')?.trim()) {
    return { path: '/compare/', search: `?${merged.toString()}` };
  }
  // tei-tools view.html: ?xsl=... と u / url / tei
  if (merged.get('xsl')?.trim() && (merged.get('u')?.trim() || merged.get('url')?.trim() || merged.get('tei')?.trim())) {
    return { path: '/xsl/', search: `?${merged.toString()}` };
  }
  // dts-viewer: ?base=...
  if (merged.get('base')?.trim()) {
    return { path: '/dts/', search: `?${merged.toString()}` };
  }
  // PTV / koui / tei_viewer / letter / app: ?u=... / ?tei=... / ?config=... / ?url=...
  if (getSources(merged).length > 0) {
    return { path: '/viewer/', search: `?${merged.toString()}` };
  }
  return null;
}

// 本文の横に出せるペイン。panes を書かなければ、使えるものを全部出す
export const OPTIONAL_PANES = ['image', 'model', 'apparatus', 'entities', 'speech', 'map', 'timeline'] as const;
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
