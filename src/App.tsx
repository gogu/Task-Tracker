/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TaskProvider, useTaskContext } from './context/TaskContext';
import { Header } from './components/Header';
import { KanbanView } from './components/KanbanView';
import { GanttView } from './components/GanttView';
import { QuickCheckInModal } from './components/QuickCheckInModal';
import { TaskModal } from './components/TaskModal';
import { DriveSyncModal } from './components/DriveSyncModal';
import { ConfirmModal } from './components/ConfirmModal';
import { Toast } from './components/Toast';
import { TaskDetailDrawer } from './components/TaskDetailDrawer';

const AppContent: React.FC = () => {
  const { viewMode } = useTaskContext();

  return (
    <div className="min-h-screen bg-zinc-100/60 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col antialiased">
      <div className="max-w-7xl w-full mx-auto p-3 sm:p-5 md:p-6 space-y-4 flex-1 flex flex-col">
        {/* Top Header & Navigation */}
        <Header />

        {/* Dynamic View Body */}
        <main className="flex-1">
          {viewMode === 'kanban' ? <KanbanView /> : <GanttView />}
        </main>
      </div>

      {/* Global Modals & Notifications */}
      <QuickCheckInModal />
      <TaskModal />
      <DriveSyncModal />
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
