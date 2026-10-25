'use client';

import type { Surface3D } from '@/lib/tei/model3d';

interface Props {
  /** readModels で読んだ 3D モデル。1 つ以上 */
  surfaces: Surface3D[];
  /** 本文で選んでいる id（URL の id）。当たる範囲があれば、そこへカメラを寄せる */
  focusId?: string | null;
  /** 3D の側で範囲を選んだ。zone.selectId を渡す */
  onSelect?: (id: string) => void;
}

// 3D ペイン（仮）。中身は別の作業で作る
export default function ModelPane({ surfaces }: Props) {
  return <div data-testid="model-pane" data-model={surfaces[0]?.model.kind} />;
}
