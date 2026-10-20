'use client';

import ParamsPlaceholder from './ParamsPlaceholder';

// URL で受け取る予定のパラメータ
export const VIEWER_PARAMS = ['u', 'tei', 'config', 'manifest', 'curation', 'panes', 'dir', 'wit', 'xsl', 'id', 'embed'] as const;

export default function ViewerContent() {
  return <ParamsPlaceholder screen="viewer" params={VIEWER_PARAMS} />;
}
