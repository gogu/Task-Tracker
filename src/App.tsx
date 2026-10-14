/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect } from 'react';
import { TaskProvider, useTaskContext } from './context/TaskContext';
import { Header } from './components/Header';
import { KanbanView } from './components/KanbanView';
import { GanttView } from './components/GanttView';
import { QuickCheckInModal } from './components/QuickCheckInModal';
import { TaskModal } from './components/TaskModal';
import { DriveSyncModal } from './components/DriveSyncModal';
import { LocalSyncModal } from './components/LocalSyncModal';
import { ConfirmModal } from './components/ConfirmModal';
import { Toast } from './components/Toast';
import { TaskDetailDrawer } from './components/TaskDetailDrawer';

const AppContent: React.FC = () => {
  const { viewMode } = useTaskContext();
  const headerWrapperRef = useRef<HTMLDivElement>(null);

  // Prevent global page scrollbar when in Gantt view (Gantt has its own internal scrolling grid)
  useEffect(() => {
    if (viewMode === 'gantt') {
      document.documentElement.classList.add('overflow-hidden');
      document.body.classList.add('overflow-hidden');
    } else {
      document.documentElement.classList.remove('overflow-hidden');
      document.body.classList.remove('overflow-hidden');
    }
    return () => {
      document.documentElement.classList.remove('overflow-hidden');
      document.body.classList.remove('overflow-hidden');
    };
  }, [viewMode]);

  useEffect(() => {
    const el = headerWrapperRef.current;
    if (!el) return;

    const updateHeight = () => {
      const height = el.getBoundingClientRect().height;
      document.documentElement.style.setProperty('--app-header-height', `${Math.round(height)}px`);
    };

    updateHeight();

    const ro = new ResizeObserver(() => {
      updateHeight();
    });
    ro.observe(el);

    window.addEventListener('resize', updateHeight);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateHeight);
    };
  }, []);

  const isGantt = viewMode === 'gantt';

  return (
    <div
      className={`bg-zinc-100/60 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col antialiased ${
        isGantt ? 'h-screen h-dvh overflow-hidden' : 'min-h-screen'
      }`}
    >
      <div
        className={`max-w-7xl w-full mx-auto p-3 sm:p-5 md:p-6 flex flex-col min-w-0 ${
          isGantt ? 'h-full flex-1 min-h-0 overflow-hidden' : 'flex-1 space-y-4'
        }`}
      >
        {/* Top Header & Navigation */}
        <div
          ref={headerWrapperRef}
          className={
            isGantt
              ? 'shrink-0 pb-3.5'
              : 'sticky top-0 z-40 bg-zinc-100/90 dark:bg-zinc-950/90 backdrop-blur-md pt-3 sm:pt-5 md:pt-6 -mt-3 sm:-mt-5 md:-mt-6 pb-2'
          }
        >
          <Header />
        </div>

        {/* Dynamic View Body */}
        <main className={`min-w-0 ${isGantt ? 'flex-1 min-h-0 flex flex-col' : 'flex-1'}`}>
          {isGantt ? <GanttView /> : <KanbanView />}
        </main>
      </div>

      {/* Global Modals & Notifications */}
      <QuickCheckInModal />
      <TaskModal />
      <DriveSyncModal />
      <LocalSyncModal />
      <ConfirmModal />
      <TaskDetailDrawer />
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
