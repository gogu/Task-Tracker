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
  Coffee,
} from 'lucide-react';
import { useTaskContext } from '../context/TaskContext';
import { TASK_STATUS_CONFIG, PROGRESS_TYPE_CONFIG } from '../types';
import { getWeekdayChinese, diffInDays, getTodayString, formatHours } from '../utils/date';
import {
  computeTaskTimeAndRestProfile,
  formatRestDuration,
  extractLogWorkIntervals,
} from '../utils/timeDistribution';

export const TaskDetailDrawer: React.FC = () => {
  const {
    taskDetailTaskId,
    closeTaskDetail,
    tasks,
    getLogsForTask,
    getTaskTotalHours,
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

  const totalHours = useMemo(() => {
    if (!task) return 0;
    return getTaskTotalHours(task.id);
  }, [task, getTaskTotalHours]);

  const durationDays = useMemo(() => {
    if (!task?.startDate) return null;
    const endDate = task.completedDate || todayStr;
    return diffInDays(task.startDate, endDate) + 1;
  }, [task, todayStr]);

  const timeAndRestProfile = useMemo(
    () => computeTaskTimeAndRestProfile(logs),
    [logs]
  );

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
            className="absolute inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
            onClick={closeTaskDetail}
          />

          {/* Right-side Drawer (scoped inside main view area) */}
          <motion.aside
            key="drawer"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 280 }}
            className="absolute right-0 top-0 h-full w-[420px] max-w-[92%] z-50 select-text guild-modal-shell border-l border-amber-800/30 dark:border-amber-700/40 shadow-2xl flex flex-col overflow-x-hidden"
          >
            {/* ── Header ── */}
            <div className="px-5 pt-5 pb-4 border-b border-amber-800/20 dark:border-amber-700/30 guild-modal-header shrink-0 space-y-3">
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
                {totalHours > 0 && (
                  <span className="flex items-center gap-1 text-sky-600 dark:text-sky-400 font-medium">
                    <Clock className="w-3.5 h-3.5 shrink-0 text-sky-500" />
                    <span>累计 {formatHours(totalHours)}</span>
                  </span>
                )}
                {progressCount > 0 && (
                  <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                    <Flame className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                    <span>推进 {progressCount} 天</span>
                  </span>
                )}
                {timeAndRestProfile.totalRestMinutes > 0 && (
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                    <Coffee className="w-3.5 h-3.5 shrink-0" />
                    <span>累计休息 {formatRestDuration(timeAndRestProfile.totalRestMinutes)}</span>
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
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 active:scale-[0.98] rounded-lg transition-all cursor-pointer"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  {logs.some((l) => l.date === todayStr) ? '追加今日记录' : '今日打卡'}
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
                  {/* Frequent Time-of-Day & Post-Work Rest Summary */}
                  <div className="mb-5 p-3.5 rounded-xl guild-card border space-y-3">
                    {/* Frequent Time Periods */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span>经常进行的时间段</span>
                        </span>
                        {timeAndRestProfile.peakWindowLabel && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/30">
                            常驻 {timeAndRestProfile.peakWindowLabel}
                          </span>
                        )}
                      </div>

                      {timeAndRestProfile.frequentPeriods.length > 0 ? (
                        <div className="space-y-1.5">
                          {timeAndRestProfile.frequentPeriods.slice(0, 3).map((fp) => (
                            <div key={fp.id} className="space-y-0.5">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-semibold text-stone-700 dark:text-amber-100">
                                  {fp.icon} {fp.label} ({fp.rangeLabel})
                                </span>
                                <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
                                  {formatHours(fp.workHours)} · {fp.workSharePct.toFixed(0)}%
                                </span>
                              </div>
                              <div className="h-1.5 w-full rounded-full bg-amber-900/10 dark:bg-black/35 overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-amber-500"
                                  style={{ width: `${Math.max(6, fp.workSharePct)}%` }}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                          暂无带时长的时间段统计
                        </p>
                      )}
                    </div>

                    {/* Post-Work Rest Situation */}
                    <div className="pt-2.5 border-t border-amber-800/15 dark:border-white/10 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-extrabold text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                          <Coffee className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                          <span>事后休息情况</span>
                        </span>
                        {timeAndRestProfile.totalRestCount > 0 && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30">
                            {timeAndRestProfile.totalRestCount} 次 ·{' '}
                            {formatRestDuration(timeAndRestProfile.totalRestMinutes)}
                          </span>
                        )}
                      </div>

                      {timeAndRestProfile.totalRestCount > 0 ? (
                        <div className="space-y-1.5">
                          <div className="text-[11px] text-stone-600 dark:text-stone-300 flex items-center gap-3">
                            <span>
                              累计总时长：
                              <strong className="text-emerald-700 dark:text-emerald-300">
                                {formatRestDuration(timeAndRestProfile.totalRestMinutes)}
                              </strong>
                            </span>
                            <span>
                              平均每次：<strong>{timeAndRestProfile.avgRestMinutes} 分钟</strong>
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {timeAndRestProfile.recentRestSessions.slice(0, 4).map((rs) => (
                              <span
                                key={rs.id}
                                className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60"
                              >
                                {rs.date.slice(5)} {rs.startTime}-{rs.endTime} ({rs.durationMinutes}m)
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                          暂无事后休息记录（当日打卡超过 0.3h 时看板娘会自动发起休息确认）
                        </p>
                      )}
                    </div>
                  </div>

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
                              {typeof log.hours === 'number' && log.hours > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800">
                                  投入 {formatHours(log.hours)}
                                </span>
                              )}
                              {getTaskTotalHours(task.id, log.date) > 0 && (
                                <span
                                  className="text-[10px] px-1.5 py-0.5 rounded-md font-medium text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/60"
                                  title={`截至 ${log.date} 累计投入 ${formatHours(getTaskTotalHours(task.id, log.date))}`}
                                >
                                  截至当日累计 {formatHours(getTaskTotalHours(task.id, log.date))}
                                </span>
                              )}
                            </div>

                            {/* Work & Post-Work Rest Time Windows / Per-Session Breakdown */}
                            {(() => {
                              const intervals = extractLogWorkIntervals(log);
                              const restSessions = log.restSessions || [];
                              if (intervals.length > 1) {
                                return (
                                  <div className="space-y-1.5 mt-1">
                                    {intervals.map((iv, sIdx) => {
                                      const sCfg = iv.progressType
                                        ? PROGRESS_TYPE_CONFIG[iv.progressType]
                                        : config;
                                      return (
                                        <div
                                          key={iv.id}
                                          className="p-2.5 rounded-lg bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-200/70 dark:border-zinc-700/60 space-y-1"
                                        >
                                          <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
                                            <span className="font-mono font-extrabold text-amber-700 dark:text-amber-300">
                                              #{sIdx + 1} {sIdx > 0 ? '追加' : ''}
                                            </span>
                                            <span
                                              className={`px-1.5 py-0.2 rounded font-semibold border ${sCfg.lightBg}`}
                                            >
                                              {sCfg.label}
                                            </span>
                                            <span
                                              className={`font-mono px-1.5 py-0.2 rounded border ${
                                                iv.isBackfill
                                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200/70 dark:border-amber-800/70'
                                                  : 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200/70 dark:border-sky-800/70'
                                              }`}
                                            >
                                              {iv.isBackfill ? '🏷️ 补标（不计时段）' : `🕒 ${iv.startTime}-${iv.endTime}`}
                                            </span>
                                            {iv.hours > 0 && (
                                              <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
                                                投入 {formatHours(iv.hours)}
                                              </span>
                                            )}
                                            {iv.restSessions.map((rs) => (
                                              <span
                                                key={rs.id}
                                                className="font-mono px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/70"
                                              >
                                                ☕ 休 {rs.startTime}-{rs.endTime} ({rs.durationMinutes}分钟)
                                              </span>
                                            ))}
                                          </div>
                                          {iv.note && (
                                            <div className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed italic">
                                              {iv.note}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                );
                              }

                              return (
                                <>
                                  {(intervals.length > 0 || restSessions.length > 0) && (
                                    <div className="flex flex-wrap gap-1.5 mb-1.5">
                                      {intervals.map((iv) => (
                                        <span
                                          key={iv.id}
                                          className={`inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border ${
                                            iv.isBackfill
                                              ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200/70 dark:border-amber-800/70'
                                              : 'bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border-sky-200/70 dark:border-sky-800/70'
                                          }`}
                                          title={
                                            iv.isBackfill
                                              ? '补标记录：计入时长但不纳入时段统计'
                                              : iv.isEstimated
                                                ? '根据历史打卡时间推算的进行时段'
                                                : '记录的实际进行时段'
                                          }
                                        >
                                          {iv.isBackfill ? '🏷️ 补标（不计时段）' : `🕒 ${iv.startTime}-${iv.endTime}`}
                                        </span>
                                      ))}
                                      {restSessions.map((rs) => (
                                        <span
                                          key={rs.id}
                                          className="inline-flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/70"
                                        >
                                          ☕ 事后休息 {rs.startTime}-{rs.endTime} ({rs.durationMinutes}分钟)
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  {/* Note block — only shown when note exists */}
                                  {log.note && (
                                    <div className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/70 border border-zinc-100 dark:border-zinc-700/60 rounded-lg px-3 py-2 leading-relaxed italic">
                                      {log.note}
                                    </div>
                                  )}
                                </>
                              );
                            })()}
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
