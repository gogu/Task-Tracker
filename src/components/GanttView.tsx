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
        // 进行中的保持白色
        rowBg: 'bg-white hover:bg-zinc-50 dark:bg-zinc-900 dark:hover:bg-zinc-850',
        stickyBg: 'bg-white/95 dark:bg-zinc-900/95',
        border: 'border-zinc-200/70 dark:border-zinc-800',
        badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/60',
        statusLabel: '进行中',
      };
    case 'done':
      return {
        // 完成：柔和绿色整行背景
        rowBg: 'bg-emerald-50/70 hover:bg-emerald-100/50 dark:bg-emerald-950/25 dark:hover:bg-emerald-950/40',
        stickyBg: 'bg-emerald-50/95 dark:bg-emerald-950/80',
        border: 'border-emerald-200/70 dark:border-emerald-900/40',
        badge: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60',
        statusLabel: '已完成',
      };
    case 'paused':
      return {
        // 搁置：柔和橙黄色整行背景
        rowBg: 'bg-amber-50/70 hover:bg-amber-100/50 dark:bg-amber-950/25 dark:hover:bg-amber-950/40',
        stickyBg: 'bg-amber-50/95 dark:bg-amber-950/80',
        border: 'border-amber-200/70 dark:border-amber-900/40',
        badge: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60',
        statusLabel: '已搁置',
      };
    case 'backlog':
    default:
      return {
        // 未开始：柔和灰冷色整行背景
        rowBg: 'bg-slate-100/65 hover:bg-slate-100/90 dark:bg-zinc-800/35 dark:hover:bg-zinc-800/55',
        stickyBg: 'bg-slate-100/95 dark:bg-zinc-800/80',
        border: 'border-slate-200/80 dark:border-zinc-700/60',
        badge: 'bg-slate-200/80 text-slate-700 dark:bg-zinc-700 dark:text-zinc-200 border border-slate-300/70 dark:border-zinc-600',
        statusLabel: '未开始',
      };
  }
};

export const GanttView: React.FC = () => {
  const { filteredTasks, logs, openCheckInModal } = useTaskContext();
  const [timeRange, setTimeRange] = useState<GanttTimeRange>('month');
  const [pivotDate, setPivotDate] = useState<string>(getTodayString());
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const todayStr = getTodayString();

  // Tooltip state
  const [hoveredCell, setHoveredCell] = useState<{
    x: number;
    y: number;
    task: TaskItem;
    date: string;
    log?: DailyLog;
  } | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

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

  // Filter tasks based on statusFilter
  const displayedTasks = useMemo(() => {
    if (statusFilter === 'all') return filteredTasks;
    return filteredTasks.filter((t) => t.status === statusFilter);
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

          {/* Status Filter Segmented Controls */}
          <div className="flex items-center bg-zinc-200/70 dark:bg-zinc-800 p-0.5 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1 ${
                statusFilter === 'all'
                  ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-2xs font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <span>全部</span>
              <span className="text-[10px] opacity-75 font-mono">({statusCounts.all})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('in_progress')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1 ${
                statusFilter === 'in_progress'
                  ? 'bg-white dark:bg-zinc-700 text-blue-600 dark:text-blue-400 shadow-2xs font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>进行中</span>
              <span className="text-[10px] opacity-75 font-mono">({statusCounts.in_progress})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('backlog')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1 ${
                statusFilter === 'backlog'
                  ? 'bg-white dark:bg-zinc-700 text-slate-800 dark:text-slate-200 shadow-2xs font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span>未开始</span>
              <span className="text-[10px] opacity-75 font-mono">({statusCounts.backlog})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('done')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1 ${
                statusFilter === 'done'
                  ? 'bg-white dark:bg-zinc-700 text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>已完成</span>
              <span className="text-[10px] opacity-75 font-mono">({statusCounts.done})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('paused')}
              className={`px-2.5 py-1 rounded-md font-medium transition-all cursor-pointer flex items-center gap-1 ${
                statusFilter === 'paused'
                  ? 'bg-white dark:bg-zinc-700 text-amber-600 dark:text-amber-400 shadow-2xs font-semibold'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>已搁置</span>
              <span className="text-[10px] opacity-75 font-mono">({statusCounts.paused})</span>
            </button>
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

            {/* Date Columns */}
            <div className="flex">
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

          {/* Grouped Rows */}
          {Object.entries(groupedTasks).map(([primaryTag, groupTasks]) => (
            <div key={primaryTag} className="border-b border-zinc-200/80 dark:border-zinc-800">
              {/* Group Section Row: Left label strictly pinned in left header column, timeline grid on right */}
              <div className="flex border-b border-zinc-200/70 dark:border-zinc-800/70 bg-zinc-100/60 dark:bg-zinc-850/50">
                {/* Fixed Group Header Cell in the left column */}
                <div className="w-64 sm:w-72 shrink-0 py-1.5 px-3 sticky left-0 z-10 bg-zinc-100 dark:bg-zinc-850 border-r border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-800 dark:text-zinc-200">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span>{primaryTag}</span>
                    <span className="text-[11px] font-normal text-zinc-500 ml-1">
                      ({groupTasks.length} 项)
                    </span>
                  </span>
                </div>

                {/* Right Timeline Grid divider filler so vertical gridlines remain perfectly aligned */}
                <div className="flex items-center pointer-events-none select-none">
                  {dates.map((dateStr) => {
                    const isToday = dateStr === todayStr;
                    const weekend = isWeekend(dateStr);
                    return (
                      <div
                        key={dateStr}
                        className={`w-9 h-7 shrink-0 border-r border-zinc-200/40 dark:border-zinc-800/40 ${
                          isToday
                            ? 'bg-blue-500/10'
                            : weekend
                            ? 'bg-black/[0.025] dark:bg-white/[0.025]'
                            : ''
                        }`}
                      />
                    );
                  })}
                </div>
              </div>

              {/* Task Rows */}
              {groupTasks.map((task) => {
                const statusStyle = getRowStatusClasses(task.status);

                return (
                  <div
                    key={task.id}
                    className={`flex border-b ${statusStyle.border} ${statusStyle.rowBg} transition-colors group`}
                  >
                    {/* Sticky Task Label Card */}
                    <div
                      onClick={() => openCheckInModal(task, todayStr)}
                      className={`w-64 sm:w-72 shrink-0 p-2.5 px-3 sticky left-0 z-10 ${statusStyle.stickyBg} border-r border-zinc-200 dark:border-zinc-800 flex flex-col justify-center cursor-pointer hover:brightness-95 dark:hover:brightness-110 transition-all`}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${statusStyle.badge}`}>
                          {statusStyle.statusLabel}
                        </span>
                        {task.tags.slice(1, 3).map((t) => (
                          <span
                            key={t}
                            className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                      <h4 className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1 group-hover:text-blue-600 transition-colors">
                        {task.title}
                      </h4>
                    </div>

                    {/* Timeline Date Grid Cells */}
                    <div className="flex items-center">
                      {dates.map((dateStr) => {
                        const log = logsLookup.get(`${task.id}_${dateStr}`);
                        const isToday = dateStr === todayStr;
                        const weekend = isWeekend(dateStr);

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
                            className={`w-9 h-11 shrink-0 flex items-center justify-center border-r border-zinc-200/40 dark:border-zinc-800/40 relative cursor-pointer group/cell ${
                              isToday
                                ? 'bg-blue-500/10 dark:bg-blue-500/20'
                                : weekend
                                ? 'bg-black/[0.025] dark:bg-white/[0.025]'
                                : ''
                            } hover:bg-blue-500/15 dark:hover:bg-blue-500/25 transition-colors`}
                          >
                            {/* If today indicator line */}
                            {isToday && (
                              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-blue-500/50 pointer-events-none" />
                            )}

                            {/* Discrete Block Rendering based on Log Progress Type */}
                            {log ? (
                              <div
                                className={`w-6 h-6 rounded-md flex items-center justify-center transition-all shadow-xs group-hover/cell:scale-110 ${
                                  log.progressType === 'progress'
                                    ? 'bg-blue-500 text-white'
                                    : log.progressType === 'rest'
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-emerald-600 text-white'
                                }`}
                              >
                                {log.progressType === 'completed' ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 stroke-2" />
                                ) : (
                                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                                )}
                              </div>
                            ) : (
                              // Blank cell with faint hover dot
                              <div className="w-1.5 h-1.5 rounded-full bg-transparent group-hover/cell:bg-blue-400/50 transition-colors" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {displayedTasks.length === 0 && (
            <div className="py-16 text-center text-xs text-zinc-400">
              {filteredTasks.length === 0 ? (
                '当前暂无匹配的任务数据，请点击「+ 新建任务」添加'
              ) : (
                <div className="flex flex-col items-center justify-center gap-2">
                  <span>
                    当前无「
                    {statusFilter === 'in_progress'
                      ? '进行中'
                      : statusFilter === 'backlog'
                      ? '未开始'
                      : statusFilter === 'done'
                      ? '已完成'
                      : '已搁置'}
                    」状态的任务
                  </span>
                  <button
                    type="button"
                    onClick={() => setStatusFilter('all')}
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
