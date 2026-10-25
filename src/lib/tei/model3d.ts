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

/** 文書の中の 3D モデルを、書かれた順に。無ければ空 */
export function readModels(tei: Document, baseUrl?: string): Surface3D[] {
  void tei;
  void baseUrl;
  throw new Error('not implemented');
}

/** 3D モデルを持つ文書か（ペインとツールバーのボタンを出すか） */
export function hasModelData(tei: Document): boolean {
  void tei;
  throw new Error('not implemented');
}

/** URL の id から、それに当たる範囲（どのモデルの、どの zone か）。無ければ null */
export function zoneForId(surfaces: Surface3D[], id: string | null | undefined): { surface: number; zone: Zone3D } | null {
  void surfaces;
  void id;
  throw new Error('not implemented');
}
