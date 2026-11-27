import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronLeft,
  ChevronRight,
  ScrollText,
  GripVertical,
} from 'lucide-react';
import {
  TaskItem,
  DailyLog,
  GanttTimeRange,
  PROGRESS_TYPE_CONFIG,
  ProgressType,
  TaskStatus,
} from '../types';
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
import { formatRestDuration } from '../utils/timeDistribution';

interface DateColMeta {
  dateStr: string;
  dayNum: number;
  monthLabel: string;
  weekdayShort: string;
  weekdayFull: string;
  isToday: boolean;
  isWeekend: boolean;
}

interface TimelineSegment {
  key: string;
  startIdx: number;
  endIdx: number;
  leftPct: number;
  widthPct: number;
  gradient: string;
  tipType: ProgressType;
  showTipBall: boolean;
}

interface HoveredLogInfo {
  x: number;
  y: number;
  placeBelow: boolean;
  task: TaskItem;
  colMeta: DateColMeta;
  log: DailyLog;
  cumulativeHours: number;
}

const EMPTY_SEGMENTS: TimelineSegment[] = [];

const TIMELINE_TYPE_STYLE: Record<
  ProgressType,
  {
    tail: string;
    mid: string;
    head: string;
    ballColor: string;
    legendGradient: string;
    dotClass: string;
    hoverDotClass: string;
  }
> = {
  progress: {
    tail: 'rgba(59, 130, 246, 0.25)',
    mid: '#3b82f6',
    head: '#3b82f6',
    ballColor: '#3b82f6',
    legendGradient: 'linear-gradient(90deg, rgba(59, 130, 246, 0.25) 0%, #3b82f6 100%)',
    dotClass: 'bg-blue-400',
    hoverDotClass: 'border-white/95 bg-blue-500',
  },
  rest: {
    tail: 'rgba(245, 158, 11, 0.25)',
    mid: '#f59e0b',
    head: '#f59e0b',
    ballColor: '#f59e0b',
    legendGradient: 'linear-gradient(90deg, rgba(245, 158, 11, 0.25) 0%, #f59e0b 100%)',
    dotClass: 'bg-amber-400',
    hoverDotClass: 'border-white/95 bg-amber-500',
  },
  completed: {
    tail: 'rgba(16, 185, 129, 0.28)',
    mid: '#10b981',
    head: '#10b981',
    ballColor: '#10b981',
    legendGradient: 'linear-gradient(90deg, rgba(16, 185, 129, 0.28) 0%, #10b981 100%)',
    dotClass: 'bg-emerald-400',
    hoverDotClass: 'border-white/95 bg-emerald-500',
  },
};

function buildSegmentGradient(
  segLogs: DailyLog[],
  startIdx: number,
  endIdx: number,
  extendsLeft: boolean,
  extendsRight: boolean,
  totalCols: number
): string {
  const firstType = segLogs[0].progressType;
  const lastType = segLogs[segLogs.length - 1].progressType;
  const allSameType = segLogs.every((l) => l.progressType === firstType);

  if (allSameType) {
    const style = TIMELINE_TYPE_STYLE[lastType];
    if (extendsLeft && extendsRight) {
      return `linear-gradient(90deg, ${style.mid} 0%, ${style.mid} 100%)`;
    }
    if (extendsLeft) {
      return `linear-gradient(90deg, ${style.mid} 0%, ${style.head} 100%)`;
    }
    if (extendsRight) {
      return `linear-gradient(90deg, ${style.tail} 0%, ${style.mid} 55%, ${style.mid} 100%)`;
    }
    return `linear-gradient(90deg, ${style.tail} 0%, ${style.mid} 45%, ${style.head} 100%)`;
  }

  const segStartCol = extendsLeft ? 0 : startIdx + 0.1;
  const segEndCol = extendsRight ? totalCols : endIdx + 0.5;
  const span = Math.max(0.01, segEndCol - segStartCol);

  const firstStyle = TIMELINE_TYPE_STYLE[firstType];
  const lastStyle = TIMELINE_TYPE_STYLE[lastType];
  const stops: string[] = [`${extendsLeft ? firstStyle.mid : firstStyle.tail} 0%`];

  for (let i = 0; i < segLogs.length; i++) {
    const colCenter = startIdx + i + 0.5;
    const rawPct = ((colCenter - segStartCol) / span) * 100;
    const pct = Math.max(1, Math.min(99, Math.round(rawPct * 10) / 10));
    stops.push(`${TIMELINE_TYPE_STYLE[segLogs[i].progressType].mid} ${pct}%`);
  }

  stops.push(`${extendsRight ? lastStyle.mid : lastStyle.head} 100%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

// Visual configuration for row background by task status (RPG Parchment palette)
const getRowStatusClasses = (status: TaskStatus) => {
  switch (status) {
    case 'in_progress':
      return {
        rowBg: 'bg-white/75 hover:bg-amber-50/70 dark:bg-[#282019]/85 dark:hover:bg-[#33281f]',
        border: 'border-amber-800/15 dark:border-amber-700/25',
        badge:
          'bg-blue-100/90 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 border border-blue-300/70 dark:border-blue-800/60',
        dotClass: 'bg-blue-500',
        statusLabel: '攻略中',
      };
    case 'done':
      return {
        rowBg:
          'bg-emerald-50/70 hover:bg-emerald-100/60 dark:bg-emerald-950/20 dark:hover:bg-emerald-950/30',
        border: 'border-emerald-700/20 dark:border-emerald-800/30',
        badge:
          'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300 border border-emerald-300/70 dark:border-emerald-800/60',
        dotClass: 'bg-emerald-500',
        statusLabel: '已达成',
      };
    case 'paused':
      return {
        rowBg:
          'bg-amber-100/55 hover:bg-amber-100/85 dark:bg-amber-950/25 dark:hover:bg-amber-950/35',
        border: 'border-amber-700/20 dark:border-amber-800/35',
        badge:
          'bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300/80 dark:border-amber-800/60',
        dotClass: 'bg-amber-500',
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
        dotClass: 'bg-stone-400',
        statusLabel: '待接取',
      };
  }
};

interface GanttTaskRowProps {
  task: TaskItem;
  dateColumns: DateColMeta[];
  nextWindowDate: string | null;
  taskLogsByDate: Map<string, DailyLog> | undefined;
  segments: TimelineSegment[];
  isDragging: boolean;
  dragOverPos: 'before' | 'after' | null;
  onOpenDetail: (taskId: string) => void;
  onClickCell: (task: TaskItem, dateStr: string) => void;
  onHoverLog: (
    targetEl: HTMLElement,
    task: TaskItem,
    colMeta: DateColMeta,
    log: DailyLog
  ) => void;
  onLeaveLog: () => void;
  onDragStart: (e: React.DragEvent, taskId: string) => void;
  onDragOver: (e: React.DragEvent, taskId: string) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, taskId: string) => void;
  onDragEnd: () => void;
}

const GanttTaskRow = React.memo<GanttTaskRowProps>(
  ({
    task,
    dateColumns,
    nextWindowDate,
    taskLogsByDate,
    segments,
    isDragging,
    dragOverPos,
    onOpenDetail,
    onClickCell,
    onHoverLog,
    onLeaveLog,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
  }) => {
    const statusStyle = getRowStatusClasses(task.status);
    const totalCols = dateColumns.length;

    return (
      <div
        draggable
        onDragStart={(e) => onDragStart(e, task.id)}
        onDragOver={(e) => onDragOver(e, task.id)}
        onDragLeave={onDragLeave}
        onDrop={(e) => onDrop(e, task.id)}
        onDragEnd={onDragEnd}
        className={`flex w-full min-w-0 border-b ${statusStyle.border} ${statusStyle.rowBg} transition-colors group relative ${
          isDragging ? 'opacity-40' : ''
        }`}
      >
        {dragOverPos === 'before' && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-amber-500 z-30 pointer-events-none" />
        )}
        {dragOverPos === 'after' && (
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-amber-500 z-30 pointer-events-none" />
        )}

        {/* Task Label Card */}
        <div className="w-28 sm:w-52 md:w-60 shrink-0 px-1.5 sm:px-2 py-2 border-r border-amber-800/20 dark:border-amber-700/35 flex items-center gap-1.5 min-w-0 max-sm:sticky max-sm:left-0 max-sm:z-20 max-sm:bg-[#fbf3df] dark:max-sm:bg-[#201b16]">
          <GripVertical className="w-3.5 h-3.5 text-amber-800/25 dark:text-amber-300/25 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing hidden sm:block" />
          <div
            onClick={() => onOpenDetail(task.id)}
            className="flex items-center gap-1.5 min-w-0 flex-1 cursor-pointer hover:opacity-85 transition-opacity"
          >
            <span
              className={`sm:hidden w-2 h-2 rounded-full shrink-0 ${statusStyle.dotClass}`}
              aria-hidden="true"
            />
            <span
              className={`hidden sm:inline-block shrink-0 text-[9px] sm:text-[10px] px-1.5 py-0.5 rounded font-bold ${statusStyle.badge}`}
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

        {/* Dual-Layer Timeline Container: Bottom = Grid Cells, Top = Continuous Gradient Thin Lines */}
        <div className="flex-1 min-w-0 relative isolate flex">
          {/* Bottom Layer: Grid Cells & Vertical Axes */}
          <div
            className="flex-1 min-w-0 grid items-stretch"
            style={{ gridTemplateColumns: `repeat(${totalCols}, minmax(0, 1fr))` }}
          >
            {dateColumns.map((col, dateIdx) => {
              const log = taskLogsByDate?.get(col.dateStr);
              const nextDateStr =
                dateIdx < totalCols - 1 ? dateColumns[dateIdx + 1].dateStr : nextWindowDate;
              const hasNextLog = !!(log && nextDateStr && taskLogsByDate?.has(nextDateStr));
              const isTipCell = !!(log && !hasNextLog);
              const typeStyle = log ? TIMELINE_TYPE_STYLE[log.progressType] : null;

              return (
                <div
                  key={col.dateStr}
                  onClick={() => onClickCell(task, col.dateStr)}
                  onMouseEnter={
                    log ? (e) => onHoverLog(e.currentTarget, task, col, log) : undefined
                  }
                  onMouseLeave={log ? onLeaveLog : undefined}
                  className={`min-w-0 h-full flex items-center justify-center border-r border-amber-800/10 dark:border-amber-700/15 relative cursor-pointer group/cell ${
                    col.isToday
                      ? 'bg-amber-500/15 dark:bg-amber-500/20'
                      : col.isWeekend
                      ? 'bg-black/[0.025] dark:bg-white/[0.02]'
                      : ''
                  } ${
                    log
                      ? 'hover:bg-amber-500/15 dark:hover:bg-amber-500/25'
                      : 'hover:bg-amber-500/10 dark:hover:bg-amber-500/15'
                  } transition-colors`}
                >
                  {col.isToday && (
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-amber-600/45 pointer-events-none" />
                  )}

                  {log && typeStyle ? (
                    <span
                      className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-20 rounded-full opacity-0 scale-75 group-hover/cell:opacity-100 group-hover/cell:scale-100 transition-all duration-150 ${
                        isTipCell
                          ? 'w-4 h-4 sm:w-[18px] sm:h-[18px] border-2 border-white/90 dark:border-amber-100/90'
                          : `w-2.5 h-2.5 border-2 ${typeStyle.hoverDotClass}`
                      }`}
                    />
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-transparent group-hover/cell:bg-amber-500/55 transition-colors pointer-events-none" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Top Layer: Continuous Gradient Thin Lines & Tip Spheres (unbroken by vertical axes) */}
          {segments.length > 0 && (
            <div className="absolute inset-0 pointer-events-none z-10">
              {segments.map((seg) => {
                const tipStyle = TIMELINE_TYPE_STYLE[seg.tipType];
                return (
                  <div
                    key={seg.key}
                    style={{
                      left: `${seg.leftPct}%`,
                      width: `${seg.widthPct}%`,
                      background: seg.gradient,
                    }}
                    className="absolute top-1/2 -translate-y-1/2 h-[5.25px] sm:h-[6px] rounded-full"
                  >
                    {seg.showTipBall && (
                      <span
                        style={{ backgroundColor: tipStyle.ballColor }}
                        className="absolute right-0 top-1/2 translate-x-1/2 -translate-y-1/2 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full"
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }
);

GanttTaskRow.displayName = 'GanttTaskRow';

export const GanttView: React.FC = () => {
  const {
    filteredTasks,
    logs,
    openCheckInModal,
    openTaskDetail,
    reorderTasksGlobal,
    ganttGroupOrder,
    setGanttGroupOrder,
  } = useTaskContext();

  const [timeRange, setTimeRange] = useState<GanttTimeRange>('month');
  const [pivotDate, setPivotDate] = useState<string>(getTodayString());
  const [statusFilter, setStatusFilter] = useState<Set<TaskStatus>>(new Set());
  const [isMobilePhone, setIsMobilePhone] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false
  );
  const todayStr = getTodayString();

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia('(max-width: 639px)');
    const onChange = (e: MediaQueryListEvent) => setIsMobilePhone(e.matches);
    setIsMobilePhone(mql.matches);
    mql.addEventListener?.('change', onChange);
    return () => mql.removeEventListener?.('change', onChange);
  }, []);

  const toggleStatusFilter = (status: TaskStatus) => {
    setHoveredCell(null);
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

  // Tooltip state (only triggered when hovering recorded line/cells)
  const [hoveredCell, setHoveredCell] = useState<HoveredLogInfo | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // ── Two-level drag sort state ─────────────────────────────────────────────
  const [draggingGroupTag, setDraggingGroupTag] = useState<string | null>(null);
  const [dragOverGroupTag, setDragOverGroupTag] = useState<string | null>(null);
  const [groupDropPos, setGroupDropPos] = useState<'before' | 'after'>('before');

  const [draggingTaskId, setDraggingTaskId] = useState<string | null>(null);
  const [dragOverTaskId, setDragOverTaskId] = useState<string | null>(null);
  const [taskDropPos, setTaskDropPos] = useState<'before' | 'after'>('before');

  const draggingTaskIdRef = useRef<string | null>(null);
  const dragOverTaskIdRef = useRef<string | null>(null);
  const taskDropPosRef = useRef<'before' | 'after'>('before');

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
    return getGanttDateWindow(timeRange, earliestDate, latestDate, pivotDate, isMobilePhone);
  }, [timeRange, earliestDate, latestDate, pivotDate, isMobilePhone]);

  const isCompactCols = dates.length > 21;

  // Precompute column metadata once per window change (avoids Date allocations inside row/cell loops)
  const dateColumns = useMemo<DateColMeta[]>(() => {
    return dates.map((dateStr, idx) => {
      const [, month, day] = dateStr.split('-');
      const dayNum = parseInt(day, 10);
      const weekdayFull = getWeekdayChinese(dateStr);
      return {
        dateStr,
        dayNum,
        monthLabel: !isCompactCols || dayNum === 1 || idx === 0 ? `${parseInt(month, 10)}月` : '',
        weekdayShort: weekdayFull.replace('周', ''),
        weekdayFull,
        isToday: dateStr === todayStr,
        isWeekend: isWeekend(dateStr),
      };
    });
  }, [dates, todayStr, isCompactCols]);

  const prevWindowDate = useMemo(
    () => (dates.length > 0 ? addDays(dates[0], -1) : null),
    [dates]
  );
  const nextWindowDate = useMemo(
    () => (dates.length > 0 ? addDays(dates[dates.length - 1], 1) : null),
    [dates]
  );

  // Single-pass index of logs by taskId -> date -> DailyLog + prefix-sum cumulative hours
  const { logsByTaskMap, cumulativeHoursByTaskId } = useMemo(() => {
    const byTask = new Map<string, Map<string, DailyLog>>();

    logs.forEach((log) => {
      let dateMap = byTask.get(log.taskId);
      if (!dateMap) {
        dateMap = new Map<string, DailyLog>();
        byTask.set(log.taskId, dateMap);
      }
      dateMap.set(log.date, log);
    });

    const cumHoursMap = new Map<string, Map<string, number>>();
    byTask.forEach((dateMap, taskId) => {
      const taskLogs = Array.from(dateMap.values());
      if (taskLogs.length > 1) {
        taskLogs.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      }
      const dateHours = new Map<string, number>();
      let running = 0;
      for (let i = 0; i < taskLogs.length; i++) {
        const h = taskLogs[i].hours;
        if (typeof h === 'number' && !isNaN(h)) {
          running += h;
        }
        dateHours.set(taskLogs[i].date, Math.round(running * 10) / 10);
      }
      cumHoursMap.set(taskId, dateHours);
    });

    return { logsByTaskMap: byTask, cumulativeHoursByTaskId: cumHoursMap };
  }, [logs]);

  // Precompute continuous gradient segments per task
  const segmentsByTaskId = useMemo(() => {
    const map = new Map<string, TimelineSegment[]>();
    const totalCols = dates.length;
    if (totalCols === 0) return map;

    displayedTasks.forEach((task) => {
      const taskDateMap = logsByTaskMap.get(task.id);
      if (!taskDateMap || taskDateMap.size === 0) return;

      const segments: TimelineSegment[] = [];
      let segStart = -1;
      let segLogs: DailyLog[] = [];

      const flushSegment = (endIdx: number) => {
        if (segStart < 0 || segLogs.length === 0) return;
        const extendsLeft = segStart === 0 && !!(prevWindowDate && taskDateMap.has(prevWindowDate));
        const extendsRight =
          endIdx === totalCols - 1 && !!(nextWindowDate && taskDateMap.has(nextWindowDate));

        const leftPct = extendsLeft ? 0 : ((segStart + 0.1) / totalCols) * 100;
        const rightPct = extendsRight ? 100 : ((endIdx + 0.5) / totalCols) * 100;
        const widthPct = Math.max(0.5, rightPct - leftPct);

        const tipType = segLogs[segLogs.length - 1].progressType;

        segments.push({
          key: `${dates[segStart]}_${dates[endIdx]}`,
          startIdx: segStart,
          endIdx,
          leftPct: Math.round(leftPct * 1000) / 1000,
          widthPct: Math.round(widthPct * 1000) / 1000,
          gradient: buildSegmentGradient(
            segLogs,
            segStart,
            endIdx,
            extendsLeft,
            extendsRight,
            totalCols
          ),
          tipType,
          showTipBall: !extendsRight,
        });

        segStart = -1;
        segLogs = [];
      };

      for (let i = 0; i < totalCols; i++) {
        const log = taskDateMap.get(dates[i]);
        if (log) {
          if (segStart < 0) {
            segStart = i;
          }
          segLogs.push(log);
        } else if (segStart >= 0) {
          flushSegment(i - 1);
        }
      }
      if (segStart >= 0) {
        flushSegment(totalCols - 1);
      }

      if (segments.length > 0) {
        map.set(task.id, segments);
      }
    });

    return map;
  }, [displayedTasks, dates, logsByTaskMap, prevWindowDate, nextWindowDate]);

  const handleShiftDate = (days: number) => {
    setHoveredCell(null);
    setPivotDate((prev) => addDays(prev, days));
  };

  const handleResetToday = () => {
    setHoveredCell(null);
    setPivotDate(todayStr);
  };

  const sortedGroupEntries = useMemo(() => {
    const allGroupKeys = Object.keys(groupedTasks);
    const ordered = ganttGroupOrder.filter((tag) => allGroupKeys.includes(tag));
    const newTags = allGroupKeys.filter((tag) => !ordered.includes(tag));
    return [...ordered, ...newTags].map((tag) => [tag, groupedTasks[tag]] as [string, TaskItem[]]);
  }, [groupedTasks, ganttGroupOrder]);

  // Keep refs for callbacks passed to React.memo(GanttTaskRow) so rows never re-render on hover/context updates
  const openCheckInModalRef = useRef(openCheckInModal);
  openCheckInModalRef.current = openCheckInModal;

  const openTaskDetailRef = useRef(openTaskDetail);
  openTaskDetailRef.current = openTaskDetail;

  const reorderTasksGlobalRef = useRef(reorderTasksGlobal);
  reorderTasksGlobalRef.current = reorderTasksGlobal;

  const cumulativeHoursRef = useRef(cumulativeHoursByTaskId);
  cumulativeHoursRef.current = cumulativeHoursByTaskId;

  const handleOpenDetail = useCallback((taskId: string) => {
    openTaskDetailRef.current(taskId);
  }, []);

  const handleClickCell = useCallback((task: TaskItem, dateStr: string) => {
    setHoveredCell(null);
    openCheckInModalRef.current(task, dateStr);
  }, []);

  const handleHoverLog = useCallback(
    (targetEl: HTMLElement, task: TaskItem, colMeta: DateColMeta, log: DailyLog) => {
      const rect = targetEl.getBoundingClientRect();
      const clampedX = Math.max(
        130,
        Math.min(window.innerWidth - 130, rect.left + rect.width / 2)
      );
      const placeBelow = rect.top < 180;
      const cumulativeHours = cumulativeHoursRef.current.get(task.id)?.get(colMeta.dateStr) ?? 0;

      setHoveredCell({
        x: clampedX,
        y: placeBelow ? rect.bottom + 8 : rect.top - 10,
        placeBelow,
        task,
        colMeta,
        log,
        cumulativeHours,
      });
    },
    []
  );

  const handleLeaveLog = useCallback(() => {
    setHoveredCell(null);
  }, []);

  // ── Group drag handlers ───────────────────────────────────────────────────
  const handleGroupDragStart = (e: React.DragEvent, tag: string) => {
    setHoveredCell(null);
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

  // ── Task row drag handlers (stable references) ────────────────────────────
  const handleTaskDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    setHoveredCell(null);
    draggingTaskIdRef.current = taskId;
    setDraggingTaskId(taskId);
    e.dataTransfer.setData('dragType', 'task');
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleTaskDragOver = useCallback((e: React.DragEvent, taskId: string) => {
    if (e.dataTransfer.getData('dragType') === 'group') return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (taskId === draggingTaskIdRef.current) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nextPos = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    if (dragOverTaskIdRef.current !== taskId) {
      dragOverTaskIdRef.current = taskId;
      setDragOverTaskId(taskId);
    }
    if (taskDropPosRef.current !== nextPos) {
      taskDropPosRef.current = nextPos;
      setTaskDropPos(nextPos);
    }
  }, []);

  const handleTaskDragLeave = useCallback((e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      dragOverTaskIdRef.current = null;
      setDragOverTaskId(null);
    }
  }, []);

  const handleTaskDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const draggedId = draggingTaskIdRef.current;
    if (!draggedId || draggedId === targetId) return;
    reorderTasksGlobalRef.current(draggedId, targetId, taskDropPosRef.current);
    draggingTaskIdRef.current = null;
    dragOverTaskIdRef.current = null;
    setDraggingTaskId(null);
    setDragOverTaskId(null);
  }, []);

  const handleTaskDragEnd = useCallback(() => {
    draggingTaskIdRef.current = null;
    dragOverTaskIdRef.current = null;
    setDraggingTaskId(null);
    setDragOverTaskId(null);
  }, []);

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
              onClick={() => {
                setHoveredCell(null);
                setStatusFilter(new Set());
              }}
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
                { key: 'week', label: isMobilePhone ? '周·7日' : '旬·10日' },
                { key: 'month', label: '月·21日' },
                { key: 'all', label: '全景·35日' },
              ] as const
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  setHoveredCell(null);
                  setTimeRange(item.key);
                }}
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
      <div className="hidden sm:flex px-3 sm:px-4 py-1.5 border-b border-amber-800/15 dark:border-amber-700/25 bg-[#f7edd5]/75 dark:bg-[#231c15]/90 flex-wrap items-center justify-between gap-2 text-[11px] text-stone-600 dark:text-stone-300 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <span className="text-amber-900/70 dark:text-amber-300/70 font-bold">印记:</span>
            {(
              [
                { key: 'progress', label: '实质推进' },
                { key: 'rest', label: '休整' },
                { key: 'completed', label: '通关达成' },
              ] as const
            ).map(({ key, label }) => {
              const st = TIMELINE_TYPE_STYLE[key];
              return (
                <span key={key} className="flex items-center gap-1.5">
                  <span className="relative inline-flex items-center w-5 h-3 shrink-0" aria-hidden="true">
                    <span
                      style={{ background: st.legendGradient }}
                      className="w-4 h-[4.5px] rounded-full"
                    />
                    <span
                      style={{ backgroundColor: st.ballColor }}
                      className="w-2.5 h-2.5 rounded-full -ml-1"
                    />
                  </span>
                  <span>{label}</span>
                </span>
              );
            })}
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
          悬停有记录的线查看当天简略 · 点击任意方格打卡或修改
        </span>
      </div>

      {/* Main Gantt Grid Container — 100% Width-Adaptive on sm+; Horizontal Scroll on <640px for 21/35d */}
      <div
        ref={scrollContainerRef}
        onScroll={() => setHoveredCell(null)}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-auto sm:overflow-x-hidden relative select-none w-full"
      >
        <div
          className="w-full min-w-0"
          style={
            isMobilePhone && dateColumns.length > 7
              ? { minWidth: `${112 + dateColumns.length * 30}px` }
              : undefined
          }
        >
          {/* Header Row */}
          <div className="flex w-full min-w-0 border-b border-amber-800/25 dark:border-amber-700/40 sticky top-0 bg-[#f3e6c8]/95 dark:bg-[#2a221a]/95 z-30 backdrop-blur-md">
            <div className="w-28 sm:w-52 md:w-60 shrink-0 px-2 sm:px-2.5 py-2 border-r border-amber-800/20 dark:border-amber-700/35 text-[11px] font-extrabold text-amber-950 dark:text-amber-200 uppercase tracking-wider flex items-center justify-between gap-1 max-sm:sticky max-sm:left-0 max-sm:z-20 max-sm:bg-[#f3e6c8] dark:max-sm:bg-[#2a221a]">
              <span className="truncate">委托名录 (按主标签)</span>
            </div>

            {/* Adaptive Date Columns Grid */}
            <div
              className="flex-1 min-w-0 grid"
              style={{ gridTemplateColumns: `repeat(${dateColumns.length}, minmax(0, 1fr))` }}
            >
              {dateColumns.map((col) => (
                <div
                  key={col.dateStr}
                  className={`min-w-0 flex flex-col items-center justify-center py-1.5 border-r border-amber-800/10 dark:border-amber-700/20 text-center transition-colors ${
                    col.isToday
                      ? 'bg-amber-500/20 dark:bg-amber-500/25'
                      : col.isWeekend
                      ? 'bg-amber-900/5 dark:bg-white/[0.03]'
                      : ''
                  }`}
                >
                  <span
                    className={`text-[9px] sm:text-[10px] leading-none ${
                      col.isToday
                        ? 'font-extrabold text-amber-800 dark:text-amber-300'
                        : 'text-stone-500 dark:text-stone-400'
                    }`}
                  >
                    {isCompactCols || isMobilePhone
                      ? col.isToday
                        ? '今'
                        : col.weekdayShort
                      : col.weekdayFull}
                  </span>
                  <span
                    className={`text-[10px] sm:text-xs font-mono mt-0.5 leading-none ${
                      col.isToday
                        ? 'w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center bg-amber-600 text-white rounded-full font-extrabold shadow-2xs'
                        : 'text-stone-800 dark:text-amber-100 font-semibold'
                    }`}
                  >
                    {col.dayNum}
                  </span>
                  <span className="text-[8px] sm:text-[9px] text-stone-400 dark:text-stone-500 leading-none mt-0.5 h-2.5">
                    {col.monthLabel}
                  </span>
                </div>
              ))}
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
                  <div className="w-28 sm:w-52 md:w-60 shrink-0 py-1.5 px-2 border-r border-amber-800/20 dark:border-amber-700/35 flex items-center gap-1.5 min-w-0 max-sm:sticky max-sm:left-0 max-sm:z-20 max-sm:bg-[#efe0bd] dark:max-sm:bg-[#261e17]">
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
                {groupTasks.map((task) => (
                  <GanttTaskRow
                    key={task.id}
                    task={task}
                    dateColumns={dateColumns}
                    nextWindowDate={nextWindowDate}
                    taskLogsByDate={logsByTaskMap.get(task.id)}
                    segments={segmentsByTaskId.get(task.id) ?? EMPTY_SEGMENTS}
                    isDragging={draggingTaskId === task.id}
                    dragOverPos={dragOverTaskId === task.id ? taskDropPos : null}
                    onOpenDetail={handleOpenDetail}
                    onClickCell={handleClickCell}
                    onHoverLog={handleHoverLog}
                    onLeaveLog={handleLeaveLog}
                    onDragStart={handleTaskDragStart}
                    onDragOver={handleTaskDragOver}
                    onDragLeave={handleTaskDragLeave}
                    onDrop={handleTaskDrop}
                    onDragEnd={handleTaskDragEnd}
                  />
                ))}

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

      {/* Hover Tooltip — Mounted to document.body to avoid backdrop-filter fixed containing block offset */}
      {typeof document !== 'undefined' &&
        hoveredCell &&
        createPortal(
          (() => {
            const { log, task, colMeta, cumulativeHours } = hoveredCell;
            const logRestMinutes =
              typeof log.totalRestMinutes === 'number' && !isNaN(log.totalRestMinutes)
                ? log.totalRestMinutes
                : Array.isArray(log.restSessions)
                  ? log.restSessions.reduce((s, r) => s + r.durationMinutes, 0)
                  : 0;
            const sessionCount = Array.isArray(log.workSessions) ? log.workSessions.length : 0;
            const typeStyle = TIMELINE_TYPE_STYLE[log.progressType];

            return (
              <div
                style={{
                  position: 'fixed',
                  left: `${hoveredCell.x}px`,
                  top: `${hoveredCell.y}px`,
                  transform: hoveredCell.placeBelow
                    ? 'translate(-50%, 0)'
                    : 'translate(-50%, -100%)',
                  pointerEvents: 'none',
                  zIndex: 60,
                }}
                className="bg-[#1c140e]/95 text-amber-50 border border-amber-500/50 rounded-xl px-3 py-2 shadow-2xl text-xs max-w-xs"
              >
                <div className="flex items-center justify-between gap-3 text-[11px] text-amber-300/80 border-b border-amber-700/40 pb-1 mb-1.5">
                  <span className="font-mono">{colMeta.dateStr}</span>
                  <span>{colMeta.weekdayFull}</span>
                </div>

                <div className="font-bold text-xs line-clamp-1 mb-1">{task.title}</div>

                <div className="flex items-center flex-wrap gap-1.5 mb-1">
                  <div className="flex items-center gap-1.5 mr-auto">
                    <span className={`w-2 h-2 rounded-full ${typeStyle.dotClass}`} />
                    <span className="text-[11px] font-medium">
                      {PROGRESS_TYPE_CONFIG[log.progressType].label}
                    </span>
                  </div>
                  {sessionCount > 1 && (
                    <span className="text-[10px] font-medium text-amber-200/80 bg-amber-950/70 px-1.5 py-0.5 rounded border border-amber-800/60">
                      {sessionCount} 次记录
                    </span>
                  )}
                  {typeof log.hours === 'number' && log.hours > 0 && (
                    <span className="text-[10px] font-semibold text-sky-300 bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-800/80">
                      投入 {formatHours(log.hours)}
                    </span>
                  )}
                  {logRestMinutes > 0 && (
                    <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/80">
                      休整 {formatRestDuration(logRestMinutes)}
                    </span>
                  )}
                </div>

                {log.note ? (
                  <div className="text-[11px] text-amber-100/90 bg-black/35 p-1.5 rounded mt-1 line-clamp-3 italic">
                    "{log.note}"
                  </div>
                ) : (
                  <div className="text-[10px] text-amber-200/60">无附加日志笔记</div>
                )}

                {cumulativeHours > 0 && (
                  <div className="text-[10px] text-amber-200/75 mt-1.5 pt-1 border-t border-amber-700/40 flex justify-between">
                    <span>截至当日累计:</span>
                    <span className="font-semibold text-amber-300">
                      {formatHours(cumulativeHours)}
                    </span>
                  </div>
                )}
              </div>
            );
          })(),
          document.body
        )}
    </div>
  );
};
