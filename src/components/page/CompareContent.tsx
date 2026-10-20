'use client';

import ParamsPlaceholder from './ParamsPlaceholder';

// URL で受け取る予定のパラメータ
export const COMPARE_PARAMS = ['manifest1', 'manifest2', 'canvas1', 'canvas2', 'label1', 'label2', 'mode', 'embed'] as const;

export default function CompareContent() {
  return <ParamsPlaceholder screen="compare" params={COMPARE_PARAMS} />;
}
