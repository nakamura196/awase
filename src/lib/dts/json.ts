// 外から来た JSON を安全に読むための小さな関数。

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

export function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** 応答の view（ページ送り）から、次のページの URL を取り出す。無ければ undefined */
export function nextPage(json: unknown): string | undefined {
  if (!isRecord(json) || !isRecord(json.view)) return undefined;
  return str(json.view.next);
}
