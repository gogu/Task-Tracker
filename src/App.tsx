/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { TaskProvider } from './context/TaskContext';
import { KanbanView } from './components/KanbanView';
import { QuickCheckInModal } from './components/QuickCheckInModal';
import { TaskModal } from './components/TaskModal';
import { DriveSyncModal } from './components/DriveSyncModal';
import { LocalSyncModal } from './components/LocalSyncModal';
import { ConfirmModal } from './components/ConfirmModal';
import { Toast } from './components/Toast';

const detectStandalonePwa = (): boolean => {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );
};

const NON_TEXT_INPUT_TYPES = new Set([
  'checkbox',
  'radio',
  'button',
  'submit',
  'reset',
  'file',
  'range',
  'color',
  'hidden',
]);

const isEditableElement = (el: EventTarget | null): el is HTMLElement => {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type?.toLowerCase() ?? 'text';
    return !NON_TEXT_INPUT_TYPES.has(type);
  }
  return false;
};

const AppContent: React.FC = () => {
  const [isStandalonePwa, setIsStandalonePwa] = useState<boolean>(detectStandalonePwa);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);

  useEffect(() => {
    document.documentElement.classList.add('overflow-hidden');
    document.body.classList.add('overflow-hidden');

    const standaloneMedia =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(display-mode: standalone)')
        : null;
    const handleStandaloneChange = () => {
      setIsStandalonePwa(detectStandalonePwa());
    };
    standaloneMedia?.addEventListener?.('change', handleStandaloneChange);

    let rafId = 0;
    let shortSyncTimer: number | undefined;
    let longSyncTimer: number | undefined;
    let wasKeyboardOpen = false;
    let pendingScrollIntoView = false;

    const syncViewportHeight = () => {
      const innerH = window.innerHeight;
      const vv = window.visualViewport;
      const vvH = vv?.height ?? innerH;
      const vvTop = vv?.offsetTop ?? 0;
      const keyboardOpen = innerH - vvH > 120;
      setIsKeyboardOpen(keyboardOpen);

      if (keyboardOpen && vvH > 0) {
        document.documentElement.style.setProperty('--app-height', `${Math.round(vvH)}px`);
        document.documentElement.style.setProperty(
          '--app-offset-top',
          `${Math.max(0, Math.round(vvTop))}px`
        );

        if ((!wasKeyboardOpen || pendingScrollIntoView) && isEditableElement(document.activeElement)) {
          const activeEl = document.activeElement;
          pendingScrollIntoView = false;
          window.requestAnimationFrame(() => {
            if (document.activeElement === activeEl) {
              activeEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
          });
        }
      } else {
        document.documentElement.style.removeProperty('--app-height');
        document.documentElement.style.removeProperty('--app-offset-top');
        pendingScrollIntoView = false;
        if (window.scrollY !== 0 || window.scrollX !== 0) {
          window.scrollTo(0, 0);
        }
      }

      wasKeyboardOpen = keyboardOpen;
    };

    const syncViaRaf = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        syncViewportHeight();
      });
    };

    const scheduleSync = () => {
      syncViaRaf();
      window.clearTimeout(shortSyncTimer);
      window.clearTimeout(longSyncTimer);
      // iOS/iPadOS keyboard animation finishes ~250-350ms after focus/resize events
      shortSyncTimer = window.setTimeout(syncViewportHeight, 150);
      longSyncTimer = window.setTimeout(syncViewportHeight, 350);
    };

    const handleFocusIn = (e: FocusEvent) => {
      if (!isEditableElement(e.target)) return;
      pendingScrollIntoView = true;
      scheduleSync();
    };

    const handleFocusOut = () => {
      scheduleSync();
    };

    syncViewportHeight();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', scheduleSync);
    vv?.addEventListener('scroll', syncViaRaf);
    window.addEventListener('focusin', handleFocusIn);
    window.addEventListener('focusout', handleFocusOut);
    window.addEventListener('resize', scheduleSync);
    window.addEventListener('orientationchange', scheduleSync);
    window.addEventListener('focus', scheduleSync);
    window.addEventListener('pageshow', scheduleSync);
    document.addEventListener('visibilitychange', scheduleSync);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.clearTimeout(shortSyncTimer);
      window.clearTimeout(longSyncTimer);
      standaloneMedia?.removeEventListener?.('change', handleStandaloneChange);
      vv?.removeEventListener('resize', scheduleSync);
      vv?.removeEventListener('scroll', syncViaRaf);
      window.removeEventListener('focusin', handleFocusIn);
      window.removeEventListener('focusout', handleFocusOut);
      window.removeEventListener('resize', scheduleSync);
      window.removeEventListener('orientationchange', scheduleSync);
      window.removeEventListener('focus', scheduleSync);
      window.removeEventListener('pageshow', scheduleSync);
      document.removeEventListener('visibilitychange', scheduleSync);
      document.documentElement.classList.remove('overflow-hidden');
      document.body.classList.remove('overflow-hidden');
      document.documentElement.style.removeProperty('--app-height');
      document.documentElement.style.removeProperty('--app-offset-top');
    };
  }, []);

  return (
    <div
      className="fixed inset-x-0 w-full max-w-[100vw] overflow-hidden bg-[#120c08] text-amber-50 flex flex-col antialiased"
      style={
        isKeyboardOpen
          ? {
              top: 'var(--app-offset-top, 0px)',
              height: 'var(--app-height, 100dvh)',
              maxHeight: 'var(--app-height, 100dvh)',
            }
          : { top: 0, bottom: 0 }
      }
    >
      <main
        className={
          isStandalonePwa
            ? 'w-full h-full flex flex-col min-w-0 min-h-0 overflow-hidden'
            : 'w-full h-full mx-auto flex flex-col min-w-0 min-h-0 overflow-hidden xl:max-w-[1440px] xl:p-3'
        }
      >
        <KanbanView isStandalonePwa={isStandalonePwa} />
      </main>

      {/* Global Modals & Notifications */}
      <QuickCheckInModal />
      <TaskModal />
      <DriveSyncModal />
      <LocalSyncModal />
      <ConfirmModal />
      <Toast />
    </div>
  );
};

export default function App() {
  return (
    <TaskProvider>
      <AppContent />
    </TaskProvider>
  );
}
