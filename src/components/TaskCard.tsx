import React, { useState } from 'react';
import { MoreVertical, Edit2, Trash2, Flame } from 'lucide-react';
import { TaskItem, TASK_STATUS_CONFIG } from '../types';
import { useTaskContext } from '../context/TaskContext';
import { getRelativeTimeString } from '../utils/date';

interface TaskCardProps {
  task: TaskItem;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragEnd?: (taskId: string) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onDragStart, onDragOver, onDragEnd }) => {
  const {
    openTaskModal,
    deleteTask,
    moveTaskStatus,
    getLatestLogForTask,
    getLogsForTask,
    selectedTag,
    setSelectedTag,
    requestConfirm,
    showToast,
  } = useTaskContext();

  const [menuOpen, setMenuOpen] = useState(false);

  const latestLog = getLatestLogForTask(task.id);
  const allLogs = getLogsForTask(task.id);
  const progressCount = allLogs.filter(
    (l) => l.progressType === 'progress' || l.progressType === 'completed'
  ).length;

  const statusConfig = TASK_STATUS_CONFIG[task.status];

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      onDragOver={onDragOver}
      onDragEnd={() => onDragEnd?.(task.id)}
      className="group relative bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200/90 dark:border-zinc-800 hover:border-blue-400/50 dark:hover:border-blue-500/40 hover:shadow-sm transition-all select-none cursor-grab active:cursor-grabbing"
    >
      <div className="px-3 py-2 flex flex-col gap-1">

        {/* Row 1: status dot · title · flame count · menu */}
        <div className="flex items-center gap-2 min-w-0">
          {/* Status dot */}
          <div className={`w-2 h-2 rounded-full shrink-0 ${statusConfig.dotColor}`} />

          {/* Title — click to edit */}
          <h4
            onClick={(e) => {
              e.stopPropagation();
              openTaskModal(task);
            }}
            className="flex-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors leading-tight"
          >
            {task.title}
          </h4>

          {/* Flame badge */}
          {progressCount > 0 && (
            <span
              className="flex items-center gap-0.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400 shrink-0"
              title={`累计推进 ${progressCount} 天`}
            >
              <Flame className="w-3 h-3 fill-amber-500 text-amber-500" />
              {progressCount}
            </span>
          )}

          {/* ··· menu — only visible on hover */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="p-0.5 text-zinc-300 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-300 rounded transition-colors opacity-0 group-hover:opacity-100"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {menuOpen && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-20"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                  }}
                />
                {/* Dropdown */}
                <div className="absolute right-0 top-5 w-36 bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 py-1.5 z-30 text-xs text-zinc-700 dark:text-zinc-200 animate-in fade-in zoom-in-95 duration-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      openTaskModal(task);
                    }}
                    className="w-full px-3 py-1.5 text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-700/70"
                  >
                    <Edit2 className="w-3.5 h-3.5 text-zinc-400" />
                    <span>编辑任务</span>
                  </button>

                  <div className="my-1 border-t border-zinc-100 dark:border-zinc-700" />

                  <div className="px-3 py-1 text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                    移至泳道
                  </div>
                  {(['backlog', 'in_progress', 'done', 'paused'] as const).map((s) => {
                    if (s === task.status) return null;
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuOpen(false);
                          moveTaskStatus(task.id, s);
                        }}
                        className="w-full px-3 py-1 text-left flex items-center gap-2 hover:bg-zinc-100 dark:hover:bg-zinc-700/70 text-[11px]"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${TASK_STATUS_CONFIG[s].dotColor}`} />
                        <span>{TASK_STATUS_CONFIG[s].label}</span>
                      </button>
                    );
                  })}

                  <div className="my-1 border-t border-zinc-100 dark:border-zinc-700" />

                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      setMenuOpen(false);
                      const confirmed = await requestConfirm({
                        title: '删除任务',
                        message: `确定要删除「${task.title}」及其所有打卡记录吗？此操作无法撤销。`,
                        confirmText: '确认删除',
                        cancelText: '取消',
                        variant: 'danger',
                      });
                      if (confirmed) {
                        deleteTask(task.id);
                        showToast(`已删除任务「${task.title}」`, 'info');
                      }
                    }}
                    className="w-full px-3 py-1.5 text-left flex items-center gap-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>删除任务</span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Row 2: all tags · relative check-in time */}
        <div className="flex items-center gap-1 pl-4 min-w-0 flex-wrap">
          {task.tags.map((tag, idx) => {
            const isPrimary = idx === 0;
            const isFiltered = selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTag(isFiltered ? null : tag);
                }}
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium transition-all leading-none ${
                  isPrimary
                    ? 'bg-blue-50 text-blue-700 border border-blue-200/80 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900'
                    : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                } ${isFiltered ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                title={isPrimary ? `主标签：${tag}` : tag}
              >
                {tag}
              </button>
            );
          })}

          {latestLog && (
            <span className="ml-auto shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500">
              {getRelativeTimeString(latestLog.date)}
            </span>
          )}
        </div>

      </div>
    </div>
  );
};
