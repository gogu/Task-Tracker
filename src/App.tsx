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
    return () => {
      document.documentElement.classList.remove('overflow-hidden');
      document.body.classList.remove('overflow-hidden');
    };
  }, []);

  return (
    <div className="h-screen h-dvh w-full max-w-[100vw] overflow-hidden bg-[#120c08] text-amber-50 flex flex-col antialiased">
      <main className="max-w-[1440px] w-full h-full mx-auto p-1.5 sm:p-3 flex flex-col min-w-0 min-h-0 overflow-hidden">
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
