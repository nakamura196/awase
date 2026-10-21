'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';
import { withBasePath } from '@/lib/basePath';
import { addZonePageBreaks } from '@/lib/tei/facs';
import { absolutizeGraphics, transformTei } from '@/lib/xsl/engine';
import {
  defaultXslId,
  injectBase,
  sefLocation,
  setFrameHtmlAttrs,
  type XslChoice,
} from '@/lib/xsl/params';

interface Props {
  tei: Document;
  baseUrl: string;
  choice: XslChoice;
  vertical: boolean;
  focusId?: string | null;
  onSelect?: (id: string) => void;
  onDirectionChange?: (dir: 'v' | 'h') => void;
}

export default function XslViewPane({
  tei,
  baseUrl,
  choice,
  vertical,
  focusId = null,
  onSelect,
  onDirectionChange,
}: Props) {
  const t = useTranslations('Xsl');
  const { resolvedTheme } = useTheme();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; html: string } | { status: 'error' }>({
    status: 'loading',
  });

  const xmlText = useMemo(() => new XMLSerializer().serializeToString(tei), [tei]);
  const effectiveId = useMemo(
    () => (choice.kind === 'auto' ? defaultXslId(xmlText) : choice.kind === 'catalog' ? choice.id : null),
    [choice, xmlText],
  );
  const isReadingView = effectiveId === 'reading';

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const absBaseUrl = new URL(baseUrl, window.location.href).href;
        const sefPath = sefLocation(choice, xmlText, withBasePath);
        if (!sefPath) {
          if (!cancelled) setState({ status: 'error' });
          return;
        }
        const sefUrl = new URL(sefPath, window.location.href).href;
        const docClone = tei.cloneNode(true) as Document;
        absolutizeGraphics(docClone, absBaseUrl);
        addZonePageBreaks(docClone);
        const rawHtml = await transformTei(sefUrl, docClone);
        if (cancelled) return;
        const assetsBase = new URL(withBasePath('/xsl-assets/'), window.location.href).href;
        setState({ status: 'ready', html: injectBase(rawHtml, assetsBase) });
      } catch {
        if (!cancelled) setState({ status: 'error' });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [tei, xmlText, baseUrl, choice]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'awase:focus' && typeof e.data.id === 'string') {
        onSelect?.(e.data.id);
      } else if (e.data.type === 'awase:dir' && (e.data.dir === 'v' || e.data.dir === 'h')) {
        onDirectionChange?.(e.data.dir);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onSelect, onDirectionChange]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'awase:focus', id: focusId }, '*');
  }, [focusId]);

  useEffect(() => {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.postMessage({ type: 'awase:dir', dir: vertical ? 'v' : 'h' }, '*');
  }, [vertical]);

  const frameSrcDoc = useMemo(() => {
    if (state.status !== 'ready') return '';
    return setFrameHtmlAttrs(state.html, {
      dark: resolvedTheme === 'dark',
      vertical: isReadingView && vertical,
    });
  }, [state, resolvedTheme, isReadingView, vertical]);

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center p-4 text-sm text-[var(--ds-fg-muted)]" data-testid="text-pane">
        {t('loading')}
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <p role="alert" className="p-4 text-sm text-[var(--ds-fg)]" data-testid="text-pane">
        {t('errorTransform')}
      </p>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden rounded border border-[var(--ds-border)] bg-[var(--ds-surface)]" data-testid="text-pane">
      <iframe
        ref={iframeRef}
        data-testid="xsl-frame"
        title={t('frameTitle')}
        sandbox="allow-scripts allow-popups"
        srcDoc={frameSrcDoc}
        onLoad={() => {
          if (focusId) {
            iframeRef.current?.contentWindow?.postMessage({ type: 'awase:focus', id: focusId }, '*');
          }
        }}
        className="h-full w-full border-0"
      />
    </div>
  );
}
