'use client';

import ParamsPlaceholder from './ParamsPlaceholder';

// URL で受け取る予定のパラメータ
export const DTS_PARAMS = ['base', 'url'] as const;

export default function DtsContent() {
  return <ParamsPlaceholder screen="dts" params={DTS_PARAMS} />;
}
