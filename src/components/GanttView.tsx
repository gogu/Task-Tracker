import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Layers,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Info,
  CheckCircle2,
  GripVertical,
} from 'lucide-react';
import { TaskItem, DailyLog, GanttTimeRange, PROGRESS_TYPE_CONFIG, ProgressType, TaskStatus } from '../types';
import { useTaskContext } from '../context/TaskContext';
import {
  getTodayString,
  getGanttDateWindow,
  parseDate,
  getWeekdayChinese,
  isWeekend,
  addDays,
} from '../utils/date';

// Visual configuration for row background by task status
const getRowStatusClasses = (status: TaskStatus) => {
  switch (status) {
    case 'in_progress':
      return {
        // 进行中：保持接近白色/深色背景，无彩色
        rowBg: 'bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-800/60',
        stickyBg: 'bg-white/95 dark:bg-zinc-900/95',
        border: 'border-zinc-200/70 dark:border-zinc-800',
        badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60',
        statusLabel: '进行中',
      };
    case 'done':
      return {
        // 完成：浅绿色，深色模式下极淡
        rowBg: 'bg-emerald-50/60 hover:bg-emerald-100/50 dark:bg-emerald-950/12 dark:hover:bg-emerald-950/20',
        stickyBg: 'bg-emerald-50/95 dark:bg-emerald-950/30',
        border: 'border-emerald-200/60 dark:border-emerald-900/30',
        badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
        statusLabel: '已完成',
      };
    case 'paused':
      return {
        // 搁置：浅橙黄，深色模式下极淡
        rowBg: 'bg-amber-50/60 hover:bg-amber-100/50 dark:bg-amber-950/12 dark:hover:bg-amber-950/20',
        stickyBg: 'bg-amber-50/95 dark:bg-amber-950/30',
        border: 'border-amber-200/60 dark:border-amber-900/30',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
        statusLabel: '已搁置',
      };
    case 'backlog':
    default:
      return {
        // 未开始：冷灰色，深色模式下微弱
        rowBg: 'bg-slate-100/60 hover:bg-slate-100/90 dark:bg-zinc-800/30 dark:hover:bg-zinc-800/50',
        stickyBg: 'bg-slate-100/95 dark:bg-zinc-800/60',
        border: 'border-slate-200/70 dark:border-zinc-700/50',
        badge: 'bg-slate-200/80 text-slate-700 dark:bg-zinc-700 dark:text-zinc-200 border border-slate-300/70 dark:border-zinc-600',
        statusLabel: '未开始',
      };
  }
};

export const GanttView: React.FC = () => {
  const {
    filteredTasks, logs,
    openCheckInModal, openTaskDetail,
    reorderTasksGlobal,
    ganttGroupOrder, setGanttGroupOrder,
  } = useTaskContext();
  const [timeRange, setTimeRange] = useState<GanttTimeRange>('month');
  const [pivotDate, setPivotDate] = useState<string>(getTodayString());
  // Multi-select status filter: empty set = show all
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
  // Drag-to-pan on the date header
  const isDraggingHeader = useRef(false);
  const dragStartX = useRef(0);
  const dragStartScrollLeft = useRef(0);
  const [headerCursor, setHeaderCursor] = useState<'grab' | 'grabbing'>('grab');

  // ── Two-level drag sort state ─────────────────────────────────────────────
  // Group drag
  const [draggingGroupTag, setDraggingGroupTag] = useState<string | null>(null);
  const [dragOverGroupTag, setDragOverGroupTag] = useState<string | null>(null);
  const [groupDropPos, setGroupDropPos] = useState<'before' | 'after'>('before');
  // Task row drag
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

  // Filter tasks: empty set = all; otherwise only selected statuses
  const displayedTasks = useMemo(() => {
    if (statusFilter.size === 0) return filteredTasks;
    return filteredTasks.filter((t) => statusFilter.has(t.status));
  }, [filteredTasks, statusFilter]);

  // Group displayed tasks by their primary tag
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

  // Find overall earliest & latest dates across all displayed tasks and logs
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

  // Generate date columns
  const { dates } = useMemo(() => {
    return getGanttDateWindow(timeRange, earliestDate, latestDate, pivotDate);
  }, [timeRange, earliestDate, latestDate, pivotDate]);

  // Fast map lookup: taskId -> date -> DailyLog
  const logsLookup = useMemo(() => {
    const map = new Map<string, DailyLog>();
    logs.forEach((log) => {
      map.set(`${log.taskId}_${log.date}`, log);
    });
    return map;
  }, [logs]);

  // Scroll to today column smoothly on initial mount or range switch
  useEffect(() => {
    if (scrollContainerRef.current) {
      const todayIndex = dates.indexOf(todayStr);
      if (todayIndex >= 0) {
        const cellWidth = 36;
        const scrollPos = todayIndex * cellWidth - scrollContainerRef.current.clientWidth / 2 + 100;
        scrollContainerRef.current.scrollTo({ left: Math.max(0, scrollPos), behavior: 'smooth' });
      }
    }
  }, [dates, timeRange, todayStr]);

  const handleShiftDate = (days: number) => {
    setPivotDate((prev) => addDays(prev, days));
  };

  const handleResetToday = () => {
    setPivotDate(todayStr);
  };

  // ── Drag-to-pan on the date header ──────────────────────────────────────
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (!scrollContainerRef.current) return;
    isDraggingHeader.current = true;
    dragStartX.current = e.clientX;
    dragStartScrollLeft.current = scrollContainerRef.current.scrollLeft;
    setHeaderCursor('grabbing');
    e.preventDefault();
  };

  const handleHeaderMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingHeader.current || !scrollContainerRef.current) return;
    const dx = e.clientX - dragStartX.current;
    scrollContainerRef.current.scrollLeft = dragStartScrollLeft.current - dx;
  };

  const handleHeaderMouseUp = () => {
    isDraggingHeader.current = false;
    setHeaderCursor('grab');
  };

  // ── Sorted group entries (respects ganttGroupOrder) ───────────────────────
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

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/90 dark:border-zinc-800 shadow-xs overflow-hidden flex flex-col min-h-[560px]">
      {/* Top Toolbar */}
      <div className="p-3 sm:px-5 border-b border-zinc-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3 bg-zinc-50/70 dark:bg-zinc-900/70">
        {/* Left: View Title & Status Filter */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200 mr-1">
            <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>甘特图</span>
          </div>

          {/* Status Filter — multi-select toggles */}
          <div className="flex items-center gap-1 text-xs flex-wrap">
            {/* Clear-all / "全部" */}
            <button
              type="button"
              onClick={() => setStatusFilter(new Set())}
              className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1 ${
                statusFilter.size === 0
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 shadow-2xs font-semibold'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
              }`}
            >
              <span>全部</span>
              <span className="text-[10px] opacity-75 font-mono">({statusCounts.all})</span>
            </button>

            {(
              [
                { key: 'in_progress', dot: 'bg-blue-500',    label: '进行中', activeText: 'text-blue-600 dark:text-blue-300' },
                { key: 'backlog',     dot: 'bg-slate-400',   label: '未开始', activeText: 'text-slate-700 dark:text-slate-200' },
                { key: 'done',        dot: 'bg-emerald-500', label: '已完成', activeText: 'text-emerald-600 dark:text-emerald-300' },
                { key: 'paused',      dot: 'bg-amber-500',   label: '已搁置', activeText: 'text-amber-600 dark:text-amber-300' },
              ] as const
            ).map(({ key, dot, label, activeText }) => {
              const active = statusFilter.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleStatusFilter(key)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1 border ${
                    active
                      ? `bg-white dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 shadow-2xs font-semibold ${activeText}`
                      : 'border-transparent bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
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

        {/* Right: Controls (Range Zoom & Navigation) */}
        <div className="flex items-center gap-2">
          {/* Zoom: Week / Month / All */}
          <div className="flex items-center bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setTimeRange('week')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                timeRange === 'week'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-2xs font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              周
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('month')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                timeRange === 'month'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-2xs font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              月
            </button>
            <button
              type="button"
              onClick={() => setTimeRange('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                timeRange === 'all'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-2xs font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              全部
            </button>
          </div>

          {/* Date Paging */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => handleShiftDate(timeRange === 'week' ? -7 : -14)}
              className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              title="前推时间"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleResetToday}
              className={`px-2 py-1 text-xs font-medium rounded-md border transition-colors ${
                pivotDate === todayStr
                  ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/50 dark:border-blue-800 dark:text-blue-300'
                  : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50'
              }`}
            >
              今天
            </button>
            <button
              type="button"
              onClick={() => handleShiftDate(timeRange === 'week' ? 7 : 14)}
              className="p-1.5 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
              title="后移时间"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Sub Toolbar: Legends (Progress Square + Row Background) */}
      <div className="px-3.5 sm:px-5 py-2 border-b border-zinc-200/60 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-900/40 flex flex-wrap items-center justify-between gap-3 text-[11px] text-zinc-500">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 font-medium">打卡块:</span>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-500" />
              <span>有推进</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-amber-500" />
              <span>休息/无进展</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600" />
              <span>通关/完结</span>
            </div>
          </div>

          <div className="flex items-center gap-2 pl-3 border-l border-zinc-200 dark:border-zinc-800">
            <span className="text-zinc-400 font-medium">行背景:</span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs border border-zinc-300 bg-white dark:bg-zinc-900" />
              <span>进行中(白)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs border border-slate-300 bg-slate-100 dark:bg-zinc-800" />
              <span>未开始(灰)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs border border-emerald-300 bg-emerald-100/80 dark:bg-emerald-950" />
              <span>已完成(绿)</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-xs border border-amber-300 bg-amber-100/80 dark:bg-amber-950" />
              <span>已搁置(橙)</span>
            </span>
          </div>
        </div>

        <span className="text-zinc-400 text-[10px]">
          点击方格可查看并修改打卡详情
        </span>
      </div>

      {/* Main Gantt Grid Container */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-x-auto overflow-y-auto relative select-none"
      >
        <div className="min-w-fit">
          {/* Header Row (Sticky Left + Date Headers) */}
          <div className="flex border-b border-zinc-200 dark:border-zinc-800 sticky top-0 bg-zinc-50/95 dark:bg-zinc-900/95 z-20 backdrop-blur-xs">
            {/* Sticky Task Label Column Header */}
            <div className="w-64 sm:w-72 shrink-0 p-3 sticky left-0 z-30 bg-zinc-50/95 dark:bg-zinc-900/95 border-r border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center justify-between">
              <span>任务对象 (按主分类分组)</span>
              <span className="text-[10px] font-normal text-zinc-400">点击方格查看/修改详情</span>
            </div>

            {/* Date Columns — draggable to pan horizontally */}
            <div
              className="flex"
              style={{ cursor: headerCursor }}
              onMouseDown={handleHeaderMouseDown}
              onMouseMove={handleHeaderMouseMove}
              onMouseUp={handleHeaderMouseUp}
              onMouseLeave={handleHeaderMouseUp}
            >
              {dates.map((dateStr) => {
                const [_, month, day] = dateStr.split('-');
                const isToday = dateStr === todayStr;
                const weekend = isWeekend(dateStr);
                const weekdayStr = getWeekdayChinese(dateStr);

                return (
                  <div
                    key={dateStr}
                    className={`w-9 shrink-0 flex flex-col items-center justify-center py-2 border-r border-zinc-100 dark:border-zinc-800/60 text-center transition-colors ${
                      isToday
                        ? 'bg-blue-50/80 dark:bg-blue-950/30'
                        : weekend
                        ? 'bg-zinc-100/40 dark:bg-zinc-800/20'
                        : ''
                    }`}
                  >
                    <span
                      className={`text-[10px] ${
                        isToday
                          ? 'font-bold text-blue-600 dark:text-blue-400'
                          : 'text-zinc-400 dark:text-zinc-500'
                      }`}
                    >
                      {weekdayStr}
                    </span>
                    <span
                      className={`text-xs font-mono mt-0.5 ${
                        isToday
                          ? 'w-5 h-5 flex items-center justify-center bg-blue-600 text-white rounded-full font-bold shadow-xs'
                          : 'text-zinc-700 dark:text-zinc-300 font-medium'
                      }`}
                    >
                      {parseInt(day, 10)}
                    </span>
                    <span className="text-[9px] text-zinc-400 scale-90 -mt-0.5">
                      {parseInt(month, 10)}月
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grouped Rows — sortedGroupEntries respects ganttGroupOrder */}
          {sortedGroupEntries.map(([primaryTag, groupTasks]) => {
            const isGroupDragOver = dragOverGroupTag === primaryTag;
            const isDraggingThisGroup = draggingGroupTag === primaryTag;
            return (
              <div
                key={primaryTag}
                draggable
                onDragStart={(e) => handleGroupDragStart(e, primaryTag)}
                onDragOver={(e) => handleGroupDragOver(e, primaryTag)}
                onDragLeave={handleGroupDragLeave}
                onDrop={(e) => handleGroupDrop(e, primaryTag)}
                onDragEnd={handleGroupDragEnd}
                className={`relative transition-opacity ${isDraggingThisGroup ? 'opacity-40' : ''}`}
              >
                {/* Group insertion line — before */}
                {isGroupDragOver && groupDropPos === 'before' && (
                  <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-30 pointer-events-none" />
                )}

                {/* Group Section Row */}
                <div className="flex border-b border-zinc-200/70 dark:border-zinc-800/70 bg-zinc-100/60 dark:bg-zinc-800/40 cursor-grab active:cursor-grabbing">
                  <div className="w-64 sm:w-72 shrink-0 py-1.5 px-2 sticky left-0 z-10 bg-zinc-100 dark:bg-zinc-800/70 border-r border-zinc-200 dark:border-zinc-700/80 flex items-center gap-1.5">
                    <GripVertical className="w-3.5 h-3.5 text-zinc-400 dark:text-zinc-600 shrink-0" />
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-800 dark:text-zinc-200">
                      <span className="w-2 h-2 rounded-full bg-blue-500" />
                      <span>{primaryTag}</span>
                      <span className="text-[11px] font-normal text-zinc-500 ml-1">
                        ({groupTasks.length} 项)
                      </span>
                    </span>
                  </div>
                  {/* Empty right area */}
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
                      className={`flex border-b ${statusStyle.border} ${statusStyle.rowBg} transition-all group relative ${
                        isDraggingThisTask ? 'opacity-40' : ''
                      }`}
                    >
                      {/* Task insertion line — before */}
                      {isTaskDragOver && taskDropPos === 'before' && (
                        <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 z-20 pointer-events-none" />
                      )}
                      {/* Task insertion line — after */}
                      {isTaskDragOver && taskDropPos === 'after' && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-20 pointer-events-none" />
                      )}

                      {/* Sticky Task Label Card */}
                      <div
                        className={`w-64 sm:w-72 shrink-0 px-2 py-2 sticky left-0 z-10 ${statusStyle.stickyBg} border-r border-zinc-200 dark:border-zinc-800 flex items-center gap-1.5 min-w-0`}
                      >
                        {/* Drag handle */}
                        <GripVertical className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-700 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing" />
                        {/* Content — click opens detail */}
                        <div
                          onClick={() => openTaskDetail(task.id)}
                          className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                        >
                          <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded font-medium ${statusStyle.badge}`}>
                            {statusStyle.statusLabel}
                          </span>
                          <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate group-hover:text-blue-600 transition-colors">
                            {task.title}
                          </span>
                          {task.tags.slice(1, 2).map((t) => (
                            <span
                              key={t}
                              className="shrink-0 text-[10px] text-zinc-400 dark:text-zinc-500 truncate max-w-[60px]"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      </div>

                    {/* Timeline Date Grid Cells */}
                    <div className="flex items-stretch">
                      {dates.map((dateStr, dateIdx) => {
                        const log = logsLookup.get(`${task.id}_${dateStr}`);
                        const isToday = dateStr === todayStr;
                        const weekend = isWeekend(dateStr);

                        // Streak detection: check prev/next dates for same-task logs
                        const prevDate = dateIdx > 0 ? dates[dateIdx - 1] : null;
                        const nextDate = dateIdx < dates.length - 1 ? dates[dateIdx + 1] : null;
                        const prevLog = prevDate ? logsLookup.get(`${task.id}_${prevDate}`) : null;
                        const nextLog = nextDate ? logsLookup.get(`${task.id}_${nextDate}`) : null;

                        // A cell is connected left/right if neighbor also has a log (any type)
                        const connectedLeft = !!(log && prevLog);
                        const connectedRight = !!(log && nextLog);

                        // Rounded corners based on streak position
                        const roundedClass = log
                          ? [
                              !connectedLeft ? 'rounded-l-md' : '',
                              !connectedRight ? 'rounded-r-md' : '',
                            ]
                              .filter(Boolean)
                              .join(' ') || 'rounded-none'
                          : '';

                        // Bar color
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
                              setHoveredCell({
                                x: rect.left + rect.width / 2,
                                y: rect.top,
                                task,
                                date: dateStr,
                                log,
                              });
                            }}
                            onMouseLeave={() => setHoveredCell(null)}
                            title={`${task.title} · ${dateStr} (点击查看或修改详情)`}
                            className={`w-9 h-full shrink-0 flex items-center justify-center border-r border-zinc-200/40 dark:border-zinc-800/40 relative cursor-pointer group/cell ${
                              isToday
                                ? 'bg-blue-500/10 dark:bg-blue-500/20'
                                : weekend
                                ? 'bg-black/[0.025] dark:bg-white/[0.025]'
                                : ''
                            } hover:bg-blue-500/15 dark:hover:bg-blue-500/25 transition-colors`}
                          >
                            {/* Today indicator line */}
                            {isToday && (
                              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-blue-500/50 pointer-events-none" />
                            )}

                            {log ? (
                              /* ── Unified block: h-6, centered, connected edges flush to cell border ── */
                              <div
                                className={`absolute top-1/2 -translate-y-1/2 h-6 transition-all group-hover/cell:h-7 pointer-events-none ${barColor} ${roundedClass} ${
                                  connectedLeft ? 'left-0' : 'left-[14%]'
                                } ${
                                  connectedRight ? 'right-0' : 'right-[14%]'
                                }`}
                              >
                                {/* Icon on isolated blocks and streak-end cells */}
                                {!connectedRight && (
                                  <span className="absolute inset-0 flex items-center justify-center">
                                    {log.progressType === 'completed' ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 stroke-2 text-white" />
                                    ) : (
                                      <span className="w-1.5 h-1.5 rounded-full bg-white/80" />
                                    )}
                                  </span>
                                )}
                              </div>
                            ) : (
                              /* Blank cell hover dot */
                              <div className="w-1.5 h-1.5 rounded-full bg-transparent group-hover/cell:bg-blue-400/50 transition-colors" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

                {/* Group insertion line — after */}
                {isGroupDragOver && groupDropPos === 'after' && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 z-30 pointer-events-none" />
                )}
              </div>
            );
          })}



          {displayedTasks.length === 0 && (
            <div className="py-16 text-center text-xs text-zinc-400">
              {filteredTasks.length === 0 ? (
                '当前暂无匹配的任务数据，请点击「+ 新建任务」添加'
              ) : (
                <div className="flex flex-col items-center justify-center gap-2">
                  <span>当前筛选条件下暂无任务</span>
                  <button
                    type="button"
                    onClick={() => setStatusFilter(new Set())}
                    className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium"
                  >
                    查看全部任务 ({statusCounts.all})
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
            zIndex: 40,
          }}
          className="bg-zinc-900/95 text-white dark:bg-zinc-800/95 dark:text-zinc-100 border border-zinc-700/80 rounded-xl px-3 py-2 shadow-xl text-xs max-w-xs animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center justify-between gap-3 text-[11px] text-zinc-400 border-b border-zinc-700/60 pb-1 mb-1.5">
            <span className="font-mono">{hoveredCell.date}</span>
            <span>{getWeekdayChinese(hoveredCell.date)}</span>
          </div>

          <div className="font-semibold text-xs line-clamp-1 mb-1">{hoveredCell.task.title}</div>

          {hoveredCell.log ? (
            <div>
              <div className="flex items-center gap-1.5 mb-1">
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
              {hoveredCell.log.note ? (
                <div className="text-[11px] text-zinc-300 bg-black/30 p-1.5 rounded mt-1 line-clamp-3 italic">
                  "{hoveredCell.log.note}"
                </div>
              ) : (
                <div className="text-[10px] text-zinc-400">无附加日志笔记</div>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-zinc-400 italic">本日暂无打卡（点击即可快速打卡）</div>
          )}
        </div>
      )}
    </div>
  );
};
