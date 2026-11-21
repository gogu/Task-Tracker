/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { TaskProvider } from './context/TaskContext';
import { KanbanView } from './components/KanbanView';
import { QuickCheckInModal } from './components/QuickCheckInModal';
import { TaskModal } from './components/TaskModal';
import { DriveSyncModal } from './components/DriveSyncModal';
import { LocalSyncModal } from './components/LocalSyncModal';
import { ConfirmModal } from './components/ConfirmModal';
import { Toast } from './components/Toast';

const AppContent: React.FC = () => {
  useEffect(() => {
    document.documentElement.classList.add('overflow-hidden');
    document.body.classList.add('overflow-hidden');

    let delayedSyncTimer: number | undefined;
    const syncViewportHeight = () => {
      const vh = window.visualViewport?.height ?? window.innerHeight;
      if (vh > 0) {
        document.documentElement.style.setProperty('--app-height', `${Math.round(vh)}px`);
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
      className="w-full max-w-[100vw] overflow-hidden bg-[#120c08] text-amber-50 flex flex-col antialiased"
      style={{
        height: 'var(--app-height, 100dvh)',
        maxHeight: 'var(--app-height, 100dvh)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <main className="max-w-[1440px] w-full h-full mx-auto p-1 sm:p-2 xl:p-3 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <KanbanView />
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
