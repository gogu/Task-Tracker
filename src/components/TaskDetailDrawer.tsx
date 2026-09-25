import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Calendar,
  Flame,
  CheckCircle2,
  Clock,
  PlusCircle,
  Edit2,
  Tag,
} from 'lucide-react';
import { useTaskContext } from '../context/TaskContext';
import { TASK_STATUS_CONFIG, PROGRESS_TYPE_CONFIG } from '../types';
import { getWeekdayChinese, diffInDays, getTodayString } from '../utils/date';

export const TaskDetailDrawer: React.FC = () => {
  const {
    taskDetailTaskId,
    closeTaskDetail,
    tasks,
    getLogsForTask,
    openCheckInModal,
    openTaskModal,
  } = useTaskContext();

  const todayStr = getTodayString();

  const task = useMemo(
    () => (taskDetailTaskId ? tasks.find((t) => t.id === taskDetailTaskId) ?? null : null),
    [tasks, taskDetailTaskId]
  );

  // Sorted descending (newest first = at top), oldest at bottom
  const logs = useMemo(() => {
    if (!task) return [];
    return getLogsForTask(task.id);
  }, [task, getLogsForTask]);

  const progressCount = useMemo(
    () => logs.filter((l) => l.progressType === 'progress' || l.progressType === 'completed').length,
    [logs]
  );

  const durationDays = useMemo(() => {
    if (!task?.startDate) return null;
    const endDate = task.completedDate || todayStr;
    return diffInDays(task.startDate, endDate) + 1;
  }, [task, todayStr]);

  const statusConfig = task ? TASK_STATUS_CONFIG[task.status] : null;
  const isOpen = !!task;

  return (
    <AnimatePresence>
      {isOpen && task && (
        <>
          {/* Backdrop — semi-transparent, clicking closes the drawer */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px]"
            onClick={closeTaskDetail}
          />

          {/* Right-side Drawer */}
          <motion.aside
            key="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="fixed right-0 top-0 h-full w-[400px] max-w-[92vw] z-50 bg-white dark:bg-zinc-900 border-l border-zinc-200 dark:border-zinc-800 shadow-2xl flex flex-col"
          >
            {/* ── Header ── */}
            <div className="px-5 pt-5 pb-4 border-b border-zinc-100 dark:border-zinc-800 shrink-0 space-y-3">
              {/* Title row */}
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {/* Status + Tags */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    {statusConfig && (
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-md font-semibold ${statusConfig.badgeBg}`}
                      >
                        {statusConfig.label}
                      </span>
                    )}
                    {task.tags.map((tag, i) => (
                      <span
                        key={tag}
                        className={`inline-flex items-center gap-0.5 text-[11px] px-1.5 py-0.5 rounded font-medium ${
                          i === 0
                            ? 'bg-blue-50 text-blue-700 border border-blue-200/80 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-900'
                            : 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}
                      >
                        {i > 0 && <Tag className="w-2.5 h-2.5 opacity-60" />}
                        {tag}
                      </span>
                    ))}
                  </div>
                  {/* Title */}
                  <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
                    {task.title}
                  </h2>
                </div>

                {/* Close button */}
                <button
                  type="button"
                  onClick={closeTaskDetail}
                  className="shrink-0 mt-0.5 p-1.5 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                  aria-label="关闭"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-4 text-xs text-zinc-500 dark:text-zinc-400 flex-wrap">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 shrink-0" />
                  <span>{task.startDate ?? '未开始'}</span>
                </span>
                {task.completedDate && (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    <span>{task.completedDate}</span>
                  </span>
                )}
                {durationDays !== null && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 shrink-0" />
                    <span>跨度 {durationDays} 天</span>
                  </span>
                )}
                {progressCount > 0 && (
                  <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                    <Flame className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                    <span>推进 {progressCount} 天</span>
                  </span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    closeTaskDetail();
                    openCheckInModal(task, todayStr);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] rounded-lg transition-all"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  今日打卡
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeTaskDetail();
                    openTaskModal(task);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 active:scale-[0.98] rounded-lg transition-all"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  编辑任务
                </button>
              </div>
            </div>

            {/* ── Timeline ── */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              {logs.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                    <Calendar className="w-5 h-5 text-zinc-400" />
                  </div>
                  <p className="text-sm text-zinc-400 dark:text-zinc-500">暂无打卡记录</p>
                  <button
                    type="button"
                    onClick={() => {
                      closeTaskDetail();
                      openCheckInModal(task, todayStr);
                    }}
                    className="text-blue-600 dark:text-blue-400 text-xs font-medium hover:underline"
                  >
                    立即打第一卡 →
                  </button>
                </div>
              ) : (
                <div>
                  {/* "最新" marker at top */}
                  <div className="flex items-center gap-2 mb-5">
                    <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest select-none">
                      ▲ 最新
                    </span>
                    <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums">
                      {logs.length} 条记录
                    </span>
                  </div>

                  {/* Log entries — newest first (index 0) at top, oldest at bottom */}
                  <div className="flex flex-col">
                    {logs.map((log, idx) => {
                      const config = PROGRESS_TYPE_CONFIG[log.progressType];
                      const isLast = idx === logs.length - 1;

                      return (
                        <div key={log.id} className="flex gap-3.5">
                          {/* Timeline spine: dot + vertical line */}
                          <div className="flex flex-col items-center shrink-0 w-4">
                            <div
                              className={`w-2.5 h-2.5 rounded-full shrink-0 mt-[5px] ring-2 ring-white dark:ring-zinc-900 ${config.dotBg}`}
                            />
                            {!isLast && (
                              <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-700 mt-1" />
                            )}
                          </div>

                          {/* Entry content */}
                          <div className={`flex-1 min-w-0 ${isLast ? 'pb-2' : 'pb-5'}`}>
                            {/* Date + weekday + type badge */}
                            <div className="flex items-center gap-2 flex-wrap mb-1.5">
                              <span className="text-[12px] font-mono font-semibold text-zinc-700 dark:text-zinc-300 tabular-nums">
                                {log.date}
                              </span>
                              <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                                {getWeekdayChinese(log.date)}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold border ${config.lightBg}`}
                              >
                                {config.label}
                              </span>
                            </div>

                            {/* Note block — only shown when note exists */}
                            {log.note && (
                              <div className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-100 dark:border-zinc-700/60 rounded-lg px-3 py-2 leading-relaxed italic">
                                {log.note}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* "最早" marker at bottom */}
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex-1 h-px bg-zinc-200 dark:bg-zinc-700" />
                    <span className="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest select-none">
                      ▼ 最早
                    </span>
                  </div>
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
};
