import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  MoreVertical,
  PlusCircle,
  CheckCircle2,
  Edit2,
  Trash2,
  Flame,
  ArrowRight,
  Sparkles,
} from 'lucide-react';
import { TaskItem, TASK_STATUS_CONFIG, PROGRESS_TYPE_CONFIG } from '../types';
import { useTaskContext } from '../context/TaskContext';
import { getTodayString, getRelativeTimeString } from '../utils/date';

interface TaskCardProps {
  task: TaskItem;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onDragStart }) => {
  const {
    openCheckInModal,
    openTaskModal,
    deleteTask,
    moveTaskStatus,
    getLatestLogForTask,
    getLogsForTask,
    getLog,
    selectedTag,
    setSelectedTag,
    requestConfirm,
    showToast,
  } = useTaskContext();

  const [menuOpen, setMenuOpen] = useState(false);

  const todayStr = getTodayString();
  const latestLog = getLatestLogForTask(task.id);
  const todayLog = getLog(task.id, todayStr);
  const allLogs = getLogsForTask(task.id);

  // Count active progress days
  const progressCount = allLogs.filter((l) => l.progressType === 'progress' || l.progressType === 'completed').length;
  const isInProgress = task.status === 'in_progress';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, task.id)}
      className="group relative bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/90 dark:border-zinc-800 shadow-xs hover:shadow-md transition-all hover:border-blue-400/50 dark:hover:border-blue-500/40 select-none cursor-grab active:cursor-grabbing overflow-hidden"
    >
      {/* Top Bar with Tags & Actions Menu */}
      <div className="p-3.5 pb-2.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          {/* Tags list */}
          <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
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
                  className={`text-[11px] px-2 py-0.5 rounded-md font-medium transition-all ${
                    isPrimary
                      ? 'bg-blue-50 text-blue-700 border border-blue-200/80 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900'
                      : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 hover:bg-zinc-200/80'
                  } ${isFiltered ? 'ring-2 ring-blue-500 ring-offset-1' : ''}`}
                  title={isPrimary ? `主标签：${tag}` : tag}
                >
                  {tag}
                </button>
              );
            })}
          </div>

          {/* More actions menu */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(!menuOpen);
              }}
              className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-20"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                  }}
                />
                <div className="absolute right-0 top-6 w-36 bg-white dark:bg-zinc-800 rounded-xl shadow-xl border border-zinc-200 dark:border-zinc-700 py-1.5 z-30 text-xs text-zinc-700 dark:text-zinc-200 animate-in fade-in zoom-in-95 duration-100">
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

        {/* Task Title */}
        <h4
          onClick={() => openTaskModal(task)}
          className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors line-clamp-2 cursor-pointer leading-snug"
        >
          {task.title}
        </h4>

        {/* Latest Check-in Info */}
        <div className="mt-2.5 pt-2.5 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
          <div className="flex items-center gap-1.5 text-[11px]">
            <Clock className="w-3 h-3 text-zinc-400" />
            <span className="truncate max-w-[130px]">
              {latestLog ? getRelativeTimeString(latestLog.date) : '暂无打卡记录'}
            </span>
          </div>

          {progressCount > 0 && (
            <div
              className="flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 rounded"
              title={`累计推进打卡 ${progressCount} 天`}
            >
              <Flame className="w-3 h-3 text-amber-500 fill-amber-500" />
              <span>{progressCount}天</span>
            </div>
          )}
        </div>

        {/* Latest Log Note preview if available */}
        {latestLog && latestLog.note && (
          <div className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 p-1.5 rounded-md line-clamp-1 italic">
            "{latestLog.note}"
          </div>
        )}
      </div>

      {/* Prominent Check-in Button on "In Progress" Cards */}
      {isInProgress && (
        <div className="px-3 pb-3 pt-1">
          {todayLog ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openCheckInModal(task, todayStr);
              }}
              className={`w-full py-1.5 px-2.5 rounded-lg text-xs font-medium flex items-center justify-between gap-1.5 transition-all border shadow-2xs cursor-pointer ${
                PROGRESS_TYPE_CONFIG[todayLog.progressType].lightBg
              } hover:opacity-90`}
              title={`今日已打卡：${PROGRESS_TYPE_CONFIG[todayLog.progressType].label}（点击修改）`}
            >
              <div className="flex items-center gap-1.5 min-w-0 flex-1 overflow-hidden">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-semibold whitespace-nowrap text-zinc-900 dark:text-zinc-100">已打卡</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 dark:bg-white/10 text-zinc-600 dark:text-zinc-300 truncate font-normal">
                  {PROGRESS_TYPE_CONFIG[todayLog.progressType].label}
                </span>
              </div>
              <span className="text-[11px] font-normal text-zinc-500 dark:text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 underline shrink-0 ml-1">
                修改
              </span>
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openCheckInModal(task, todayStr);
              }}
              className="w-full py-2 px-3 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.99] flex items-center justify-center gap-1.5 shadow-xs hover:shadow-sm transition-all cursor-pointer whitespace-nowrap"
            >
              <PlusCircle className="w-3.5 h-3.5 shrink-0" />
              <span>今日打卡</span>
            </button>
          )}
        </div>
      )}

      {/* For Non-in_progress tasks, show a subtle quick check-in trigger on hover */}
      {!isInProgress && (
        <div className="px-3.5 pb-2.5 pt-0 flex justify-end">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openCheckInModal(task, todayStr);
            }}
            className="text-[11px] text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors py-0.5"
          >
            <span>补打卡 / 记日志</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      )}
    </div>
  );
};
