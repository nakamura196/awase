'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { extractSpeeches } from '@/lib/tei/speech';
import { withBasePath } from '@/lib/basePath';
import {
  assignVoices,
  estimateSeconds,
  firstIndex,
  indexOfId,
  langPrefix,
  nextIndex,
  pickVoice,
  prevIndex,
  resolveLang,
  voiceRank,
} from '@/lib/vrm/reader';
import {
  alignDialogues,
  animationTime,
  emotionExpression,
  filterTracks,
  lineEnvelope,
  mouthTarget,
  MOUTH_SHAPES,
  parseScript,
  resolveAudioUrl,
  sampleKeyframes,
  type BoneFilter,
  type BoneTrack,
  type EmotionExpression,
  type MouthShape,
  type ScriptDialogue,
  type Viseme,
} from '@/lib/vrm/script';
import PaneCard, { paneButton } from './PaneCard';

interface Props {
  tei: Document;
  /** 選んでいる発話（URL の id） */
  focusId?: string | null;
  /** 読み上げる行が替わったとき。その発話の id を渡す（本文のハイライトに使う） */
  onSelect?: (id: string) => void;
  /** VRM ファイルの URL（URL の vrm）。無ければ同梱の boy.vrm */
  vrmUrl?: string | null;
  /** 台本 JSON の URL（URL の json）。あれば、その台詞を再生する */
  scriptUrl?: string | null;
  /** 台本の動きで動かすボーン（URL の filter） */
  boneFilter?: BoneFilter;
}

export const DEFAULT_VRM_PATH = '/models/vrm/boy.vrm';

// アバターの口・まばたきを動かすための、描画ループと共有する状態
interface LineAnim {
  visemes: Viseme[];
  tracks: BoneTrack[];
  emotion: { expression: EmotionExpression; weight: number };
  /** 台詞の長さ（秒）。表情と動きの入りと終わりに使う */
  duration: number;
  animDuration: number;
  loop: boolean;
  /** 台詞の頭からの秒（音声の再生位置、または読み上げの経過） */
  getTime: () => number;
}

interface Anim {
  speaking: boolean;
  bump: number;
  line: LineAnim | null;
}

interface ViewApi {
  reset: () => void;
}

// 待機の揺れ（元のアプリの idleAnimation）。ボーンごとの回転の足し分（ラジアン）
function idleEuler(bone: string, time: number): [number, number, number] | null {
  const sway = Math.sin(time * 0.5) * 0.02;
  const breath = Math.sin(time * 2) * 0.01;
  switch (bone) {
    case 'spine':
      return [breath, 0, sway];
    case 'chest':
      return [breath * 0.5, 0, 0];
    case 'head':
      return [Math.sin(time * 0.7) * 0.01, sway * 0.5, 0];
    case 'leftUpperArm':
      return [0, 0, sway * 0.3];
    case 'rightUpperArm':
      return [0, 0, -sway * 0.3];
    default:
      return null;
  }
}
const IDLE_BONES = ['spine', 'chest', 'head', 'leftUpperArm', 'rightUpperArm'];
const EMOTION_EXPRESSIONS: EmotionExpression[] = ['happy', 'angry', 'sad', 'relaxed', 'surprised'];

interface Line {
  /** 本文の要素の id（突き合わせできなかった台詞は json: で始まる別の id） */
  id: string;
  teiId: string | null;
  text: string;
  speaker: string;
  speakerKey: string;
  dialogue: ScriptDialogue | null;
}

interface Clock {
  base: number;
  offset: number;
  running: boolean;
  speed: number;
  audio: HTMLAudioElement | null;
}

function clockTime(c: Clock): number {
  if (c.audio) return c.audio.currentTime;
  return c.offset + (c.running ? ((performance.now() - c.base) / 1000) * c.speed : 0);
}

type Status = 'idle' | 'playing' | 'paused';

/** この端末に覚えておいた値。読めない環境（非公開ウィンドウなど）では空 */
function readStored(key: string): string {
  try {
    return typeof window === 'undefined' ? '' : (localStorage.getItem(key) ?? '');
  } catch {
    return '';
  }
}

// three と three-vrm は、このペインが出たときだけ読み込む（モデルは 20MB ある）
function useAvatar(
  container: React.RefObject<HTMLDivElement | null>,
  url: string,
  anim: React.RefObject<Anim>,
) {
  // 視点を戻す操作。モデルを読み終えたら入る
  const view = useRef<ViewApi | null>(null);
  const [state, setState] = useState<{ url: string; status: 'loading' | 'ready' | 'error'; progress: number }>({
    url,
    status: 'loading',
    progress: 0,
  });

  useEffect(() => {
    const host = container.current;
    if (!host) return;
    let live = true;
    let raf = 0;
    let cleanup = () => {};

    (async () => {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
        const { VRMLoaderPlugin, VRMUtils } = await import('@pixiv/three-vrm');
        if (!live) return;

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.domElement.style.display = 'block';
        renderer.domElement.setAttribute('aria-hidden', 'true');
        host.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 20);
        const light = new THREE.DirectionalLight(0xffffff, Math.PI * 0.9);
        light.position.set(0.4, 1.2, 2);
        scene.add(light, new THREE.AmbientLight(0xffffff, Math.PI * 0.35));

        const resize = () => {
          const w = Math.max(1, host.clientWidth);
          const h = Math.max(1, host.clientHeight);
          renderer.setSize(w, h, false);
          renderer.domElement.style.width = `${w}px`;
          renderer.domElement.style.height = `${h}px`;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        };
        const observer = new ResizeObserver(resize);
        observer.observe(host);
        resize();

        const loader = new GLTFLoader();
        loader.register((parser) => new VRMLoaderPlugin(parser));
        let vrm: import('@pixiv/three-vrm').VRM | null = null;
        let controls: InstanceType<typeof OrbitControls> | null = null;

        cleanup = () => {
          cancelAnimationFrame(raf);
          controls?.dispose();
          view.current = null;
          observer.disconnect();
          if (vrm) {
            scene.remove(vrm.scene);
            VRMUtils.deepDispose(vrm.scene);
          }
          renderer.dispose();
          renderer.domElement.remove();
        };

        const gltf = await loader.loadAsync(url, (e) => {
          if (live && e.total > 0) setState((s) => ({ ...s, progress: e.loaded / e.total }));
        });
        if (!live) {
          cleanup();
          return;
        }
        vrm = gltf.userData.vrm as import('@pixiv/three-vrm').VRM;
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(vrm);
        vrm.scene.traverse((o) => {
          o.frustumCulled = false;
        });
        scene.add(vrm.scene);

        // T ポーズから腕を下ろす（正規化ボーンの向きに合わせた符号）
        const arm = (name: 'leftUpperArm' | 'rightUpperArm', sign: number) => {
          const node = vrm!.humanoid.getNormalizedBoneNode(name);
          if (node) node.rotation.z = sign * THREE.MathUtils.degToRad(70);
        };
        arm('leftUpperArm', 1);
        arm('rightUpperArm', -1);

        // 頭と上半身が入る位置にカメラを置く
        vrm.scene.updateMatrixWorld(true);
        const head = vrm.humanoid.getNormalizedBoneNode('head');
        const headPos = new THREE.Vector3(0, 1.4, 0);
        head?.getWorldPosition(headPos);
        const target = new THREE.Vector3(0, headPos.y - 0.12, 0);
        camera.position.set(0, target.y + 0.02, 1.45);
        camera.lookAt(target);

        // ドラッグで回し、ホイール・ピンチで寄る。顔のあたりを中心に、回せる範囲を絞る
        controls = new OrbitControls(camera, renderer.domElement);
        controls.target.copy(target);
        controls.enablePan = false;
        controls.enableDamping = true;
        controls.minDistance = 0.5;
        controls.maxDistance = 3;
        controls.minPolarAngle = Math.PI * 0.25;
        controls.maxPolarAngle = Math.PI * 0.65;
        controls.minAzimuthAngle = -Math.PI * 0.45;
        controls.maxAzimuthAngle = Math.PI * 0.45;
        controls.update();
        controls.saveState();
        renderer.domElement.style.touchAction = 'none';
        const ctl = controls;
        view.current = { reset: () => ctl.reset() };

        if (live) setState((s) => ({ ...s, status: 'ready', progress: 1 }));

        let last = performance.now();
        let blinkAt = 1.5;
        let blinkStart = -1;
        let time = 0;
        const em = vrm.expressionManager;
        // 体の基準の姿勢（腕を下ろした状態）。動きはこれに対する差として足す
        const rests = new Map<string, import('three').Quaternion>();
        const restOf = (name: string) => {
          let r = rests.get(name);
          if (!r) {
            const node = vrm!.humanoid.getNormalizedBoneNode(name as never);
            r = node ? node.quaternion.clone() : new THREE.Quaternion();
            rests.set(name, r);
          }
          return r;
        };
        const mouth: Record<MouthShape, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
        const emo: Record<string, number> = { happy: 0, angry: 0, sad: 0, relaxed: 0, surprised: 0 };
        let animW = 0;
        let curTracks = new Map<string, BoneTrack>();
        let curLine: LineAnim | null = null;
        const touched = new Set<string>(IDLE_BONES);
        const qDelta = new THREE.Quaternion();
        const qSample = new THREE.Quaternion();
        const qIdle = new THREE.Quaternion();
        const eIdle = new THREE.Euler();
        const qOut = new THREE.Quaternion();

        const tick = (now: number) => {
          raf = requestAnimationFrame(tick);
          const dt = Math.min(0.1, (now - last) / 1000);
          last = now;
          time += dt;
          const a = anim.current;
          const line = a.line;
          const t = line ? line.getTime() : null;

          // 口: 台本に口形素があればそれ。無ければ、話している間の開け閉めと、語の切れ目での強調
          const target: Record<MouthShape, number> = { aa: 0, ih: 0, ou: 0, ee: 0, oh: 0 };
          if (line && line.visemes.length > 0 && t !== null) {
            Object.assign(target, mouthTarget(line.visemes, t * 1000));
          } else if (a.speaking) {
            if (a.bump > 0) a.bump = Math.max(0, a.bump - dt * 4);
            target.aa = Math.min(1, 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(time * 15)) + a.bump * 0.4);
          }
          const km = 1 - Math.exp(-dt * 28);
          for (const m of MOUTH_SHAPES) {
            mouth[m] += (target[m] - mouth[m]) * km;
            em?.setValue(m, mouth[m]);
          }

          // 感情の表情: 台詞のあいだ、入りと終わりをなめらかにして効かせる
          const et: Record<string, number> = { happy: 0, angry: 0, sad: 0, relaxed: 0, surprised: 0 };
          if (line && t !== null && line.emotion.weight > 0 && line.emotion.expression !== 'neutral') {
            et[line.emotion.expression] = line.emotion.weight * lineEnvelope(t, line.duration);
          }
          const ke = 1 - Math.exp(-dt * 8);
          for (const name of EMOTION_EXPRESSIONS) {
            emo[name] += (et[name] - emo[name]) * ke;
            em?.setValue(name, emo[name]);
          }

          // まばたき: 2〜5 秒おきに 0.18 秒で閉じて開く
          if (blinkStart < 0 && time >= blinkAt) blinkStart = time;
          let blink = 0;
          if (blinkStart >= 0) {
            const p = (time - blinkStart) / 0.18;
            blink = p >= 1 ? 0 : Math.sin(p * Math.PI);
            if (p >= 1) {
              blinkStart = -1;
              blinkAt = time + 2 + Math.random() * 3;
            }
          }
          em?.setValue('blink', blink);

          // 体: 基準の姿勢 × 台本の動き（差）× 待機の揺れ
          if (line !== curLine) {
            if (line && line.tracks.length) {
              curTracks = new Map(line.tracks.map((tr) => [tr.bone, tr]));
              for (const b of curTracks.keys()) touched.add(b);
            }
            curLine = line;
          }
          const wantAnim = line && t !== null && curTracks.size > 0 && line.tracks.length > 0 ? lineEnvelope(t, line.duration, 0.2, 0.4) : 0;
          animW += (wantAnim - animW) * (1 - Math.exp(-dt * 10));
          const at = line && t !== null ? animationTime(t, line.animDuration, line.loop) : 0;
          for (const name of touched) {
            const node = vrm!.humanoid.getNormalizedBoneNode(name as never);
            if (!node) continue;
            qOut.copy(restOf(name));
            const track = curTracks.get(name);
            if (track && animW > 0.001) {
              const q = sampleKeyframes(track.keyframes, at);
              qSample.set(q[0], q[1], q[2], q[3]).normalize();
              qDelta.identity().slerp(qSample, animW);
              qOut.multiply(qDelta);
            }
            const idle = idleEuler(name, time);
            if (idle) {
              const f = track ? 1 - 0.7 * animW : 1;
              eIdle.set(idle[0] * f, idle[1] * f, idle[2] * f);
              qIdle.setFromEuler(eIdle);
              qOut.multiply(qIdle);
            }
            node.quaternion.copy(qOut);
          }
          controls?.update(dt);
          vrm!.update(dt);
          renderer.render(scene, camera);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        if (live) setState((s) => ({ ...s, status: 'error' }));
      }
    })();

    return () => {
      live = false;
      cleanup();
    };
  }, [container, url, anim]);

  // url が替わった直後は、前の状態を見せない
  return { ...(state.url === url ? state : { url, status: 'loading' as const, progress: 0 }), view };
}

// VRM のアバターが、本文の発話（または台本 JSON の台詞）を読み上げるペイン。
// 音声は、台本に音声ファイルがあればそれ、無ければブラウザの音声合成（Web Speech API）。
export default function VrmPane({ tei, focusId = null, onSelect, vrmUrl = null, scriptUrl = null, boneFilter = 'all' }: Props) {
  const t = useTranslations('Vrm');
  const locale = useLocale();
  const url = vrmUrl?.trim() ? vrmUrl.trim() : withBasePath(DEFAULT_VRM_PATH);
  const teiItems = useMemo(() => extractSpeeches(tei).filter((it) => it.text.trim()), [tei]);
  const lang = useMemo(() => resolveLang(tei, locale), [tei, locale]);

  // 台本 JSON（json=）。あるあいだは、その台詞が再生の一覧になる
  const scriptHref = scriptUrl?.trim() ? withBasePath(scriptUrl.trim()) : null;
  const [loaded, setLoaded] = useState<{ url: string; status: 'ready' | 'error'; dialogues: ScriptDialogue[] } | null>(null);
  useEffect(() => {
    if (!scriptHref) return;
    const ac = new AbortController();
    fetch(scriptHref, { signal: ac.signal })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((json) => setLoaded({ url: scriptHref, status: 'ready', dialogues: parseScript(json) }))
      .catch(() => {
        if (!ac.signal.aborted) setLoaded({ url: scriptHref, status: 'error', dialogues: [] });
      });
    return () => ac.abort();
  }, [scriptHref]);
  const scriptStatus: 'none' | 'loading' | 'ready' | 'error' = !scriptHref
    ? 'none'
    : loaded?.url === scriptHref
      ? loaded.status
      : 'loading';
  const dialogues = useMemo(
    () => (scriptHref && loaded?.url === scriptHref ? loaded.dialogues : []),
    [scriptHref, loaded],
  );

  const lines = useMemo<Line[]>(() => {
    if (!scriptHref) {
      return teiItems.map((it) => ({
        id: it.id,
        teiId: it.id,
        text: it.text,
        speaker: it.speakerLabel,
        speakerKey: it.speakerKey,
        dialogue: null,
      }));
    }
    const match = alignDialogues(
      dialogues,
      teiItems.map((it) => ({ text: it.text, speaker: it.speakerLabel })),
    );
    return dialogues.map((d, i) => {
      const hit = match[i] === null ? null : teiItems[match[i] as number];
      return {
        id: hit ? hit.id : `json:${i}:${d.id}`,
        teiId: hit ? hit.id : null,
        text: d.text,
        speaker: d.character,
        speakerKey: d.character || '__unknown__',
        dialogue: d,
      };
    });
  }, [scriptHref, dialogues, teiItems]);
  const matched = lines.filter((l) => l.teiId).length;

  const hostRef = useRef<HTMLDivElement>(null);
  const anim = useRef<Anim>({ speaking: false, bump: 0, line: null });
  const avatar = useAvatar(hostRef, url, anim as React.RefObject<Anim>);

  const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!synth) return;
    const update = () => setVoices(synth.getVoices());
    update();
    synth.addEventListener('voiceschanged', update);
    return () => synth.removeEventListener('voiceschanged', update);
  }, [synth]);
  // 利用者が選んだ声（名前）。空なら自動。言語ごとに、この端末に覚えておく
  const voiceKey = `awase.vrm.voice.${langPrefix(lang)}`;
  const [chosen, setChosen] = useState(() => ({ key: voiceKey, name: readStored(voiceKey) }));
  const chosenName = chosen.key === voiceKey ? chosen.name : readStored(voiceKey);
  const onChooseVoice = (name: string) => {
    setChosen({ key: voiceKey, name });
    try {
      if (name) localStorage.setItem(voiceKey, name);
      else localStorage.removeItem(voiceKey);
    } catch {
      // 覚えておけない環境でも、この画面の間は選んだ声で読む
    }
  };
  const langVoices = useMemo(
    () =>
      voices
        .filter((v) => langPrefix(v.lang) === langPrefix(lang))
        .sort((a, b) => voiceRank(a) - voiceRank(b) || a.name.localeCompare(b.name)),
    [voices, lang],
  );
  const chosenVoice = langVoices.find((v) => v.name === chosenName) ?? null;
  const voice = useMemo(() => chosenVoice ?? pickVoice(voices, lang), [chosenVoice, voices, lang]);
  // 話者ごとの声と高さ。出てくる順に決めるので、同じ資料なら毎回同じ。
  // 声を選んだときは、全員その声で読み、高さだけで話者を分ける
  const voiceMap = useMemo(() => {
    const specs: { key: string; voiceName?: string | null }[] = [];
    for (const l of lines) specs.push({ key: l.speakerKey, voiceName: l.dialogue?.voice });
    if (chosenVoice) return assignVoices(specs, [chosenVoice], chosenVoice.lang);
    return assignVoices(specs, voices, lang);
  }, [lines, voices, lang, chosenVoice]);

  const [rate, setRate] = useState(1);
  const [autoAdvance, setAutoAdvance] = useState(true);

  // 現在の行。本文で別の発話が選ばれたら、そこへ移る（読み始めはしない）
  const [pick, setPick] = useState<{ index: number; atFocusId: string | null }>({ index: 0, atFocusId: focusId });
  const focusIndex = indexOfId(lines, focusId);
  const rawIndex = pick.atFocusId !== focusId && focusIndex >= 0 ? focusIndex : pick.index;
  const index = lines.length ? Math.min(Math.max(rawIndex, 0), lines.length - 1) : 0;
  const item = lines[index];

  // 読み上げ中の行。表示中の行と違うとき（本文で別の行を選んだ）は止める
  const [playing, setPlaying] = useState<{ status: Status; index: number }>({ status: 'idle', index: 0 });
  const status: Status = playing.index === index ? playing.status : 'idle';

  const latest = useRef({ lines, voiceMap, lang, rate, focusId, onSelect, index, autoAdvance, boneFilter, scriptHref });
  useEffect(() => {
    latest.current = { lines, voiceMap, lang, rate, focusId, onSelect, index, autoAdvance, boneFilter, scriptHref };
  });
  const token = useRef(0);
  const speakRef = useRef<(i: number) => void>(() => {});
  // いま鳴っているものの状態（一時停止・再開で使う）
  const engine = useRef<{ mode: 'audio' | 'speech' | 'silent' | 'none'; clock: Clock; watch: ReturnType<typeof setInterval> | null; paused: boolean; began: boolean }>({
    mode: 'none',
    clock: { base: 0, offset: 0, running: false, speed: 1, audio: null },
    watch: null,
    paused: false,
    began: false,
  });

  const stopAudio = useCallback(() => {
    const au = engine.current.clock.audio;
    if (au) {
      au.onended = null;
      au.onerror = null;
      au.onplaying = null;
      au.pause();
      au.removeAttribute('src');
      au.load();
    }
    engine.current.clock.audio = null;
  }, []);

  const halt = useCallback(() => {
    token.current += 1;
    anim.current.speaking = false;
    anim.current.line = null;
    const e = engine.current;
    if (e.watch) clearInterval(e.watch);
    e.watch = null;
    e.mode = 'none';
    e.paused = false;
    e.clock.running = false;
    stopAudio();
    synth?.cancel();
  }, [synth, stopAudio]);

  const speakAt = useCallback(
    (i: number) => {
      const cur = latest.current;
      const target = cur.lines[i];
      if (!target) return;
      halt();
      const my = token.current;
      const e = engine.current;
      const d = target.dialogue;
      const est = estimateSeconds(target.text, d?.audioDuration);
      const clock = e.clock;
      clock.audio = null;
      clock.offset = 0;
      clock.running = false;
      clock.speed = cur.rate;

      setPick({ index: i, atFocusId: cur.focusId });
      setPlaying({ status: 'playing', index: i });
      if (target.teiId) cur.onSelect?.(target.teiId);

      anim.current.line = d
        ? {
            visemes: d.visemes,
            tracks: filterTracks(d.tracks, cur.boneFilter),
            emotion: emotionExpression(d.emotion),
            duration: d.audioDuration ?? est,
            animDuration: d.animDuration || d.audioDuration || est,
            loop: d.animLoop,
            getTime: () => clockTime(clock),
          }
        : null;

      e.began = false;
      const startedAt = performance.now();
      const finish = () => {
        if (token.current !== my) return;
        const was = latest.current;
        halt();
        const next = was.autoAdvance ? nextIndex(was.lines, i) : null;
        if (next === null) setPlaying({ status: 'idle', index: i });
        else speakRef.current(next);
      };
      // 声も音も出ない環境でも止まらないよう、目安の時間だけ口と動きを進めて次へ進む
      const goSilent = () => {
        if (token.current !== my || e.mode === 'silent') return;
        e.mode = 'silent';
        synth?.cancel();
        stopAudio();
        if (!e.began) {
          clock.offset = 0;
          clock.base = performance.now();
          clock.speed = latest.current.rate;
          clock.running = !e.paused;
        }
        anim.current.speaking = true;
      };
      const startSpeech = () => {
        if (token.current !== my) return;
        if (!synth) {
          goSilent();
          return;
        }
        e.mode = 'speech';
        clock.audio = null;
        clock.running = false;
        clock.offset = 0;
        const sp = latest.current.voiceMap.get(target.speakerKey);
        const u = new SpeechSynthesisUtterance(target.text);
        u.lang = sp?.voice?.lang ?? latest.current.lang;
        if (sp?.voice) u.voice = sp.voice;
        u.pitch = sp?.pitch ?? 1;
        u.rate = latest.current.rate;
        u.onstart = () => {
          if (token.current !== my || e.mode !== 'speech') return;
          e.began = true;
          clock.base = performance.now();
          clock.speed = latest.current.rate;
          clock.running = !e.paused;
          anim.current.speaking = true;
        };
        u.onboundary = () => {
          if (token.current === my && e.mode === 'speech') anim.current.bump = 1;
        };
        u.onend = () => {
          if (token.current === my && e.mode === 'speech') finish();
        };
        u.onerror = () => {
          if (token.current === my && e.mode === 'speech') goSilent();
        };
        synth.speak(u);
      };
      const startAudio = (src: string) => {
        e.mode = 'audio';
        const au = new Audio(src);
        au.preload = 'auto';
        au.playbackRate = latest.current.rate;
        clock.audio = au;
        au.onplaying = () => {
          if (token.current === my) e.began = true;
        };
        au.onended = () => {
          if (token.current === my && e.mode === 'audio') finish();
        };
        const fallback = () => {
          if (token.current !== my || e.mode !== 'audio') return;
          stopAudio();
          startSpeech();
        };
        au.onerror = fallback;
        au.play().catch((err: unknown) => {
          if ((err as { name?: string })?.name !== 'AbortError') fallback();
        });
      };

      if (d?.audioPath && cur.scriptHref) startAudio(resolveAudioUrl(d.audioPath, cur.scriptHref));
      else startSpeech();

      e.watch = setInterval(() => {
        if (token.current !== my) return;
        const elapsed = (performance.now() - startedAt) / 1000;
        if (e.mode === 'silent') {
          if (clock.running && clockTime(clock) >= est) finish();
        } else if (!e.began && !e.paused && elapsed > (e.mode === 'audio' ? 8 : 4)) {
          // 音が始まらない（読み込めない・声が無い）
          if (e.mode === 'audio') {
            stopAudio();
            startSpeech();
          } else goSilent();
        } else if (e.began && e.mode === 'speech' && clockTime(clock) > est * 2 + 5) {
          finish();
        }
      }, 100);
    },
    [synth, halt, stopAudio],
  );

  useEffect(() => {
    speakRef.current = speakAt;
  }, [speakAt]);

  // 表示中の行と読み上げ中の行がずれたら、読み上げを止める
  useEffect(() => {
    if (playing.status !== 'idle' && playing.index !== index) halt();
  }, [playing, index, halt]);

  // 閉じるときは、音・合成音声・待機の仕掛けをすべてやめる
  useEffect(() => halt, [halt]);

  const onPlayPause = () => {
    if (!item) return;
    const e = engine.current;
    const clock = e.clock;
    if (status === 'playing') {
      e.paused = true;
      if (clock.audio) clock.audio.pause();
      else if (clock.running) {
        clock.offset = clockTime(clock);
        clock.running = false;
      }
      if (e.mode === 'speech') synth?.pause();
      anim.current.speaking = false;
      setPlaying({ status: 'paused', index });
    } else if (status === 'paused') {
      e.paused = false;
      if (clock.audio) void clock.audio.play().catch(() => {});
      else if (e.mode === 'silent' || e.began) {
        clock.base = performance.now();
        clock.running = true;
      }
      if (e.mode === 'speech') synth?.resume();
      anim.current.speaking = true;
      setPlaying({ status: 'playing', index });
    } else {
      speakAt(index);
    }
  };
  const onStop = () => {
    halt();
    setPlaying({ status: 'idle', index });
  };
  // 前後へ。読み上げ中は、そのまま新しい行を読み始める。止まっているときは移るだけ
  const go = (to: number | null) => {
    if (to === null) return;
    if (status === 'idle') {
      setPick({ index: to, atFocusId: focusId });
      if (lines[to].teiId) onSelect?.(lines[to].teiId);
    } else {
      speakAt(to);
    }
  };
  const first = firstIndex(lines);
  const emotionType = item?.dialogue?.emotion?.type ?? null;
  const emotionLabel = emotionType ? (t.has(`emotions.${emotionType}`) ? t(`emotions.${emotionType}`) : emotionType) : null;

  return (
    <PaneCard
      data-testid="vrm-pane"
      data-status={status}
      data-index={index}
      data-source={scriptHref ? 'json' : 'tei'}
      data-lines={lines.length}
      data-matched={scriptHref ? matched : undefined}
      bar={
        <>
          <span className="truncate font-semibold text-[var(--ds-fg)]">{t('title')}</span>
          <span className="truncate text-xs text-[var(--ds-fg-muted)]">
            {t('position', { index: lines.length ? index + 1 : 0, total: lines.length })}
          </span>
        </>
      }
      footer={
        <div className="shrink-0 border-t border-[var(--ds-border)] px-3 py-2 text-sm">
          <div className="mb-2 min-h-[3.25rem]" aria-live="polite">
            <p className="flex items-baseline gap-2 truncate text-xs font-semibold text-[var(--ds-fg-muted)]">
              <span className="truncate" data-testid="vrm-speaker">
                {item?.speaker || t('unknownSpeaker')}
              </span>
              {emotionLabel && (
                <span className="shrink-0 rounded border border-[var(--ds-border)] px-1 font-normal" data-testid="vrm-emotion">
                  {emotionLabel}
                </span>
              )}
            </p>
            <p className="line-clamp-2 text-[var(--ds-fg)]" data-testid="vrm-line">
              {scriptStatus === 'loading' ? t('scriptLoading') : scriptStatus === 'error' ? t('scriptError') : item?.text}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <button type="button" className={paneButton} disabled={prevIndex(lines, index) === null} onClick={() => go(prevIndex(lines, index))}>
              {t('prev')}
            </button>
            <button
              type="button"
              className={paneButton}
              aria-pressed={status === 'playing'}
              disabled={first < 0}
              onClick={onPlayPause}
            >
              {status === 'playing' ? t('pause') : status === 'paused' ? t('resume') : t('play')}
            </button>
            <button type="button" className={paneButton} disabled={status === 'idle'} onClick={onStop}>
              {t('stop')}
            </button>
            <button type="button" className={paneButton} disabled={nextIndex(lines, index) === null} onClick={() => go(nextIndex(lines, index))}>
              {t('next')}
            </button>
            <label className="flex items-center gap-1 text-[var(--ds-fg-muted)]">
              <input type="checkbox" checked={autoAdvance} onChange={(e) => setAutoAdvance(e.target.checked)} data-testid="vrm-auto-advance" />
              {t('autoAdvance')}
            </label>
            {langVoices.length > 1 && (
              <label className="flex items-center gap-1 text-[var(--ds-fg-muted)]">
                {t('voice')}
                <select
                  value={chosenVoice ? chosenVoice.name : ''}
                  onChange={(e) => onChooseVoice(e.target.value)}
                  className="max-w-40 rounded border border-[var(--ds-border)] bg-transparent px-1 py-0.5"
                  data-testid="vrm-voice"
                >
                  <option value="">{t('voiceAuto')}</option>
                  {langVoices.map((v) => (
                    <option key={v.voiceURI} value={v.name}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="ml-auto flex items-center gap-1 text-[var(--ds-fg-muted)]">
              {t('rate')}
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                aria-label={t('rate')}
                className="w-20"
              />
              <span className="w-8 tabular-nums">{rate.toFixed(1)}</span>
            </label>
          </div>
          {!synth && <p className="mt-1.5 text-xs text-[var(--ds-fg-muted)]">{t('unsupported')}</p>}
          {voices.length > 0 && !voice && (
            <p className="mt-1.5 text-xs text-[var(--ds-fg-muted)]">{t('noVoice', { lang })}</p>
          )}
        </div>
      }
    >
      <div ref={hostRef} className="absolute inset-0" data-testid="vrm-canvas" data-avatar={avatar.status} />
      {avatar.status === 'ready' && (
        <button
          type="button"
          className={`${paneButton} absolute right-2 top-2 text-xs`}
          onClick={() => avatar.view.current?.reset()}
          data-testid="vrm-reset-view"
        >
          {t('resetView')}
        </button>
      )}
      {avatar.status === 'loading' && (
        <p className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 text-sm text-[var(--ds-fg-muted)]">
          {avatar.progress > 0 && avatar.progress < 1
            ? t('loadingPercent', { percent: Math.round(avatar.progress * 100) })
            : t('loading')}
        </p>
      )}
      {avatar.status === 'error' && (
        <p role="alert" className="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-[var(--ds-fg-muted)]">
          {t('error')}
        </p>
      )}
    </PaneCard>
  );
}
