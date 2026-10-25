import { describe, expect, it } from 'vitest';
import {
  alignDialogues, allowedBones, emotionExpression, filterTracks, lineEnvelope, mouthTarget, parseScript,
  resolveAudioUrl, sampleKeyframes, slerpQ, stripRuby, textSimilarity, visemeShape,
} from './script';

describe('stripRuby', () => {
  it('ルビ記法を親文字にする', () => {
    expect(stripRuby('{{余計|よけい}}な事')).toBe('余計な事');
    expect(stripRuby('こん{{畜生|ちくしょう}}！')).toBe('こん畜生！');
    expect(stripRuby('平文')).toBe('平文');
  });
});

describe('parseScript', () => {
  it('台詞・口形素・動きを読む（回転は配列でもオブジェクトでも）', () => {
    const d = parseScript({
      dialogues: [
        {
          id: 'a', character: '王子', text: '{{余計|よけい}}な', emotion: { type: 'Joy', intensity: 0.5 },
          voice: 'ja-JP-NanamiNeural', audio: { path: 'audio/x.wav', duration: 2 },
          visemes: [{ visemeId: 3, audioOffset: 200 }, { visemeId: 1, audioOffset: 100 }],
          animation: { duration: 2, loop: false, tracks: [
            { boneName: 'Head', keyframes: [{ time: 1, rotation: [0, 0.1, 0, 0.99] }, { time: 0, rotation: { x: 0, y: 0, z: 0, w: 1 } }] },
            { type: 'blendShape', boneName: 'x', keyframes: [{ time: 0, values: { happy: 1 } }] },
          ] },
        },
        { id: 'b', text: '' },
        null,
      ],
    });
    expect(d).toHaveLength(1);
    expect(d[0].text).toBe('余計な');
    expect(d[0].emotion).toEqual({ type: 'joy', intensity: 0.5 });
    expect(d[0].visemes.map((v) => v.id)).toEqual([1, 3]);
    expect(d[0].tracks).toHaveLength(1);
    expect(d[0].tracks[0].bone).toBe('head');
    expect(d[0].tracks[0].keyframes[0].time).toBe(0);
  });
  it('dialogues が無ければ空', () => {
    expect(parseScript({})).toEqual([]);
    expect(parseScript(null)).toEqual([]);
  });
});

describe('resolveAudioUrl', () => {
  it('JSON の URL からの相対で解く', () => {
    expect(resolveAudioUrl('audio/a b.wav', '/data/vrm/s.json?x=1')).toBe('/data/vrm/audio/a%20b.wav');
    expect(resolveAudioUrl('a.wav', 'https://e.com/d/s.json')).toBe('https://e.com/d/a.wav');
    expect(resolveAudioUrl('https://z/a.wav', '/s.json')).toBe('https://z/a.wav');
  });
});

describe('alignDialogues', () => {
  const targets = [
    { text: 'そのマントルをこっちへよこせ。', speaker: '第一の盗人' },
    { text: '余計な事を云うな。その剣こそこっちへよこせ。', speaker: '第二の盗人' },
    { text: '全く別の台詞です。', speaker: '王子' },
    { text: 'よしよし、ではこのマントルはおれが貰って置こう。', speaker: '第一の盗人' },
  ];
  it('順序を保って対応づけ、ト書きなどは null', () => {
    const r = alignDialogues(
      [
        { text: '森の中。三人の盗人ぬすびとが宝を争っている。', character: 'ナレーター' },
        { text: 'そのマントルをこっちへよこせ。', character: '第一の盗人' },
        { text: '{{余計|よけい}}な事を云うな。その剣こそこっちへよこせ。', character: '第二の盗人' },
        { text: 'よしよし、ではこのマントルはおれが貰って置こう', character: '第一の盗人' },
      ],
      targets,
    );
    expect(r).toEqual([null, 0, 1, 3]);
  });
  it('順序が逆の一致は採らない', () => {
    const r = alignDialogues(
      [{ text: targets[3].text, character: '' }, { text: targets[0].text, character: '' }],
      targets,
    );
    expect(r.filter((x) => x !== null)).toHaveLength(1);
  });
  it('近さ', () => {
    expect(textSimilarity('あいうえお', 'あいうえお')).toBe(1);
    expect(textSimilarity('あいうえお', 'かきくけこ')).toBe(0);
  });
});

describe('visemes / emotion / envelope', () => {
  it('viseme の対応と口の目標', () => {
    expect(visemeShape(0)).toBeNull();
    expect(visemeShape(8)).toBe('ou');
    const v = [{ id: 1, ms: 100 }, { id: 8, ms: 200 }];
    expect(mouthTarget(v, 50).aa).toBe(0);
    expect(mouthTarget(v, 150).aa).toBeGreaterThan(0);
    expect(mouthTarget(v, 250).ou).toBeGreaterThan(0);
    expect(mouthTarget(v, 900).ou).toBe(0);
  });
  it('感情', () => {
    expect(emotionExpression({ type: 'joy', intensity: 0.5 })).toEqual({ expression: 'happy', weight: 0.5 });
    expect(emotionExpression({ type: 'anger', intensity: 1 }).weight).toBeLessThanOrEqual(0.8);
    expect(emotionExpression({ type: 'neutral', intensity: 1 }).weight).toBe(0);
    expect(emotionExpression(null).weight).toBe(0);
    expect(emotionExpression({ type: 'zzz', intensity: 1 }).weight).toBe(0);
  });
  it('エンベロープは両端で 0、途中で 1', () => {
    expect(lineEnvelope(0, 3)).toBe(0);
    expect(lineEnvelope(1.5, 3)).toBe(1);
    expect(lineEnvelope(3, 3)).toBe(0);
  });
});

describe('animation', () => {
  it('slerp と補間', () => {
    const id: [number, number, number, number] = [0, 0, 0, 1];
    const s = Math.SQRT1_2;
    const q = slerpQ(id, [s, 0, 0, s], 0.5);
    expect(q[3]).toBeCloseTo(Math.cos(Math.PI / 8));
    const k = [{ time: 0, q: id }, { time: 2, q: [s, 0, 0, s] as [number, number, number, number] }];
    expect(sampleKeyframes(k, -1)).toEqual(id);
    expect(sampleKeyframes(k, 9)[0]).toBeCloseTo(s);
    expect(sampleKeyframes(k, 1)[3]).toBeCloseTo(Math.cos(Math.PI / 8));
  });
  it('ボーンの絞り込み', () => {
    expect(allowedBones('all')).toBeNull();
    const tracks = ['head', 'spine', 'leftIndexProximal', 'leftUpperLeg'].map((bone) => ({ bone, keyframes: [] }));
    expect(filterTracks(tracks, 'head-only').map((t) => t.bone)).toEqual(['head']);
    expect(filterTracks(tracks, 'upper-body').map((t) => t.bone)).toEqual(['head', 'spine']);
    expect(filterTracks(tracks, 'no-fingers').map((t) => t.bone)).toEqual(['head', 'spine', 'leftUpperLeg']);
    expect(filterTracks(tracks, 'all')).toHaveLength(4);
  });
});
