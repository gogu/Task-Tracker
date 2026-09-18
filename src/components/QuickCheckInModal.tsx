import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  X,
  Trash2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Sparkles,
  Info,
} from 'lucide-react';
import { useTaskContext } from '../context/TaskContext';
import { ProgressType, PROGRESS_TYPE_CONFIG } from '../types';
import {
  getTodayString,
  getYesterdayString,
  addDays,
  getWeekdayChinese,
  diffInDays,
} from '../utils/date';

export const QuickCheckInModal: React.FC = () => {
  const {
    checkInModalTask,
    checkInModalDate,
    closeCheckInModal,
    addOrUpdateLog,
    deleteLog,
    getLog,
    showToast,
  } = useTaskContext();

  const task = checkInModalTask;
  const initialDate = checkInModalDate || getTodayString();

  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [progressType, setProgressType] = useState<ProgressType>('progress');
  const [note, setNote] = useState<string>('');
  const [markAsCompleted, setMarkAsCompleted] = useState<boolean>(false);
  const [existingLogId, setExistingLogId] = useState<string | null>(null);

  const todayStr = getTodayString();
  const yesterdayStr = getYesterdayString();

  // Synchronize selectedDate when checkInModalDate or checkInModalTask changes
  useEffect(() => {
    if (checkInModalDate) {
      setSelectedDate(checkInModalDate);
    } else {
      setSelectedDate(getTodayString());
    }
  }, [checkInModalDate, checkInModalTask]);

  // Load existing log for the selected date
  useEffect(() => {
    if (task && selectedDate) {
      const existing = getLog(task.id, selectedDate);
      if (existing) {
        setProgressType(existing.progressType);
        setNote(existing.note || '');
        setExistingLogId(existing.id);
        setMarkAsCompleted(existing.progressType === 'completed' || task.status === 'done');
      } else {
        setProgressType('progress');
        setNote('');
        setExistingLogId(null);
        setMarkAsCompleted(false);
      }
    }
  }, [task, selectedDate, getLog]);

  if (!task) return null;

  const currentLog = selectedDate ? getLog(task.id, selectedDate) : undefined;

  // Relative day description
  const dayDiff = diffInDays(selectedDate, todayStr);
  let relativeDayLabel = '';
  if (dayDiff === 0) relativeDayLabel = '今天';
  else if (dayDiff === 1) relativeDayLabel = '昨天';
  else if (dayDiff === 2) relativeDayLabel = '前天';
  else if (dayDiff > 2) relativeDayLabel = `${dayDiff} 天前`;
  else if (dayDiff === -1) relativeDayLabel = '明天';
  else relativeDayLabel = `${Math.abs(dayDiff)} 天后`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveType = markAsCompleted ? 'completed' : progressType;

    addOrUpdateLog({
      taskId: task.id,
      date: selectedDate,
      progressType: effectiveType,
      note: note.trim(),
      markTaskAsCompleted: markAsCompleted || effectiveType === 'completed',
    });

    showToast(
      existingLogId
        ? `已更新「${task.title}」${selectedDate} 的打卡详情`
        : `已为「${task.title}」添加 ${selectedDate} 打卡记录`,
      'success'
    );
    closeCheckInModal();
  };

  const handleDelete = () => {
    if (existingLogId) {
      deleteLog(existingLogId);
      showToast(`已清空 ${selectedDate} 的打卡记录`, 'info');
      closeCheckInModal();
    }
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
        onClick={closeCheckInModal}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.16 }}
          className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-start justify-between bg-zinc-50/70 dark:bg-zinc-900/70 shrink-0">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold">
                <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>甘特方格 · {currentLog ? '详情与修改' : '录入打卡'}</span>
                </span>
                {currentLog ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                    已记录
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
                    待打卡
                  </span>
                )}
              </div>
              <h3 className="mt-1 text-base font-bold text-zinc-900 dark:text-zinc-100 line-clamp-1">
                {task.title}
              </h3>
              <div className="flex items-center gap-1.5 mt-1">
                {task.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-medium"
                  >
                    #{t}
                  </span>
                ))}
              </div>
            </div>
            <button
              onClick={closeCheckInModal}
              className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Body with scroll */}
          <form onSubmit={handleSubmit} className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Date Navigator Bar */}
            <div className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-blue-500" />
                  <span>当前方格日期</span>
                </span>
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-900/60">
                  {selectedDate} · {getWeekdayChinese(selectedDate)} ({relativeDayLabel})
                </span>
              </div>

              <div className="flex items-center gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => setSelectedDate(addDays(selectedDate, -1))}
                  className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  title="查看上一天"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">前一天</span>
                </button>

                <div className="relative flex-1">
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-medium bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-center"
                    required
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedDate(addDays(selectedDate, 1))}
                  className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 text-xs flex items-center gap-1 transition-colors cursor-pointer"
                  title="查看后一天"
                >
                  <span className="hidden sm:inline">后一天</span>
                  <ChevronRight className="w-4 h-4" />
                </button>

                {selectedDate !== todayStr && (
                  <button
                    type="button"
                    onClick={() => setSelectedDate(todayStr)}
                    className="px-2.5 py-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors cursor-pointer border border-blue-200 dark:border-blue-900/60"
                  >
                    回到今天
                  </button>
                )}
              </div>
            </div>

            {/* Current Log Overview Card (查看当前详情) */}
            {currentLog ? (
              <div className="p-3.5 rounded-xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-500" />
                    <span>该方格当前已存详情</span>
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    {currentLog.createdAt
                      ? `登记于 ${new Date(currentLog.createdAt).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : '已记录'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                      PROGRESS_TYPE_CONFIG[currentLog.progressType].lightBg
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        PROGRESS_TYPE_CONFIG[currentLog.progressType].dotBg
                      }`}
                    />
                    <span>{PROGRESS_TYPE_CONFIG[currentLog.progressType].label}</span>
                  </span>
                  {currentLog.progressType === 'completed' && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>标志通关完成</span>
                    </span>
                  )}
                </div>

                {currentLog.note ? (
                  <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/60 text-xs text-zinc-700 dark:text-zinc-200 leading-relaxed break-words">
                    <span className="font-medium text-zinc-500 dark:text-zinc-400 mr-1.5">
                      打卡备注:
                    </span>
                    {currentLog.note}
                  </div>
                ) : (
                  <div className="text-[11px] text-zinc-400 italic">
                    暂无文字备注，可在下方直接修改补充
                  </div>
                )}
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-zinc-50/60 dark:bg-zinc-800/30 border border-dashed border-zinc-200 dark:border-zinc-800 text-center py-3.5">
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  当前日期暂无推进打卡记录，直接在下方选择状态并保存即可点亮甘特图。
                </p>
              </div>
            )}

            {/* Progress Type options (修改/选择状态) */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">
                {currentLog ? '修改方格状态' : '选择打卡状态'}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['progress', 'rest', 'completed'] as ProgressType[]).map((type) => {
                  const cfg = PROGRESS_TYPE_CONFIG[type];
                  const isSelected = progressType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setProgressType(type);
                        if (type === 'completed') {
                          setMarkAsCompleted(true);
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all relative cursor-pointer ${
                        isSelected
                          ? `${cfg.lightBg} ring-2 ring-blue-500/30 shadow-xs font-medium`
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/40 dark:bg-zinc-800/40 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`w-2.5 h-2.5 rounded-full ${cfg.dotBg}`} />
                        <span className="text-xs font-semibold">{cfg.label}</span>
                      </div>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-tight">
                        {type === 'progress' && '实质推进投入'}
                        {type === 'rest' && '暂停或休息'}
                        {type === 'completed' && '通关/完结归档'}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Note text field (修改/填入心得备注) */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                进度心得与日志备注 (可选)
              </label>
              <textarea
                rows={2}
                placeholder="记录今日心得或微观进展（如：打过黑神话第三章、读完50-80页、跑步5公里...）"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none leading-relaxed"
              />
            </div>

            {/* Checkbox: Mark as completed */}
            <div className="pt-0.5">
              <label className="flex items-start gap-2.5 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={markAsCompleted || progressType === 'completed'}
                  onChange={(e) => {
                    setMarkAsCompleted(e.target.checked);
                    if (e.target.checked && progressType !== 'completed') {
                      setProgressType('completed');
                    }
                  }}
                  className="mt-0.5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="text-xs">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-blue-600 transition-colors">
                    同时标记此任务为「已通关/完成」
                  </span>
                  <p className="text-zinc-400 dark:text-zinc-500 text-[11px] mt-0.5">
                    勾选后卡片将自动移至「已完成」泳道，并记录归档完成日期。
                  </p>
                </div>
              </label>
            </div>

            {/* Footer Buttons */}
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-3">
              {existingLogId ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-xl transition-colors cursor-pointer border border-rose-200/70 dark:border-rose-900/60"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>清空该日方格记录</span>
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeCheckInModal}
                  className="px-3.5 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{existingLogId ? '保存修改' : '保存打卡'}</span>
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

