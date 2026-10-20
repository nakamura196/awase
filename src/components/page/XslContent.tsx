'use client';

import ParamsPlaceholder from './ParamsPlaceholder';

// URL で受け取る予定のパラメータ
export const XSL_PARAMS = ['u', 'url', 'xsl'] as const;

export default function XslContent() {
  return <ParamsPlaceholder screen="xsl" params={XSL_PARAMS} />;
}
