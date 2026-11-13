import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  Flame,
  PieChart,
  BarChart3,
  Calendar,
  Tag,
  Trophy,
  FileText,
  Edit3,
  ArrowUpRight,
  Sparkles,
  Filter,
  X,
} from 'lucide-react';
import {
  TaskItem,
  DailyLog,
  StatsPeriod,
  TASK_STATUS_CONFIG,
  PROGRESS_TYPE_CONFIG,
} from '../types';
import { useTaskContext } from '../context/TaskContext';
import {
  getTodayString,
  addDays,
  addMonths,
  getWeekRange,
  getMonthRange,
  formatPeriodLabel,
  formatHours,
  getWeekdayChinese,
  isWeekend,
} from '../utils/date';

type ShareDimension = 'task' | 'status' | 'tag';

interface DonutSlice {
  id: string;
  label: string;
  hours: number;
  percentage: number;
  color: string;
  subLabel?: string;
}

const SLICE_PALETTE = [
  '#2563eb', // blue-600
  '#10b981', // emerald-500
  '#8b5cf6', // violet-500
  '#f59e0b', // amber-500
  '#ec4899', // pink-500
  '#06b6d4', // cyan-500
  '#f97316', // orange-500
  '#6366f1', // indigo-500
];

function round1(num: number): number {
  return Math.round(num * 10) / 10;
}

export const StatsView: React.FC = () => {
  const {
    filteredTasks,
    logs,
    selectedTag,
    setSelectedTag,
    searchQuery,
    setSearchQuery,
    openTaskDetail,
    openCheckInModal,
    getTaskTotalHours,
  } = useTaskContext();

  const todayStr = getTodayString();
  const [period, setPeriod] = useState<StatsPeriod>('day');
  const [pivotDate, setPivotDate] = useState<string>(todayStr);
  const [shareDimension, setShareDimension] = useState<ShareDimension>('task');
  const [hoveredSliceId, setHoveredSliceId] = useState<string | null>(null);
  const [selectedDrillDate, setSelectedDrillDate] = useState<string | null>(null);

  // Compute current period date window
  const periodWindow = useMemo(() => {
    if (period === 'day') {
      return {
        startDate: pivotDate,
        endDate: pivotDate,
        dates: [pivotDate],
      };
    }
    if (period === 'week') {
      return getWeekRange(pivotDate);
    }
    return getMonthRange(pivotDate);
  }, [period, pivotDate]);

  const isCurrentPeriodToday = useMemo(() => {
    if (period === 'day') return pivotDate === todayStr;
    return todayStr >= periodWindow.startDate && todayStr <= periodWindow.endDate;
  }, [period, pivotDate, todayStr, periodWindow]);

  // Navigation handlers
  const handlePrev = () => {
    setSelectedDrillDate(null);
    if (period === 'day') {
      setPivotDate((d) => addDays(d, -1));
    } else if (period === 'week') {
      setPivotDate((d) => addDays(d, -7));
    } else {
      setPivotDate((d) => addMonths(d, -1));
    }
  };

  const handleNext = () => {
    setSelectedDrillDate(null);
    if (period === 'day') {
      setPivotDate((d) => addDays(d, 1));
    } else if (period === 'week') {
      setPivotDate((d) => addDays(d, 7));
    } else {
      setPivotDate((d) => addMonths(d, 1));
    }
  };

  const handleResetToday = () => {
    setSelectedDrillDate(null);
    setPivotDate(todayStr);
  };

  // Map of filtered tasks
  const taskMap = useMemo(() => {
    const map = new Map<string, TaskItem>();
    filteredTasks.forEach((t) => map.set(t.id, t));
    return map;
  }, [filteredTasks]);

  // Filter logs belonging to filteredTasks within the period
  const periodLogs = useMemo(() => {
    return logs.filter(
      (l) =>
        taskMap.has(l.taskId) &&
        l.date >= periodWindow.startDate &&
        l.date <= periodWindow.endDate
    );
  }, [logs, taskMap, periodWindow]);

  // Helper to check if a log/task counts as "completed task"
  const isCompletedTaskLog = (log: DailyLog, task?: TaskItem): boolean => {
    if (!task) return log.progressType === 'completed';
    return task.status === 'done' || log.progressType === 'completed';
  };

  // Core period metrics
  const metrics = useMemo(() => {
    let totalHours = 0;
    let completedHours = 0;
    let inProgressHours = 0;
    let pausedOrBacklogHours = 0;
    let progressLogCount = 0;
    const completedTaskIds = new Set<string>();
    const activeDates = new Set<string>();

    periodLogs.forEach((log) => {
      const task = taskMap.get(log.taskId);
      const h = typeof log.hours === 'number' && !isNaN(log.hours) ? log.hours : 0;
      totalHours += h;

      if (h > 0 || log.progressType !== 'rest') {
        activeDates.add(log.date);
      }

      if (log.progressType === 'progress' || log.progressType === 'completed') {
        progressLogCount++;
      }

      if (isCompletedTaskLog(log, task)) {
        completedHours += h;
        completedTaskIds.add(log.taskId);
      } else if (task?.status === 'in_progress') {
        inProgressHours += h;
      } else {
        pausedOrBacklogHours += h;
      }
    });

    // Also include tasks whose completedDate falls in this period
    filteredTasks.forEach((t) => {
      if (
        t.status === 'done' &&
        t.completedDate &&
        t.completedDate >= periodWindow.startDate &&
        t.completedDate <= periodWindow.endDate
      ) {
        completedTaskIds.add(t.id);
      }
    });

    totalHours = round1(totalHours);
    completedHours = round1(completedHours);
    inProgressHours = round1(inProgressHours);
    pausedOrBacklogHours = round1(pausedOrBacklogHours);
    const otherHours = round1(Math.max(0, totalHours - completedHours));

    const completedRatio = totalHours > 0 ? (completedHours / totalHours) * 100 : 0;
    const activeDaysCount = activeDates.size;
    const totalDaysCount = periodWindow.dates.length;
    const avgDailyHours = totalDaysCount > 0 ? round1(totalHours / totalDaysCount) : 0;
    const avgActiveDayHours = activeDaysCount > 0 ? round1(totalHours / activeDaysCount) : 0;

    // For Day view: compare with previous day
    let prevDayDiffHours: number | null = null;
    if (period === 'day') {
      const prevDate = addDays(pivotDate, -1);
      const prevHours = round1(
        logs
          .filter((l) => taskMap.has(l.taskId) && l.date === prevDate)
          .reduce((sum, l) => sum + (typeof l.hours === 'number' && !isNaN(l.hours) ? l.hours : 0), 0)
      );
      prevDayDiffHours = round1(totalHours - prevHours);
    }

    return {
      totalHours,
      completedHours,
      inProgressHours,
      pausedOrBacklogHours,
      otherHours,
      completedRatio,
      progressLogCount,
      totalLogCount: periodLogs.length,
      completedTasksCount: completedTaskIds.size,
      activeDaysCount,
      totalDaysCount,
      avgDailyHours,
      avgActiveDayHours,
      prevDayDiffHours,
    };
  }, [periodLogs, taskMap, filteredTasks, periodWindow, period, pivotDate, logs]);

  // Task breakdown ranking within the period
  const taskBreakdown = useMemo(() => {
    const statsByTask = new Map<
      string,
      {
        task: TaskItem;
        hours: number;
        logCount: number;
        progressCount: number;
        latestNote?: string;
        latestDate: string;
        isCompleted: boolean;
      }
    >();

    periodLogs.forEach((log) => {
      const task = taskMap.get(log.taskId);
      if (!task) return;
      const h = typeof log.hours === 'number' && !isNaN(log.hours) ? log.hours : 0;
      const existing = statsByTask.get(task.id);
      const isComp = isCompletedTaskLog(log, task);

      if (existing) {
        existing.hours = round1(existing.hours + h);
        existing.logCount += 1;
        if (log.progressType === 'progress' || log.progressType === 'completed') {
          existing.progressCount += 1;
        }
        if (log.date >= existing.latestDate) {
          existing.latestDate = log.date;
          if (log.note) existing.latestNote = log.note;
        }
        if (isComp) existing.isCompleted = true;
      } else {
        statsByTask.set(task.id, {
          task,
          hours: round1(h),
          logCount: 1,
          progressCount: log.progressType === 'progress' || log.progressType === 'completed' ? 1 : 0,
          latestNote: log.note,
          latestDate: log.date,
          isCompleted: isComp,
        });
      }
    });

    const list = Array.from(statsByTask.values()).sort((a, b) => {
      if (b.hours !== a.hours) return b.hours - a.hours;
      return b.logCount - a.logCount;
    });

    return list.map((item, idx) => ({
      ...item,
      percentage: metrics.totalHours > 0 ? (item.hours / metrics.totalHours) * 100 : 0,
      color: SLICE_PALETTE[idx % SLICE_PALETTE.length],
    }));
  }, [periodLogs, taskMap, metrics.totalHours]);

  // Daily breakdown for Week / Month bar chart
  const dailySeries = useMemo(() => {
    const mapByDate = new Map<
      string,
      {
        date: string;
        totalHours: number;
        completedHours: number;
        otherHours: number;
        logCount: number;
      }
    >();

    periodWindow.dates.forEach((d) => {
      mapByDate.set(d, {
        date: d,
        totalHours: 0,
        completedHours: 0,
        otherHours: 0,
        logCount: 0,
      });
    });

    periodLogs.forEach((log) => {
      const entry = mapByDate.get(log.date);
      if (!entry) return;
      const task = taskMap.get(log.taskId);
      const h = typeof log.hours === 'number' && !isNaN(log.hours) ? log.hours : 0;
      entry.totalHours = round1(entry.totalHours + h);
      if (isCompletedTaskLog(log, task)) {
        entry.completedHours = round1(entry.completedHours + h);
      } else {
        entry.otherHours = round1(entry.otherHours + h);
      }
      entry.logCount += 1;
    });

    const series = Array.from(mapByDate.values());
    const maxHours = Math.max(...series.map((s) => s.totalHours), 1);
    return { series, maxHours };
  }, [periodWindow.dates, periodLogs, taskMap]);

  // Donut chart slices based on selected shareDimension
  const donutSlices = useMemo<DonutSlice[]>(() => {
    if (metrics.totalHours <= 0) return [];

    if (shareDimension === 'task') {
      const withHours = taskBreakdown.filter((t) => t.hours > 0);
      if (withHours.length <= 7) {
        return withHours.map((item) => ({
          id: item.task.id,
          label: item.task.title,
          hours: item.hours,
          percentage: item.percentage,
          color: item.color,
          subLabel: TASK_STATUS_CONFIG[item.task.status].label,
        }));
      }
      const top6 = withHours.slice(0, 6);
      const restHours = round1(withHours.slice(6).reduce((s, i) => s + i.hours, 0));
      const slices: DonutSlice[] = top6.map((item) => ({
        id: item.task.id,
        label: item.task.title,
        hours: item.hours,
        percentage: item.percentage,
        color: item.color,
        subLabel: TASK_STATUS_CONFIG[item.task.status].label,
      }));
      if (restHours > 0) {
        slices.push({
          id: 'other-tasks',
          label: `其他任务 (${withHours.length - 6} 项)`,
          hours: restHours,
          percentage: (restHours / metrics.totalHours) * 100,
          color: '#94a3b8',
        });
      }
      return slices;
    }

    if (shareDimension === 'status') {
      const items: DonutSlice[] = [];
      if (metrics.completedHours > 0) {
        items.push({
          id: 'status-done',
          label: '已完成 / 通关任务',
          hours: metrics.completedHours,
          percentage: (metrics.completedHours / metrics.totalHours) * 100,
          color: '#10b981', // emerald-500
          subLabel: '已完成状态或达成通关打卡',
        });
      }
      if (metrics.inProgressHours > 0) {
        items.push({
          id: 'status-in-progress',
          label: '进行中任务',
          hours: metrics.inProgressHours,
          percentage: (metrics.inProgressHours / metrics.totalHours) * 100,
          color: '#2563eb', // blue-600
          subLabel: '持续推进中',
        });
      }
      if (metrics.pausedOrBacklogHours > 0) {
        items.push({
          id: 'status-other',
          label: '搁置 / 未开始任务',
          hours: metrics.pausedOrBacklogHours,
          percentage: (metrics.pausedOrBacklogHours / metrics.totalHours) * 100,
          color: '#f59e0b', // amber-500
          subLabel: '暂停或待启动',
        });
      }
      return items;
    }

    // shareDimension === 'tag'
    const tagHoursMap = new Map<string, { hours: number; taskCount: number }>();
    taskBreakdown.forEach((item) => {
      if (item.hours <= 0) return;
      const primaryTag = item.task.tags[0] || '默认/未分类';
      const prev = tagHoursMap.get(primaryTag) || { hours: 0, taskCount: 0 };
      tagHoursMap.set(primaryTag, {
        hours: round1(prev.hours + item.hours),
        taskCount: prev.taskCount + 1,
      });
    });

    return Array.from(tagHoursMap.entries())
      .sort((a, b) => b[1].hours - a[1].hours)
      .map(([tag, info], idx) => ({
        id: `tag-${tag}`,
        label: tag,
        hours: info.hours,
        percentage: (info.hours / metrics.totalHours) * 100,
        color: SLICE_PALETTE[idx % SLICE_PALETTE.length],
        subLabel: `${info.taskCount} 项任务`,
      }));
  }, [shareDimension, taskBreakdown, metrics]);

  // Active target date for the Daily Check-in Detail section
  const activeDetailDate = useMemo(() => {
    if (period === 'day') return pivotDate;
    if (selectedDrillDate && selectedDrillDate >= periodWindow.startDate && selectedDrillDate <= periodWindow.endDate) {
      return selectedDrillDate;
    }
    if (todayStr >= periodWindow.startDate && todayStr <= periodWindow.endDate) {
      return todayStr;
    }
    // Otherwise pick the latest date in the period that has logs, or endDate
    const withLogs = [...dailySeries.series].reverse().find((d) => d.logCount > 0);
    return withLogs ? withLogs.date : periodWindow.endDate;
  }, [period, pivotDate, selectedDrillDate, periodWindow, todayStr, dailySeries]);

  // Logs for activeDetailDate
  const activeDateDetail = useMemo(() => {
    const dayLogs = periodLogs
      .filter((l) => l.date === activeDetailDate)
      .map((log) => {
        const task = taskMap.get(log.taskId)!;
        const hours = typeof log.hours === 'number' && !isNaN(log.hours) ? round1(log.hours) : 0;
        const isComp = isCompletedTaskLog(log, task);
        return { log, task, hours, isComp };
      })
      .sort((a, b) => b.hours - a.hours);

    const dayTotalHours = round1(dayLogs.reduce((s, i) => s + i.hours, 0));
    const dayCompletedHours = round1(
      dayLogs.filter((i) => i.isComp).reduce((s, i) => s + i.hours, 0)
    );
    const dayCompletedRatio = dayTotalHours > 0 ? (dayCompletedHours / dayTotalHours) * 100 : 0;

    return {
      date: activeDetailDate,
      items: dayLogs,
      dayTotalHours,
      dayCompletedHours,
      dayCompletedRatio,
    };
  }, [periodLogs, activeDetailDate, taskMap]);

  const topTask = taskBreakdown[0] || null;
  const hoveredSlice = donutSlices.find((s) => s.id === hoveredSliceId) || null;

  return (
    <div className="space-y-4 pb-6 w-full min-w-0 overflow-x-hidden">
      {/* 1. Top Control Bar: Period Switcher & Date Navigation */}
      <div className="guild-surface border p-3.5 sm:p-4 rounded-2xl shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Left: Period Dimension Switcher (日 / 周 / 月) */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="inline-flex items-center bg-amber-900/10 dark:bg-black/30 p-1 rounded-xl border border-amber-800/20 dark:border-amber-700/30">
            {(
              [
                { key: 'day', label: '日卷宗' },
                { key: 'week', label: '周卷宗' },
                { key: 'month', label: '月卷宗' },
              ] as { key: StatsPeriod; label: string }[]
            ).map((tab) => {
              const active = period === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setPeriod(tab.key);
                    setSelectedDrillDate(null);
                  }}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    active
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-stone-700 dark:text-stone-300 hover:text-amber-950 dark:hover:text-amber-100'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Active Global Filter Pill */}
          {(selectedTag || searchQuery.trim()) && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/60 border border-amber-400/50 dark:border-amber-700/60 text-xs text-amber-900 dark:text-amber-200">
              <Filter className="w-3 h-3 shrink-0" />
              <span>
                已过滤:
                {selectedTag ? ` 标签「${selectedTag}」` : ''}
                {searchQuery.trim() ? ` 搜索「${searchQuery.trim()}」` : ''}
              </span>
              <button
                type="button"
                onClick={() => {
                  setSelectedTag(null);
                  setSearchQuery('');
                }}
                className="ml-0.5 p-0.5 hover:bg-amber-200/70 dark:hover:bg-amber-900 rounded cursor-pointer"
                title="清除筛选条件"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>

        {/* Right: Date Range Navigator */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <div className="flex items-center bg-white/70 dark:bg-black/30 border border-amber-800/20 dark:border-amber-700/35 rounded-xl p-1">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1.5 text-amber-900 dark:text-amber-200 hover:bg-amber-900/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              title={period === 'day' ? '前一天' : period === 'week' ? '上一周' : '上一月'}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="relative px-3 py-1 flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-amber-950 dark:text-amber-100 select-none">
              <Calendar className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>{formatPeriodLabel(period, pivotDate)}</span>
              <input
                type="date"
                value={pivotDate}
                onChange={(e) => {
                  if (e.target.value) {
                    setPivotDate(e.target.value);
                    setSelectedDrillDate(null);
                  }
                }}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                title="点击选择日期"
              />
            </div>

            <button
              type="button"
              onClick={handleNext}
              className="p-1.5 text-amber-900 dark:text-amber-200 hover:bg-amber-900/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              title={period === 'day' ? '后一天' : period === 'week' ? '下一周' : '下一月'}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {!isCurrentPeriodToday && (
            <button
              type="button"
              onClick={handleResetToday}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600 text-white hover:bg-amber-700 shadow-2xs transition-colors cursor-pointer"
            >
              回到今天
            </button>
          )}
        </div>
      </div>

      {/* 2. KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Recorded Time */}
        <div className="guild-card border p-4 rounded-2xl shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900/75 dark:text-amber-200/80">
              {period === 'day' ? '当日冒险投入' : period === 'week' ? '本周累计投入' : '本月累计投入'}
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>

          <div className="my-2 flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-amber-50 tracking-tight">
              {formatHours(metrics.totalHours)}
            </span>
            {period === 'day' && metrics.prevDayDiffHours !== null && (
              <span
                className={`text-xs font-semibold ${
                  metrics.prevDayDiffHours > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : metrics.prevDayDiffHours < 0
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-stone-400'
                }`}
              >
                {metrics.prevDayDiffHours > 0
                  ? `较前日 +${formatHours(metrics.prevDayDiffHours)}`
                  : metrics.prevDayDiffHours < 0
                    ? `较前日 ${formatHours(metrics.prevDayDiffHours)}`
                    : '与前日持平'}
              </span>
            )}
          </div>

          <div className="text-[11px] text-stone-500 dark:text-stone-400 flex items-center justify-between pt-2 border-t border-amber-800/15 dark:border-amber-700/25">
            {period === 'day' ? (
              <>
                <span>涉及委托: <strong className="text-stone-800 dark:text-amber-100">{taskBreakdown.length} 项</strong></span>
                <span>打卡记录: <strong className="text-stone-800 dark:text-amber-100">{metrics.totalLogCount} 条</strong></span>
              </>
            ) : (
              <>
                <span>日均: <strong className="text-stone-800 dark:text-amber-100">{formatHours(metrics.avgDailyHours)}</strong></span>
                <span>活跃日均: <strong className="text-amber-700 dark:text-amber-300">{formatHours(metrics.avgActiveDayHours)}</strong></span>
              </>
            )}
          </div>
        </div>

        {/* Card 2: Completed Task Time Ratio */}
        <div className="guild-card border p-4 rounded-2xl shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900/75 dark:text-amber-200/80">
              已达成委托时长占比
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-300/60 dark:border-emerald-800 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>

          <div className="my-2">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">
                {metrics.completedRatio.toFixed(1)}%
              </span>
              <span className="text-xs font-medium text-stone-500 dark:text-stone-400">
                ({formatHours(metrics.completedHours)} / {formatHours(metrics.totalHours)})
              </span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-amber-900/10 dark:bg-black/40 overflow-hidden flex">
              {metrics.totalHours > 0 ? (
                <>
                  <div
                    className="h-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${metrics.completedRatio}%` }}
                    title={`已达成委托耗时: ${formatHours(metrics.completedHours)}`}
                  />
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${Math.max(0, 100 - metrics.completedRatio)}%` }}
                    title={`攻略中/其他委托耗时: ${formatHours(metrics.otherHours)}`}
                  />
                </>
              ) : (
                <div className="h-full w-full bg-amber-900/10 dark:bg-stone-800" />
              )}
            </div>
          </div>

          <div className="text-[11px] text-stone-500 dark:text-stone-400 flex items-center justify-between pt-2 border-t border-amber-800/15 dark:border-amber-700/25">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
              已达成: <strong className="text-stone-800 dark:text-amber-100">{formatHours(metrics.completedHours)}</strong>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              攻略中: <strong className="text-stone-800 dark:text-amber-100">{formatHours(metrics.otherHours)}</strong>
            </span>
          </div>
        </div>

        {/* Card 3: Top Task Concentration */}
        <div className="guild-card border p-4 rounded-2xl shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900/75 dark:text-amber-200/80">
              头号主打委托占比
            </span>
            <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-400 border border-violet-300/60 dark:border-violet-800 flex items-center justify-center">
              <Trophy className="w-4 h-4" />
            </div>
          </div>

          {topTask && topTask.hours > 0 ? (
            <>
              <div className="my-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-amber-50 tracking-tight">
                    {topTask.percentage.toFixed(1)}%
                  </span>
                  <span className="text-xs font-semibold text-violet-600 dark:text-violet-400">
                    {formatHours(topTask.hours)}
                  </span>
                </div>
                <p
                  onClick={() => openTaskDetail(topTask.task.id)}
                  className="mt-1 text-xs font-bold text-stone-700 dark:text-amber-100 truncate cursor-pointer hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                  title={topTask.task.title}
                >
                  {topTask.task.title}
                </p>
              </div>
              <div className="text-[11px] text-stone-500 dark:text-stone-400 flex items-center justify-between pt-2 border-t border-amber-800/15 dark:border-amber-700/25">
                <span>主分类: <strong className="text-stone-800 dark:text-amber-100">{topTask.task.tags[0] || '未分类'}</strong></span>
                <span>当期打卡: <strong className="text-stone-800 dark:text-amber-100">{topTask.logCount} 次</strong></span>
              </div>
            </>
          ) : (
            <>
              <div className="my-2">
                <span className="text-2xl font-bold text-stone-400 dark:text-stone-600">--</span>
                <p className="mt-1 text-xs text-stone-400">当期尚无记录时长的委托</p>
              </div>
              <div className="text-[11px] text-stone-400 pt-2 border-t border-amber-800/15 dark:border-amber-700/25">
                在打卡汇报中填写小时数即可生成占比
              </div>
            </>
          )}
        </div>

        {/* Card 4: Check-in Activity & Completions */}
        <div className="guild-card border p-4 rounded-2xl shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-amber-900/75 dark:text-amber-200/80">
              有效推进与达成
            </span>
            <div className="w-8 h-8 rounded-xl bg-orange-100 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 border border-orange-300/60 dark:border-orange-800 flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </div>
          </div>

          <div className="my-2 flex items-baseline gap-2 flex-wrap">
            <span className="text-2xl sm:text-3xl font-extrabold text-stone-900 dark:text-amber-50 tracking-tight">
              {metrics.progressLogCount}
              <span className="text-sm font-semibold text-stone-500 dark:text-stone-400 ml-1">次推进</span>
            </span>
            {metrics.completedTasksCount > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-800">
                已达成 {metrics.completedTasksCount} 项
              </span>
            )}
          </div>

          <div className="text-[11px] text-stone-500 dark:text-stone-400 flex items-center justify-between pt-2 border-t border-amber-800/15 dark:border-amber-700/25">
            <span>
              活跃天数:{' '}
              <strong className="text-stone-800 dark:text-amber-100">
                {metrics.activeDaysCount} / {metrics.totalDaysCount} 天
              </strong>
            </span>
            <span>
              推进率:{' '}
              <strong className="text-emerald-600 dark:text-emerald-400">
                {metrics.totalLogCount > 0
                  ? `${Math.round((metrics.progressLogCount / metrics.totalLogCount) * 100)}%`
                  : '0%'}
              </strong>
            </span>
          </div>
        </div>
      </div>

      {/* 3. Time Share Analysis: Donut Chart (Left) + Task Ranking Breakdown (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left: SVG Donut Chart & Dimension Switcher (5 cols) */}
        <div className="lg:col-span-5 guild-card border p-4 sm:p-5 rounded-2xl shadow-xs flex flex-col space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="text-sm font-extrabold text-amber-950 dark:text-amber-100 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>时间占比分布</span>
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                多维度拆解当期记录时间的投入构成
              </p>
            </div>

            {/* Dimension Switcher */}
            <div className="inline-flex items-center bg-amber-900/10 dark:bg-black/30 p-0.5 rounded-lg border border-amber-800/20 text-[11px]">
              {(
                [
                  { key: 'task', label: '按委托' },
                  { key: 'status', label: '按状态' },
                  { key: 'tag', label: '按标签' },
                ] as { key: ShareDimension; label: string }[]
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setShareDimension(tab.key);
                    setHoveredSliceId(null);
                  }}
                  className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                    shareDimension === tab.key
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-stone-700 dark:text-stone-300 hover:text-amber-950 dark:hover:text-amber-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* SVG Donut Chart */}
          {donutSlices.length > 0 ? (
            <div className="flex flex-col items-center justify-center py-2">
              <div className="relative w-48 h-48 sm:w-52 sm:h-52 flex items-center justify-center">
                <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
                  {(() => {
                    const radius = 74;
                    const circumference = 2 * Math.PI * radius;
                    let cumulativePercent = 0;

                    return donutSlices.map((slice) => {
                      const strokeDasharray = `${(slice.percentage / 100) * circumference} ${circumference}`;
                      const strokeDashoffset = -((cumulativePercent / 100) * circumference);
                      cumulativePercent += slice.percentage;
                      const isHovered = hoveredSliceId === slice.id;

                      return (
                        <circle
                          key={slice.id}
                          cx="100"
                          cy="100"
                          r={radius}
                          fill="transparent"
                          stroke={slice.color}
                          strokeWidth={isHovered ? 28 : 24}
                          strokeDasharray={strokeDasharray}
                          strokeDashoffset={strokeDashoffset}
                          className="transition-all duration-200 cursor-pointer"
                          onMouseEnter={() => setHoveredSliceId(slice.id)}
                          onMouseLeave={() => setHoveredSliceId(null)}
                        />
                      );
                    });
                  })()}
                </svg>

                {/* Center Label */}
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 pointer-events-none">
                  {hoveredSlice ? (
                    <>
                      <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 line-clamp-1 max-w-[120px]">
                        {hoveredSlice.label}
                      </span>
                      <span className="text-xl font-extrabold text-stone-900 dark:text-amber-50 mt-0.5">
                        {hoveredSlice.percentage.toFixed(1)}%
                      </span>
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                        {formatHours(hoveredSlice.hours)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-[11px] font-medium text-stone-400 dark:text-stone-500">
                        {period === 'day' ? '当日总计' : period === 'week' ? '本周总计' : '本月总计'}
                      </span>
                      <span className="text-2xl font-extrabold text-stone-900 dark:text-amber-50 mt-0.5">
                        {formatHours(metrics.totalHours)}
                      </span>
                      <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        达成占 {metrics.completedRatio.toFixed(0)}%
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Legend List */}
              <div className="w-full mt-4 space-y-1.5 max-h-56 overflow-y-auto pr-1">
                {donutSlices.map((slice) => {
                  const isHovered = hoveredSliceId === slice.id;
                  return (
                    <div
                      key={slice.id}
                      onMouseEnter={() => setHoveredSliceId(slice.id)}
                      onMouseLeave={() => setHoveredSliceId(null)}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded-xl text-xs transition-colors cursor-default ${
                        isHovered
                          ? 'bg-amber-900/10 dark:bg-white/10'
                          : 'hover:bg-amber-900/5 dark:hover:bg-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: slice.color }}
                        />
                        <span className="font-semibold text-stone-800 dark:text-amber-50 truncate">
                          {slice.label}
                        </span>
                        {slice.subLabel && (
                          <span className="text-[10px] text-stone-400 dark:text-stone-500 shrink-0">
                            ({slice.subLabel})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0 ml-2">
                        <span className="font-bold text-stone-700 dark:text-amber-100">
                          {formatHours(slice.hours)}
                        </span>
                        <span className="w-12 text-right font-semibold text-stone-500 dark:text-stone-400">
                          {slice.percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-900/10 dark:bg-stone-800 text-amber-700/60 dark:text-amber-300/60 flex items-center justify-center mb-3">
                <PieChart className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-stone-700 dark:text-amber-100">
                当前周期暂无时长记录
              </p>
              <p className="text-xs text-stone-400 dark:text-stone-500 mt-1 max-w-xs">
                向看板娘汇报打卡时填写「投入时长」，即可在此查看各委托、标签及状态的时间占比分析
              </p>
            </div>
          )}
        </div>

        {/* Right: Task Time Share & Ranking List (7 cols) */}
        <div className="lg:col-span-7 guild-card border p-4 sm:p-5 rounded-2xl shadow-xs flex flex-col space-y-4 min-w-0">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="text-sm font-extrabold text-amber-950 dark:text-amber-100 flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <span>当期委托战绩排行</span>
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                按当前{period === 'day' ? '日' : period === 'week' ? '周' : '月'}累计投入时间排序，点击委托查看完整档案
              </p>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-900/10 dark:bg-black/30 text-amber-900 dark:text-amber-200 border border-amber-800/15">
              共 {taskBreakdown.length} 项活跃委托
            </span>
          </div>

          {taskBreakdown.length > 0 ? (
            <div className="space-y-2.5 flex-1 min-h-0 max-h-[520px] overflow-y-auto pr-1">
              {taskBreakdown.map((item, idx) => {
                const statusCfg = TASK_STATUS_CONFIG[item.task.status];
                const totalCumulativeHours = getTaskTotalHours(item.task.id);

                return (
                  <div
                    key={item.task.id}
                    onClick={() => openTaskDetail(item.task.id)}
                    className="group p-3 rounded-xl border border-amber-800/20 dark:border-amber-700/30 hover:border-amber-500 dark:hover:border-amber-400 bg-white/60 dark:bg-black/20 hover:bg-white dark:hover:bg-black/35 transition-all cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <span
                          className={`w-6 h-6 rounded-lg text-xs font-extrabold flex items-center justify-center shrink-0 ${
                            idx === 0
                              ? 'bg-amber-200 text-amber-900 dark:bg-amber-500/30 dark:text-amber-200'
                              : idx === 1
                                ? 'bg-stone-200 text-stone-700 dark:bg-stone-700 dark:text-stone-200'
                                : idx === 2
                                  ? 'bg-orange-200 text-orange-800 dark:bg-orange-950/80 dark:text-orange-300'
                                  : 'bg-amber-900/10 text-stone-500 dark:bg-stone-800 dark:text-stone-400'
                          }`}
                        >
                          {idx + 1}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-bold text-stone-900 dark:text-amber-50 truncate group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">
                              {item.task.title}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${statusCfg.badgeBg}`}
                            >
                              {statusCfg.label}
                            </span>
                            {item.task.tags[0] && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-900/10 dark:bg-white/10 text-stone-600 dark:text-stone-300 font-medium shrink-0">
                                <Tag className="w-2.5 h-2.5 opacity-60" />
                                {item.task.tags[0]}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 sm:gap-3 mt-1 text-[11px] text-stone-500 dark:text-stone-400 flex-wrap">
                            <span>当期打卡 {item.logCount} 次</span>
                            <span>·</span>
                            <span>历史累计 {formatHours(totalCumulativeHours)}</span>
                            {item.latestNote && (
                              <>
                                <span>·</span>
                                <span className="truncate max-w-[180px]" title={item.latestNote}>
                                  “{item.latestNote}”
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                        <div className="text-right">
                          <div className="text-sm font-extrabold text-stone-900 dark:text-amber-50">
                            {formatHours(item.hours)}
                          </div>
                          <div className="text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                            {item.percentage.toFixed(1)}%
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCheckInModal(item.task, activeDetailDate);
                          }}
                          className="p-2 rounded-lg text-stone-400 hover:text-amber-700 dark:hover:text-amber-300 hover:bg-amber-500/15 transition-colors cursor-pointer"
                          title={`打卡 / 编辑 ${activeDetailDate} 记录`}
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2.5 h-1.5 w-full rounded-full bg-amber-900/10 dark:bg-black/35 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300"
                        style={{
                          width: `${Math.max(item.hours > 0 ? 3 : 0, item.percentage)}%`,
                          backgroundColor: item.isCompleted ? '#10b981' : item.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-900/10 dark:bg-stone-800 text-amber-700/60 dark:text-amber-300/60 flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-stone-700 dark:text-amber-100">
                当前周期暂无打卡委托
              </p>
              <p className="text-xs text-stone-400 dark:text-stone-500 mt-1">
                可切换日期范围或向看板娘汇报每日打卡进度
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 4. Daily Recorded Time Bar Chart (Shown in Week & Month views) — 100% Width-Adaptive, Zero Horizontal Scrollbar */}
      {period !== 'day' && (
        <div className="guild-card border p-4 sm:p-5 rounded-2xl shadow-xs space-y-4 w-full min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-extrabold text-amber-950 dark:text-amber-100 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                <span>{period === 'week' ? '本周每日冒险投入趋势' : '本月每日冒险投入趋势'}</span>
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
                点击任意柱状图可下钻查看当日打卡明细与当日委托耗时占比
              </p>
            </div>

            <div className="flex items-center gap-4 text-xs text-stone-500 dark:text-stone-400">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" />
                <span>已达成委托时长</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-blue-500 inline-block" />
                <span>攻略中/其他时长</span>
              </span>
            </div>
          </div>

          <div className="pt-3 pb-1 w-full overflow-x-hidden">
            <div
              className={`grid items-end min-h-[175px] w-full ${
                period === 'week' ? 'gap-1.5 sm:gap-2' : 'gap-0.5 sm:gap-1'
              }`}
              style={{
                gridTemplateColumns: `repeat(${dailySeries.series.length}, minmax(0, 1fr))`,
              }}
            >
              {dailySeries.series.map((dayItem) => {
                const isSelected = activeDetailDate === dayItem.date;
                const isToday = dayItem.date === todayStr;
                const weekend = isWeekend(dayItem.date);
                const heightPct =
                  dayItem.totalHours > 0
                    ? Math.max(8, (dayItem.totalHours / dailySeries.maxHours) * 100)
                    : 0;
                const completedPctOfBar =
                  dayItem.totalHours > 0 ? (dayItem.completedHours / dayItem.totalHours) * 100 : 0;
                const dayNum = Number(dayItem.date.split('-')[2]);

                return (
                  <button
                    key={dayItem.date}
                    type="button"
                    onClick={() =>
                      setSelectedDrillDate((prev) => (prev === dayItem.date ? null : dayItem.date))
                    }
                    className={`min-w-0 group flex flex-col items-center justify-end h-44 rounded-xl p-0.5 sm:p-1 border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/15 dark:bg-amber-500/20 border-amber-500/60'
                        : 'border-transparent hover:bg-amber-900/5 dark:hover:bg-white/5'
                    }`}
                    title={`${dayItem.date} (${getWeekdayChinese(dayItem.date)})\n当日总时长: ${formatHours(
                      dayItem.totalHours
                    )}\n已达成委托: ${formatHours(dayItem.completedHours)}\n攻略中/其他: ${formatHours(
                      dayItem.otherHours
                    )}\n打卡数: ${dayItem.logCount} 次`}
                  >
                    <span
                      className={`text-[8px] sm:text-[10px] font-semibold mb-1 truncate max-w-full ${
                        dayItem.totalHours > 0
                          ? isSelected
                            ? 'text-amber-700 dark:text-amber-300 opacity-100'
                            : 'text-stone-600 dark:text-stone-300 opacity-90'
                          : 'opacity-0'
                      }`}
                    >
                      {dayItem.totalHours > 0 ? `${dayItem.totalHours.toFixed(1)}` : ''}
                    </span>

                    <div className="w-full max-w-[32px] flex-1 flex items-end justify-center">
                      {dayItem.totalHours > 0 ? (
                        <div
                          className="w-full rounded-t-md overflow-hidden flex flex-col justify-end transition-all duration-300 shadow-2xs"
                          style={{ height: `${heightPct}%` }}
                        >
                          {dayItem.otherHours > 0 && (
                            <div
                              className="w-full bg-blue-500 group-hover:bg-blue-600 transition-colors"
                              style={{ height: `${100 - completedPctOfBar}%` }}
                            />
                          )}
                          {dayItem.completedHours > 0 && (
                            <div
                              className="w-full bg-emerald-500 group-hover:bg-emerald-600 transition-colors"
                              style={{ height: `${completedPctOfBar}%` }}
                            />
                          )}
                        </div>
                      ) : (
                        <div className="w-full h-1 rounded-full bg-amber-900/15 dark:bg-stone-800" />
                      )}
                    </div>

                    <div className="mt-1.5 flex flex-col items-center leading-tight min-w-0 max-w-full">
                      <span
                        className={`text-[9px] sm:text-[11px] font-bold truncate ${
                          isToday
                            ? 'text-amber-700 dark:text-amber-300'
                            : isSelected
                              ? 'text-stone-900 dark:text-amber-50'
                              : weekend
                                ? 'text-amber-600/80 dark:text-amber-400/80'
                                : 'text-stone-600 dark:text-stone-400'
                        }`}
                      >
                        {period === 'week' ? getWeekdayChinese(dayItem.date) : dayNum}
                      </span>
                      {period === 'week' && (
                        <span className="text-[9px] sm:text-[10px] text-stone-400 dark:text-stone-500">
                          {dayItem.date.slice(5)}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 5. Daily Check-in Log Details (当日打卡记录与时间明细) */}
      <div className="guild-card border p-4 sm:p-5 rounded-2xl shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-sm font-extrabold text-amber-950 dark:text-amber-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>
                {activeDateDetail.date} ({getWeekdayChinese(activeDateDetail.date)}) 当日打卡时间明细
              </span>
            </h3>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200 border border-amber-300/70 dark:border-amber-800">
              当日记录时间: {formatHours(activeDateDetail.dayTotalHours)}
            </span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/70 dark:border-emerald-800">
              当日达成占比: {activeDateDetail.dayCompletedRatio.toFixed(1)}%
            </span>
          </div>

          {period !== 'day' && (
            <button
              type="button"
              onClick={() => {
                setPeriod('day');
                setPivotDate(activeDateDetail.date);
                setSelectedDrillDate(null);
              }}
              className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-300 hover:underline cursor-pointer self-start sm:self-auto"
            >
              <span>切换至该日独立视图</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {activeDateDetail.items.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {activeDateDetail.items.map(({ log, task, hours }) => {
              const progressCfg = PROGRESS_TYPE_CONFIG[log.progressType];
              const statusCfg = TASK_STATUS_CONFIG[task.status];
              const daySharePct =
                activeDateDetail.dayTotalHours > 0
                  ? (hours / activeDateDetail.dayTotalHours) * 100
                  : 0;

              return (
                <div
                  key={log.id}
                  onClick={() => openCheckInModal(task, log.date)}
                  className="group p-3.5 rounded-xl border border-amber-800/20 dark:border-amber-700/30 hover:border-amber-500 dark:hover:border-amber-400 bg-white/60 dark:bg-black/20 hover:bg-white dark:hover:bg-black/35 transition-all cursor-pointer flex flex-col justify-between gap-2.5"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md font-semibold border ${progressCfg.lightBg}`}
                      >
                        {progressCfg.label}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${statusCfg.badgeBg}`}>
                        {statusCfg.label}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-0.5">
                      <h4 className="text-sm font-bold text-stone-900 dark:text-amber-50 truncate group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">
                        {task.title}
                      </h4>
                    </div>

                    {log.note ? (
                      <p className="text-xs text-stone-600 dark:text-stone-300 line-clamp-2 bg-amber-900/5 dark:bg-black/30 p-2 rounded-lg border border-amber-800/10 dark:border-amber-700/20">
                        {log.note}
                      </p>
                    ) : (
                      <p className="text-xs text-stone-400 italic">无备注说明</p>
                    )}
                  </div>

                  <div className="pt-2 border-t border-amber-800/15 dark:border-amber-700/25 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span className="font-bold text-stone-800 dark:text-amber-50">
                        {formatHours(hours)}
                      </span>
                      {hours > 0 && (
                        <span className="text-[11px] text-stone-500 dark:text-stone-400">
                          (占当日 {daySharePct.toFixed(1)}%)
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                      <Edit3 className="w-3 h-3" />
                      编辑打卡
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-xs text-stone-400 dark:text-stone-500">
            {activeDateDetail.date} 当日暂无打卡记录
          </div>
        )}
      </div>
    </div>
  );
};

