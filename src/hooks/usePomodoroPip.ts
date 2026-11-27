import { useCallback, useEffect, useRef, useState } from 'react';

export interface DocumentPictureInPictureOptions {
  width?: number;
  height?: number;
  disallowReturnToOpener?: boolean;
}

export interface DocumentPictureInPictureApi {
  requestWindow(options?: DocumentPictureInPictureOptions): Promise<Window>;
  readonly window: Window | null;
}

function getDocumentPipApi(): DocumentPictureInPictureApi | null {
  if (typeof window === 'undefined') return null;
  const pip = (window as Window & { documentPictureInPicture?: DocumentPictureInPictureApi })
    .documentPictureInPicture;
  if (!pip || typeof pip.requestWindow !== 'function') return null;
  return pip;
}

/** Check whether the current browser supports Document Picture-in-Picture. */
export function isDocumentPipSupported(): boolean {
  return getDocumentPipApi() !== null;
}

function copyDocumentStyles(sourceDoc: Document, targetDoc: Document): void {
  targetDoc.documentElement.lang = sourceDoc.documentElement.lang || 'zh-CN';

  const colorSchemeMeta = sourceDoc.head.querySelector('meta[name="color-scheme"]');
  if (colorSchemeMeta) {
    targetDoc.head.appendChild(colorSchemeMeta.cloneNode(true));
  }

  const styleNodes = sourceDoc.head.querySelectorAll('style, link[rel="stylesheet"]');
  styleNodes.forEach((node) => {
    if (node.tagName === 'STYLE') {
      const styleEl = targetDoc.createElement('style');
      styleEl.textContent = node.textContent;
      targetDoc.head.appendChild(styleEl);
      return;
    }

    if (node.tagName === 'LINK') {
      const linkEl = node as HTMLLinkElement;
      const rawHref = linkEl.getAttribute('href');
      if (!rawHref) return;
      const cloned = targetDoc.createElement('link');
      cloned.rel = 'stylesheet';
      try {
        cloned.href = new URL(rawHref, sourceDoc.baseURI).href;
      } catch {
        cloned.href = linkEl.href || rawHref;
      }
      if (linkEl.media) cloned.media = linkEl.media;
      targetDoc.head.appendChild(cloned);
    }
  });

  const baseStyle = targetDoc.createElement('style');
  baseStyle.textContent = `
    html, body {
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background-color: #120c08;
    }
  `;
  targetDoc.head.appendChild(baseStyle);
}

export interface UsePomodoroPipOptions {
  width?: number;
  height?: number;
  onUnsupported?: () => void;
  onOpen?: () => void;
  onClose?: () => void;
}

/** Manage an always-on-top Document Picture-in-Picture window for the Pomodoro clock. */
export function usePomodoroPip({
  width = 240,
  height = 220,
  onUnsupported,
  onOpen,
  onClose,
}: UsePomodoroPipOptions = {}) {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [pipContainer, setPipContainer] = useState<HTMLElement | null>(null);
  const pipWindowRef = useRef<Window | null>(null);

  const onUnsupportedRef = useRef(onUnsupported);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  onUnsupportedRef.current = onUnsupported;
  onOpenRef.current = onOpen;
  onCloseRef.current = onClose;

  const isSupported = isDocumentPipSupported();

  const clearPipState = useCallback(() => {
    pipWindowRef.current = null;
    setPipWindow(null);
    setPipContainer(null);
  }, []);

  const closePip = useCallback(() => {
    const win = pipWindowRef.current;
    clearPipState();
    if (win && !win.closed) {
      try {
        win.close();
      } catch {
        // Ignore close errors
      }
    }
  }, [clearPipState]);

  const openPip = useCallback((options?: { silent?: boolean }) => {
    const api = getDocumentPipApi();
    if (!api) {
      if (!options?.silent) {
        onUnsupportedRef.current?.();
      }
      return;
    }

    const existing = pipWindowRef.current;
    if (existing && !existing.closed) {
      try {
        existing.focus();
      } catch {
        // Ignore focus errors
      }
      return;
    }

    // Call requestWindow synchronously inside user gesture without preceding await
    api
      .requestWindow({ width, height })
      .then((win) => {
        if (win.closed) return;

        copyDocumentStyles(document, win.document);

        const rootEl = win.document.createElement('div');
        rootEl.id = 'pomodoro-pip-root';
        rootEl.style.width = '100%';
        rootEl.style.height = '100%';
        win.document.body.appendChild(rootEl);

        pipWindowRef.current = win;
        setPipWindow(win);
        setPipContainer(rootEl);
        onOpenRef.current?.();

        const handlePageHide = () => {
          if (pipWindowRef.current === win) {
            clearPipState();
            onCloseRef.current?.();
          }
        };
        win.addEventListener('pagehide', handlePageHide, { once: true });
      })
      .catch(() => {
        // Gracefully ignore user cancellation or browser denial
      });
  }, [width, height, clearPipState]);

  const togglePip = useCallback(() => {
    const existing = pipWindowRef.current;
    if (existing && !existing.closed) {
      closePip();
    } else {
      openPip();
    }
  }, [closePip, openPip]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const win = pipWindowRef.current;
      if (win && !win.closed) {
        try {
          win.close();
        } catch {
          // Ignore close errors
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      handleBeforeUnload();
    };
  }, []);

  return {
    isSupported,
    isPipOpen: Boolean(pipWindow && pipContainer && !pipWindow.closed),
    pipWindow,
    pipContainer,
    openPip,
    closePip,
    togglePip,
  };
}
