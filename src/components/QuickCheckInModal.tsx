import React, { useState, useEffect, useRef } from 'react';
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
  Coffee,
  Plus,
} from 'lucide-react';
import { useTaskContext } from '../context/TaskContext';
import { DurationStepperInput } from './DurationStepperInput';
import { ProgressType, PROGRESS_TYPE_CONFIG } from '../types';
import {
  getTodayString,
  addDays,
  getWeekdayChinese,
  diffInDays,
  formatHours,
} from '../utils/date';
import { extractLogWorkIntervals } from '../utils/timeDistribution';

export const QuickCheckInModal: React.FC = () => {
  const {
    checkInModalTask,
    checkInModalDate,
    closeCheckInModal,
    addOrUpdateLog,
    deleteWorkSession,
    deleteLog,
    getLog,
    getTaskTotalHours,
    showToast,
    setPendingRestPrompt,
  } = useTaskContext();

  const task = checkInModalTask;
  const initialDate = checkInModalDate || getTodayString();

  const [selectedDate, setSelectedDate] = useState<string>(initialDate);
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [progressType, setProgressType] = useState<ProgressType>('progress');
  const [note, setNote] = useState<string>('');
  const [hours, setHours] = useState<string>('');
  const [restMinutes, setRestMinutes] = useState<string>('');
  const [isBackfill, setIsBackfill] = useState<boolean>(false);
  const [markAsCompleted, setMarkAsCompleted] = useState<boolean>(false);
  const [existingLogId, setExistingLogId] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const lastModalInitKeyRef = useRef<string>('');

  const todayStr = getTodayString();

  // Synchronize selectedDate when checkInModalDate or checkInModalTask changes
  useEffect(() => {
    lastModalInitKeyRef.current = '';
    if (checkInModalDate) {
      setSelectedDate(checkInModalDate);
    } else {
      setSelectedDate(getTodayString());
    }
  }, [checkInModalDate, checkInModalTask]);

  const applyModeToForm = (targetMode: 'append' | 'replace', existing: ReturnType<typeof getLog>, taskStatus?: string) => {
    setMode(targetMode);
    setRestMinutes('');
    if (existing && targetMode === 'replace') {
      setProgressType(existing.progressType);
      setNote(existing.note || '');
      setHours(
        typeof existing.hours === 'number' && !isNaN(existing.hours)
          ? String(existing.hours)
          : ''
      );
      setIsBackfill(
        Boolean(
          existing.isBackfill ||
            (existing.workSessions?.length === 1 && existing.workSessions[0].isBackfill)
        )
      );
      setMarkAsCompleted(existing.progressType === 'completed' || taskStatus === 'done');
    } else {
      setProgressType('progress');
      setNote('');
      setHours('');
      setIsBackfill(false);
      setMarkAsCompleted(false);
    }
  };

  // Load existing log for the selected date
  useEffect(() => {
    isSubmittingRef.current = false;
    if (!task) {
      lastModalInitKeyRef.current = '';
      return;
    }
    if (selectedDate) {
      const existing = getLog(task.id, selectedDate);
      setExistingLogId(existing ? existing.id : null);
      const initKey = `${task.id}:${selectedDate}`;
      if (lastModalInitKeyRef.current !== initKey) {
        lastModalInitKeyRef.current = initKey;
        const defaultMode: 'append' | 'replace' =
          existing && selectedDate === todayStr ? 'append' : 'replace';
        applyModeToForm(defaultMode, existing, task.status);
      }
    }
  }, [task, selectedDate, todayStr, getLog]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!task) return;
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const effectiveType = markAsCompleted ? 'completed' : progressType;
    const parsedHours = hours.trim() !== '' ? parseFloat(hours) : undefined;
    const validHours = parsedHours !== undefined && !isNaN(parsedHours) ? parsedHours : undefined;
    const parsedRest = restMinutes.trim() !== '' ? parseInt(restMinutes, 10) : undefined;
    const validRest = parsedRest !== undefined && !isNaN(parsedRest) && parsedRest > 0 ? parsedRest : undefined;
    const isCompleted = markAsCompleted || effectiveType === 'completed';
    const submitMode: 'append' | 'replace' = existingLogId ? mode : 'replace';

    const savedLog = addOrUpdateLog({
      taskId: task.id,
      date: selectedDate,
      progressType: effectiveType,
      hours: validHours,
      note: note.trim(),
      isBackfill,
      markTaskAsCompleted: isCompleted,
      mode: submitMode,
      restMinutes: validRest,
    });

    const latestSession = savedLog.workSessions?.[savedLog.workSessions.length - 1];

    showToast(
      existingLogId
        ? submitMode === 'append'
          ? `已为「${task.title}」${selectedDate} 追加一条新记录`
          : `已更新「${task.title}」${selectedDate} 的打卡详情`
        : `已为「${task.title}」添加 ${selectedDate} 打卡记录`,
      'success',
      true
    );

    if (
      selectedDate === todayStr &&
      !isBackfill &&
      effectiveType !== 'rest' &&
      validHours !== undefined &&
      validHours > 0.3 &&
      !validRest
    ) {
      setPendingRestPrompt({
        taskId: task.id,
        taskTitle: task.title,
        date: selectedDate,
        hours: validHours,
        wasCompleted: isCompleted,
        sessionId: latestSession?.id,
      });
    }

    closeCheckInModal();
  };

  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  useEffect(() => {
    if (!task) return;

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleSubmitRef.current();
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => window.removeEventListener('keydown', handleWindowKeyDown);
  }, [task]);

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

  const handleFormKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleSubmit();
    }
  };

  const handleDelete = () => {
    if (existingLogId) {
      deleteLog(existingLogId);
      showToast(`已清空 ${selectedDate} 的打卡记录`, 'info', true);
      closeCheckInModal();
    }
  };

  return (
    <AnimatePresence>
      <div
        className="guild-modal-overlay z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ duration: 0.16 }}
          className="w-full max-w-lg guild-modal-shell rounded-2xl shadow-2xl overflow-hidden overflow-x-hidden flex flex-col max-h-full"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-amber-800/20 dark:border-amber-700/30 flex items-start justify-between guild-modal-header shrink-0">
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
          <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="p-5 space-y-4 overflow-y-auto flex-1">
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

            {/* Current Log Overview Card (查看当前详情 & 模式切换) */}
            {currentLog ? (
              <div className="p-3.5 rounded-xl border border-blue-200/80 dark:border-blue-900/60 bg-blue-50/40 dark:bg-blue-950/20 space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-500" />
                    <span>该日已登记记录</span>
                  </span>
                  <div className="inline-flex items-center p-0.5 rounded-lg bg-white/80 dark:bg-zinc-900 border border-blue-200/70 dark:border-blue-800/60 text-[11px]">
                    <button
                      type="button"
                      onClick={() => applyModeToForm('append', currentLog, task.status)}
                      className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                        mode === 'append'
                          ? 'bg-amber-600 text-white'
                          : 'text-zinc-600 dark:text-zinc-300 hover:text-amber-600'
                      }`}
                    >
                      <Plus className="w-3 h-3" />
                      <span>追加新记录</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => applyModeToForm('replace', currentLog, task.status)}
                      className={`px-2 py-0.5 rounded-md font-bold transition-colors cursor-pointer ${
                        mode === 'replace'
                          ? 'bg-amber-600 text-white'
                          : 'text-zinc-600 dark:text-zinc-300 hover:text-amber-600'
                      }`}
                    >
                      修改当日汇总
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
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
                  {typeof currentLog.hours === 'number' && currentLog.hours > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-sky-700 dark:text-sky-300 font-semibold bg-sky-50 dark:bg-sky-950/60 px-2.5 py-1 rounded-lg border border-sky-200 dark:border-sky-800">
                      <Clock className="w-3.5 h-3.5 text-sky-500" />
                      <span>当日合计 {formatHours(currentLog.hours)}</span>
                    </span>
                  )}
                  {getTaskTotalHours(task.id, selectedDate) > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400 font-medium bg-zinc-100 dark:bg-zinc-800/80 px-2 py-1 rounded-lg">
                      <span>截至该日累计: {formatHours(getTaskTotalHours(task.id, selectedDate))}</span>
                    </span>
                  )}
                </div>

                {(() => {
                  const daySessions = extractLogWorkIntervals(currentLog);
                  if (daySessions.length === 0) {
                    return currentLog.note ? (
                      <div className="p-2.5 rounded-lg bg-white dark:bg-zinc-800/80 border border-zinc-200/60 dark:border-zinc-700/60 text-xs text-zinc-700 dark:text-zinc-200 leading-relaxed break-words">
                        <span className="font-medium text-zinc-500 dark:text-zinc-400 mr-1.5">
                          打卡备注:
                        </span>
                        {currentLog.note}
                      </div>
                    ) : (
                      <div className="text-[11px] text-zinc-400 italic">
                        暂无文字备注，可在下方追加或修改
                      </div>
                    );
                  }
                  return (
                    <div className="space-y-1.5">
                      {daySessions.map((iv, sIdx) => (
                        <div
                          key={iv.id}
                          className="px-2.5 py-1.5 rounded-lg bg-white/90 dark:bg-zinc-800/80 border border-zinc-200/70 dark:border-zinc-700/60 flex items-center justify-between gap-2 text-[11px]"
                        >
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
                                #{sIdx + 1}
                              </span>
                              <span
                                className={`font-mono ${
                                  iv.isBackfill
                                    ? 'text-amber-700 dark:text-amber-300'
                                    : 'text-sky-700 dark:text-sky-300'
                                }`}
                              >
                                {iv.isBackfill ? '🏷️ 补标（不计时段）' : `${iv.startTime}-${iv.endTime}`}
                              </span>
                              <span className="font-mono font-bold text-blue-600 dark:text-blue-300">
                                {formatHours(iv.hours)}
                              </span>
                              {iv.restSessions.map((rs) => (
                                <span
                                  key={rs.id}
                                  className="font-mono px-1.5 py-0.2 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/60"
                                >
                                  ☕ 休{rs.durationMinutes}m
                                </span>
                              ))}
                            </div>
                            {iv.note && (
                              <div className="text-zinc-600 dark:text-zinc-300 truncate">
                                {iv.note}
                              </div>
                            )}
                          </div>
                          {!iv.isEstimated && (
                            <button
                              type="button"
                              onClick={() => deleteWorkSession(task.id, selectedDate, iv.id)}
                              className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 cursor-pointer shrink-0"
                              title="删除该条分段记录"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
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
                {currentLog
                  ? mode === 'append'
                    ? '选择本次追加记录状态'
                    : '修改当日汇总状态'
                  : '选择打卡状态'}
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

            {/* Hours input field */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  本次投入时长 (单位：h)
                </label>
                {task && (
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    截至该日累计：
                    <span className="font-semibold text-blue-600 dark:text-blue-400 ml-1">
                      {formatHours(getTaskTotalHours(task.id, selectedDate))}
                    </span>
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <DurationStepperInput
                  value={hours}
                  onChange={setHours}
                  step={0.1}
                  min={0}
                  max={24}
                  unit="h"
                  placeholder="例如 1.5"
                  accent="blue"
                  variant="modal"
                  className="w-40 sm:w-44 shrink-0"
                  ariaLabel="本次投入时长（小时）"
                />

                {/* Quick hour presets */}
                <div className="flex items-center gap-1 flex-wrap">
                  {[0.5, 1.0, 1.5, 2.0, 3.0].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setHours(String(preset))}
                      className={`px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                        hours === String(preset)
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-800 font-semibold shadow-xs'
                          : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700/60'
                      }`}
                    >
                      {preset.toFixed(1)}h
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Independent Rest Minutes Input (Optional) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  <Coffee className="w-3.5 h-3.5 text-emerald-500" />
                  <span>本次休息时长 (分钟，可选)</span>
                </label>
                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                  留空且当日&gt;0.3h时自动呼出表盘
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <DurationStepperInput
                  value={restMinutes}
                  onChange={setRestMinutes}
                  step={1}
                  min={0}
                  max={240}
                  unit="分钟"
                  placeholder="如 5"
                  accent="emerald"
                  variant="modal"
                  className="w-40 sm:w-44 shrink-0"
                  ariaLabel="本次休息时长（分钟）"
                />
                <div className="flex items-center gap-1 flex-wrap">
                  {[5, 10, 15, 20].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => setRestMinutes((prev) => (prev === String(mins) ? '' : String(mins)))}
                      className={`px-2 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                        restMinutes === String(mins)
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border-emerald-300 dark:border-emerald-800 font-semibold shadow-xs'
                          : 'bg-zinc-50 dark:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-700/60'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
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

            {/* Checkboxes: Backfill & Mark as completed */}
            <div className="pt-0.5 space-y-2.5">
              <label className="flex items-start gap-2.5 cursor-pointer select-none group">
                <input
                  type="checkbox"
                  checked={isBackfill}
                  onChange={(e) => setIsBackfill(e.target.checked)}
                  className="mt-0.5 rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
                />
                <div className="text-xs">
                  <span className="font-medium text-zinc-800 dark:text-zinc-200 group-hover:text-amber-600 transition-colors">
                    补标记录（计入时长但不统计时段）
                  </span>
                  <p className="text-zinc-400 dark:text-zinc-500 text-[11px] mt-0.5">
                    用于事后补录时长：会正常累加至当日与任务总时长，但不纳入 24 小时时段分布与常驻时段分析。
                  </p>
                </div>
              </label>

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
                  title="按 Ctrl + Enter 快速提交"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 active:scale-[0.98] rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {existingLogId ? (mode === 'append' ? '追加记录' : '保存修改') : '保存打卡'}
                  </span>
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

