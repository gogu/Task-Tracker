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

    let delayedSyncTimer: number | undefined;
    const syncViewportHeight = () => {
      const innerH = window.innerHeight;
      const vvH = window.visualViewport?.height ?? innerH;
      const keyboardOpen = innerH - vvH > 120;
      setIsKeyboardOpen(keyboardOpen);
      if (keyboardOpen && vvH > 0) {
        document.documentElement.style.setProperty('--app-height', `${Math.round(vvH)}px`);
      } else {
        document.documentElement.style.removeProperty('--app-height');
      }
    };

    const scheduleSync = () => {
      syncViewportHeight();
      window.clearTimeout(delayedSyncTimer);
      // iPadOS Chrome/Safari may finish toolbar or orientation transitions ~120ms after the event
      delayedSyncTimer = window.setTimeout(syncViewportHeight, 120);
    };

    syncViewportHeight();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', scheduleSync);
    vv?.addEventListener('scroll', syncViewportHeight);
    window.addEventListener('resize', scheduleSync);
    window.addEventListener('orientationchange', scheduleSync);
    window.addEventListener('focus', scheduleSync);
    window.addEventListener('pageshow', scheduleSync);
    document.addEventListener('visibilitychange', scheduleSync);

    return () => {
      window.clearTimeout(delayedSyncTimer);
      standaloneMedia?.removeEventListener?.('change', handleStandaloneChange);
      vv?.removeEventListener('resize', scheduleSync);
      vv?.removeEventListener('scroll', syncViewportHeight);
      window.removeEventListener('resize', scheduleSync);
      window.removeEventListener('orientationchange', scheduleSync);
      window.removeEventListener('focus', scheduleSync);
      window.removeEventListener('pageshow', scheduleSync);
      document.removeEventListener('visibilitychange', scheduleSync);
      document.documentElement.classList.remove('overflow-hidden');
      document.body.classList.remove('overflow-hidden');
      document.documentElement.style.removeProperty('--app-height');
    };
  }, []);

  return (
    <div
      className="fixed inset-x-0 top-0 w-full max-w-[100vw] overflow-hidden bg-[#120c08] text-amber-50 flex flex-col antialiased"
      style={
        isKeyboardOpen
          ? { height: 'var(--app-height, 100dvh)', maxHeight: 'var(--app-height, 100dvh)' }
          : { bottom: 0 }
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
