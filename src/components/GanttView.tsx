import React, { useState, useMemo, useRef } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ScrollText,
  CheckCircle2,
  GripVertical,
} from 'lucide-react';
import { TaskItem, DailyLog, GanttTimeRange, PROGRESS_TYPE_CONFIG, TaskStatus } from '../types';
import { useTaskContext } from '../context/TaskContext';
import {
  getTodayString,
  getGanttDateWindow,
  getWeekdayChinese,
  isWeekend,
  addDays,
  formatHours,
} from '../utils/date';
import { getQuestCategoryBadge } from '../utils/guildNpc';

// Visual configuration for row background by task status (RPG Parchment palette)
const getRowStatusClasses = (status: TaskStatus) => {
  switch (status) {
    case 'in_progress':
      return {
        rowBg: 'bg-white/75 hover:bg-amber-50/70 dark:bg-[#282019]/85 dark:hover:bg-[#33281f]',
        border: 'border-amber-800/15 dark:border-amber-700/25',
        badge:
          'bg-blue-100/90 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-300/70 dark:border-blue-800/60',
        statusLabel: '攻略中',
      };
    case 'done':
      return {
        rowBg:
          'bg-emerald-50/70 hover:bg-emerald-100/60 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30',
        border: 'border-emerald-700/20 dark:border-emerald-800/30',
        badge:
          'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300/70 dark:border-emerald-800/60',
        statusLabel: '已达成',
      };
    case 'paused':
      return {
        rowBg:
          'bg-amber-100/55 hover:bg-amber-100/85 dark:bg-amber-950/25 dark:hover:bg-amber-950/35',
        border: 'border-amber-700/20 dark:border-amber-800/35',
        badge:
          'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300/80 dark:border-amber-800/60',
        statusLabel: '已冻结',
      };
    case 'backlog':
    default:
      return {
        rowBg:
          'bg-stone-200/45 hover:bg-stone-200/75 dark:bg-stone-900/45 dark:hover:bg-stone-800/60',
        border: 'border-stone-400/25 dark:border-stone-700/40',
        badge:
          'bg-stone-200/90 text-stone-700 dark:bg-stone-800 dark:text-stone-300 border border-stone-300/80 dark:border-stone-700',
        statusLabel: '待接取',
      };
  }
};

export const GanttView: React.FC = () => {
  const {
    filteredTasks,
    logs,
    openCheckInModal,
    openTaskDetail,
    reorderTasksGlobal,
    ganttGroupOrder,
    setGanttGroupOrder,
    getTaskTotalHours,
  } = useTaskContext();

  const [timeRange, setTimeRange] = useState<GanttTimeRange>('month');
  const [pivotDate, setPivotDate] = useState<string>(getTodayString());
  const [statusFilter, setStatusFilter] = useState<Set<TaskStatus>>(new Set());
  const todayStr = getTodayString();

  const toggleStatusFilter = (status: TaskStatus) => {
    setStatusFilter((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  };

  // Tooltip state
  const [hoveredCell, setHoveredCell] = useState<{
    x: number;
    y: number;
    task: TaskItem;
    date: string;
    log?: DailyLog;
  } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Two-level drag sort state ─────────────────────────────────────────────
  const [draggingGroupTag, setDraggingGroupTag] = useState<string | null>(null);
  const [dragOverGroupTag, setDragOverGroupTag] = useState<string | null>(null);
  const [groupDropPos, setGroupDropPos] = useState<'before' | 'after'>('before');

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [taskDropPos, setTaskDropPos] = useState<'before' | 'after'>('before');

  // Status counts for filter tabs
  const statusCounts = useMemo(() => {
    const counts = { all: filteredTasks.length, in_progress: 0, backlog: 0, done: 0, paused: 0 };
    filteredTasks.forEach((t) => {
      if (counts[t.status] !== undefined) {
        counts[t.status]++;
      }
    });
    return counts;
  }, [filteredTasks]);

  const displayedTasks = useMemo(() => {
    if (statusFilter.size === 0) return filteredTasks;
    return filteredTasks.filter((t) => statusFilter.has(t.status));
  }, [filteredTasks, statusFilter]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, TaskItem[]> = {};
    displayedTasks.forEach((task) => {
      const primaryTag = task.tags[0] || '默认/未分类';
      if (!groups[primaryTag]) {
        groups[primaryTag] = [];
      }
      groups[primaryTag].push(task);
    });
    return groups;
  }, [displayedTasks]);

  const { earliestDate, latestDate } = useMemo(() => {
    let earliest: string | null = null;
    let latest: string | null = null;

    displayedTasks.forEach((t) => {
      if (t.startDate && (!earliest || t.startDate < earliest)) earliest = t.startDate;
      if (t.completedDate && (!latest || t.completedDate > latest)) latest = t.completedDate;
    });

    logs.forEach((l) => {
      if (!earliest || l.date < earliest) earliest = l.date;
      if (!latest || l.date > latest) latest = l.date;
    });

    return { earliestDate: earliest, latestDate: latest };
  }, [displayedTasks, logs]);

  const { dates } = useMemo(() => {
    return getGanttDateWindow(timeRange, earliestDate, latestDate, pivotDate);
  }, [timeRange, earliestDate, latestDate, pivotDate]);

  const logsLookup = useMemo(() => {
    const map = new Map<string, DailyLog>();
    logs.forEach((log) => {
      map.set(`${log.taskId}_${log.date}`, log);
    });
    return map;
  }, [logs]);

  const handleShiftDate = (days: number) => {
    setPivotDate((prev) => addDays(prev, days));
  };

  const handleResetToday = () => {
    setPivotDate(todayStr);
  };

  const sortedGroupEntries = useMemo(() => {
    const allGroupKeys = Object.keys(groupedTasks);
    const ordered = ganttGroupOrder.filter((tag) => allGroupKeys.includes(tag));
    const newTags = allGroupKeys.filter((tag) => !ordered.includes(tag));
    return [...ordered, ...newTags].map((tag) => [tag, groupedTasks[tag]] as [string, TaskItem[]]);
  }, [groupedTasks, ganttGroupOrder]);

  // ── Group drag handlers ───────────────────────────────────────────────────
  const handleGroupDragStart = (e: React.DragEvent, tag: string) => {
    setDraggingGroupTag(tag);
    e.dataTransfer.setData('dragType', 'group');
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleGroupDragOver = (e: React.DragEvent, tag: string) => {
    if (e.dataTransfer.getData('dragType') === 'task') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (tag === draggingGroupTag) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOverGroupTag(tag);
    setGroupDropPos(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
  };

  const handleGroupDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDragOverGroupTag(null);
    }
  };

  const handleGroupDrop = (e: React.DragEvent, targetTag: string) => {
    e.preventDefault();
    if (!draggingGroupTag || draggingGroupTag === targetTag) return;
    const allKeys = sortedGroupEntries.map(([tag]) => tag);
    const next = allKeys.filter((t) => t !== draggingGroupTag);
    const idx = next.indexOf(targetTag);
    next.splice(groupDropPos === 'before' ? idx : idx + 1, 0, draggingGroupTag);
    setGanttGroupOrder(next);
    setDraggingGroupTag(null);
    setDragOverGroupTag(null);
  };

  const handleGroupDragEnd = () => {
    setDraggingGroupTag(null);
    setDragOverGroupTag(null);
  };

  // ── Task row drag handlers ────────────────────────────────────────────────
  const handleTaskDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggingTaskId(taskId);
    e.dataTransfer.setData('dragType', 'task');
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleTaskDragOver = (e: React.DragEvent, taskId: string) => {
    if (e.dataTransfer.getData('dragType') === 'group') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (taskId === draggingTaskId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setDragOverTaskId(taskId);
    setTaskDropPos(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
  };

  const handleTaskDragLeave = (e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      setDragOverTaskId(null);
    }
  };

  const handleTaskDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggingTaskId || draggingTaskId === targetId) return;
    reorderTasksGlobal(draggingTaskId, targetId, taskDropPos);
    setDraggingTaskId(null);
    setDragOverTaskId(null);
  };

  const handleTaskDragEnd = () => {
    setDraggingTaskId(null);
    setDragOverTaskId(null);
  };

  const isCompactCols = dates.length > 21;

  return (
    <div className="guild-parchment text-stone-900 dark:text-amber-50 rounded-2xl border-2 border-amber-700/60 dark:border-amber-600/50 shadow-[0_20px_50px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col flex-1 min-h-0 w-full">
      {/* Top Toolbar */}
      <div className="px-3 sm:px-4 py-2.5 border-b border-amber-800/20 dark:border-amber-700/35 flex flex-wrap items-center justify-between gap-2 bg-[#f3e6c8]/90 dark:bg-[#2a221a]/95 shrink-0">
        {/* Left: View Title & Status Filter */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <div className="flex items-center gap-1.5 text-xs sm:text-sm font-extrabold text-amber-950 dark:text-amber-100 mr-1">
            <ScrollText className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
            <span>时序卷轴</span>
          </div>

          {/* Status Filter — multi-select toggles */}
          <div className="flex items-center gap-1 text-xs flex-wrap">
            <button
              type="button"
              onClick={() => setStatusFilter(new Set())}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 border ${
                statusFilter.size === 0
                  ? 'bg-amber-700 text-amber-50 border-amber-800 shadow-2xs'
                  : 'bg-white/60 dark:bg-stone-900/60 border-amber-800/20 text-stone-700 dark:text-stone-300 hover:bg-white/90 dark:hover:bg-stone-800'
              }`}
            >
              <span>全部</span>
              <span className="text-[10px] opacity-80 font-mono">({statusCounts.all})</span>
            </button>

            {(
              [
                { key: 'in_progress', dot: 'bg-blue-500', label: '攻略中' },
                { key: 'backlog', dot: 'bg-stone-400', label: '待接取' },
                { key: 'done', dot: 'bg-emerald-500', label: '已达成' },
                { key: 'paused', dot: 'bg-amber-500', label: '已冻结' },
              ] as const
            ).map(({ key, dot, label }) => {
              const active = statusFilter.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleStatusFilter(key)}
                  className={`px-2 py-1 rounded-lg font-semibold transition-all cursor-pointer flex items-center gap-1 border ${
                    active
                      ? 'bg-amber-100 dark:bg-amber-900/60 border-amber-600 dark:border-amber-500 text-amber-950 dark:text-amber-100 shadow-2xs'
                      : 'bg-white/50 dark:bg-stone-900/50 border-amber-800/15 dark:border-amber-700/25 text-stone-600 dark:text-stone-300 hover:bg-white/80 dark:hover:bg-stone-800'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${dot}`} />
                  <span>{label}</span>
                  <span className="text-[10px] opacity-75 font-mono">({statusCounts[key]})</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Controls (Range Zoom & Date Paging) */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-amber-900/10 dark:bg-black/30 p-0.5 rounded-lg border border-amber-800/20 text-xs">
            {(
              [
                { key: 'week', label: '旬·10日' },
                { key: 'month', label: '月·21日' },
                { key: 'all', label: '全景·35日' },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setTimeRange(item.key)}
                className={`px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer ${
                  timeRange === item.key
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-stone-700 dark:text-stone-300 hover:text-amber-950 dark:hover:text-amber-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Date Paging */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleShiftDate(timeRange === 'week' ? -5 : timeRange === 'month' ? -10 : -14)}
              className="p-1.5 text-amber-900 dark:text-amber-200 hover:bg-amber-900/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              title="前推时间卷轴"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleResetToday}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                pivotDate === todayStr
                  ? 'bg-amber-600 border-amber-700 text-white'
                  : 'bg-white/70 dark:bg-stone-800 border-amber-800/25 text-stone-700 dark:text-stone-200 hover:bg-white'
              }`}
            >
              今天
            </button>
            <button
              type="button"
              onClick={() => handleShiftDate(timeRange === 'week' ? 5 : timeRange === 'month' ? 10 : 14)}
              className="p-1.5 text-amber-900 dark:text-amber-200 hover:bg-amber-900/10 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              title="后移时间卷轴"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Sub Toolbar: Legends */}
      <div className="px-3 sm:px-4 py-1.5 border-b border-amber-800/15 dark:border-amber-700/25 bg-[#f7edd5]/75 dark:bg-[#231c15]/90 flex flex-wrap items-center justify-between gap-2 text-[11px] text-stone-600 dark:text-stone-300 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-amber-900/70 dark:text-amber-300/70 font-bold">印记:</span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-500" />
              <span>实质推进</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
              <span>休整</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600" />
              <span>通关达成</span>
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2 pl-3 border-l border-amber-800/20 dark:border-amber-700/30">
            <span className="text-amber-900/70 dark:text-amber-300/70 font-bold">行底色:</span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs border border-amber-800/25 bg-white dark:bg-stone-800" />
              <span>攻略中</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs border border-stone-400 bg-stone-200 dark:bg-stone-700" />
              <span>待接取</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs border border-emerald-400 bg-emerald-100 dark:bg-emerald-950" />
              <span>已达成</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs border border-amber-400 bg-amber-100 dark:bg-amber-950" />
              <span>已冻结</span>
            </span>
          </div>
        </div>

        <span className="text-amber-900/70 dark:text-amber-300/70 text-[10px] font-medium">
          点击任意方格即可直接打卡或修改 · 支持左右翻页查看历史
        </span>
      </div>

      {/* Main Gantt Grid Container — 100% Width-Adaptive, Zero Horizontal Scrollbar */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden relative select-none w-full"
      >
        <div className="w-full min-w-0">
          {/* Header Row */}
          <div className="flex w-full min-w-0 border-b border-amber-800/25 dark:border-amber-700/40 sticky top-0 bg-[#f3e6c8]/95 dark:bg-[#2a221a]/95 z-30 backdrop-blur-md">
            <div className="w-40 sm:w-52 md:w-60 shrink-0 px-2.5 py-2 border-r border-amber-800/20 dark:border-amber-700/35 text-[11px] font-extrabold text-amber-950 dark:text-amber-200 uppercase tracking-wider flex items-center justify-between gap-1">
              <span className="truncate">委托名录 (按主标签)</span>
            </div>

            {/* Adaptive Date Columns Grid */}
            <div
              className="flex-1 min-w-0 grid"
              style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }}
            >
              {dates.map((dateStr, idx) => {
                const [, month, day] = dateStr.split('-');
                const isToday = dateStr === todayStr;
                const weekend = isWeekend(dateStr);
                const weekdayStr = getWeekdayChinese(dateStr).replace('周', '');
                const dayNum = parseInt(day, 10);
                const showMonthLabel = !isCompactCols || dayNum === 1 || idx === 0;

                return (
                  <div
                    key={dateStr}
                    className={`min-w-0 flex flex-col items-center justify-center py-1.5 border-r border-amber-800/10 dark:border-amber-700/20 text-center transition-colors ${
                      isToday
                        ? 'bg-amber-500/20 dark:bg-amber-500/25'
                        : weekend
                        ? 'bg-amber-900/5 dark:bg-white/[0.03]'
                        : ''
                    }`}
                  >
                    <span
                      className={`text-[9px] sm:text-[10px] leading-none ${
                        isToday
                          ? 'font-extrabold text-amber-800 dark:text-amber-300'
                          : 'text-stone-500 dark:text-stone-400'
                      }`}
                    >
                      {isCompactCols ? (isToday ? '今' : weekdayStr) : `周${weekdayStr}`}
                    </span>
                    <span
                      className={`text-[10px] sm:text-xs font-mono mt-0.5 leading-none ${
                        isToday
                          ? 'w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center bg-amber-600 text-white rounded-full font-extrabold shadow-2xs'
                          : 'text-stone-800 dark:text-amber-100 font-semibold'
                      }`}
                    >
                      {dayNum}
                    </span>
                    <span className="text-[8px] sm:text-[9px] text-stone-400 dark:text-stone-500 leading-none mt-0.5 h-2.5">
                      {showMonthLabel ? `${parseInt(month, 10)}月` : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grouped Rows */}
          {sortedGroupEntries.map(([primaryTag, groupTasks]) => {
            const isGroupDragOver = dragOverGroupTag === primaryTag;
            const isDraggingThisGroup = draggingGroupTag === primaryTag;
            const groupCat = getQuestCategoryBadge([primaryTag]);

            return (
              <div
                key={primaryTag}
                draggable
                onDragStart={(e) => handleGroupDragStart(e, primaryTag)}
                onDragOver={(e) => handleGroupDragOver(e, primaryTag)}
                onDragLeave={handleGroupDragLeave}
                onDrop={(e) => handleGroupDrop(e, primaryTag)}
                onDragEnd={handleGroupDragEnd}
                className={`relative w-full min-w-0 transition-opacity ${
                  isDraggingThisGroup ? 'opacity-40' : ''
                }`}
              >
                {isGroupDragOver && groupDropPos === 'before' && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-500 z-30 pointer-events-none" />
                )}

                {/* Group Section Row */}
                <div className="flex w-full min-w-0 border-b border-amber-800/15 dark:border-amber-700/30 bg-[#efe0bd]/80 dark:bg-[#261e17]/90 cursor-grab active:cursor-grabbing">
                  <div className="w-40 sm:w-52 md:w-60 shrink-0 py-1.5 px-2 border-r border-amber-800/20 dark:border-amber-700/35 flex items-center gap-1.5 min-w-0">
                    <GripVertical className="w-3.5 h-3.5 text-amber-800/40 dark:text-amber-300/40 shrink-0" />
                    <span className="inline-flex items-center gap-1 text-xs font-extrabold text-amber-950 dark:text-amber-100 min-w-0">
                      <span className="shrink-0">{groupCat.icon}</span>
                      <span className="truncate">{primaryTag}</span>
                      <span className="text-[10px] font-medium text-amber-900/70 dark:text-amber-300/70 shrink-0">
                        ({groupTasks.length})
                      </span>
                    </span>
                  </div>
                  <div className="flex-1 min-w-0" />
                </div>

                {/* Task Rows */}
                {groupTasks.map((task) => {
                  const statusStyle = getRowStatusClasses(task.status);
                  const isTaskDragOver = dragOverTaskId === task.id;
                  const isDraggingThisTask = draggingTaskId === task.id;

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleTaskDragStart(e, task.id)}
                      onDragOver={(e) => handleTaskDragOver(e, task.id)}
                      onDragLeave={handleTaskDragLeave}
                      onDrop={(e) => handleTaskDrop(e, task.id)}
                      onDragEnd={handleTaskDragEnd}
                      className={`flex w-full min-w-0 border-b ${statusStyle.border} ${statusStyle.rowBg} transition-colors group relative ${
                        isDraggingThisTask ? 'opacity-40' : ''
                      }`}
                    >
                      {isTaskDragOver && taskDropPos === 'before' && (
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-500 z-30 pointer-events-none" />
                      )}
                      {isTaskDragOver && taskDropPos === 'after' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 z-30 pointer-events-none" />
                      )}

                      {/* Task Label Card */}
                      <div className="w-40 sm:w-52 md:w-60 shrink-0 px-2 py-2 border-r border-amber-800/20 dark:border-amber-700/35 flex items-center gap-1.5 min-w-0">
                        <GripVertical className="w-3.5 h-3.5 text-amber-800/25 dark:text-amber-300/25 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing hidden sm:block" />
                        <div
                          onClick={() => openTaskDetail(task.id)}
                          className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer hover:opacity-85 transition-opacity"
                        >
                          <span
                            className={`shrink-0 text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded font-bold ${statusStyle.badge}`}
                          >
                            {statusStyle.statusLabel}
                          </span>
                          <span
                            className="text-xs font-bold text-stone-900 dark:text-amber-50 truncate group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors"
                            title={task.title}
                          >
                            {task.title}
                          </span>
                        </div>
                      </div>

                      {/* Adaptive Timeline Date Grid Cells */}
                      <div
                        className="flex-1 min-w-0 grid items-stretch"
                        style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(0, 1fr))` }}
                      >
                        {dates.map((dateStr, dateIdx) => {
                          const log = logsLookup.get(`${task.id}_${dateStr}`);
                          const isToday = dateStr === todayStr;
                          const weekend = isWeekend(dateStr);

                          const prevDate = dateIdx > 0 ? dates[dateIdx - 1] : null;
                          const nextDate = dateIdx < dates.length - 1 ? dates[dateIdx + 1] : null;
                          const prevLog = prevDate ? logsLookup.get(`${task.id}_${prevDate}`) : null;
                          const nextLog = nextDate ? logsLookup.get(`${task.id}_${nextDate}`) : null;

                          const connectedLeft = !!(log && prevLog);
                          const connectedRight = !!(log && nextLog);

                          const roundedClass = log
                            ? [
                                !connectedLeft ? 'rounded-l-md' : '',
                                !connectedRight ? 'rounded-r-md' : '',
                              ]
                                .filter(Boolean)
                                .join(' ') || 'rounded-none'
                            : '';

                          const barColor = log
                            ? log.progressType === 'progress'
                              ? 'bg-blue-500'
                              : log.progressType === 'rest'
                              ? 'bg-amber-500'
                              : 'bg-emerald-600'
                            : '';

                          return (
                            <div
                              key={dateStr}
                              onClick={() => {
                                setHoveredCell(null);
                                openCheckInModal(task, dateStr);
                              }}
                              onMouseEnter={(e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const clampedX = Math.max(
                                  130,
                                  Math.min(window.innerWidth - 130, rect.left + rect.width / 2)
                                );
                                setHoveredCell({
                                  x: clampedX,
                                  y: rect.top,
                                  task,
                                  date: dateStr,
                                  log,
                                });
                              }}
                              onMouseLeave={() => setHoveredCell(null)}
                              className={`min-w-0 h-full flex items-center justify-center border-r border-amber-800/10 dark:border-amber-700/15 relative cursor-pointer group/cell ${
                                isToday
                                  ? 'bg-amber-500/15 dark:bg-amber-500/20'
                                  : weekend
                                  ? 'bg-black/[0.025] dark:bg-white/[0.02]'
                                  : ''
                              } hover:bg-amber-500/20 dark:hover:bg-amber-500/30 transition-colors`}
                            >
                              {isToday && (
                                <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-amber-600/50 pointer-events-none" />
                              )}

                              {log ? (
                                <>
                                  <div
                                    className={`absolute top-1/2 -translate-y-1/2 h-5 sm:h-6 transition-all group-hover/cell:h-7 pointer-events-none ${barColor} ${roundedClass} ${
                                      connectedLeft ? 'left-0' : 'left-[10%]'
                                    } ${connectedRight ? 'right-0' : 'right-[10%]'}`}
                                  />
                                  {!connectedRight && (
                                    <span className="relative flex items-center justify-center pointer-events-none z-[1]">
                                      {log.progressType === 'completed' ? (
                                        <CheckCircle2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-2 text-white" />
                                      ) : (
                                        <span className="w-1.5 h-1.5 rounded-full bg-white/85" />
                                      )}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <div className="w-1.5 h-1.5 rounded-full bg-transparent group-hover/cell:bg-amber-500/60 transition-colors" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {isGroupDragOver && groupDropPos === 'after' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 z-30 pointer-events-none" />
                )}
              </div>
            );
          })}

          {displayedTasks.length === 0 && (
            <div className="py-16 text-center text-xs text-stone-500 dark:text-stone-400">
              {filteredTasks.length === 0 ? (
                '当前暂无匹配的委托数据，请向看板娘登记新委托'
              ) : (
                <div className="flex flex-col items-center justify-center gap-2">
                  <span>当前筛选条件下暂无委托</span>
                  <button
                    type="button"
                    onClick={() => setStatusFilter(new Set())}
                    className="text-amber-700 dark:text-amber-300 hover:underline cursor-pointer font-bold"
                  >
                    查看全部委托 ({statusCounts.all})
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lightweight Hover Tooltip */}
      {hoveredCell && (
        <div
          style={{
            position: 'fixed',
            left: `${hoveredCell.x}px`,
            top: `${hoveredCell.y - 10}px`,
            transform: 'translate(-50%, -100%)',
            pointerEvents: 'none',
            zIndex: 60,
          }}
          className="bg-[#1c140e]/95 text-amber-50 border border-amber-500/50 rounded-xl px-3 py-2 shadow-2xl text-xs max-w-xs"
        >
          <div className="flex items-center justify-between gap-3 text-[11px] text-amber-300/80 border-b border-amber-700/40 pb-1 mb-1.5">
            <span className="font-mono">{hoveredCell.date}</span>
            <span>{getWeekdayChinese(hoveredCell.date)}</span>
          </div>

          <div className="font-bold text-xs line-clamp-1 mb-1">{hoveredCell.task.title}</div>

          {hoveredCell.log ? (
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      hoveredCell.log.progressType === 'progress'
                        ? 'bg-blue-400'
                        : hoveredCell.log.progressType === 'rest'
                        ? 'bg-amber-400'
                        : 'bg-emerald-400'
                    }`}
                  />
                  <span className="text-[11px] font-medium">
                    {PROGRESS_TYPE_CONFIG[hoveredCell.log.progressType].label}
                  </span>
                </div>
                {typeof hoveredCell.log.hours === 'number' && hoveredCell.log.hours > 0 && (
                  <span className="text-[10px] font-semibold text-sky-300 bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-800/80">
                    投入 {formatHours(hoveredCell.log.hours)}
                  </span>
                )}
              </div>
              {hoveredCell.log.note ? (
                <div className="text-[11px] text-amber-100/90 bg-black/35 p-1.5 rounded mt-1 line-clamp-3 italic">
                  "{hoveredCell.log.note}"
                </div>
              ) : (
                <div className="text-[10px] text-amber-200/60">无附加日志笔记</div>
              )}
              {getTaskTotalHours(hoveredCell.task.id, hoveredCell.date) > 0 && (
                <div className="text-[10px] text-amber-200/75 mt-1.5 pt-1 border-t border-amber-700/40 flex justify-between">
                  <span>截至当日累计:</span>
                  <span className="font-semibold text-amber-300">
                    {formatHours(getTaskTotalHours(hoveredCell.task.id, hoveredCell.date))}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="text-[11px] text-amber-200/70 italic">本日暂无打卡（点击即可快速打卡）</div>
              {getTaskTotalHours(hoveredCell.task.id, hoveredCell.date) > 0 && (
                <div className="text-[10px] text-amber-200/75 mt-1.5 pt-1 border-t border-amber-700/40 flex justify-between">
                  <span>截至当日累计:</span>
                  <span className="font-semibold text-amber-300">
                    {formatHours(getTaskTotalHours(hoveredCell.task.id, hoveredCell.date))}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
