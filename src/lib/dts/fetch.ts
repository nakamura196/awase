// 取りに行く部分。ここだけが通信をする（ほかは JSON を読むだけの純粋な関数）。

export type FetchResult = { ok: true; json: unknown; url: string } | { ok: false; status?: number };

/** JSON を取る。失敗は例外にせず結果で返す。url は転送のあとの最終の URL（相対の URL の基準になる） */
export async function fetchJson(url: string, signal?: AbortSignal): Promise<FetchResult> {
  try {
    const res = await fetch(url, { signal, headers: { accept: 'application/json' } });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, json: await res.json(), url: res.url || url };
  } catch {
    return { ok: false };
  }
}
