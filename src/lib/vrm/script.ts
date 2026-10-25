// VRM 読み上げペインで、台本 JSON（json=）を扱う部分。画面（three・DOM）に依存しない。
// 台本 JSON は、台詞ごとに話者・感情・声・音声・口形素（viseme）・体の動き（クォータニオンのキーフレーム）を持つ。

export type BoneFilter = 'all' | 'head-only' | 'upper-body' | 'no-fingers';

export interface Viseme {
  id: number;
  /** 音声の頭からのミリ秒 */
  ms: number;
}

export interface Keyframe {
  time: number;
  /** [x, y, z, w] */
  q: [number, number, number, number];
}

export interface BoneTrack {
  /** VRM の人型ボーン名（leftUpperArm など） */
  bone: string;
  keyframes: Keyframe[];
}

export interface ScriptDialogue {
  id: string;
  character: string;
  /** ルビ記法（{{親|ふりがな}}）を親文字だけにした本文 */
  text: string;
  emotion: { type: string; intensity: number } | null;
  /** Azure の声の名前（ja-JP-NanamiNeural など） */
  voice: string | null;
  audioPath: string | null;
  /** 秒 */
  audioDuration: number | null;
  visemes: Viseme[];
  tracks: BoneTrack[];
  animDuration: number;
  animLoop: boolean;
}

const asNumber = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const asString = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);

/** {{親|ふりがな}} と 親《ふりがな》 を親文字だけにする */
export function stripRuby(text: string): string {
  return text
    .replace(/\{\{([^|{}]*)\|[^{}]*\}\}/g, '$1')
    .replace(/[｜|]?([^｜|《》\s]*)《[^《》]*》/g, '$1');
}

/** ボーン名の先頭を小文字にそろえる（LeftUpperArm → leftUpperArm） */
export function normalizeBoneName(name: string): string {
  const n = name.trim();
  return n ? n[0].toLowerCase() + n.slice(1) : n;
}

function parseQuat(v: unknown): [number, number, number, number] | null {
  if (Array.isArray(v) && v.length === 4 && v.every((x) => asNumber(x) !== null)) {
    return v as [number, number, number, number];
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const x = asNumber(o.x);
    const y = asNumber(o.y);
    const z = asNumber(o.z);
    const w = asNumber(o.w);
    if (x !== null && y !== null && z !== null && w !== null) return [x, y, z, w];
  }
  return null;
}

/** 台本 JSON（{ dialogues: [...] }）を読む。形の違うものは飛ばす */
export function parseScript(json: unknown): ScriptDialogue[] {
  const list = (json as { dialogues?: unknown } | null)?.dialogues;
  if (!Array.isArray(list)) return [];
  const out: ScriptDialogue[] = [];
  list.forEach((raw, n) => {
    if (!raw || typeof raw !== 'object') return;
    const r = raw as Record<string, unknown>;
    const rawText = asString(r.text);
    if (!rawText) return;
    const emo = r.emotion as Record<string, unknown> | undefined;
    const emoType = asString(emo?.type);
    const audio = r.audio as Record<string, unknown> | undefined;
    const anim = r.animation as Record<string, unknown> | undefined;

    const visemes: Viseme[] = [];
    if (Array.isArray(r.visemes)) {
      for (const v of r.visemes) {
        const o = v as Record<string, unknown>;
        const id = asNumber(o?.visemeId);
        const ms = asNumber(o?.audioOffset) ?? asNumber(o?.timeMs);
        if (id !== null && ms !== null) visemes.push({ id, ms });
      }
      visemes.sort((a, b) => a.ms - b.ms);
    }

    const tracks: BoneTrack[] = [];
    if (anim && Array.isArray(anim.tracks)) {
      for (const t of anim.tracks) {
        const o = t as Record<string, unknown>;
        const bone = asString(o?.boneName);
        if (!bone || !Array.isArray(o.keyframes)) continue; // blendShape の track などは対象外
        const keyframes: Keyframe[] = [];
        for (const k of o.keyframes) {
          const ko = k as Record<string, unknown>;
          const time = asNumber(ko?.time);
          const q = parseQuat(ko?.rotation);
          if (time !== null && q) keyframes.push({ time, q });
        }
        keyframes.sort((a, b) => a.time - b.time);
        if (keyframes.length) tracks.push({ bone: normalizeBoneName(bone), keyframes });
      }
    }

    out.push({
      id: asString(r.id) ?? `dialogue-${n + 1}`,
      character: asString(r.character) ?? '',
      text: stripRuby(rawText).trim(),
      emotion: emoType ? { type: emoType.toLowerCase(), intensity: asNumber(emo?.intensity) ?? 0.7 } : null,
      voice: asString(r.voice),
      audioPath: asString(audio?.path),
      audioDuration: asNumber(audio?.duration),
      visemes,
      tracks,
      animDuration: asNumber(anim?.duration) ?? 0,
      animLoop: anim?.loop === true,
    });
  });
  return out;
}

/** 音声ファイルの URL。台本 JSON の URL からの相対で解く */
export function resolveAudioUrl(path: string, scriptUrl: string): string {
  if (/^(https?:)?\/\//i.test(path) || path.startsWith('/')) return path;
  const q = scriptUrl.search(/[?#]/);
  const base = q >= 0 ? scriptUrl.slice(0, q) : scriptUrl;
  const slash = base.lastIndexOf('/');
  const dir = slash >= 0 ? base.slice(0, slash + 1) : '';
  return dir + path.split('/').map(encodeURIComponent).join('/');
}

// ---- TEI の発話との突き合わせ ----

/** 比べるための文字列。ルビ記法・空白・句読点・記号を落とす */
export function normalizeForMatch(text: string): string {
  return stripRuby(text)
    .normalize('NFKC')
    .replace(/[\s\p{P}\p{S}]/gu, '')
    .toLowerCase();
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2);
    m.set(g, (m.get(g) ?? 0) + 1);
  }
  return m;
}

/**
 * 2 つの文字列の近さ（0〜1）。文字 2-gram の Dice 係数と、短いほうがどれだけ長いほうに含まれるかの大きいほう。
 * 台本側に読みがなが混ざっていたり、台詞が途中で切れていたりしても、近さが落ちすぎないようにする。
 */
export function textSimilarity(a: string, b: string): number {
  const x = normalizeForMatch(a);
  const y = normalizeForMatch(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  if (x.length < 2 || y.length < 2) return 0;
  const gx = bigrams(x);
  const gy = bigrams(y);
  let inter = 0;
  for (const [g, c] of gx) inter += Math.min(c, gy.get(g) ?? 0);
  const nx = x.length - 1;
  const ny = y.length - 1;
  const dice = (2 * inter) / (nx + ny);
  const contain = inter / Math.min(nx, ny);
  // 含まれ具合は、短いほうがある程度の長さのときだけ信用する
  return Math.max(dice, Math.min(nx, ny) >= 5 ? contain * 0.9 : 0);
}

export interface AlignTarget {
  text: string;
  speaker: string;
}

/** 近さがこれ未満の組は、同じ発話とみなさない */
export const MATCH_THRESHOLD = 0.5;

/**
 * 台本の台詞を TEI の発話に順序を保って 1 対 1 で対応づける（動的計画法）。
 * 戻り値は台詞ごとの TEI の発話の位置（対応が無ければ null）。
 * 組の得点は近さ（話者名が一致すれば少し加点）で、得点の合計が最大になる対応を選ぶ。
 */
export function alignDialogues(
  dialogues: readonly { text: string; character: string }[],
  targets: readonly AlignTarget[],
  threshold = MATCH_THRESHOLD,
): (number | null)[] {
  const n = dialogues.length;
  const m = targets.length;
  const w: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(m).fill(0);
    for (let j = 0; j < m; j++) {
      const s = textSimilarity(dialogues[i].text, targets[j].text);
      if (s >= threshold) {
        const sameSpeaker = dialogues[i].character && dialogues[i].character === targets[j].speaker;
        row[j] = s + (sameSpeaker ? 0.1 : 0);
      }
    }
    w.push(row);
  }
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      let best = Math.max(dp[i - 1][j], dp[i][j - 1]);
      if (w[i - 1][j - 1] > 0) best = Math.max(best, dp[i - 1][j - 1] + w[i - 1][j - 1]);
      dp[i][j] = best;
    }
  }
  const result: (number | null)[] = new Array<number | null>(n).fill(null);
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (w[i - 1][j - 1] > 0 && Math.abs(dp[i][j] - (dp[i - 1][j - 1] + w[i - 1][j - 1])) < 1e-9) {
      result[i - 1] = j - 1;
      i--;
      j--;
    } else if (dp[i][j] === dp[i - 1][j]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

// ---- 口形素・感情・動き ----

export type MouthShape = 'aa' | 'ih' | 'ou' | 'ee' | 'oh';
export const MOUTH_SHAPES: readonly MouthShape[] = ['aa', 'ih', 'ou', 'ee', 'oh'];

// Azure Speech の viseme ID（0〜21）→ VRM の口の表情。元のアプリの対応表のまま
const VISEME_SHAPE: Record<number, MouthShape | null> = {
  0: null,
  1: 'aa',
  2: 'aa',
  3: 'oh',
  4: 'ee',
  5: 'ee',
  6: 'ih',
  7: 'oh',
  8: 'ou',
  9: 'oh',
  10: 'oh',
  11: 'oh',
  12: 'oh',
  13: 'aa',
  14: 'ee',
  15: 'ou',
  16: 'ou',
  17: 'ih',
  18: 'aa',
  19: 'ee',
  20: 'ih',
  21: 'aa',
};

export function visemeShape(id: number): MouthShape | null {
  return VISEME_SHAPE[id] ?? null;
}

/** 口形素を、この長さ（ミリ秒）より長くは開けたままにしない（次の口形素が来なければ閉じる） */
const MOUTH_HOLD_MS = 220;
const MOUTH_OPEN = 0.8;

/** 時刻（ミリ秒）の口の目標。visemes は時刻順。 */
export function mouthTarget(visemes: readonly Viseme[], ms: number): Record<MouthShape, number> {
  const out: Record<MouthShape, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
  // 時刻以前で最後の口形素（二分探索）
  let lo = 0;
  let hi = visemes.length - 1;
  let at = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (visemes[mid].ms <= ms) {
      at = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  if (at < 0) return out;
  const v = visemes[at];
  if (ms - v.ms > MOUTH_HOLD_MS) return out;
  const shape = visemeShape(v.id);
  if (shape) out[shape] = MOUTH_OPEN;
  return out;
}

export type EmotionExpression = 'happy' | 'angry' | 'sad' | 'relaxed' | 'surprised' | 'neutral';

// 台本の感情名 → VRM の表情と、効かせる強さの倍率。
// 元のアプリには感情名の対応表が無く（表情は動きの track に入れる設計）、ここで決めた
const EMOTION_MAP: Record<string, { expression: EmotionExpression; scale: number }> = {
  neutral: { expression: 'neutral', scale: 0 },
  joy: { expression: 'happy', scale: 1 },
  happy: { expression: 'happy', scale: 1 },
  happiness: { expression: 'happy', scale: 1 },
  pride: { expression: 'happy', scale: 0.6 },
  anticipation: { expression: 'happy', scale: 0.5 },
  love: { expression: 'happy', scale: 0.8 },
  anger: { expression: 'angry', scale: 1 },
  angry: { expression: 'angry', scale: 1 },
  hatred: { expression: 'angry', scale: 0.9 },
  disgust: { expression: 'angry', scale: 0.6 },
  sadness: { expression: 'sad', scale: 1 },
  sad: { expression: 'sad', scale: 1 },
  sorrow: { expression: 'sad', scale: 1 },
  fear: { expression: 'sad', scale: 0.8 },
  surprise: { expression: 'surprised', scale: 1 },
  surprised: { expression: 'surprised', scale: 1 },
  confusion: { expression: 'surprised', scale: 0.5 },
  thinking: { expression: 'relaxed', scale: 0.5 },
  calm: { expression: 'relaxed', scale: 0.8 },
  relaxed: { expression: 'relaxed', scale: 0.8 },
};

/** 感情の表情の上限（口やまばたきを邪魔しない） */
const EMOTION_MAX = 0.8;

export function emotionExpression(
  emotion: { type: string; intensity: number } | null,
): { expression: EmotionExpression; weight: number } {
  if (!emotion) return { expression: 'neutral', weight: 0 };
  const m = EMOTION_MAP[emotion.type] ?? EMOTION_MAP.neutral;
  const intensity = Math.min(1, Math.max(0, emotion.intensity));
  return { expression: m.expression, weight: Math.min(EMOTION_MAX, intensity * m.scale) };
}

function smoothstep(x: number): number {
  const c = Math.min(1, Math.max(0, x));
  return c * c * (3 - 2 * c);
}

/**
 * 1 つの台詞のあいだの強さ（0〜1）。入りと終わりをなめらかにする。
 * 長さが分からない（0）ときは、入りだけ。
 */
export function lineEnvelope(t: number, duration: number, fadeIn = 0.25, fadeOut = 0.35): number {
  const up = smoothstep(t / fadeIn);
  if (!(duration > 0)) return up;
  const down = smoothstep((duration - t) / fadeOut);
  return Math.min(up, down);
}

const HEAD_BONES = ['neck', 'head'];
const UPPER_BONES = [
  'spine', 'chest', 'upperChest', 'neck', 'head',
  'leftShoulder', 'rightShoulder', 'leftUpperArm', 'rightUpperArm',
  'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand',
];
const NO_FINGER_BONES = [
  'hips', ...UPPER_BONES,
  'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg', 'leftFoot', 'rightFoot',
];

export function parseBoneFilter(v: string | null | undefined): BoneFilter {
  return v === 'head-only' || v === 'upper-body' || v === 'no-fingers' ? v : 'all';
}

/** 動かしてよいボーン。null は制限なし */
export function allowedBones(filter: BoneFilter): ReadonlySet<string> | null {
  switch (filter) {
    case 'head-only':
      return new Set(HEAD_BONES);
    case 'upper-body':
      return new Set(UPPER_BONES);
    case 'no-fingers':
      return new Set(NO_FINGER_BONES);
    default:
      return null;
  }
}

export function filterTracks(tracks: readonly BoneTrack[], filter: BoneFilter): BoneTrack[] {
  const allowed = allowedBones(filter);
  return allowed ? tracks.filter((t) => allowed.has(t.bone)) : [...tracks];
}

type Q = [number, number, number, number];

/** 球面線形補間（slerp） */
export function slerpQ(a: Q, b: Q, t: number): Q {
  let [bx, by, bz, bw] = b;
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) {
    dot = -dot;
    bx = -bx;
    by = -by;
    bz = -bz;
    bw = -bw;
  }
  if (dot > 0.9995) {
    const r: Q = [
      a[0] + (bx - a[0]) * t,
      a[1] + (by - a[1]) * t,
      a[2] + (bz - a[2]) * t,
      a[3] + (bw - a[3]) * t,
    ];
    const len = Math.hypot(r[0], r[1], r[2], r[3]) || 1;
    return [r[0] / len, r[1] / len, r[2] / len, r[3] / len];
  }
  const theta = Math.acos(dot);
  const sin = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sin;
  const wb = Math.sin(t * theta) / sin;
  return [a[0] * wa + bx * wb, a[1] * wa + by * wb, a[2] * wa + bz * wb, a[3] * wa + bw * wb];
}

/** キーフレーム列の時刻 t の向き。範囲の外は端の値 */
export function sampleKeyframes(keyframes: readonly Keyframe[], t: number): Q {
  if (keyframes.length === 0) return [0, 0, 0, 1];
  if (keyframes.length === 1 || t <= keyframes[0].time) return keyframes[0].q;
  const last = keyframes[keyframes.length - 1];
  if (t >= last.time) return last.q;
  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i];
    const b = keyframes[i + 1];
    if (t >= a.time && t <= b.time) {
      const span = b.time - a.time;
      return slerpQ(a.q, b.q, span > 0 ? (t - a.time) / span : 0);
    }
  }
  return last.q;
}

/** ループする動きの時刻を 0〜duration に折り返す */
export function animationTime(t: number, duration: number, loop: boolean): number {
  if (loop && duration > 0) return t % duration;
  return t;
}
