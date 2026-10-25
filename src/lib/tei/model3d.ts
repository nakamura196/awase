// 3D モデル（facsimile/surface が 3D モデルを指すもの）と、その中の範囲（zone）を読む。
// 書き方は資料によって違うので、見つけた所で次を読む（docs/notes/model3d.md）。
//
// - Sketchfab: <surface corresp="<モデルの uid>">、または <graphic url="https://sketchfab.com/3d-models/…<uid>"/>。
//   zone は Sketchfab 側に登録した注記の番号を、@n・@idno・note/idno のどれかに持つ
// - GLB/glTF: <surface type="threejs" corresp="….glb">。zone は type="polygon" points="x,y,z x,y,z …"、または @x @y @z（1 点）
//
// 本文とのつなぎは、次の 3 通りを読む。
// - 本文の要素の @corresp が zone を指す（<l corresp="#zone…">）
// - 本文の要素の @facs が zone を指す（<div xml:id="…" facs="#zone…">）
// - zone の @corresp が本文の要素を指す（<zone corresp="#stanza1 #stanza4">）

import { child, httpUrl, xmlId } from './facs';
import { correspIds } from './link';

/** 3D モデルの在り処 */
export type Model3D =
  | { kind: 'sketchfab'; /** Sketchfab のモデルの uid（32 桁の 16 進） */ uid: string }
  | { kind: 'gltf'; /** GLB/glTF の URL（TEI の場所から解決したもの） */ url: string };

/** モデルの中の範囲 */
export interface Zone3D {
  /** zone の xml:id */
  id: string;
  /** Sketchfab の注記の番号（0 から） */
  annotation?: number;
  /** 多角形の頂点、または 1 点。[x, y, z] */
  points?: [number, number, number][];
  /** 見出し（zone/label、note/label） */
  label?: string;
  /** 説明（zone/note の文字） */
  note?: string;
  /**
   * この範囲を選んだことになる URL の id（本文ペインの id= と同じ決まり。src/lib/tei/link.ts）。
   * zone の xml:id、zone@corresp が指す id、zone を @facs で指す本文の要素の xml:id。重複は除く
   */
  ids: string[];
  /** 3D の側でこの範囲を選んだときに、URL の id にする値。ids のうち本文で見つかるものを先に選ぶ */
  selectId: string;
}

/** 3D モデル 1 つと、その中の範囲 */
export interface Surface3D {
  /** surface の xml:id */
  id?: string;
  model: Model3D;
  /** surface/label、surface/desc */
  label?: string;
  zones: Zone3D[];
}

const SKETCHFAB_CORRESP = /^(?:#(?:sketchfab-)?)?([0-9a-f]{32})$/i;
const SKETCHFAB_PATH = /^\/(?:3d-models\/(?:[^/]+-)?|models\/)([0-9a-f]{32})\/?$/i;

function sketchfabUidFromUrl(raw: string | null | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  try {
    const u = new URL(v);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return undefined;
    if (u.hostname !== 'sketchfab.com' && u.hostname !== 'www.sketchfab.com') return undefined;
    const m = SKETCHFAB_PATH.exec(u.pathname);
    return m ? m[1].toLowerCase() : undefined;
  } catch {
    return undefined;
  }
}

function sketchfabUidFromCorresp(raw: string | null | undefined): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  for (const token of v.split(/\s+/)) {
    const m = SKETCHFAB_CORRESP.exec(token);
    if (m) return m[1].toLowerCase();
    const fromUrl = sketchfabUidFromUrl(token);
    if (fromUrl) return fromUrl;
  }
  return undefined;
}

function gltfUrl(raw: string | null | undefined, base?: string): string | undefined {
  const v = raw?.trim();
  if (!v || !/\.gl(?:b|tf)$/i.test(v)) return undefined;
  return httpUrl(v, base);
}

// surface@corresp と graphic@url から 3D モデル（Sketchfab または glTF）を判定する
function surfaceModel(surface: Element, baseUrl?: string): Model3D | null {
  const corresp = surface.getAttribute('corresp');
  const graphic = child(surface, 'graphic');
  const graphicUrl = graphic?.getAttribute('url');

  const uid = sketchfabUidFromCorresp(corresp) ?? sketchfabUidFromUrl(graphicUrl);
  if (uid) return { kind: 'sketchfab', uid };

  const url = gltfUrl(corresp, baseUrl) ?? gltfUrl(graphicUrl, baseUrl);
  if (url) return { kind: 'gltf', url };

  return null;
}

function nonNegInt(raw: string | null | undefined): number | undefined {
  const s = raw?.trim();
  if (!s || !/^\d+$/.test(s)) return undefined;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : undefined;
}

// 注記の番号は @n・@idno・子孫の idno の順に見る
function readAnnotation(zone: Element): number | undefined {
  const candidates: (string | null | undefined)[] = [
    zone.getAttribute('n'),
    zone.getAttribute('idno'),
    ...Array.from(zone.getElementsByTagNameNS('*', 'idno')).map((el) => el.textContent),
  ];
  for (const c of candidates) {
    const n = nonNegInt(c);
    if (n !== undefined) return n;
  }
  return undefined;
}

function finiteNum(raw: string | null | undefined): number | undefined {
  const s = raw?.trim();
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

// points="x,y,z …" または @x @y @z から 3 次元の座標を読む
function readPoints(zone: Element): [number, number, number][] | undefined {
  const rawPoints = zone.getAttribute('points')?.trim();
  if (rawPoints) {
    const pts: [number, number, number][] = [];
    for (const token of rawPoints.split(/\s+/)) {
      const parts = token.split(',');
      if (parts.length !== 3) continue;
      const x = finiteNum(parts[0]);
      const y = finiteNum(parts[1]);
      const z = finiteNum(parts[2]);
      if (x !== undefined && y !== undefined && z !== undefined) {
        pts.push([x, y, z]);
      }
    }
    if (pts.length > 0) return pts;
  }
  const x = finiteNum(zone.getAttribute('x'));
  const y = finiteNum(zone.getAttribute('y'));
  const z = finiteNum(zone.getAttribute('z'));
  if (x !== undefined && y !== undefined && z !== undefined) {
    return [[x, y, z]];
  }
  return undefined;
}

/** 文書の中の 3D モデルを、書かれた順に。無ければ空 */
export function readModels(tei: Document, baseUrl?: string): Surface3D[] {
  const surfaces = Array.from(tei.getElementsByTagNameNS('*', 'surface'));
  if (surfaces.length === 0) return [];

  // 文書内の全 xml:id と、本文から各 zone を指す要素の xml:id を集める
  const docIds = new Set<string>();
  for (const el of Array.from(tei.getElementsByTagNameNS('*', '*'))) {
    const id = xmlId(el)?.trim();
    if (id) docIds.add(id);
  }

  const textRefsByZone = new Map<string, string[]>();
  const textRoots = Array.from(tei.getElementsByTagNameNS('*', 'text')).filter((t) => !t.parentElement?.closest('text'));
  for (const textRoot of textRoots) {
    for (const el of Array.from(textRoot.getElementsByTagNameNS('*', '*'))) {
      const eid = xmlId(el)?.trim();
      if (!eid) continue;
      const refs = [...correspIds(el.getAttribute('facs')), ...correspIds(el.getAttribute('corresp'))];
      for (const ref of refs) {
        const list = textRefsByZone.get(ref);
        if (list) {
          if (!list.includes(eid)) list.push(eid);
        } else {
          textRefsByZone.set(ref, [eid]);
        }
      }
    }
  }

  const out: Surface3D[] = [];
  for (const surface of surfaces) {
    const model = surfaceModel(surface, baseUrl);
    if (!model) continue;

    const sid = xmlId(surface)?.trim() || undefined;
    const surfaceLabel =
      child(surface, 'label')?.textContent?.trim() ||
      child(surface, 'desc')?.textContent?.trim() ||
      undefined;

    const zones: Zone3D[] = [];
    for (const zone of Array.from(surface.getElementsByTagNameNS('*', 'zone'))) {
      const zid = xmlId(zone)?.trim();
      if (!zid) continue;

      const annotation = readAnnotation(zone);
      const points = readPoints(zone);
      const notes = Array.from(zone.children).filter((c) => c.localName === 'note');
      const label =
        child(zone, 'label')?.textContent?.trim() ||
        notes.map((n) => child(n, 'label')?.textContent?.trim()).find(Boolean) ||
        undefined;
      const note =
        notes
          .filter((n) => n.children.length === 0)
          .map((n) => n.textContent?.trim())
          .find(Boolean) || undefined;

      const correspTargets = correspIds(zone.getAttribute('corresp'));
      const textTargets = textRefsByZone.get(zid) ?? [];
      const ids = Array.from(new Set([zid, ...correspTargets, ...textTargets]));
      const selectId = correspTargets.find((id) => docIds.has(id)) ?? textTargets[0] ?? zid;

      zones.push({
        id: zid,
        ...(annotation !== undefined ? { annotation } : {}),
        ...(points !== undefined ? { points } : {}),
        ...(label !== undefined ? { label } : {}),
        ...(note !== undefined ? { note } : {}),
        ids,
        selectId,
      });
    }

    out.push({
      ...(sid ? { id: sid } : {}),
      model,
      ...(surfaceLabel ? { label: surfaceLabel } : {}),
      zones,
    });
  }

  return out;
}

/** 3D モデルを持つ文書か（ペインとツールバーのボタンを出すか） */
export function hasModelData(tei: Document): boolean {
  return Array.from(tei.getElementsByTagNameNS('*', 'surface')).some((s) => surfaceModel(s, 'https://example.org/') !== null);
}

/** URL の id から、それに当たる範囲（どのモデルの、どの zone か）。無ければ null */
export function zoneForId(surfaces: Surface3D[], id: string | null | undefined): { surface: number; zone: Zone3D } | null {
  if (!id) return null;
  for (let i = 0; i < surfaces.length; i++) {
    for (const zone of surfaces[i].zones) {
      if (zone.ids.includes(id)) return { surface: i, zone };
    }
  }
  return null;
}
