import React, { useState } from 'react';
import { Plus, CheckCircle2, PlayCircle, PauseCircle, HelpCircle, Layers } from 'lucide-react';
import { TaskStatus, TASK_STATUS_CONFIG } from '../types';
import { useTaskContext } from '../context/TaskContext';
import { TaskCard } from './TaskCard';

export const KanbanView: React.FC = () => {
  const { filteredTasks, moveTaskStatus, openTaskModal } = useTaskContext();
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [dragOverLane, setDragOverLane] = useState<TaskStatus | null>(null);

  const lanes: { key: TaskStatus; icon: React.ReactNode }[] = [
    { key: 'backlog', icon: <Layers className="w-4 h-4 text-zinc-500" /> },
    { key: 'in_progress', icon: <PlayCircle className="w-4 h-4 text-blue-500" /> },
    { key: 'done', icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" /> },
    { key: 'paused', icon: <PauseCircle className="w-4 h-4 text-amber-500" /> },
  ];

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    setDraggedTaskId(taskId);
  };

  const handleDragOver = (e: React.DragEvent, lane: TaskStatus) => {
    e.preventDefault();
    if (dragOverLane !== lane) {
      setDragOverLane(lane);
    }
  };

  const handleDragLeave = (e: React.DragEvent, lane: TaskStatus) => {
    // Only clear if leaving the lane container
    if (dragOverLane === lane) {
      setDragOverLane(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetLane: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (taskId) {
      moveTaskStatus(taskId, targetLane);
    }
    setDraggedTaskId(null);
    setDragOverLane(null);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start min-h-[calc(100vh-220px)]">
      {lanes.map(({ key, icon }) => {
        const config = TASK_STATUS_CONFIG[key];
        const laneTasks = filteredTasks.filter((t) => t.status === key);
        const isDragTarget = dragOverLane === key;

        return (
          <div
            key={key}
            onDragOver={(e) => handleDragOver(e, key)}
            onDragLeave={(e) => handleDragLeave(e, key)}
            onDrop={(e) => handleDrop(e, key)}
            className={`flex flex-col rounded-2xl border transition-all duration-150 min-h-[480px] bg-zinc-50/70 dark:bg-zinc-900/30 ${
              isDragTarget
                ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/30 dark:bg-blue-950/20'
                : 'border-zinc-200/80 dark:border-zinc-800'
            }`}
          >
            {/* Lane Header */}
            <div className="p-3.5 border-b border-zinc-200/60 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {icon}
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                  {config.label}
                </h3>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  {laneTasks.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => openTaskModal(undefined, key)}
                className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-800 rounded-lg transition-colors"
                title={`在此泳道添加任务`}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Cards Container */}
            <div className="p-3 pb-4 flex-1 flex flex-col gap-3">
              {laneTasks.map((task) => (
                <TaskCard key={task.id} task={task} onDragStart={handleDragStart} />
              ))}

              {laneTasks.length === 0 && (
                <div
                  onClick={() => openTaskModal(undefined, key)}
                  className={`flex-1 min-h-[140px] flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                    isDragTarget
                      ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                    {isDragTarget ? '释放以移至此泳道' : '暂无任务，点击添加'}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
