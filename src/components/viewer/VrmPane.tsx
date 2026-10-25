'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { extractSpeeches } from '@/lib/tei/speech';
import { withBasePath } from '@/lib/basePath';
import { firstIndex, indexOfId, nextIndex, pickVoice, prevIndex, resolveLang } from '@/lib/vrm/reader';
import PaneCard, { paneButton } from './PaneCard';

interface Props {
  tei: Document;
  /** 選んでいる発話（URL の id） */
  focusId?: string | null;
  /** 読み上げる行が替わったとき。その発話の id を渡す（本文のハイライトに使う） */
  onSelect?: (id: string) => void;
  /** VRM ファイルの URL（URL の vrm）。無ければ同梱の boy.vrm */
  vrmUrl?: string | null;
}

export const DEFAULT_VRM_PATH = '/models/vrm/boy.vrm';

// アバターの口・まばたきを動かすための、描画ループと共有する状態
interface Anim {
  speaking: boolean;
  bump: number;
}

type Status = 'idle' | 'playing' | 'paused';

// three と three-vrm は、このペインが出たときだけ読み込む（モデルは 20MB ある）
function useAvatar(container: React.RefObject<HTMLDivElement | null>, url: string, anim: React.RefObject<Anim>) {
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

        cleanup = () => {
          cancelAnimationFrame(raf);
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

        if (live) setState((s) => ({ ...s, status: 'ready', progress: 1 }));

        let last = performance.now();
        let blinkAt = 1.5;
        let blinkStart = -1;
        let time = 0;
        const spine = vrm.humanoid.getNormalizedBoneNode('spine');
        const neck = vrm.humanoid.getNormalizedBoneNode('neck');
        const tick = (now: number) => {
          raf = requestAnimationFrame(tick);
          const dt = Math.min(0.1, (now - last) / 1000);
          last = now;
          time += dt;
          const a = anim.current;
          // 口: 話している間は開け閉めし、語の切れ目（onboundary）で少し大きく開く
          const em = vrm!.expressionManager;
          if (a.bump > 0) a.bump = Math.max(0, a.bump - dt * 4);
          const open = a.speaking ? Math.min(1, 0.25 + 0.3 * (0.5 + 0.5 * Math.sin(time * 15)) + a.bump * 0.4) : 0;
          em?.setValue('aa', open);
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
          // 呼吸と、ほんの少しの首の揺れ
          if (spine) spine.rotation.x = 0.012 * Math.sin(time * 1.6);
          if (neck) neck.rotation.y = 0.04 * Math.sin(time * 0.5);
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
  return state.url === url ? state : { url, status: 'loading' as const, progress: 0 };
}

// VRM のアバターが、本文の発話をブラウザの音声合成（Web Speech API）で読み上げるペイン
export default function VrmPane({ tei, focusId = null, onSelect, vrmUrl = null }: Props) {
  const t = useTranslations('Vrm');
  const locale = useLocale();
  const url = vrmUrl?.trim() ? vrmUrl.trim() : withBasePath(DEFAULT_VRM_PATH);
  const items = useMemo(() => extractSpeeches(tei).filter((it) => it.text.trim()), [tei]);
  const lang = useMemo(() => resolveLang(tei, locale), [tei, locale]);

  const hostRef = useRef<HTMLDivElement>(null);
  const anim = useRef<Anim>({ speaking: false, bump: 0 });
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
  const voice = useMemo(() => pickVoice(voices, lang), [voices, lang]);

  const [rate, setRate] = useState(1);

  // 現在の行。本文で別の発話が選ばれたら、そこへ移る（読み始めはしない）
  const [pick, setPick] = useState<{ index: number; atFocusId: string | null }>({ index: 0, atFocusId: focusId });
  const focusIndex = indexOfId(items, focusId);
  const rawIndex = pick.atFocusId !== focusId && focusIndex >= 0 ? focusIndex : pick.index;
  const index = items.length ? Math.min(Math.max(rawIndex, 0), items.length - 1) : 0;
  const item = items[index];

  // 読み上げ中の行。表示中の行と違うとき（本文で別の行を選んだ）は止める
  const [playing, setPlaying] = useState<{ status: Status; index: number }>({ status: 'idle', index: 0 });
  const status: Status = playing.index === index ? playing.status : 'idle';

  const latest = useRef({ items, voice, lang, rate, focusId, onSelect, index });
  useEffect(() => {
    latest.current = { items, voice, lang, rate, focusId, onSelect, index };
  });
  const token = useRef(0);
  const speakRef = useRef<(i: number) => void>(() => {});

  const halt = useCallback(() => {
    token.current += 1;
    anim.current.speaking = false;
    synth?.cancel();
  }, [synth]);

  const speakAt = useCallback(
    (i: number) => {
      if (!synth) return;
      const cur = latest.current;
      const target = cur.items[i];
      if (!target) return;
      halt();
      const my = token.current;
      setPick({ index: i, atFocusId: cur.focusId });
      setPlaying({ status: 'playing', index: i });
      cur.onSelect?.(target.id);
      const u = new SpeechSynthesisUtterance(target.text);
      u.lang = cur.voice?.lang ?? cur.lang;
      if (cur.voice) u.voice = cur.voice;
      u.rate = cur.rate;
      u.onstart = () => {
        if (token.current === my) anim.current.speaking = true;
      };
      u.onboundary = () => {
        if (token.current === my) anim.current.bump = 1;
      };
      u.onend = () => {
        if (token.current !== my) return;
        anim.current.speaking = false;
        const next = nextIndex(latest.current.items, i);
        if (next === null) setPlaying({ status: 'idle', index: i });
        else speakRef.current(next);
      };
      u.onerror = () => {
        if (token.current !== my) return;
        anim.current.speaking = false;
        setPlaying({ status: 'idle', index: i });
      };
      synth.speak(u);
    },
    [synth, halt],
  );

  useEffect(() => {
    speakRef.current = speakAt;
  }, [speakAt]);

  // 表示中の行と読み上げ中の行がずれたら、読み上げを止める
  useEffect(() => {
    if (playing.status !== 'idle' && playing.index !== index) halt();
  }, [playing, index, halt]);

  // 閉じるときは読み上げをやめる
  useEffect(() => halt, [halt]);

  const onPlayPause = () => {
    if (!synth || !item) return;
    if (status === 'playing') {
      synth.pause();
      anim.current.speaking = false;
      setPlaying({ status: 'paused', index });
    } else if (status === 'paused') {
      synth.resume();
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
      onSelect?.(items[to].id);
    } else {
      speakAt(to);
    }
  };
  const first = firstIndex(items);

  return (
    <PaneCard
      data-testid="vrm-pane"
      data-status={status}
      data-index={index}
      bar={
        <>
          <span className="truncate font-semibold text-[var(--ds-fg)]">{t('title')}</span>
          <span className="truncate text-xs text-[var(--ds-fg-muted)]">
            {t('position', { index: items.length ? index + 1 : 0, total: items.length })}
          </span>
        </>
      }
      footer={
        <div className="shrink-0 border-t border-[var(--ds-border)] px-3 py-2 text-sm">
          {synth ? (
            <>
              <div className="mb-2 min-h-[3.25rem]" aria-live="polite">
                <p className="truncate text-xs font-semibold text-[var(--ds-fg-muted)]" data-testid="vrm-speaker">
                  {item?.speakerLabel || t('unknownSpeaker')}
                </p>
                <p className="line-clamp-2 text-[var(--ds-fg)]" data-testid="vrm-line">
                  {item?.text}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                <button type="button" className={paneButton} disabled={prevIndex(items, index) === null} onClick={() => go(prevIndex(items, index))}>
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
                <button type="button" className={paneButton} disabled={nextIndex(items, index) === null} onClick={() => go(nextIndex(items, index))}>
                  {t('next')}
                </button>
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
              {voices.length > 0 && !voice && (
                <p className="mt-1.5 text-xs text-[var(--ds-fg-muted)]">{t('noVoice', { lang })}</p>
              )}
            </>
          ) : (
            <p role="alert" className="text-[var(--ds-fg-muted)]">
              {t('unsupported')}
            </p>
          )}
        </div>
      }
    >
      <div ref={hostRef} className="absolute inset-0" data-testid="vrm-canvas" data-avatar={avatar.status} />
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
