// Sketchfab Viewer API（https://static.sketchfab.com/api/sketchfab-viewer-1.12.1.js）の型定義（使う分だけ）

export interface SketchfabApi {
  start(callback?: () => void): void;
  addEventListener(event: 'viewerready', callback: () => void): void;
  addEventListener(event: 'annotationSelect', callback: (index: number) => void): void;
  gotoAnnotation(
    index: number,
    options?: { preventCameraAnimation?: boolean; preventCameraMove?: boolean },
    callback?: (err: unknown, index?: number) => void,
  ): void;
}

export interface SketchfabInitOptions {
  success?: (api: SketchfabApi) => void;
  error?: () => void;
  ui_infos?: 0 | 1;
  ui_watermark?: 0 | 1;
  ui_help?: 0 | 1;
  ui_settings?: 0 | 1;
  ui_vr?: 0 | 1;
  ui_ar?: 0 | 1;
  ui_inspector?: 0 | 1;
  ui_stop?: 0 | 1;
  ui_annotations?: 0 | 1;
  annotations_visible?: 0 | 1;
}

export interface SketchfabClient {
  init(uid: string, options: SketchfabInitOptions): void;
}

export interface SketchfabConstructor {
  new (iframe: HTMLIFrameElement): SketchfabClient;
}

declare global {
  interface Window {
    Sketchfab?: SketchfabConstructor;
  }
}
