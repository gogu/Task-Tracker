import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  BookOpen,
  Settings,
  Sparkles,
  Flame,
  Clock,
  CheckCircle2,
  Heart,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Plus,
  X,
  Dices,
  BellRing,
  FileText,
  ArrowRightLeft,
  Send,
  Edit3,
  MessageCircle,
  GripVertical,
  Award,
  Home,
  ScrollText,
  BarChart3,
  Search,
  Tag,
  Undo2,
  Redo2,
  Cloud,
  FolderSync,
  Download,
  Upload,
  SlidersHorizontal,
  Calendar,
  Maximize2,
  Minimize2,
  Coffee,
  Play,
  Pause,
  SkipForward,
  RotateCcw,
  Timer,
} from 'lucide-react';
import {
  TaskItem,
  TaskStatus,
  ProgressType,
} from '../types';
import { useTaskContext } from '../context/TaskContext';
import {
  formatDate,
  addDays,
  getWeekdayChinese,
  getRelativeTimeString,
  formatHours,
} from '../utils/date';
import {
  formatTimeHHMM,
  addMinutesToTimeHHMM,
  parseHHMMToMinutes,
  computeTaskTimeAndRestProfile,
  computeTaskTimeSlotAffinity,
  TaskTimeSlotAffinity,
  formatRestDuration,
  extractLogWorkIntervals,
} from '../utils/timeDistribution';
import {
  NpcConfig,
  NpcExpression,
  TimePeriodKey,
  EXPRESSION_META,
  loadNpcConfig,
  saveNpcConfig,
  resetNpcConfig,
  isNpcImageReady,
  resolveCachedNpcImageUrl,
  preloadNpcConfigAssets,
  refreshNpcConfigImageCache,
  loadAffectionPoints,
  saveAffectionPoints,
  calculateGuildRank,
  getQuestCategoryBadge,
  RPG_STATUS_META,
  getStaleInProgressTasks,
  getTimePeriodInfo,
  getTimeGreeting,
  getRandomChatter,
} from '../utils/guildNpc';
import { NpcConfigModal } from './NpcConfigModal';
import { GanttView } from './GanttView';
import { StatsView } from './StatsView';
import { TaskDetailDrawer } from './TaskDetailDrawer';

type OverlayMode = 'none' | 'ledger' | 'gantt' | 'stats';

type DialogueMode =
  | 'hub'
  | 'select_checkin_task'
  | 'inspect_task'
  | 'checkin_form'
  | 'pomodoro'
  | 'rest_prompt'
  | 'rest_dial'
  | 'rest_countdown'
  | 'checkin_done'
  | 'create_task'
  | 'edit_task'
  | 'random_pick'
  | 'stale_review'
  | 'sync_menu';

type PomodoroPhase = 'focus' | 'short_break' | 'long_break';
type PomodoroRunState = 'idle' | 'running' | 'paused';

interface DailyPomodoroStats {
  date: string;
  count: number;
  minutes: number;
}

const POMODORO_DAILY_STORAGE_KEY = 'questkeeper_pomodoro_daily_v1';

function loadDailyPomodoroStats(today: string): DailyPomodoroStats {
  try {
    const raw = localStorage.getItem(POMODORO_DAILY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DailyPomodoroStats>;
      if (
        parsed.date === today &&
        typeof parsed.count === 'number' &&
        typeof parsed.minutes === 'number'
      ) {
        return {
          date: today,
          count: Math.max(0, parsed.count),
          minutes: Math.max(0, parsed.minutes),
        };
      }
    }
  } catch {
    // Ignore storage read failures
  }
  return { date: today, count: 0, minutes: 0 };
}

function saveDailyPomodoroStats(stats: DailyPomodoroStats): void {
  try {
    localStorage.setItem(POMODORO_DAILY_STORAGE_KEY, JSON.stringify(stats));
  } catch {
    // Ignore storage write failures
  }
}

function playPomodoroChime(kind: 'focus_done' | 'break_done'): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const notes =
      kind === 'focus_done'
        ? [523.25, 659.25, 783.99, 1046.5]
        : [392.0, 493.88, 587.33, 783.99];
    const startAt = ctx.currentTime + 0.02;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = kind === 'focus_done' ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, startAt + idx * 0.12);

      gain.gain.setValueAtTime(0.0001, startAt + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.14, startAt + idx * 0.12 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + idx * 0.12 + 0.42);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt + idx * 0.12);
      osc.stop(startAt + idx * 0.12 + 0.45);
    });

    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 1500);
  } catch {
    // Ignore audio context errors when autoplay is restricted
  }
}

function formatCountdownMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

interface FloatingHeart {
  id: number;
  x: number;
  y: number;
}

const COMMON_TAG_PRESETS = [
  '游戏',
  '书籍',
  '影视',
  '漫画',
  '音乐',
  'Steam',
  'PS5',
  'Switch',
  '微信读书',
  '实体书',
  '动画',
];

const LEDGER_TABS: TaskStatus[] = ['in_progress', 'backlog', 'done', 'paused'];

function dialPolarPoint(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: cx + r * Math.sin(rad),
    y: cy - r * Math.cos(rad),
  };
}

function describeDialArc(cx: number, cy: number, r: number, angleDeg: number): string {
  const clamped = Math.max(0.5, Math.min(359.9, angleDeg));
  const start = dialPolarPoint(cx, cy, r, 0);
  const end = dialPolarPoint(cx, cy, r, clamped);
  const largeArc = clamped > 180 ? 1 : 0;
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

function describeDialWedge(cx: number, cy: number, r: number, angleDeg: number): string {
  const clamped = Math.max(0.5, Math.min(359.9, angleDeg));
  const start = dialPolarPoint(cx, cy, r, 0);
  const end = dialPolarPoint(cx, cy, r, clamped);
  const largeArc = clamped > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)} Z`;
}

function clientPointToDialMinutes(
  svg: SVGSVGElement | null,
  clientX: number,
  clientY: number,
  maxMinutes: number = 60
): number | null {
  if (!svg) return null;
  const rect = svg.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const dx = clientX - cx;
  const dy = clientY - cy;
  const angleDeg = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
  const rawMins = Math.round(angleDeg / 6);
  return rawMins === 0 ? Math.min(60, maxMinutes) : Math.max(1, Math.min(maxMinutes, rawMins));
}

interface PocketWatchDialProps {
  dialRef: React.RefObject<SVGSVGElement | null>;
  dialAngle: number;
  activeMinuteMarker: number | null;
  accent: 'emerald' | 'rose';
  interactive: boolean;
  isDragging: boolean;
  onDraggingChange: (dragging: boolean) => void;
  onUpdatePoint: (clientX: number, clientY: number) => void;
}

const DIAL_NUMERALS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60];

/** Shared interactive SVG pocket-watch dial for rest timer and Pomodoro phases. */
const PocketWatchDialSvg: React.FC<PocketWatchDialProps> = ({
  dialRef,
  dialAngle,
  activeMinuteMarker,
  accent,
  interactive,
  isDragging,
  onDraggingChange,
  onUpdatePoint,
}) => {
  const isRose = accent === 'rose';
  const strokeHex = isRose ? '#e11d48' : '#10b981';
  const wedgeRgba = isRose ? 'rgba(225, 29, 72, 0.20)' : 'rgba(16, 185, 129, 0.22)';
  const handTip = dialPolarPoint(110, 110, 62, dialAngle);

  return (
    <svg
      ref={dialRef}
      viewBox="0 0 220 220"
      className={`w-56 h-56 sm:w-60 sm:h-60 select-none touch-none drop-shadow-md ${
        interactive ? 'cursor-pointer' : 'cursor-default'
      }`}
      style={{ touchAction: 'none' }}
      onPointerDown={(e) => {
        if (!interactive) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        onDraggingChange(true);
        onUpdatePoint(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (interactive && isDragging) {
          onUpdatePoint(e.clientX, e.clientY);
        }
      }}
      onPointerUp={() => onDraggingChange(false)}
      onPointerCancel={() => onDraggingChange(false)}
    >
      {/* Outer Watch Frame */}
      <circle
        cx={110}
        cy={110}
        r={104}
        className="fill-amber-950/90 dark:fill-[#140e09] stroke-amber-500/60"
        strokeWidth={3}
      />
      <circle
        cx={110}
        cy={110}
        r={94}
        className="fill-[#fdf6e7] dark:fill-[#241b13] stroke-amber-700/35"
        strokeWidth={1.5}
      />

      {/* Selected / Remaining Duration Wedge & Progress Arc */}
      {dialAngle >= 359.5 ? (
        <circle
          cx={110}
          cy={110}
          r={80}
          fill={wedgeRgba}
          stroke={strokeHex}
          strokeWidth={6}
        />
      ) : (
        <>
          <path d={describeDialWedge(110, 110, 80, dialAngle)} fill={wedgeRgba} />
          <path
            d={describeDialArc(110, 110, 80, dialAngle)}
            fill="none"
            stroke={strokeHex}
            strokeWidth={6}
            strokeLinecap="round"
          />
        </>
      )}

      {/* 60 Tick Marks */}
      {Array.from({ length: 60 }, (_, idx) => {
        const deg = idx * 6;
        const isMajor = idx % 5 === 0;
        const p1 = dialPolarPoint(110, 110, isMajor ? 89 : 88, deg);
        const p2 = dialPolarPoint(110, 110, isMajor ? 79 : 83, deg);
        return (
          <line
            key={idx}
            x1={p1.x}
            y1={p1.y}
            x2={p2.x}
            y2={p2.y}
            className={
              isMajor
                ? 'stroke-amber-900 dark:stroke-amber-200'
                : 'stroke-amber-800/35 dark:stroke-amber-400/30'
            }
            strokeWidth={isMajor ? 2 : 1}
            strokeLinecap="round"
          />
        );
      })}

      {/* Major Dial Numerals */}
      {DIAL_NUMERALS.map((num) => {
        const pos = dialPolarPoint(110, 110, 67, num * 6);
        const active = activeMinuteMarker === num;
        return (
          <text
            key={num}
            x={pos.x}
            y={pos.y}
            textAnchor="middle"
            dominantBaseline="central"
            className={`text-[10px] font-mono font-bold pointer-events-none ${
              active
                ? isRose
                  ? 'fill-rose-700 dark:fill-rose-300'
                  : 'fill-emerald-700 dark:fill-emerald-300'
                : 'fill-stone-600 dark:fill-amber-200/75'
            }`}
          >
            {num}
          </text>
        );
      })}

      {/* Dial Hand */}
      <line
        x1={110}
        y1={110}
        x2={handTip.x}
        y2={handTip.y}
        stroke="#d97706"
        strokeWidth={3.5}
        strokeLinecap="round"
      />
      <circle
        cx={handTip.x}
        cy={handTip.y}
        r={7}
        className={`${
          isRose ? 'fill-rose-500' : 'fill-emerald-500'
        } stroke-white dark:stroke-stone-900`}
        strokeWidth={2}
      />
      <circle
        cx={110}
        cy={110}
        r={6}
        className="fill-amber-600 stroke-amber-100"
        strokeWidth={2}
      />
    </svg>
  );
};

export const KanbanView: React.FC = () => {
  const {
    viewMode,
    setViewMode,
    filteredTasks,
    tasks,
    logs,
    allTags,
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    addTask,
    updateTask,
    deleteTask,
    moveTaskStatus,
    reorderTasks,
    addOrUpdateLog,
    addRestSession,
    deleteWorkSession,
    deleteLog,
    getLog,
    getLogsForTask,
    getLatestLogForTask,
    getTaskTotalHours,
    pendingRestPrompt,
    setPendingRestPrompt,
    openTaskDetail,
    requestConfirm,
    showToast,
    canUndo,
    canRedo,
    lastUndoDescription,
    lastRedoDescription,
    undo,
    redo,
    exportData,
    importData,
    user,
    isSyncing,
    syncStatus,
    hasUnsyncedDriveChanges,
    setDriveSyncModalOpen,
    localSync,
    setLocalSyncModalOpen,
  } = useTaskContext();

  // ── Reactive Wall-Clock Time & Viewport Tracking ───────────────────────────
  const [liveNow, setLiveNow] = useState<Date>(() => new Date());
  const todayStr = useMemo(() => formatDate(liveNow), [liveNow]);
  const yesterdayStr = useMemo(() => addDays(todayStr, -1), [todayStr]);
  const periodInfo = useMemo(() => getTimePeriodInfo(liveNow), [liveNow]);

  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>(() => {
    if (typeof window === 'undefined') return { width: 1280, height: 800 };
    return {
      width: Math.round(window.visualViewport?.width ?? window.innerWidth),
      height: Math.round(window.visualViewport?.height ?? window.innerHeight),
    };
  });
  const isPortraitMode = viewportSize.height > viewportSize.width;
  const isCompactScreen = viewportSize.width < 1024;
  const isPortraitOrCompact = isPortraitMode || isCompactScreen;
  const isShortLandscape = !isPortraitMode && viewportSize.height <= 780;

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── NPC Appearance & Affection State ───────────────────────────────────────
  const [npcConfig, setNpcConfig] = useState<NpcConfig>(() => loadNpcConfig());
  const [npcModalOpen, setNpcModalOpen] = useState(false);
  const [affection, setAffection] = useState<number>(() => loadAffectionPoints());
  const [floatingHearts, setFloatingHearts] = useState<FloatingHeart[]>([]);
  const [cacheVersion, setCacheVersion] = useState(0);
  const [loadedRawSrcs, setLoadedRawSrcs] = useState<Record<string, boolean>>({});
  const [failedRawSrcs, setFailedRawSrcs] = useState<Record<string, boolean>>({});
  const [lastReadyRawSrc, setLastReadyRawSrc] = useState<string>('');

  // ── Primary Navigation & Overlay State ─────────────────────────────────────
  const [activeOverlay, setActiveOverlay] = useState<OverlayMode>(() => {
    if (viewMode === 'gantt') return 'gantt';
    if (viewMode === 'stats') return 'stats';
    return 'none';
  });
  const [wideOverlayMode, setWideOverlayMode] = useState<boolean>(false);
  const [showPortraitCompanion, setShowPortraitCompanion] = useState<boolean>(false);
  const [showFilterBar, setShowFilterBar] = useState<boolean>(false);
  const [showAllTagChips, setShowAllTagChips] = useState<boolean>(false);

  // Keep activeOverlay aligned when viewMode changes externally
  useEffect(() => {
    if (viewMode === 'gantt' && activeOverlay !== 'gantt') {
      setActiveOverlay('gantt');
    } else if (viewMode === 'stats' && activeOverlay !== 'stats') {
      setActiveOverlay('stats');
    } else if (viewMode === 'kanban' && (activeOverlay === 'gantt' || activeOverlay === 'stats')) {
      setActiveOverlay('none');
    }
  }, [viewMode, activeOverlay]);

  // ── Derived Guild Stats & Alerts ───────────────────────────────────────────
  const guildStats = useMemo(
    () => calculateGuildRank(tasks, logs, todayStr),
    [tasks, logs, todayStr]
  );
  const staleList = useMemo(
    () => getStaleInProgressTasks(tasks, logs, todayStr),
    [tasks, logs, todayStr]
  );
  const timeGreeting = useMemo(() => getTimeGreeting(guildStats, liveNow), [guildStats, liveNow]);

  // ── AVG Scene & Dialogue State ─────────────────────────────────────────────
  const [dialogueMode, setDialogueMode] = useState<DialogueMode>('hub');
  const [expression, setExpression] = useState<NpcExpression>(timeGreeting.expression);
  const [dialogueText, setDialogueText] = useState<string>(timeGreeting.greeting);
  const [typedLength, setTypedLength] = useState<number>(0);

  const lastGreetingPeriodRef = useRef<TimePeriodKey>(periodInfo.key);
  const lastTodayStrRef = useRef<string>(todayStr);
  const hiddenAtMsRef = useRef<number | null>(null);
  const pendingWakeGreetingRef = useRef<boolean>(false);

  // ── Selected Task & Active Sub-flows ───────────────────────────────────────
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null),
    [tasks, selectedTaskId]
  );
  const [showAllCheckinStatuses, setShowAllCheckinStatuses] = useState(false);
  const [randomPickedId, setRandomPickedId] = useState<string | null>(null);
  const [staleIndex, setStaleIndex] = useState(0);
  const [lastCheckInResult, setLastCheckInResult] = useState<{
    taskTitle: string;
    date: string;
    progressType: ProgressType;
    hours?: number;
    wasCompleted: boolean;
  } | null>(null);

  // ── Quest Ledger (4-Status Tabbed Book Overlay) ────────────────────────────
  const [activeLedgerTab, setActiveLedgerTab] = useState<TaskStatus>('in_progress');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedTaskStatus, setDraggedTaskStatus] = useState<TaskStatus | null>(null);
  const [dragOverTab, setDragOverTab] = useState<TaskStatus | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after'>('after');
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // ── Inline Check-in Form State ─────────────────────────────────────────────
  const [checkInDate, setCheckInDate] = useState<string>(todayStr);
  const [checkInFormMode, setCheckInFormMode] = useState<'append' | 'replace'>('append');
  const [checkInType, setCheckInType] = useState<ProgressType>('progress');
  const [checkInHours, setCheckInHours] = useState<string>('');
  const [checkInNote, setCheckInNote] = useState<string>('');
  const [checkInRestMinutes, setCheckInRestMinutes] = useState<string>('');
  const [checkInIsBackfill, setCheckInIsBackfill] = useState<boolean>(false);
  const [markAsCompleted, setMarkAsCompleted] = useState<boolean>(false);
  const lastCheckInInitKeyRef = useRef<string>('');

  // ── Post-Work Rest Inquiry, Dial & Countdown State ─────────────────────────
  const [restDurationMinutes, setRestDurationMinutes] = useState<number>(5);
  const [restRemainingSeconds, setRestRemainingSeconds] = useState<number>(300);
  const [restStartTimeStr, setRestStartTimeStr] = useState<string>('');
  const [restStartedAtMs, setRestStartedAtMs] = useState<number | null>(null);
  const [restTargetEndMs, setRestTargetEndMs] = useState<number | null>(null);
  const [isDraggingDial, setIsDraggingDial] = useState<boolean>(false);
  const dialSvgRef = useRef<SVGSVGElement | null>(null);
  const restTaskRef = useRef<{
    taskId: string;
    taskTitle: string;
    date: string;
    sessionId?: string;
  } | null>(null);
  const restCompletedGuardRef = useRef<boolean>(false);
  const [lastRecordedRest, setLastRecordedRest] = useState<{
    startTime: string;
    endTime: string;
    durationMinutes: number;
  } | null>(null);

  // ── Pomodoro Timer State ───────────────────────────────────────────────────
  const [pomodoroPhase, setPomodoroPhase] = useState<PomodoroPhase>('focus');
  const [pomodoroRunState, setPomodoroRunState] = useState<PomodoroRunState>('idle');
  const [pomodoroFocusMinutes, setPomodoroFocusMinutes] = useState<number>(25);
  const [pomodoroShortBreakMinutes, setPomodoroShortBreakMinutes] = useState<number>(5);
  const [pomodoroLongBreakMinutes, setPomodoroLongBreakMinutes] = useState<number>(15);
  const [pomodoroTaskId, setPomodoroTaskId] = useState<string | null>(null);
  const [pomodoroNote, setPomodoroNote] = useState<string>('');
  const [pomodoroAutoRecord, setPomodoroAutoRecord] = useState<boolean>(true);
  const [pomodoroTargetEndMs, setPomodoroTargetEndMs] = useState<number | null>(null);
  const [pomodoroRemainingSeconds, setPomodoroRemainingSeconds] = useState<number>(25 * 60);
  const [pomodoroStartedAtStr, setPomodoroStartedAtStr] = useState<string>('');
  const [pomodoroStartedAtMs, setPomodoroStartedAtMs] = useState<number | null>(null);
  const [pomodoroElapsedCarryMs, setPomodoroElapsedCarryMs] = useState<number>(0);
  const [pomodoroLastWorkSessionId, setPomodoroLastWorkSessionId] = useState<string | undefined>(
    undefined
  );
  const [pomodoroDailyStats, setPomodoroDailyStats] = useState<DailyPomodoroStats>(() =>
    loadDailyPomodoroStats(todayStr)
  );
  const [pomodoroShowAllTasks, setPomodoroShowAllTasks] = useState<boolean>(false);
  const [pomodoroLastSummary, setPomodoroLastSummary] = useState<{
    phase: PomodoroPhase;
    minutes: number;
    taskTitle?: string;
    startTime: string;
    endTime: string;
    autoRecorded: boolean;
  } | null>(null);
  const [isDraggingPomodoroDial, setIsDraggingPomodoroDial] = useState<boolean>(false);
  const pomodoroDialSvgRef = useRef<SVGSVGElement | null>(null);
  const pomodoroCompletedGuardRef = useRef<boolean>(false);

  // ── Inline Create / Edit Task Form State ───────────────────────────────────
  const [formTitle, setFormTitle] = useState('');
  const [formStatus, setFormStatus] = useState<TaskStatus>('in_progress');
  const [formTags, setFormTags] = useState<string[]>(['游戏']);
  const [formNewTag, setFormNewTag] = useState('');

  // ── Typewriter Effect ──────────────────────────────────────────────────────
  useEffect(() => {
    setTypedLength(0);
    if (!dialogueText) return;
    const total = dialogueText.length;
    const step = total > 80 ? 2 : 1;
    const timer = window.setInterval(() => {
      setTypedLength((prev) => {
        if (prev + step >= total) {
          window.clearInterval(timer);
          return total;
        }
        return prev + step;
      });
    }, 18);
    return () => window.clearInterval(timer);
  }, [dialogueText]);

  const speak = useCallback((text: string, nextExpr: NpcExpression) => {
    setExpression(nextExpr);
    setDialogueText(text);
  }, []);

  // ── Viewport Size & Orientation Tracking (iPad Chrome & Responsive Stage) ──
  useEffect(() => {
    let delayedTimer: number | undefined;
    const prevPortraitRef = { current: window.innerHeight > window.innerWidth };

    const updateViewport = () => {
      const nextWidth = Math.round(window.visualViewport?.width ?? window.innerWidth);
      const nextHeight = Math.round(window.visualViewport?.height ?? window.innerHeight);
      if (nextWidth <= 0 || nextHeight <= 0) return;

      const nextPortrait = nextHeight > nextWidth;
      if (nextPortrait && !prevPortraitRef.current) {
        // Default portrait split-stage companion to hidden after rotating to portrait
        setShowPortraitCompanion(false);
      }
      prevPortraitRef.current = nextPortrait;

      setViewportSize((prev) =>
        prev.width === nextWidth && prev.height === nextHeight
          ? prev
          : { width: nextWidth, height: nextHeight }
      );
    };

    const scheduleViewportUpdate = () => {
      updateViewport();
      window.clearTimeout(delayedTimer);
      delayedTimer = window.setTimeout(updateViewport, 140);
    };

    updateViewport();
    const vv = window.visualViewport;
    vv?.addEventListener('resize', scheduleViewportUpdate);
    window.addEventListener('resize', scheduleViewportUpdate);
    window.addEventListener('orientationchange', scheduleViewportUpdate);
    window.addEventListener('focus', scheduleViewportUpdate);
    window.addEventListener('pageshow', scheduleViewportUpdate);
    document.addEventListener('visibilitychange', scheduleViewportUpdate);

    return () => {
      window.clearTimeout(delayedTimer);
      vv?.removeEventListener('resize', scheduleViewportUpdate);
      window.removeEventListener('resize', scheduleViewportUpdate);
      window.removeEventListener('orientationchange', scheduleViewportUpdate);
      window.removeEventListener('focus', scheduleViewportUpdate);
      window.removeEventListener('pageshow', scheduleViewportUpdate);
      document.removeEventListener('visibilitychange', scheduleViewportUpdate);
    };
  }, []);

  // ── Live Wall-Clock Sync (periodic tick + tab wake-up / focus recovery) ──
  useEffect(() => {
    const refreshClockOnReturn = () => {
      const hiddenAt = hiddenAtMsRef.current;
      if (hiddenAt !== null && Date.now() - hiddenAt >= 60_000) {
        pendingWakeGreetingRef.current = true;
      }
      hiddenAtMsRef.current = null;
      setLiveNow(new Date());
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (hiddenAtMsRef.current === null) {
          hiddenAtMsRef.current = Date.now();
        }
      } else {
        refreshClockOnReturn();
      }
    };

    const handleBlur = () => {
      if (hiddenAtMsRef.current === null) {
        hiddenAtMsRef.current = Date.now();
      }
    };

    const timer = window.setInterval(() => {
      setLiveNow(new Date());
    }, 15_000);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', refreshClockOnReturn);
    window.addEventListener('pageshow', refreshClockOnReturn);
    window.addEventListener('blur', handleBlur);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', refreshClockOnReturn);
      window.removeEventListener('pageshow', refreshClockOnReturn);
      window.removeEventListener('blur', handleBlur);
    };
  }, []);

  // ── Sync Midnight Rollover & Receptionist Lines When Period Shifts or Tab Wakes ──
  useEffect(() => {
    const prevToday = lastTodayStrRef.current;
    if (todayStr !== prevToday) {
      setCheckInDate((prev) => (prev === prevToday ? todayStr : prev));
      const freshStats = loadDailyPomodoroStats(todayStr);
      setPomodoroDailyStats(freshStats);
      saveDailyPomodoroStats(freshStats);
      lastTodayStrRef.current = todayStr;
    }

    const periodChanged = periodInfo.key !== lastGreetingPeriodRef.current;
    const shouldWakeGreet = pendingWakeGreetingRef.current;

    if (periodChanged) {
      lastGreetingPeriodRef.current = periodInfo.key;
    }
    if (shouldWakeGreet) {
      pendingWakeGreetingRef.current = false;
    }

    if ((periodChanged || shouldWakeGreet) && dialogueMode === 'hub' && activeOverlay === 'none') {
      const fresh = getTimeGreeting(guildStats, liveNow);
      speak(fresh.greeting, fresh.expression);
    }
  }, [todayStr, periodInfo.key, guildStats, liveNow, dialogueMode, activeOverlay, speak]);

  const finalizeRestSession = useCallback(
    (isAutoComplete: boolean) => {
      if (restCompletedGuardRef.current) return;
      restCompletedGuardRef.current = true;

      const targetInfo = restTaskRef.current;
      const now = new Date();
      const startTime = restStartTimeStr || formatTimeHHMM(now);
      const endTime = formatTimeHHMM(now);
      const actualDuration = isAutoComplete
        ? restDurationMinutes
        : Math.max(
            1,
            Math.round(
              ((restStartedAtMs ? Date.now() - restStartedAtMs : restDurationMinutes * 60_000) /
                60_000)
            )
          );

      setRestTargetEndMs(null);
      setRestStartedAtMs(null);
      setRestRemainingSeconds(0);

      if (targetInfo) {
        addRestSession(targetInfo.taskId, targetInfo.date, {
          startTime,
          endTime,
          durationMinutes: actualDuration,
          sessionId: targetInfo.sessionId,
        });
        setLastRecordedRest({
          startTime,
          endTime,
          durationMinutes: actualDuration,
        });
        setAffection((prev) => {
          const next = prev + 1;
          saveAffectionPoints(next);
          return next;
        });
        showToast(
          `☕ 休息结束！已记录 ${actualDuration} 分钟休息时段（${startTime} - ${endTime}）至「${targetInfo.taskTitle}」`,
          'success',
          true
        );
        speak(
          `叮铃~ 休息时间到啦！本次休息时段（${startTime} ~ ${endTime}，共 ${actualDuration} 分钟）已经妥善记入《${targetInfo.taskTitle}》的卷宗，精神焕发地继续下一场冒险吧！`,
          'cheer'
        );
      }
      setActiveOverlay('none');
      setViewMode('kanban');
      setDialogueMode('checkin_done');
    },
    [
      addRestSession,
      restDurationMinutes,
      restStartTimeStr,
      restStartedAtMs,
      setViewMode,
      showToast,
      speak,
    ]
  );

  // Watch external check-in trigger (e.g. from Gantt / Stats / TaskDetailDrawer QuickCheckInModal)
  useEffect(() => {
    if (!pendingRestPrompt) return;
    setSelectedTaskId(pendingRestPrompt.taskId);
    setLastCheckInResult({
      taskTitle: pendingRestPrompt.taskTitle,
      date: pendingRestPrompt.date,
      progressType: pendingRestPrompt.wasCompleted ? 'completed' : 'progress',
      hours: pendingRestPrompt.hours,
      wasCompleted: pendingRestPrompt.wasCompleted,
    });
    restTaskRef.current = {
      taskId: pendingRestPrompt.taskId,
      taskTitle: pendingRestPrompt.taskTitle,
      date: pendingRestPrompt.date,
      sessionId: pendingRestPrompt.sessionId,
    };
    setLastRecordedRest(null);
    setRestDurationMinutes(5);
    setActiveOverlay('none');
    setViewMode('kanban');
    setDialogueMode('rest_prompt');
    speak(
      `刚刚为《${pendingRestPrompt.taskTitle}》记入了 ${formatHours(
        pendingRestPrompt.hours
      )} 的今日推进呢！连续专注这么久辛苦啦，要不要现在休息一下恢复体力？我可以帮你用表盘定个时（默认 5 分钟）~`,
      pendingRestPrompt.wasCompleted ? 'cheer' : 'happy'
    );
    setPendingRestPrompt(null);
  }, [pendingRestPrompt, setPendingRestPrompt, setViewMode, speak]);

  // Live countdown interval driven by wall-clock targetEndMs
  useEffect(() => {
    if (restTargetEndMs === null) return;
    const tick = () => {
      const remSec = Math.max(0, Math.ceil((restTargetEndMs - Date.now()) / 1000));
      setRestRemainingSeconds(remSec);
      if (remSec <= 0) {
        finalizeRestSession(true);
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [restTargetEndMs, finalizeRestSession]);

  const updateDialFromClientPoint = useCallback((clientX: number, clientY: number) => {
    const mins = clientPointToDialMinutes(dialSvgRef.current, clientX, clientY, 60);
    if (mins !== null) {
      setRestDurationMinutes(mins);
    }
  }, []);

  const openRestDial = useCallback(
    (taskInfo?: { taskId: string; taskTitle: string; date: string; sessionId?: string }) => {
      if (taskInfo) {
        restTaskRef.current = taskInfo;
      }
      setRestDurationMinutes(5);
      setActiveOverlay('none');
      setViewMode('kanban');
      setDialogueMode('rest_dial');
      speak(
        `请转动或点击表盘刻度来确认本次休息时长（默认 5 分钟），定好后按下「开始休息倒计时」即可！`,
        'thinking'
      );
    },
    [setViewMode, speak]
  );

  const startRestCountdown = useCallback(
    (minutes: number) => {
      const safeMins = Math.max(1, Math.min(60, Math.round(minutes)));
      const nowMs = Date.now();
      const startStr = formatTimeHHMM(new Date(nowMs));
      restCompletedGuardRef.current = false;
      setRestDurationMinutes(safeMins);
      setRestStartTimeStr(startStr);
      setRestStartedAtMs(nowMs);
      setRestTargetEndMs(nowMs + safeMins * 60_000);
      setRestRemainingSeconds(safeMins * 60);
      setDialogueMode('rest_countdown');
      speak(
        `公会休息沙漏已经开始计时啦（${safeMins} 分钟）~ 闭目养神、伸个懒腰或者喝杯热茶吧，倒计时结束时我会自动把休息记录归档进卷宗哦！`,
        'sleepy'
      );
    },
    [speak]
  );

  const extendRestCountdown = useCallback(
    (extraMinutes: number) => {
      const addMs = extraMinutes * 60_000;
      setRestDurationMinutes((prev) => Math.min(90, prev + extraMinutes));
      setRestTargetEndMs((prev) => (prev ?? Date.now()) + addMs);
      setRestRemainingSeconds((prev) => prev + extraMinutes * 60);
      speak(`已为休息计时再延长 ${extraMinutes} 分钟，好好放松一下吧~`, 'sleepy');
    },
    [speak]
  );

  const cancelRestCountdown = useCallback(() => {
    restCompletedGuardRef.current = true;
    setRestTargetEndMs(null);
    setRestStartedAtMs(null);
    setRestRemainingSeconds(0);
    setDialogueMode('checkin_done');
    speak(`好哦，已收起公会怀表~ 若之后还需要短暂休整随时叫我！`, 'normal');
  }, [speak]);

  const uniqueExpressionRawUrls = useMemo(() => {
    const orderedKeys: NpcExpression[] = ['normal', 'happy', 'cheer', 'thinking', 'sleepy'];
    const urls: string[] = [];
    orderedKeys.forEach((key) => {
      const url = npcConfig.expressions[key];
      if (url && !urls.includes(url)) {
        urls.push(url);
      }
    });
    return urls;
  }, [npcConfig.expressions]);

  const desiredRawSrc = npcConfig.expressions[expression] || npcConfig.expressions.normal;
  const bgRawSrc = npcConfig.customBgUrl || './npc/bg-guild-hall.jpg';

  useEffect(() => {
    setLoadedRawSrcs({});
    setFailedRawSrcs({});
    setLastReadyRawSrc('');
  }, [npcConfig]);

  useEffect(() => {
    let active = true;
    preloadNpcConfigAssets(npcConfig, expression, () => {
      if (active) {
        setCacheVersion((v) => v + 1);
      }
    });
    return () => {
      active = false;
    };
  }, [npcConfig, expression]);

  const resolvedBgSrc = useMemo(() => {
    void cacheVersion;
    return resolveCachedNpcImageUrl(bgRawSrc);
  }, [bgRawSrc, cacheVersion]);

  const resolvedExpressionSrcMap = useMemo(() => {
    void cacheVersion;
    const map = new Map<string, string>();
    uniqueExpressionRawUrls.forEach((raw) => {
      map.set(raw, resolveCachedNpcImageUrl(raw));
    });
    return map;
  }, [uniqueExpressionRawUrls, cacheVersion]);

  const isDesiredReady = useMemo(() => {
    void cacheVersion;
    return Boolean(
      desiredRawSrc &&
        !failedRawSrcs[desiredRawSrc] &&
        (loadedRawSrcs[desiredRawSrc] || isNpcImageReady(desiredRawSrc))
    );
  }, [desiredRawSrc, failedRawSrcs, loadedRawSrcs, cacheVersion]);

  useEffect(() => {
    if (isDesiredReady && desiredRawSrc) {
      setLastReadyRawSrc(desiredRawSrc);
    }
  }, [isDesiredReady, desiredRawSrc]);

  const displayRawSrc = useMemo(() => {
    void cacheVersion;
    const ready = (raw: string) =>
      Boolean(raw && !failedRawSrcs[raw] && (loadedRawSrcs[raw] || isNpcImageReady(raw)));

    if (ready(desiredRawSrc)) return desiredRawSrc;
    if (
      lastReadyRawSrc &&
      uniqueExpressionRawUrls.includes(lastReadyRawSrc) &&
      ready(lastReadyRawSrc)
    ) {
      return lastReadyRawSrc;
    }
    const anyReady = uniqueExpressionRawUrls.find((u) => ready(u));
    return anyReady || desiredRawSrc;
  }, [
    desiredRawSrc,
    lastReadyRawSrc,
    uniqueExpressionRawUrls,
    loadedRawSrcs,
    failedRawSrcs,
    cacheVersion,
  ]);

  const activeImgFailed = Boolean(
    displayRawSrc &&
      failedRawSrcs[displayRawSrc] &&
      uniqueExpressionRawUrls.every((u) => failedRawSrcs[u])
  );

  const handleNpcImgLoad = useCallback((rawSrc: string) => {
    setLoadedRawSrcs((prev) => (prev[rawSrc] ? prev : { ...prev, [rawSrc]: true }));
    setFailedRawSrcs((prev) => (prev[rawSrc] ? { ...prev, [rawSrc]: false } : prev));
  }, []);

  const handleNpcImgError = useCallback((rawSrc: string) => {
    setFailedRawSrcs((prev) => (prev[rawSrc] ? prev : { ...prev, [rawSrc]: true }));
  }, []);

  useEffect(() => {
    if (
      (dialogueMode === 'inspect_task' ||
        dialogueMode === 'checkin_form' ||
        dialogueMode === 'edit_task') &&
      !selectedTask
    ) {
      setDialogueMode('hub');
    }
  }, [dialogueMode, selectedTask]);

  const loadCheckInFormFields = useCallback(
    (task: TaskItem, date: string, mode: 'append' | 'replace') => {
      const existing = getLog(task.id, date);
      setCheckInFormMode(mode);
      setCheckInRestMinutes('');
      if (existing && mode === 'replace') {
        setCheckInType(existing.progressType);
        setCheckInHours(
          typeof existing.hours === 'number' && !isNaN(existing.hours) ? String(existing.hours) : ''
        );
        setCheckInNote(existing.note || '');
        setCheckInIsBackfill(
          Boolean(
            existing.isBackfill ||
              (existing.workSessions?.length === 1 && existing.workSessions[0].isBackfill)
          )
        );
        setMarkAsCompleted(existing.progressType === 'completed' || task.status === 'done');
      } else {
        setCheckInType('progress');
        setCheckInHours('');
        setCheckInNote('');
        setCheckInIsBackfill(false);
        setMarkAsCompleted(false);
      }
    },
    [getLog]
  );

  useEffect(() => {
    if (dialogueMode !== 'checkin_form') {
      lastCheckInInitKeyRef.current = '';
      return;
    }
    if (!selectedTask) return;
    const initKey = `${selectedTask.id}:${checkInDate}`;
    if (lastCheckInInitKeyRef.current === initKey) return;
    lastCheckInInitKeyRef.current = initKey;

    const existing = getLog(selectedTask.id, checkInDate);
    const defaultMode: 'append' | 'replace' = existing && checkInDate === todayStr ? 'append' : 'replace';
    loadCheckInFormFields(selectedTask, checkInDate, defaultMode);
  }, [dialogueMode, selectedTask, checkInDate, todayStr, getLog, loadCheckInFormFields]);

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, TaskItem[]> = {
      in_progress: [],
      backlog: [],
      done: [],
      paused: [],
    };
    filteredTasks.forEach((t) => {
      if (map[t.status]) map[t.status].push(t);
    });
    return map;
  }, [filteredTasks]);

  const currentHour = liveNow.getHours();

  const taskTimeAffinityMap = useMemo(() => {
    const [y, m, d] = todayStr.split('-').map(Number);
    const evalTime = new Date(y, m - 1, d, currentHour, 0, 0, 0);
    const map = new Map<string, TaskTimeSlotAffinity>();
    tasks.forEach((task) => {
      map.set(task.id, computeTaskTimeSlotAffinity(getLogsForTask(task.id), evalTime));
    });
    return map;
  }, [tasks, logs, getLogsForTask, todayStr, currentHour]);

  const activeInProgressTasks = useMemo(
    () => tasks.filter((t) => t.status === 'in_progress'),
    [tasks]
  );

  // Order "in_progress" tasks by: not checked in today -> highest current time-slot affinity -> original order
  const prioritizedInProgressTasks = useMemo(() => {
    const indexMap = new Map<string, number>();
    const unchecked: TaskItem[] = [];
    const checked: TaskItem[] = [];

    activeInProgressTasks.forEach((t, idx) => {
      indexMap.set(t.id, idx);
      if (getLog(t.id, todayStr)) {
        checked.push(t);
      } else {
        unchecked.push(t);
      }
    });

    const compareByAffinity = (a: TaskItem, b: TaskItem) => {
      const affA = taskTimeAffinityMap.get(a.id)?.score ?? 0;
      const affB = taskTimeAffinityMap.get(b.id)?.score ?? 0;
      if (Math.abs(affB - affA) > 0.001) {
        return affB - affA;
      }
      return (indexMap.get(a.id) ?? 0) - (indexMap.get(b.id) ?? 0);
    };

    unchecked.sort(compareByAffinity);
    checked.sort(compareByAffinity);
    return [...unchecked, ...checked];
  }, [activeInProgressTasks, getLog, todayStr, taskTimeAffinityMap]);

  const pinnedActiveTasks = useMemo(() => {
    const MAX_PINNED = 5;
    const topTasks = prioritizedInProgressTasks.slice(0, MAX_PINNED);
    if (topTasks.length === 0) return topTasks;

    let latestCheckedTask: TaskItem | null = null;
    let latestTimestamp = -1;
    let latestEndMin = -1;

    for (const task of activeInProgressTasks) {
      const todayLog = getLog(task.id, todayStr);
      if (!todayLog) continue;

      let ts = todayLog.createdAt ? Date.parse(todayLog.createdAt) : NaN;
      if (isNaN(ts)) ts = 0;

      let endMin = -1;
      if (Array.isArray(todayLog.workSessions) && todayLog.workSessions.length > 0) {
        for (const ws of todayLog.workSessions) {
          const wsTs = ws.recordedAt ? Date.parse(ws.recordedAt) : NaN;
          const wsEndMin = ws.endTime ? parseHHMMToMinutes(ws.endTime) : -1;
          if (!isNaN(wsTs) && (wsTs > ts || (wsTs === ts && wsEndMin > endMin))) {
            ts = wsTs;
            endMin = wsEndMin;
          }
        }
      }

      if (ts > latestTimestamp || (ts === latestTimestamp && endMin > latestEndMin)) {
        latestTimestamp = ts;
        latestEndMin = endMin;
        latestCheckedTask = task;
      }
    }

    if (!latestCheckedTask) {
      return topTasks;
    }

    if (topTasks.some((t) => t.id === latestCheckedTask.id)) {
      return topTasks;
    }

    return [latestCheckedTask, ...topTasks.slice(0, MAX_PINNED - 1)];
  }, [prioritizedInProgressTasks, activeInProgressTasks, getLog, todayStr]);

  const sortedAllTags = useMemo(() => {
    return [...allTags].sort((a, b) => {
      const countA = tasks.filter((t) => t.tags.includes(a)).length;
      const countB = tasks.filter((t) => t.tags.includes(b)).length;
      return countB - countA;
    });
  }, [allTags, tasks]);

  // ── Pomodoro Timer Derived State & Lifecycle Actions ───────────────────────
  const activePomodoroTotalMinutes =
    pomodoroPhase === 'focus'
      ? pomodoroFocusMinutes
      : pomodoroPhase === 'short_break'
        ? pomodoroShortBreakMinutes
        : pomodoroLongBreakMinutes;

  const pomodoroBoundTask = useMemo(
    () => (pomodoroTaskId ? tasks.find((t) => t.id === pomodoroTaskId) ?? null : null),
    [pomodoroTaskId, tasks]
  );

  const pomodoroSelectableTasks = useMemo(() => {
    const base = pomodoroShowAllTasks
      ? tasks.filter((t) => t.status !== 'done')
      : prioritizedInProgressTasks;
    if (pomodoroBoundTask && !base.some((t) => t.id === pomodoroBoundTask.id)) {
      return [pomodoroBoundTask, ...base];
    }
    return base;
  }, [pomodoroShowAllTasks, tasks, prioritizedInProgressTasks, pomodoroBoundTask]);

  const setActivePhaseMinutes = useCallback(
    (mins: number) => {
      const maxMins = pomodoroPhase === 'focus' ? 90 : 60;
      const clamped = Math.max(1, Math.min(maxMins, Math.round(mins)));
      if (pomodoroPhase === 'focus') {
        setPomodoroFocusMinutes(clamped);
      } else if (pomodoroPhase === 'short_break') {
        setPomodoroShortBreakMinutes(clamped);
      } else {
        setPomodoroLongBreakMinutes(clamped);
      }
      if (pomodoroRunState === 'idle') {
        setPomodoroRemainingSeconds(clamped * 60);
      }
    },
    [pomodoroPhase, pomodoroRunState]
  );

  const updatePomodoroDialFromClientPoint = useCallback(
    (clientX: number, clientY: number) => {
      if (pomodoroRunState !== 'idle') return;
      const mins = clientPointToDialMinutes(pomodoroDialSvgRef.current, clientX, clientY, 60);
      if (mins !== null) {
        setActivePhaseMinutes(mins);
      }
    },
    [pomodoroRunState, setActivePhaseMinutes]
  );

  const switchPomodoroPhaseTab = useCallback(
    (nextPhase: PomodoroPhase) => {
      if (pomodoroRunState === 'running') {
        showToast('计时进行中，请先暂停或重置后再切换阶段', 'info');
        return;
      }
      pomodoroCompletedGuardRef.current = true;
      setPomodoroRunState('idle');
      setPomodoroTargetEndMs(null);
      setPomodoroStartedAtMs(null);
      setPomodoroElapsedCarryMs(0);
      setPomodoroPhase(nextPhase);
      const nextMins =
        nextPhase === 'focus'
          ? pomodoroFocusMinutes
          : nextPhase === 'short_break'
            ? pomodoroShortBreakMinutes
            : pomodoroLongBreakMinutes;
      setPomodoroRemainingSeconds(nextMins * 60);
    },
    [
      pomodoroRunState,
      pomodoroFocusMinutes,
      pomodoroShortBreakMinutes,
      pomodoroLongBreakMinutes,
      showToast,
    ]
  );

  const openPomodoroPanel = useCallback(() => {
    setActiveOverlay('none');
    setViewMode('kanban');
    setDialogueMode('pomodoro');

    if (pomodoroRunState === 'running') {
      speak(
        `番茄怀表正在滴答走动呢！当前${
          pomodoroPhase === 'focus' ? '专注冲刺' : '休整休息'
        }还剩 ${formatCountdownMMSS(pomodoroRemainingSeconds)}，保持节奏加油~`,
        pomodoroPhase === 'focus' ? 'happy' : 'sleepy'
      );
    } else {
      speak(
        `欢迎来到「公会番茄怀表」台前！默认 25 分钟专注搭配 5 分钟短休，每满 4 颗番茄还会解锁一次 15 分钟长休整哦~`,
        'happy'
      );
    }
  }, [setViewMode, speak, pomodoroRunState, pomodoroPhase, pomodoroRemainingSeconds]);

  const startPomodoroPhase = useCallback(
    (overridePhase?: PomodoroPhase, overrideMinutes?: number) => {
      const targetPhase = overridePhase ?? pomodoroPhase;
      const baseMins =
        targetPhase === 'focus'
          ? pomodoroFocusMinutes
          : targetPhase === 'short_break'
            ? pomodoroShortBreakMinutes
            : pomodoroLongBreakMinutes;
      const safeMins = Math.max(
        1,
        Math.min(targetPhase === 'focus' ? 90 : 60, Math.round(overrideMinutes ?? baseMins))
      );

      if (overridePhase) {
        setPomodoroPhase(targetPhase);
      }
      if (overrideMinutes !== undefined) {
        if (targetPhase === 'focus') setPomodoroFocusMinutes(safeMins);
        else if (targetPhase === 'short_break') setPomodoroShortBreakMinutes(safeMins);
        else setPomodoroLongBreakMinutes(safeMins);
      }

      const nowMs = Date.now();
      const nowStr = formatTimeHHMM(new Date(nowMs));
      pomodoroCompletedGuardRef.current = false;
      setPomodoroStartedAtStr(nowStr);
      setPomodoroStartedAtMs(nowMs);
      setPomodoroElapsedCarryMs(0);
      setPomodoroRemainingSeconds(safeMins * 60);
      setPomodoroTargetEndMs(nowMs + safeMins * 60_000);
      setPomodoroRunState('running');
      setPomodoroLastSummary(null);

      if (targetPhase === 'focus') {
        speak(
          pomodoroBoundTask
            ? `🍅 专注计时启动（${safeMins} 分钟）！本次目标委托：《${pomodoroBoundTask.title}》，全神贯注冲刺吧，结束时我会为你盖章记账~`
            : `🍅 专注计时启动（${safeMins} 分钟）！心无旁骛地投入这段时光吧，倒计时归零时我会敲响提醒钟~`,
          'happy'
        );
      } else {
        speak(
          `☕ 开始${targetPhase === 'long_break' ? '长休整' : '短休整'}倒计时（${safeMins} 分钟）~ 起身伸展一下、补充些水分，让精力满格恢复吧！`,
          'sleepy'
        );
      }
    },
    [
      pomodoroPhase,
      pomodoroFocusMinutes,
      pomodoroShortBreakMinutes,
      pomodoroLongBreakMinutes,
      pomodoroBoundTask,
      speak,
    ]
  );

  const pausePomodoro = useCallback(() => {
    if (pomodoroRunState !== 'running') return;
    const remSec =
      pomodoroTargetEndMs !== null
        ? Math.max(1, Math.ceil((pomodoroTargetEndMs - Date.now()) / 1000))
        : pomodoroRemainingSeconds;
    const legMs = pomodoroStartedAtMs !== null ? Math.max(0, Date.now() - pomodoroStartedAtMs) : 0;
    setPomodoroElapsedCarryMs((prev) => prev + legMs);
    setPomodoroStartedAtMs(null);
    setPomodoroTargetEndMs(null);
    setPomodoroRemainingSeconds(remSec);
    setPomodoroRunState('paused');
    speak(`已按住怀表表冠暂停计时（剩余 ${formatCountdownMMSS(remSec)}），准备好随时继续~`, 'thinking');
  }, [pomodoroRunState, pomodoroTargetEndMs, pomodoroRemainingSeconds, pomodoroStartedAtMs, speak]);

  const resumePomodoro = useCallback(() => {
    if (pomodoroRunState !== 'paused') return;
    const nowMs = Date.now();
    pomodoroCompletedGuardRef.current = false;
    setPomodoroStartedAtMs(nowMs);
    setPomodoroTargetEndMs(nowMs + pomodoroRemainingSeconds * 1000);
    setPomodoroRunState('running');
    speak(
      `怀表重新走字啦！还剩 ${formatCountdownMMSS(pomodoroRemainingSeconds)}，继续稳步推进吧~`,
      pomodoroPhase === 'focus' ? 'happy' : 'sleepy'
    );
  }, [pomodoroRunState, pomodoroRemainingSeconds, pomodoroPhase, speak]);

  const resetPomodoro = useCallback(() => {
    pomodoroCompletedGuardRef.current = true;
    setPomodoroRunState('idle');
    setPomodoroTargetEndMs(null);
    setPomodoroStartedAtMs(null);
    setPomodoroElapsedCarryMs(0);
    setPomodoroRemainingSeconds(activePomodoroTotalMinutes * 60);
    speak(`已将番茄怀表拨回 ${activePomodoroTotalMinutes} 分钟刻度，随时可以重新起步~`, 'normal');
  }, [activePomodoroTotalMinutes, speak]);

  const extendPomodoro = useCallback(
    (extraMinutes: number) => {
      const addSec = extraMinutes * 60;
      setPomodoroRemainingSeconds((prev) => prev + addSec);
      if (pomodoroRunState === 'running') {
        setPomodoroTargetEndMs((prev) => (prev ?? Date.now()) + addSec * 1000);
      }
      speak(`已为当前计时追加 ${extraMinutes} 分钟，保持好手感继续加油~`, 'happy');
    },
    [pomodoroRunState, speak]
  );

  const completePomodoroPhase = useCallback(
    (isEarlySettlement: boolean = false) => {
      if (pomodoroCompletedGuardRef.current) return;
      pomodoroCompletedGuardRef.current = true;

      const currentLegMs =
        pomodoroStartedAtMs !== null ? Math.max(0, Date.now() - pomodoroStartedAtMs) : 0;
      const totalElapsedMs = pomodoroElapsedCarryMs + currentLegMs;
      const elapsedMinutesExact = Math.round(totalElapsedMs / 60_000);
      const actualMinutes = isEarlySettlement
        ? Math.max(
            1,
            elapsedMinutesExact ||
              Math.round((activePomodoroTotalMinutes * 60 - pomodoroRemainingSeconds) / 60)
          )
        : Math.max(activePomodoroTotalMinutes, elapsedMinutesExact || activePomodoroTotalMinutes);

      const now = new Date();
      const endStr = formatTimeHHMM(now);
      const startStr =
        pomodoroStartedAtStr ||
        formatTimeHHMM(new Date(now.getTime() - actualMinutes * 60_000));

      setPomodoroRunState('idle');
      setPomodoroTargetEndMs(null);
      setPomodoroStartedAtMs(null);
      setPomodoroElapsedCarryMs(0);

      playPomodoroChime(pomodoroPhase === 'focus' ? 'focus_done' : 'break_done');

      if (pomodoroPhase === 'focus') {
        const currentDaily =
          pomodoroDailyStats.date === todayStr
            ? pomodoroDailyStats
            : { date: todayStr, count: 0, minutes: 0 };
        const nextCount = currentDaily.count + 1;
        const nextStats: DailyPomodoroStats = {
          date: todayStr,
          count: nextCount,
          minutes: currentDaily.minutes + actualMinutes,
        };
        setPomodoroDailyStats(nextStats);
        saveDailyPomodoroStats(nextStats);

        setAffection((prev) => {
          const next = prev + 3;
          saveAffectionPoints(next);
          return next;
        });

        let didAutoRecord = false;
        if (pomodoroBoundTask && pomodoroAutoRecord) {
          const hoursVal = Math.max(0.1, Math.round((actualMinutes / 60) * 100) / 100);
          const trimmedNote = pomodoroNote.trim();
          const noteText = trimmedNote
            ? `🍅 番茄专注 ${actualMinutes}m：${trimmedNote}`
            : `🍅 番茄专注 ${actualMinutes} 分钟`;

          const savedLog = addOrUpdateLog({
            taskId: pomodoroBoundTask.id,
            date: todayStr,
            progressType: 'progress',
            hours: hoursVal,
            note: noteText,
            mode: 'append',
            sessionStartTime: startStr,
            sessionEndTime: endStr,
          });
          const latestWs = savedLog.workSessions?.[savedLog.workSessions.length - 1];
          setPomodoroLastWorkSessionId(latestWs?.id);
          setPomodoroNote('');
          didAutoRecord = true;
          showToast(
            `🍅 番茄专注完成！已为「${pomodoroBoundTask.title}」记入 ${actualMinutes} 分钟 (${formatHours(hoursVal)})`,
            'success',
            true
          );
        } else {
          showToast(
            `🍅 番茄专注完成（${actualMinutes} 分钟）！今日第 ${nextCount} 颗番茄已收获`,
            'success',
            true
          );
        }

        const isLongBreakTurn = nextCount % 4 === 0;
        const nextBreakPhase: PomodoroPhase = isLongBreakTurn ? 'long_break' : 'short_break';
        const nextBreakMins = isLongBreakTurn
          ? pomodoroLongBreakMinutes
          : pomodoroShortBreakMinutes;

        setPomodoroPhase(nextBreakPhase);
        setPomodoroRemainingSeconds(nextBreakMins * 60);
        setPomodoroLastSummary({
          phase: 'focus',
          minutes: actualMinutes,
          taskTitle: pomodoroBoundTask?.title,
          startTime: startStr,
          endTime: endStr,
          autoRecorded: didAutoRecord,
        });

        speak(
          isLongBreakTurn
            ? `叮咚🎉！第 ${nextCount} 颗番茄收割完毕（本轮专注 ${actualMinutes} 分钟）！今天已经攒满整整 4 轮啦，我为你切好了 ${nextBreakMins} 分钟长休整表盘，彻底放松一下吧~`
            : `叮铃~ 番茄专注圆满达成（${actualMinutes} 分钟，今日第 ${nextCount} 颗）！${
                didAutoRecord && pomodoroBoundTask
                  ? `已经自动写入《${pomodoroBoundTask.title}》今日打卡并盖章入账。`
                  : ''
              }现在切到 ${nextBreakMins} 分钟短休整啦，按下「开始短休整」喘口气吧！`,
          'cheer'
        );
      } else {
        if (pomodoroBoundTask) {
          addRestSession(pomodoroBoundTask.id, todayStr, {
            startTime: startStr,
            endTime: endStr,
            durationMinutes: actualMinutes,
            sessionId: pomodoroLastWorkSessionId,
          });
          showToast(
            `☕ 休整结束！已将 ${actualMinutes} 分钟休息记入「${pomodoroBoundTask.title}」`,
            'info',
            true
          );
        } else {
          showToast(`☕ 休整结束（${actualMinutes} 分钟），准备好迎接下一轮专注啦！`, 'info', true);
        }

        setPomodoroPhase('focus');
        setPomodoroRemainingSeconds(pomodoroFocusMinutes * 60);
        setPomodoroLastSummary({
          phase: pomodoroPhase,
          minutes: actualMinutes,
          taskTitle: pomodoroBoundTask?.title,
          startTime: startStr,
          endTime: endStr,
          autoRecorded: Boolean(pomodoroBoundTask),
        });

        speak(
          `休整时间到啦（共休息 ${actualMinutes} 分钟）~ 表盘已为你复位回 ${pomodoroFocusMinutes} 分钟专注模式，随时可以开启下一轮番茄冲刺！`,
          'happy'
        );
      }
    },
    [
      pomodoroStartedAtMs,
      pomodoroElapsedCarryMs,
      activePomodoroTotalMinutes,
      pomodoroRemainingSeconds,
      pomodoroStartedAtStr,
      pomodoroPhase,
      pomodoroDailyStats,
      todayStr,
      pomodoroBoundTask,
      pomodoroAutoRecord,
      pomodoroNote,
      addOrUpdateLog,
      addRestSession,
      pomodoroLastWorkSessionId,
      pomodoroLongBreakMinutes,
      pomodoroShortBreakMinutes,
      pomodoroFocusMinutes,
      showToast,
      speak,
    ]
  );

  // Live Pomodoro countdown tick driven by wall-clock target timestamp
  useEffect(() => {
    if (pomodoroRunState !== 'running' || pomodoroTargetEndMs === null) return;
    const tick = () => {
      const remSec = Math.max(0, Math.ceil((pomodoroTargetEndMs - Date.now()) / 1000));
      setPomodoroRemainingSeconds(remSec);
      if (remSec <= 0) {
        completePomodoroPhase(false);
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [pomodoroRunState, pomodoroTargetEndMs, completePomodoroPhase]);

  // ── Primary Navigation Switching ───────────────────────────────────────────
  const switchSection = (next: OverlayMode) => {
    setActiveOverlay(next);
    setShowPortraitCompanion(false);
    if (next === 'gantt') {
      setViewMode('gantt');
      setDialogueMode('hub');
      speak(
        `已为你展开「时序卷轴」！点击任意方格即可登记或修改当天的打卡详情，也可以使用右上角的周/月/全景进行翻页~`,
        'thinking'
      );
    } else if (next === 'stats') {
      setViewMode('stats');
      setDialogueMode('hub');
      speak(
        `欢迎来到「战绩圣殿」！截至目前你已累计投入 ${formatHours(
          guildStats.totalHours
        )}，共达成了 ${guildStats.completedCount} 份公会委托！`,
        'cheer'
      );
    } else if (next === 'ledger') {
      setViewMode('kanban');
      setDialogueMode('hub');
      speak(
        `已摊开「公会委托账本」！共有 ${filteredTasks.length} 份委托记录在册，拖拽卡片至顶部书签即可快速调动状态哦~`,
        'normal'
      );
    } else {
      const now = new Date();
      setLiveNow(now);
      setViewMode('kanban');
      setDialogueMode('hub');
      const fresh = getTimeGreeting(guildStats, now);
      lastGreetingPeriodRef.current = fresh.periodKey;
      speak(fresh.greeting, fresh.expression);
    }
  };

  // ── File Import Handler ────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          const success = importData(content);
          if (success) {
            showToast('数据导入成功！', 'success', true);
            speak(`已成功将备份卷宗导入公会账本！所有委托与记录都已就绪~`, 'happy');
          } else {
            showToast('导入失败：文件格式不符合要求', 'error');
            speak(`唔…这份卷宗的格式好像不太对呢，请确认是本公会导出的 JSON 备份文件哦。`, 'thinking');
          }
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  // ── Affection & Stage Click Chatter ────────────────────────────────────────
  const handleNpcStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeOverlay !== 'none') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const heartId = Date.now() + Math.random();
    const x = Math.max(40, Math.min(rect.width - 40, e.clientX - rect.left));
    const y = Math.max(40, Math.min(rect.height - 160, e.clientY - rect.top));

    setFloatingHearts((prev) => [...prev.slice(-6), { id: heartId, x, y }]);
    window.setTimeout(() => {
      setFloatingHearts((prev) => prev.filter((h) => h.id !== heartId));
    }, 1300);

    setAffection((prev) => {
      const next = prev + 1;
      saveAffectionPoints(next);
      return next;
    });

    if (dialogueMode === 'hub') {
      const now = new Date();
      setLiveNow(now);
      const chatter = getRandomChatter(guildStats, tasks, staleList, now);
      speak(chatter.text, chatter.expression);
    }
  };

  // ── Navigation & Dialogue Flow Actions ─────────────────────────────────────
  const returnToHub = () => {
    const now = new Date();
    setLiveNow(now);
    setDialogueMode('hub');
    setSelectedTaskId(null);
    setShowPortraitCompanion(false);
    const fresh = getTimeGreeting(guildStats, now);
    lastGreetingPeriodRef.current = fresh.periodKey;
    speak(fresh.greeting, fresh.expression);
  };

  const openInspectTask = (task: TaskItem) => {
    setActiveOverlay('none');
    setViewMode('kanban');
    setSelectedTaskId(task.id);
    setDialogueMode('inspect_task');

    const latest = getLatestLogForTask(task.id);
    const totalHours = getTaskTotalHours(task.id);
    const progressDays = getLogsForTask(task.id).filter(
      (l) => l.progressType === 'progress' || l.progressType === 'completed'
    ).length;

    const statusLabel = RPG_STATUS_META[task.status].rpgLabel;
    const latestStr = latest
      ? `最近记录在 ${getRelativeTimeString(latest.date)}${latest.note ? `（“${latest.note}”）` : ''}`
      : '还没有打卡记录';

    speak(
      `让我看看《${task.title}》的卷宗~ 目前处于【${statusLabel}】状态，累计投入 ${formatHours(
        totalHours
      )}（推进 ${progressDays} 天），${latestStr}。接下来要怎么处理呢？`,
      task.status === 'done' ? 'cheer' : 'thinking'
    );
  };

  const openCheckInForTask = (
    task: TaskItem,
    date: string = todayStr,
    preferredMode?: 'append' | 'replace'
  ) => {
    setActiveOverlay('none');
    setViewMode('kanban');
    setSelectedTaskId(task.id);
    setCheckInDate(date);
    const existing = getLog(task.id, date);
    const nextMode: 'append' | 'replace' =
      existing ? preferredMode ?? (date === todayStr ? 'append' : 'replace') : 'replace';
    lastCheckInInitKeyRef.current = `${task.id}:${date}`;
    loadCheckInFormFields(task, date, nextMode);
    setDialogueMode('checkin_form');

    if (existing) {
      speak(
        nextMode === 'append'
          ? `《${task.title}》在 ${date} 已经有打卡记录啦~ 可以在这里继续追加一条独立备注、时长与休息时间的记录哦！`
          : `已调出《${task.title}》在 ${date} 的打卡记录，可以直接修改当日汇总或切换为「追加新记录」！`,
        'thinking'
      );
    } else {
      speak(
        `准备好记录《${task.title}》的进展了吗？选好状态、投入时长、休息时间与心得，我来为你盖上公会印章！`,
        'happy'
      );
    }
  };

  const startCheckInFlow = () => {
    setActiveOverlay('none');
    setViewMode('kanban');
    if (activeInProgressTasks.length === 1 && !showAllCheckinStatuses) {
      openCheckInForTask(activeInProgressTasks[0], todayStr);
      return;
    }
    setDialogueMode('select_checkin_task');
    if (activeInProgressTasks.length === 0) {
      setShowAllCheckinStatuses(true);
      speak(
        `目前「攻略中」列表是空的呢~ 我帮你把其他状态的委托也列出来啦，点选一个就能直接打卡！`,
        'thinking'
      );
    } else {
      speak(
        `今天推进了哪一份委托呢？当前有 ${activeInProgressTasks.length} 项正在攻略中，点选一项就能立刻汇报！`,
        'normal'
      );
    }
  };

  const startCreateTask = (defaultStatus: TaskStatus = 'in_progress') => {
    setActiveOverlay('none');
    setViewMode('kanban');
    setFormTitle('');
    setFormStatus(defaultStatus);
    setFormTags(['游戏']);
    setFormNewTag('');
    setDialogueMode('create_task');
    speak(
      `又有新目标了吗？告诉我委托名称和分类标签，我立刻在公会账本上为你立项登记！`,
      'thinking'
    );
  };

  const startEditTask = (task: TaskItem) => {
    setActiveOverlay('none');
    setViewMode('kanban');
    setSelectedTaskId(task.id);
    setFormTitle(task.title);
    setFormStatus(task.status);
    setFormTags(task.tags.length > 0 ? [...task.tags] : ['游戏']);
    setFormNewTag('');
    setDialogueMode('edit_task');
    speak(`要调整《${task.title}》的档案内容吗？改好后点击保存就行啦~`, 'thinking');
  };

  const triggerRandomPick = (excludeId?: string) => {
    setActiveOverlay('none');
    setViewMode('kanban');
    const backlogPool = tasks.filter((t) => t.status === 'backlog');
    if (backlogPool.length === 0) {
      setDialogueMode('hub');
      speak(
        `「待接取」书架上目前空空如也呢！不如先登记几个想玩的游戏或想看的书进去？`,
        'thinking'
      );
      return;
    }
    const candidates =
      backlogPool.length > 1 && excludeId
        ? backlogPool.filter((t) => t.id !== excludeId)
        : backlogPool;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    setRandomPickedId(chosen.id);
    setSelectedTaskId(chosen.id);
    setDialogueMode('random_pick');

    const cat = getQuestCategoryBadge(chosen.tags);
    speak(
      `命运的骰子停在了 ${cat.icon}《${chosen.title}》！这份待接取委托一直在等你开启呢，要现在就把它移入「攻略中」正式开坑吗？`,
      'happy'
    );
  };

  const startStaleReview = () => {
    setActiveOverlay('none');
    setViewMode('kanban');
    if (staleList.length === 0) {
      const now = new Date();
      setLiveNow(now);
      const chatter = getRandomChatter(guildStats, tasks, staleList, now);
      speak(chatter.text, chatter.expression);
      return;
    }
    setStaleIndex(0);
    const first = staleList[0];
    setSelectedTaskId(first.task.id);
    setDialogueMode('stale_review');
    speak(
      `我巡检账本时发现《${first.task.title}》已经 ${first.daysSinceLastActive} 天没有推进记录啦（${first.lastDateLabel}）。今天要推一把，还是先帮它移到「搁置区」？`,
      'sleepy'
    );
  };

  // ── Check-in Form Submission ───────────────────────────────────────────────
  const handleCheckInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;

    const effectiveType: ProgressType = markAsCompleted ? 'completed' : checkInType;
    const parsedHours = checkInHours.trim() !== '' ? parseFloat(checkInHours) : undefined;
    const validHours = parsedHours !== undefined && !isNaN(parsedHours) ? parsedHours : undefined;
    const parsedRest = checkInRestMinutes.trim() !== '' ? parseInt(checkInRestMinutes, 10) : undefined;
    const validRest = parsedRest !== undefined && !isNaN(parsedRest) && parsedRest > 0 ? parsedRest : undefined;

    const existingForDate = getLog(selectedTask.id, checkInDate);
    const submitMode: 'append' | 'replace' = existingForDate ? checkInFormMode : 'replace';

    const savedLog = addOrUpdateLog({
      taskId: selectedTask.id,
      date: checkInDate,
      progressType: effectiveType,
      hours: validHours,
      note: checkInNote.trim(),
      isBackfill: checkInIsBackfill,
      markTaskAsCompleted: markAsCompleted || effectiveType === 'completed',
      mode: submitMode,
      restMinutes: validRest,
    });

    const latestSession = savedLog.workSessions?.[savedLog.workSessions.length - 1];
    const latestSessionRest =
      latestSession?.restSessions?.[latestSession.restSessions.length - 1] ?? null;

    const isCompleted = markAsCompleted || effectiveType === 'completed';
    setLastCheckInResult({
      taskTitle: selectedTask.title,
      date: checkInDate,
      progressType: effectiveType,
      hours: validHours,
      wasCompleted: isCompleted,
    });

    setAffection((prev) => {
      const next = prev + (isCompleted ? 5 : 2);
      saveAffectionPoints(next);
      return next;
    });

    const shouldOfferRest =
      checkInDate === todayStr &&
      !checkInIsBackfill &&
      effectiveType !== 'rest' &&
      validHours !== undefined &&
      validHours > 0.3 &&
      !validRest;

    if (shouldOfferRest) {
      restTaskRef.current = {
        taskId: selectedTask.id,
        taskTitle: selectedTask.title,
        date: checkInDate,
        sessionId: latestSession?.id,
      };
      setLastRecordedRest(null);
      setRestDurationMinutes(5);
      setDialogueMode('rest_prompt');

      const toastMsg = isCompleted
        ? `🎉 通关达成！已归档「${selectedTask.title}」`
        : submitMode === 'append'
          ? `已为「${selectedTask.title}」(${checkInDate}) 追加一条新记录`
          : `已登记「${selectedTask.title}」(${checkInDate}) 推进打卡`;
      showToast(toastMsg, 'success', true);

      speak(
        isCompleted
          ? `恭喜正式通关《${selectedTask.title}》！刚刚投入了 ${formatHours(
              validHours!
            )} 呢，要不要趁机休息放松一下？我可以为你开启表盘倒计时（默认 5 分钟）~`
          : `收到！《${selectedTask.title}》本次${
              submitMode === 'append' ? '追加的 ' : '推进 '
            }${formatHours(validHours!)} 已经盖章入账啦！连续专注超过 0.3 小时辛苦了，需要休息一下吗？我准备了休息表盘（默认 5 分钟）哦~`,
        isCompleted ? 'cheer' : 'happy'
      );
      return;
    }

    setLastRecordedRest(
      latestSessionRest && validRest
        ? {
            startTime: latestSessionRest.startTime,
            endTime: latestSessionRest.endTime,
            durationMinutes: latestSessionRest.durationMinutes,
          }
        : null
    );
    setDialogueMode('checkin_done');

    const restNotice = validRest ? `（含 ${validRest} 分钟事后休息）` : '';
    if (isCompleted) {
      speak(
        `太棒啦！恭喜正式通关《${selectedTask.title}》！！${restNotice}我已经帮你加盖了「已达成」金印并归档，冒险者大人真是太可靠了！`,
        'cheer'
      );
      showToast(`🎉 通关达成！已归档「${selectedTask.title}」`, 'success', true);
    } else if (effectiveType === 'rest') {
      speak(
        `偶尔在营地休整也是冒险的重要一环！已经把《${selectedTask.title}》在 ${checkInDate} 的休整记录${restNotice}登记妥当啦~`,
        'normal'
      );
      showToast(`已登记「${selectedTask.title}」(${checkInDate}) 休整记录`, 'info', true);
    } else {
      const hoursText = validHours && validHours > 0 ? `（投入 ${formatHours(validHours)}）` : '';
      speak(
        `收到！《${selectedTask.title}》在 ${checkInDate} 的${
          submitMode === 'append' ? '追加记录' : '推进成果'
        }${hoursText}${restNotice}已经盖章入账！`,
        'happy'
      );
      showToast(
        submitMode === 'append'
          ? `已为「${selectedTask.title}」(${checkInDate}) 追加新记录`
          : `已登记「${selectedTask.title}」(${checkInDate}) 推进打卡`,
        'success',
        true
      );
    }
  };

  const handleDeleteCurrentCheckIn = () => {
    if (!selectedTask) return;
    const existing = getLog(selectedTask.id, checkInDate);
    if (!existing) return;
    deleteLog(existing.id);
    showToast(`已清空 ${checkInDate} 的打卡记录`, 'info', true);
    speak(`已经帮你擦除了《${selectedTask.title}》在 ${checkInDate} 的那笔记录。`, 'normal');
    setDialogueMode('inspect_task');
  };

  // ── Create / Edit Task Form Submission ─────────────────────────────────────
  const handleAddFormTag = (tagToAdd: string) => {
    const trimmed = tagToAdd.trim();
    if (trimmed && !formTags.includes(trimmed)) {
      setFormTags([...formTags, trimmed]);
    }
    setFormNewTag('');
  };

  const handleTaskFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = formTitle.trim();
    if (!trimmedTitle) return;

    let finalTags = [...formTags];
    const pendingTag = formNewTag.trim();
    if (pendingTag && !finalTags.includes(pendingTag)) {
      finalTags.push(pendingTag);
    }
    if (finalTags.length === 0) finalTags = ['未分类'];

    if (dialogueMode === 'edit_task' && selectedTask) {
      updateTask(selectedTask.id, {
        title: trimmedTitle,
        status: formStatus,
        tags: finalTags,
      });
      setDialogueMode('inspect_task');
      speak(`已经帮你将《${trimmedTitle}》的委托档案修改妥当啦！`, 'happy');
    } else {
      const created = addTask({
        title: trimmedTitle,
        status: formStatus,
        tags: finalTags,
      });
      setSelectedTaskId(created.id);
      setDialogueMode('inspect_task');
      setAffection((prev) => {
        const next = prev + 2;
        saveAffectionPoints(next);
        return next;
      });
      speak(
        `好耶！新委托《${created.title}》已正式写入公会账本的「${RPG_STATUS_META[created.status].rpgLabel}」名录！要顺便为它打第一卡吗？`,
        'happy'
      );
    }
  };

  const handleDeleteSelectedTask = async () => {
    if (!selectedTask) return;
    const title = selectedTask.title;
    const confirmed = await requestConfirm({
      title: '销毁委托档案',
      message: `确定要将「${title}」及其所有打卡记录从公会账本中移除吗？移除后可通过顶部「撤销」恢复。`,
      confirmText: '确认销毁',
      cancelText: '再想想',
      variant: 'danger',
    });
    if (confirmed) {
      deleteTask(selectedTask.id);
      showToast(`已移除委托「${title}」`, 'info', true);
      setSelectedTaskId(null);
      setDialogueMode('hub');
      speak(`已经将《${title}》的委托卷宗妥善清理掉了。如果有后悔，还可以用顶部的「撤销」找回哦~`, 'normal');
    }
  };

  const handleQuickMoveStatus = (task: TaskItem, targetStatus: TaskStatus) => {
    if (task.status === targetStatus) return;
    moveTaskStatus(task.id, targetStatus);
    if (targetStatus === 'done') {
      speak(`恭喜！《${task.title}》已光荣归入「已达成」殿堂！`, 'cheer');
    } else if (targetStatus === 'in_progress') {
      speak(`《${task.title}》已转为「攻略中」状态，祝你冒险愉快！`, 'happy');
    } else if (targetStatus === 'paused') {
      speak(`好，先把《${task.title}》放入「冻结书架」保存起来，想继续时随时唤醒它~`, 'normal');
    } else {
      speak(`已将《${task.title}》放回「待接取」名录。`, 'normal');
    }
  };

  // ── Ledger Drag & Drop Handlers ────────────────────────────────────────────
  const handleCardDragStart = (e: React.DragEvent, task: TaskItem) => {
    e.dataTransfer.setData('text/plain', task.id);
    setDraggedTaskId(task.id);
    setDraggedTaskStatus(task.status);
    setTimeout(() => {
      const el = cardRefs.current.get(task.id);
      if (el) el.style.opacity = '0.4';
    }, 0);
  };

  const handleCardDragEnd = (taskId: string) => {
    const el = cardRefs.current.get(taskId);
    if (el) el.style.opacity = '';
    setDraggedTaskId(null);
    setDraggedTaskStatus(null);
    setDragOverTab(null);
    setDragOverCardId(null);
  };

  const handleCardDragOver = (e: React.DragEvent, cardId: string, cardStatus: TaskStatus) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedTaskStatus === cardStatus && draggedTaskId !== cardId) {
      const cardEl = cardRefs.current.get(cardId);
      if (cardEl) {
        const rect = cardEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        setDragOverCardId(cardId);
        setDropPosition(e.clientY < midY ? 'before' : 'after');
      }
    }
  };

  const handleCardDrop = (e: React.DragEvent, targetTask: TaskItem) => {
    e.preventDefault();
    e.stopPropagation();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (!taskId || taskId === targetTask.id) return;
    if (draggedTaskStatus === targetTask.status) {
      reorderTasks(taskId, targetTask.id, dropPosition);
    }
    setDraggedTaskId(null);
    setDraggedTaskStatus(null);
    setDragOverCardId(null);
    setDragOverTab(null);
  };

  const handleTabDrop = (e: React.DragEvent, targetTab: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== targetTab) {
      handleQuickMoveStatus(task, targetTab);
      setActiveLedgerTab(targetTab);
    }
    setDraggedTaskId(null);
    setDraggedTaskStatus(null);
    setDragOverTab(null);
    setDragOverCardId(null);
  };

  const handleSaveNpcConfig = (next: NpcConfig) => {
    setLoadedRawSrcs({});
    setFailedRawSrcs({});
    setLastReadyRawSrc('');
    setNpcConfig(next);
    saveNpcConfig(next);
    refreshNpcConfigImageCache(next, expression, () => {
      setCacheVersion((v) => v + 1);
    });
    showToast(`已更新看板娘「${next.name}」的设定`, 'success');
  };

  const handleResetNpcConfig = () => {
    const def = resetNpcConfig();
    setLoadedRawSrcs({});
    setFailedRawSrcs({});
    setLastReadyRawSrc('');
    setNpcConfig(def);
    refreshNpcConfigImageCache(def, expression, () => {
      setCacheVersion((v) => v + 1);
    });
    showToast('已恢复默认公会看板娘立绘与设定', 'info');
  };

  const displayedDialogue = dialogueText.slice(0, typedLength);
  const isTyping = typedLength < dialogueText.length;

  const currentLedgerTasks = tasksByStatus[activeLedgerTab];
  const randomPickedTask = randomPickedId ? tasks.find((t) => t.id === randomPickedId) ?? null : null;
  const currentStaleItem = staleList[staleIndex] || null;
  const isSplitStage = activeOverlay !== 'none' || dialogueMode !== 'hub';
  const showLeftNpcStage = !isSplitStage
    ? true
    : isPortraitOrCompact
      ? showPortraitCompanion
      : activeOverlay === 'none' || !wideOverlayMode;
  const hasActiveFilters = Boolean(searchQuery.trim() || selectedTag);

  const counterPanelHeader = useMemo(() => {
    switch (dialogueMode) {
      case 'select_checkin_task':
        return {
          title: '选择今日要汇报的委托',
          subtitle: '点击任意委托即可登记或更新今日推进与时长',
        };
      case 'inspect_task':
        return {
          title: selectedTask ? `委托卷宗 · ${selectedTask.title}` : '委托卷宗详情',
          subtitle: '查看进度统计、调动委托状态或快捷汇报打卡',
        };
      case 'checkin_form':
        return {
          title: selectedTask ? `进度汇报柜台 · ${selectedTask.title}` : '进度汇报柜台',
          subtitle: '填写当日状态、投入时长与心得体会并盖章入账',
        };
      case 'pomodoro':
        return {
          title: pomodoroBoundTask
            ? `公会番茄怀表 · ${pomodoroBoundTask.title}`
            : '公会番茄怀表 · 专注与休整',
          subtitle: '专注倒计时自动盖章记入今日打卡，轮休结束后自动记录休息时段',
        };
      case 'rest_prompt':
        return {
          title: '营地茶歇关怀 · 休息确认',
          subtitle: '今日专注推进超过 0.3h，可启用公会怀表开启事后休息并归档时段',
        };
      case 'rest_dial':
        return {
          title: '公会怀表 · 表盘确认休息时长',
          subtitle: '拖拽或点选表盘指针（默认 5 分钟），确认后进入倒计时并自动入账',
        };
      case 'rest_countdown':
        return {
          title: restTaskRef.current
            ? `事后休息倒计时 · ${restTaskRef.current.taskTitle}`
            : '事后休息倒计时',
          subtitle: '休息结束后将自动把时段与时长记入对应的任务数据内',
        };
      case 'checkin_done':
        return {
          title: '公会印章已盖妥',
          subtitle: '本笔冒险推进成果已正式写入公会账本',
        };
      case 'create_task':
        return {
          title: '登记新的公会委托',
          subtitle: '填入目标标题、初始状态与分类标签即可正式立项',
        };
      case 'edit_task':
        return {
          title: selectedTask ? `修订委托档案 · ${selectedTask.title}` : '修订委托档案',
          subtitle: '调整标题、当前状态或分类标签',
        };
      case 'random_pick':
        return {
          title: '命运骰子 · 抽坑开玩',
          subtitle: '从「待接取」书架抽取下一场冒险',
        };
      case 'stale_review':
        return {
          title: '公会账本 · 催更巡检',
          subtitle: '梳理超过 3 天未推进的「攻略中」委托',
        };
      case 'sync_menu':
        return {
          title: '卷宗同步与备份中心',
          subtitle: '管理 GitHub Gist 云端自动同步、本地目录实时同步或 JSON 备份',
        };
      default:
        return {
          title: '公会接待柜台',
          subtitle: '随时在此办理日常委托事务',
        };
    }
  }, [dialogueMode, selectedTask, pomodoroBoundTask]);

  // Gist & Local sync dot color helpers
  const driveDotClass = !user
    ? 'bg-stone-400'
    : syncStatus === 'conflict'
      ? 'bg-rose-500 animate-pulse'
      : syncStatus === 'error'
        ? 'bg-rose-500'
        : isSyncing
          ? 'bg-blue-400 animate-pulse'
          : hasUnsyncedDriveChanges
            ? 'bg-amber-400'
            : 'bg-emerald-400';

  const localDotClass = !localSync.supported || !localSync.enabled
    ? 'bg-stone-400'
    : localSync.status === 'error'
      ? 'bg-rose-500'
      : localSync.status === 'needs-permission'
        ? 'bg-amber-400'
        : localSync.status === 'syncing'
          ? 'bg-blue-400 animate-pulse'
          : 'bg-emerald-400';

  const hubChoiceCardPad = isShortLandscape
    ? 'p-2.5 sm:p-3 rounded-xl'
    : 'p-3.5 sm:p-4 rounded-2xl';

  const renderCompanionToggle = (tone: 'parchment' | 'dark') => {
    if (isPortraitOrCompact) {
      return (
        <button
          type="button"
          onClick={() => setShowPortraitCompanion((p) => !p)}
          className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
            showPortraitCompanion
              ? 'bg-amber-500 text-amber-950 border-amber-300'
              : tone === 'parchment'
                ? 'bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/20 dark:hover:bg-white/15 text-amber-950 dark:text-amber-100 border-amber-700/25 dark:border-amber-500/35'
                : 'bg-black/40 hover:bg-white/10 border-amber-500/35 text-amber-100'
          }`}
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span>{showPortraitCompanion ? '收起伴随' : '看板娘伴随'}</span>
        </button>
      );
    }

    if (activeOverlay === 'none') return null;

    return (
      <button
        type="button"
        onClick={() => setWideOverlayMode((p) => !p)}
        className={`hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
          tone === 'parchment'
            ? 'rounded-xl bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/20 dark:hover:bg-white/15 text-amber-950 dark:text-amber-100'
            : 'rounded-lg bg-black/40 hover:bg-white/10 border border-amber-500/35 text-amber-100'
        }`}
      >
        {wideOverlayMode ? (
          <>
            <Minimize2 className="w-3.5 h-3.5" />
            <span>▶ 看板娘伴随</span>
          </>
        ) : (
          <>
            <Maximize2 className="w-3.5 h-3.5" />
            <span>◀ 宽屏视图</span>
          </>
        )}
      </button>
    );
  };

  return (
    <div className="relative flex flex-col w-full h-full flex-1 min-h-0 rounded-2xl border-2 border-amber-800/70 dark:border-amber-700/50 bg-[#1a130e] shadow-2xl overflow-hidden overflow-x-hidden select-none">
      {/* Hidden JSON Import Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* ── Layer 0: Unified Guild Primary Navigation & Top HUD ── */}
      <header
        className={`relative z-40 bg-[#231811]/95 border-b border-amber-600/40 shrink-0 ${
          isShortLandscape
            ? 'px-3 sm:px-5 py-1.5 sm:py-2 space-y-1.5'
            : 'px-3 sm:px-6 py-2 sm:py-3 space-y-2'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Left: Rank Badge, Live Clock/Period & Guild Micro-Stats */}
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r ${guildStats.tierColorClass} border shadow-sm`}
              title={`经验值 ${guildStats.exp} EXP（距下一级还需 ${guildStats.nextLevelExp - guildStats.exp} EXP）`}
            >
              <Award className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              <div className="leading-none">
                <div className="text-xs sm:text-sm font-extrabold tracking-wide flex items-center gap-1.5">
                  <span>Lv.{guildStats.level}</span>
                  <span>{guildStats.rankTitle}</span>
                </div>
                <div className="w-20 sm:w-28 h-1.5 bg-black/25 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-white/90 rounded-full transition-all duration-300"
                    style={{ width: `${guildStats.levelProgressPct}%` }}
                  />
                </div>
              </div>
            </div>

            <div
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-black/45 border border-amber-500/30 text-xs sm:text-sm text-amber-100"
              title={`当前时间 ${periodInfo.clockText} · ${periodInfo.label}（${todayStr}）`}
            >
              <span>{periodInfo.icon}</span>
              <span className="font-mono font-bold text-amber-200">{periodInfo.clockText}</span>
              <span className="hidden sm:inline text-amber-400/50">·</span>
              <span className="hidden sm:inline text-amber-300 font-bold">{periodInfo.label}</span>
            </div>

            <div className="hidden xl:flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-black/40 border border-amber-500/25 text-xs sm:text-sm text-amber-100">
              <span className="flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span>连击 {guildStats.streakDays} 天</span>
              </span>
              <span className="w-1 h-1 rounded-full bg-amber-500/40" />
              <span>今日 {guildStats.todayCheckedCount} 卡</span>
              <span className="w-1 h-1 rounded-full bg-amber-500/40" />
              <span className="flex items-center gap-1 text-rose-300 font-semibold" title="点击看板娘可提升默契度">
                <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-400" />
                <span>{affection}</span>
              </span>
            </div>
          </div>

          {/* Center: Primary Guild Navigation Tabs */}
          <nav className="flex items-center flex-wrap gap-1.5 bg-black/45 p-1.5 rounded-xl border border-amber-600/35">
            <button
              type="button"
              onClick={() => switchSection('none')}
              className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                activeOverlay === 'none'
                  ? 'bg-amber-500 text-amber-950 shadow-sm'
                  : 'text-amber-100/85 hover:text-amber-50 hover:bg-white/10'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>接待大厅</span>
            </button>

            <button
              type="button"
              onClick={() => switchSection(activeOverlay === 'ledger' ? 'none' : 'ledger')}
              className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                activeOverlay === 'ledger'
                  ? 'bg-amber-500 text-amber-950 shadow-sm'
                  : 'text-amber-100/85 hover:text-amber-50 hover:bg-white/10'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>委托账本</span>
              <span
                className={`text-xs font-mono px-1.5 py-0.2 rounded-full ${
                  activeOverlay === 'ledger' ? 'bg-black/15 text-amber-950' : 'bg-amber-500/25 text-amber-200'
                }`}
              >
                {filteredTasks.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => switchSection(activeOverlay === 'gantt' ? 'none' : 'gantt')}
              className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                activeOverlay === 'gantt'
                  ? 'bg-amber-500 text-amber-950 shadow-sm'
                  : 'text-amber-100/85 hover:text-amber-50 hover:bg-white/10'
              }`}
            >
              <ScrollText className="w-4 h-4" />
              <span>时序卷轴</span>
            </button>

            <button
              type="button"
              onClick={() => switchSection(activeOverlay === 'stats' ? 'none' : 'stats')}
              className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                activeOverlay === 'stats'
                  ? 'bg-amber-500 text-amber-950 shadow-sm'
                  : 'text-amber-100/85 hover:text-amber-50 hover:bg-white/10'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>战绩圣殿</span>
            </button>
          </nav>

          {/* Right: Global Actions, Undo/Redo, Sync & NPC Settings */}
          <div className="flex items-center flex-wrap gap-1.5 grow">
            {restTargetEndMs !== null && (dialogueMode !== 'rest_countdown' || activeOverlay !== 'none') && (
              <button
                type="button"
                onClick={() => {
                  setActiveOverlay('none');
                  setViewMode('kanban');
                  setDialogueMode('rest_countdown');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-emerald-600/90 hover:bg-emerald-500 text-white border border-emerald-300/60 text-xs sm:text-sm font-extrabold shadow-sm animate-pulse cursor-pointer"
                title="点击回到事后休息倒计时表盘"
              >
                <Coffee className="w-4 h-4" />
                <span className="font-mono">
                  {String(Math.floor(restRemainingSeconds / 60)).padStart(2, '0')}:
                  {String(restRemainingSeconds % 60).padStart(2, '0')}
                </span>
              </button>
            )}

            {pomodoroRunState !== 'idle' &&
            (dialogueMode !== 'pomodoro' || activeOverlay !== 'none') ? (
              <button
                type="button"
                onClick={() => openPomodoroPanel()}
                className={`flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl text-white border text-xs sm:text-sm font-extrabold shadow-sm cursor-pointer transition-colors ${
                  pomodoroPhase === 'focus'
                    ? pomodoroRunState === 'running'
                      ? 'bg-rose-600/95 hover:bg-rose-500 border-rose-300/70 animate-pulse'
                      : 'bg-amber-700/90 hover:bg-amber-600 border-amber-300/60'
                    : pomodoroRunState === 'running'
                      ? 'bg-emerald-600/95 hover:bg-emerald-500 border-emerald-300/70 animate-pulse'
                      : 'bg-teal-700/90 hover:bg-teal-600 border-teal-300/60'
                }`}
                title="点击打开番茄钟倒计时面板"
              >
                <span>{pomodoroPhase === 'focus' ? '🍅' : '☕'}</span>
                <span className="font-mono">{formatCountdownMMSS(pomodoroRemainingSeconds)}</span>
                {pomodoroRunState === 'paused' && (
                  <span className="text-[10px] px-1 py-0.5 rounded bg-black/25">暂停</span>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openPomodoroPanel()}
                className={`flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl border text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                  activeOverlay === 'none' && dialogueMode === 'pomodoro'
                    ? 'bg-rose-600/90 text-white border-rose-300/70 shadow-sm'
                    : 'bg-black/40 border-amber-600/30 text-amber-100/90 hover:bg-white/10'
                }`}
                title="打开公会番茄钟计时器"
              >
                <span>🍅</span>
                <span className="hidden sm:inline">番茄钟</span>
                {pomodoroDailyStats.date === todayStr && pomodoroDailyStats.count > 0 && (
                  <span className="text-[11px] px-1.5 py-0.2 rounded-full bg-rose-500/25 text-rose-200 font-mono">
                    ×{pomodoroDailyStats.count}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => startCreateTask('in_progress')}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-amber-950 text-xs sm:text-sm font-extrabold shadow-xs transition-colors cursor-pointer"
              title="向看板娘登记新委托"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">新委托</span>
            </button>

            <button
              type="button"
              onClick={() => setShowFilterBar((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl border text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                showFilterBar || hasActiveFilters
                  ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                  : 'bg-black/40 border-amber-600/30 text-amber-100/85 hover:bg-white/10'
              }`}
              title="展开/收起搜索与标签筛选"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden md:inline">筛选</span>
              {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-amber-400" />}
            </button>

            {/* Undo / Redo */}
            <div className="flex items-center gap-1 pl-1.5 border-l border-amber-600/25">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                title={canUndo ? `撤销：${lastUndoDescription} (Ctrl+Z)` : '暂无可撤销操作'}
                className={`p-2 rounded-lg border text-xs sm:text-sm transition-colors ${
                  canUndo
                    ? 'bg-black/40 border-amber-600/30 text-amber-100 hover:bg-white/10 cursor-pointer'
                    : 'bg-black/20 border-white/5 text-stone-600 cursor-not-allowed'
                }`}
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                title={canRedo ? `重做：${lastRedoDescription} (Ctrl+Y)` : '暂无可重做操作'}
                className={`p-2 rounded-lg border text-xs sm:text-sm transition-colors ${
                  canRedo
                    ? 'bg-black/40 border-amber-600/30 text-amber-100 hover:bg-white/10 cursor-pointer'
                    : 'bg-black/20 border-white/5 text-stone-600 cursor-not-allowed'
                }`}
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            {/* Cloud & Local Sync + JSON Backup */}
            <div className="flex items-center gap-1.5 pl-1.5 border-l border-amber-600/25">
              <button
                type="button"
                onClick={() => setDriveSyncModalOpen(true)}
                title={
                  syncStatus === 'conflict'
                    ? 'GitHub Gist 同步存在冲突 - 点击处理'
                    : user
                      ? 'GitHub Gist 云端同步管理'
                      : '连接 GitHub Gist 云端同步'
                }
                className="relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-black/40 hover:bg-white/10 border border-amber-600/30 text-amber-100 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                <Cloud className="w-4 h-4 text-sky-400" />
                <span className="hidden lg:inline">云同步</span>
                <span className={`w-2 h-2 rounded-full ${driveDotClass}`} />
              </button>

              <button
                type="button"
                onClick={() => setLocalSyncModalOpen(true)}
                title="本地目录实时同步管理"
                className="relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-black/40 hover:bg-white/10 border border-amber-600/30 text-amber-100 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                <FolderSync className="w-4 h-4 text-amber-300" />
                <span className="hidden lg:inline">本地</span>
                <span className={`w-2 h-2 rounded-full ${localDotClass}`} />
              </button>

              <button
                type="button"
                onClick={exportData}
                title="导出 JSON 备份"
                className="p-2 rounded-lg bg-black/40 hover:bg-white/10 border border-amber-600/30 text-amber-100/85 hover:text-amber-50 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="导入 JSON 备份"
                className="p-2 rounded-lg bg-black/40 hover:bg-white/10 border border-amber-600/30 text-amber-100/85 hover:text-amber-50 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
              </button>
            </div>

            {/* NPC Settings */}
            <button
              type="button"
              onClick={() => setNpcModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-black/40 hover:bg-white/10 border border-amber-600/30 text-amber-100 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              title="自定义看板娘名字、预设与立绘"
            >
              <Settings className="w-4 h-4 text-amber-300" />
              <span className="hidden xl:inline">看板娘</span>
            </button>

            <a
              href="./v1/"
              title="切换访问旧版界面 (/v1/)"
              className="ml-auto px-2 py-1.5 sm:py-2 rounded-lg text-[11px] sm:text-xs font-mono text-amber-200/50 hover:text-amber-100 hover:bg-white/5 border border-transparent hover:border-amber-600/25 transition-colors"
            >
              v1
            </a>
          </div>
        </div>

        {/* Collapsible Search & Tag Filter Bar (Zero Horizontal Overflow, uses flex-wrap) */}
        {(showFilterBar || hasActiveFilters) && (
          <div className="pt-2 border-t border-amber-600/20 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5 flex-wrap text-xs sm:text-sm">
              <span className="flex items-center gap-1 text-amber-300/85 text-xs sm:text-sm font-semibold mr-1">
                <Tag className="w-3.5 h-3.5" />
                <span>标签:</span>
              </span>

              <button
                type="button"
                onClick={() => setSelectedTag(null)}
                className={`px-3 py-1 rounded-lg text-xs sm:text-sm font-bold border transition-colors cursor-pointer ${
                  selectedTag === null
                    ? 'bg-amber-500 text-amber-950 border-amber-300'
                    : 'bg-black/35 text-amber-100/85 border-amber-600/30 hover:bg-white/10'
                }`}
              >
                全部 ({tasks.length})
              </button>

              {(showAllTagChips ? sortedAllTags : sortedAllTags.slice(0, 8)).map((tag) => {
                const count = tasks.filter((t) => t.tags.includes(tag)).length;
                const isSelected = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTag(isSelected ? null : tag)}
                    className={`px-3 py-1 rounded-lg text-xs sm:text-sm font-semibold border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400 text-amber-950 border-amber-200'
                        : 'bg-black/35 text-amber-100/85 border-amber-600/25 hover:bg-white/10'
                    }`}
                  >
                    {tag} <span className="opacity-75">({count})</span>
                  </button>
                );
              })}

              {sortedAllTags.length > 8 && (
                <button
                  type="button"
                  onClick={() => setShowAllTagChips((p) => !p)}
                  className="text-xs sm:text-sm text-amber-300 hover:underline px-1.5 cursor-pointer"
                >
                  {showAllTagChips ? '收起' : `+${sortedAllTags.length - 8} 更多`}
                </button>
              )}
            </div>

            <div className="relative w-full md:w-72 shrink-0">
              <Search className="w-4 h-4 text-amber-300/60 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="搜索委托标题或标签..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 text-xs sm:text-sm bg-black/45 border border-amber-600/35 rounded-lg text-amber-50 placeholder-amber-200/40 focus:outline-none focus:border-amber-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-300/70 hover:text-amber-100 text-xs cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── Layer 1: Dynamic Center Reception / Left-Right Split Interactive Stage ── */}
      <div
        className={`relative flex-1 min-h-0 flex flex-col ${
          isPortraitMode ? '' : 'lg:flex-row'
        } overflow-hidden overflow-x-hidden bg-[#1a110b]`}
      >
        {/* Continuous Full-Stage Background Layer for Sprite Overlay Mode */}
        {npcConfig.displayMode === 'sprite' && (
          <div
            className="absolute inset-0 bg-cover bg-center transition-all duration-500 pointer-events-none"
            style={{
              backgroundImage: `url(${resolvedBgSrc})`,
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/45" />
          </div>
        )}

        {/* Left / Center NPC Visual Stage */}
        {showLeftNpcStage && (
          <div
            onClick={handleNpcStageClick}
            className={`relative z-10 min-h-0 flex flex-col justify-end overflow-hidden cursor-pointer group/stage transition-[width] duration-300 ease-out ${
              !isSplitStage
                ? 'w-full flex-1 h-full'
                : isPortraitOrCompact
                  ? 'w-full h-[265px] sm:h-[290px] shrink-0 border-b border-amber-500/35'
                  : activeOverlay === 'none'
                    ? 'w-full lg:w-[40%] xl:w-[38%] 2xl:w-[36%] h-full shrink-0 border-r border-amber-500/35'
                    : 'w-full lg:w-[31%] xl:w-[29%] 2xl:w-[27%] h-full shrink-0 border-r border-amber-500/35'
            }`}
          >
            {/* Warm fantasy fallback backdrop (when in scene mode or no custom bg) */}
            {npcConfig.displayMode !== 'sprite' && (
              <div className="absolute inset-0 bg-gradient-to-b from-[#332216] via-[#261810] to-[#1a110b]">
                <div className="absolute -top-20 left-1/4 w-96 h-96 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />
                <div className="absolute top-10 right-1/4 w-72 h-72 rounded-full bg-orange-400/10 blur-3xl pointer-events-none" />
              </div>
            )}

            {/* Pre-Mounted Scene CG Layers (when in scene mode: zero DOM swap or network delay on expression change) */}
            {npcConfig.displayMode === 'scene' && !activeImgFailed && (
              <div className="absolute inset-0 w-full h-full pointer-events-none">
                {uniqueExpressionRawUrls.map((rawSrc) => {
                  const resolvedSrc = resolvedExpressionSrcMap.get(rawSrc) || rawSrc;
                  const isActive = rawSrc === displayRawSrc;
                  return (
                    <img
                      key={`scene-${rawSrc}`}
                      src={resolvedSrc}
                      alt={`${npcConfig.name} - ${EXPRESSION_META[expression].label}`}
                      decoding="sync"
                      loading="eager"
                      onLoad={() => handleNpcImgLoad(rawSrc)}
                      onError={() => handleNpcImgError(rawSrc)}
                      className={`absolute inset-0 w-full h-full object-cover object-[center_18%] transition-opacity duration-200 ease-out ${
                        isActive ? 'opacity-100 z-[2]' : 'opacity-0 z-[1] pointer-events-none'
                      }`}
                      draggable={false}
                    />
                  );
                })}
              </div>
            )}

            {/* Bottom cinematic vignette */}
            <div
              className={`absolute inset-x-0 bottom-0 pointer-events-none ${
                npcConfig.displayMode === 'scene'
                  ? 'h-44 bg-gradient-to-t from-[#140e0a] via-[#140e0a]/65 to-transparent'
                  : 'h-32 bg-gradient-to-t from-[#140e0a]/85 via-[#140e0a]/35 to-transparent'
              }`}
            />

            {/* Floating Hearts on Click */}
            {floatingHearts.map((h) => (
              <div
                key={h.id}
                style={{ left: h.x, top: h.y }}
                className="absolute pointer-events-none z-30 flex items-center gap-1 text-rose-400 font-bold text-sm drop-shadow-md guild-heart-rise"
              >
                <Heart className="w-5 h-5 fill-rose-500 text-rose-400" />
                <span>+1</span>
              </div>
            ))}

            {/* Center Mode: Pinned Active Quests Board (floating top-left) */}
            {!isSplitStage && activeInProgressTasks.length > 0 && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`hidden md:flex flex-col absolute z-20 cursor-default ${
                  isShortLandscape
                    ? 'top-2.5 left-3 w-64 sm:w-72 gap-1'
                    : 'top-4 left-4 sm:top-6 sm:left-6 w-72 sm:w-80 gap-2'
                }`}
              >
                <div className="flex items-center justify-between px-1.5">
                  <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-amber-200 drop-shadow">
                    📌 当前攻略中 ({activeInProgressTasks.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveLedgerTab('in_progress');
                      switchSection('ledger');
                    }}
                    className="text-xs text-amber-300/90 hover:text-amber-100 underline cursor-pointer"
                  >
                    全部 →
                  </button>
                </div>
                {pinnedActiveTasks.map((task) => {
                  const cat = getQuestCategoryBadge(task.tags);
                  const todayLog = getLog(task.id, todayStr);
                  const affinity = taskTimeAffinityMap.get(task.id);
                  return (
                    <div
                      key={task.id}
                      onClick={() => openInspectTask(task)}
                      className={`rounded-xl bg-black/65 hover:bg-black/85 border border-amber-500/40 hover:border-amber-400/80 backdrop-blur-md text-amber-50 flex items-center justify-between gap-2 cursor-pointer transition-all shadow-lg ${
                        isShortLandscape ? 'px-3 py-1.5' : 'px-3.5 py-2'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="text-base shrink-0">{cat.icon}</span>
                        <span className="text-xs sm:text-sm font-bold truncate">{task.title}</span>
                      </div>
                      {affinity?.isCurrentPeriodMatch && (
                        <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-md bg-amber-400/20 text-amber-200 border border-amber-400/35 font-bold"
                          title={`以往常在「${affinity.matchedPeriodLabel ?? affinity.topPeriodLabel}」时段攻略此委托${
                            affinity.currentPeriodSessions > 0
                              ? `（该时段累计 ${affinity.currentPeriodSessions} 次 · ${formatHours(
                                  affinity.currentPeriodHours
                                )}）`
                              : ''
                          }`}
                        >
                          ⚡ {affinity.matchedPeriodLabel ?? affinity.topPeriodLabel}常推
                        </span>
                      )}
                      {todayLog ? (
                        <span className="shrink-0 text-xs px-2 py-0.5 rounded-md bg-emerald-500/25 text-emerald-300 border border-emerald-400/45 font-bold">
                          ✓ 已报
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCheckInForTask(task, todayStr);
                          }}
                          className="shrink-0 text-xs px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-amber-950 font-extrabold transition-colors cursor-pointer"
                        >
                          打卡
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Split-Stage Mode: Top Companion Floating Controls */}
            {isSplitStage && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute top-2.5 left-3 right-3 z-20 flex items-center justify-between gap-2 cursor-default"
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveOverlay('none');
                    setViewMode('kanban');
                    returnToHub();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-black/70 hover:bg-black/85 border border-amber-400/50 text-amber-100 text-xs sm:text-sm font-bold flex items-center gap-1.5 backdrop-blur-md shadow-md cursor-pointer transition-colors"
                >
                  <Home className="w-3.5 h-3.5 text-amber-300" />
                  <span>返回大厅中央</span>
                </button>

                <div className="flex items-center gap-1.5">
                  <div className="px-3 py-1.5 rounded-xl bg-black/70 border border-amber-400/40 text-xs sm:text-sm font-bold text-amber-100 flex items-center gap-2 backdrop-blur-md shadow-md">
                    <span className="flex items-center gap-1 text-rose-300">
                      <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-400" />
                      <span>{affection}</span>
                    </span>
                    <span className="text-amber-400/50">·</span>
                    <span className="text-amber-200">{EXPRESSION_META[expression].badge}</span>
                  </div>
                  {isPortraitOrCompact && (
                    <button
                      type="button"
                      onClick={() => setShowPortraitCompanion(false)}
                      className="px-2.5 py-1.5 rounded-xl bg-black/75 hover:bg-black/90 border border-amber-400/50 text-amber-200 text-xs font-bold backdrop-blur-md shadow-md cursor-pointer transition-colors"
                    >
                      收起
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Shared Portrait Stage (decoupled fixed frame anchored behind the dialogue top edge so transitions & dialogue height never shift or float the sprite) */}
            <div
              className={`absolute inset-x-0 top-2 sm:top-3 z-10 pointer-events-none overflow-hidden ${
                isSplitStage && isPortraitOrCompact
                  ? 'bottom-[78px]'
                  : 'bottom-[176px] sm:bottom-[188px] xl:bottom-[198px]'
              }`}
            >
              {activeImgFailed ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-amber-100/80 p-4 text-center">
                  <div className="w-20 h-20 rounded-full bg-amber-900/50 border-2 border-amber-500/50 flex items-center justify-center text-3xl shadow-lg mb-2.5">
                    {expression === 'cheer'
                      ? '🎉'
                      : expression === 'happy'
                      ? '😊'
                      : expression === 'thinking'
                      ? '🤔'
                      : expression === 'sleepy'
                      ? '🥱'
                      : '✨'}
                  </div>
                  <p className="text-sm sm:text-base font-bold text-amber-200">{npcConfig.name}</p>
                  <p className="text-xs text-amber-300/75 mt-1 max-w-xs">
                    当前表情立绘未加载，可点击右上角「看板娘」设置上传或更换图片
                  </p>
                </div>
              ) : (
                npcConfig.displayMode === 'sprite' && (
                  <div
                    className={`w-full h-full ${
                      isSplitStage && isPortraitOrCompact ? 'pt-3 sm:pt-3' : 'pt-6 sm:pt-4'
                    }`}
                  >
                    <div className="relative w-full h-full">
                      {uniqueExpressionRawUrls.map((rawSrc) => {
                        const resolvedSrc = resolvedExpressionSrcMap.get(rawSrc) || rawSrc;
                        const isActive = rawSrc === displayRawSrc;
                        return (
                          <div
                            key={`sprite-${rawSrc}`}
                            className={`absolute inset-0 flex items-end justify-center pointer-events-none transition-opacity duration-150 ${
                              isActive ? 'opacity-100 z-[2]' : 'opacity-0 z-[1]'
                            }`}
                          >
                            <img
                              src={resolvedSrc}
                              alt={`${npcConfig.name} - ${EXPRESSION_META[expression].label}`}
                              decoding="sync"
                              loading="eager"
                              onLoad={() => handleNpcImgLoad(rawSrc)}
                              onError={() => handleNpcImgError(rawSrc)}
                              className="h-full w-auto max-w-none shrink-0 object-contain object-bottom drop-shadow-[0_12px_28px_rgba(0,0,0,0.65)] guild-float-slow"
                              draggable={false}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )
              )}
            </div>

            {/* ── CENTER RECEPTION MODE UI ── */}
            {!isSplitStage && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`relative mt-auto shrink-0 z-20 flex justify-center cursor-default max-h-full ${
                  isShortLandscape ? 'px-3 sm:px-6 pb-2.5 pt-5' : 'px-3 sm:px-8 pb-3 sm:pb-6 pt-5'
                }`}
              >
                <div className="relative w-full max-w-4xl xl:max-w-5xl max-h-full flex flex-col">
                  {/* Nameplate & Affection Pill (kept outside scroll container so it never clips) */}
                  <div className="absolute -top-3.5 left-4 right-4 sm:left-6 sm:right-6 z-20 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
                    <div className="flex items-center gap-2 pointer-events-auto">
                      <div className="px-3.5 sm:px-4 py-1 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 border border-amber-300/80 text-amber-50 text-xs sm:text-base font-extrabold tracking-wider shadow-lg flex items-center gap-1.5">
                        <span>【{npcConfig.title}】</span>
                        <span className="text-amber-200">{npcConfig.name}</span>
                      </div>
                      <span className="px-2.5 py-1 rounded-lg bg-black/80 border border-amber-500/40 text-xs sm:text-sm font-semibold text-amber-200 backdrop-blur-sm">
                        {EXPRESSION_META[expression].badge}
                      </span>
                    </div>

                    <div className="hidden sm:flex items-center gap-2 pointer-events-auto">
                      <span
                        className="px-3 py-1 rounded-lg bg-black/80 border border-rose-500/40 text-xs sm:text-sm font-bold text-rose-300 flex items-center gap-1.5 backdrop-blur-sm"
                        title="点击看板娘可提升默契度"
                      >
                        <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-400" />
                        <span>默契度 {affection}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const now = new Date();
                          setLiveNow(now);
                          const chatter = getRandomChatter(guildStats, tasks, staleList, now);
                          speak(chatter.text, chatter.expression);
                        }}
                        className="px-3 py-1 rounded-lg bg-[#2a2019] hover:bg-[#382b22] border border-amber-500/45 text-xs sm:text-sm font-bold text-amber-200 flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                        <span>闲聊互动</span>
                      </button>
                    </div>
                  </div>

                  <div
                    className={`w-full overflow-y-auto overscroll-contain bg-[#18120e]/92 backdrop-blur-md border-2 border-amber-500/70 rounded-3xl shadow-[0_24px_64px_rgba(0,0,0,0.8)] text-amber-50 ${
                      isShortLandscape
                        ? 'px-4 pt-4 pb-3 sm:px-5'
                        : 'p-4 pt-5 sm:p-5 sm:pt-6 xl:p-6 xl:pt-6'
                    }`}
                  >
                    {/* Large Readable Dialogue Text (pre-sized to prevent layout shift during typing) */}
                    <div
                      onClick={() => {
                        if (isTyping) setTypedLength(dialogueText.length);
                      }}
                      className={`grid text-amber-50 font-medium cursor-pointer ${
                        isShortLandscape
                          ? 'text-sm sm:text-base leading-snug min-h-[2.4rem] mt-0.5 mb-2.5'
                          : 'text-base sm:text-lg xl:text-xl leading-relaxed min-h-[3.2rem] mt-1 mb-3.5'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className="col-start-1 row-start-1 invisible select-none pointer-events-none"
                      >
                        {dialogueText}
                      </span>
                      <span className="col-start-1 row-start-1">
                        <span>{displayedDialogue}</span>
                        {isTyping && (
                          <span className="inline-block w-2 h-5 ml-1.5 bg-amber-400 animate-pulse align-middle" />
                        )}
                      </span>
                    </div>

                    {/* 6 Large RPG Choice Cards */}
                    <div
                      className={`grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 ${
                        isShortLandscape ? 'gap-2' : 'gap-2.5'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={startCheckInFlow}
                        className={`guild-choice-btn ${hubChoiceCardPad} bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-amber-950 border border-amber-200/80 shadow-lg text-left flex items-start gap-3 cursor-pointer`}
                      >
                        <div className="p-2 rounded-xl bg-black/15 shrink-0">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-extrabold leading-tight">
                            汇报今日进度
                          </div>
                          <div className="text-xs text-amber-950/80 font-semibold mt-1 truncate">
                            今日已报 {guildStats.todayCheckedCount} 项 · 攻略中 {guildStats.inProgressCount} 项
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => switchSection('ledger')}
                        className={`guild-choice-btn ${hubChoiceCardPad} bg-[#2a2019]/95 hover:bg-[#382b22] text-amber-50 border border-amber-500/45 text-left flex items-start gap-3 cursor-pointer`}
                      >
                        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0">
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-extrabold leading-tight">
                            翻阅委托账本
                          </div>
                          <div className="text-xs text-amber-200/75 mt-1 truncate">
                            共 {filteredTasks.length} 份委托 · 四状态分类管理
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => startCreateTask('in_progress')}
                        className={`guild-choice-btn ${hubChoiceCardPad} bg-[#2a2019]/95 hover:bg-[#382b22] text-amber-50 border border-amber-500/45 text-left flex items-start gap-3 cursor-pointer`}
                      >
                        <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 shrink-0">
                          <Plus className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-extrabold leading-tight">
                            登记新的委托
                          </div>
                          <div className="text-xs text-amber-200/75 mt-1 truncate">
                            立项新游戏 / 书籍 / 影视目标
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => triggerRandomPick()}
                        className={`guild-choice-btn ${hubChoiceCardPad} bg-[#2a2019]/95 hover:bg-[#382b22] text-amber-50 border border-amber-500/45 text-left flex items-start gap-3 cursor-pointer`}
                      >
                        <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 shrink-0">
                          <Dices className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-extrabold leading-tight">
                            帮我抽个坑填
                          </div>
                          <div className="text-xs text-amber-200/75 mt-1 truncate">
                            从 {guildStats.backlogCount} 项待接取中随机抽取
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={startStaleReview}
                        className={`guild-choice-btn ${hubChoiceCardPad} border text-left flex items-start gap-3 cursor-pointer ${
                          staleList.length > 0
                            ? 'bg-rose-950/75 hover:bg-rose-900/80 text-rose-50 border-rose-400/55'
                            : 'bg-[#2a2019]/95 hover:bg-[#382b22] text-amber-50 border-amber-500/45'
                        }`}
                      >
                        <div
                          className={`p-2 rounded-xl shrink-0 ${
                            staleList.length > 0
                              ? 'bg-rose-500/25 text-rose-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          <BellRing className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-extrabold leading-tight">
                            催更巡检
                          </div>
                          <div className="text-xs text-amber-200/80 mt-1 truncate">
                            {staleList.length > 0
                              ? `${staleList.length} 项委托已超 3 天未推进`
                              : '巡检久未推进的攻略中委托'}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveOverlay('none');
                          setViewMode('kanban');
                          setDialogueMode('sync_menu');
                          speak(
                            `需要同步云端卷宗还是备份到本地文件夹呢？可以在右侧同步中心直接操作~`,
                            'thinking'
                          );
                        }}
                        className={`guild-choice-btn ${hubChoiceCardPad} bg-[#2a2019]/95 hover:bg-[#382b22] text-amber-50 border border-amber-500/45 text-left flex items-start gap-3 cursor-pointer`}
                      >
                        <div className="p-2 rounded-xl bg-sky-500/20 text-sky-300 shrink-0">
                          <Cloud className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-extrabold leading-tight">
                            同步与备份
                          </div>
                          <div className="text-xs text-amber-200/75 mt-1 truncate">
                            GitHub Gist / 本地目录 / JSON 备份
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── SPLIT-STAGE LEFT COMPANION UI (Bottom Live Speech Bubble & Quick Affair Switcher) ── */}
            {isSplitStage && (
              <div
                onClick={(e) => e.stopPropagation()}
                className={`relative mt-auto shrink-0 z-20 bg-[#18120e]/92 backdrop-blur-md border-2 border-amber-500/70 rounded-2xl shadow-2xl text-amber-50 cursor-default ${
                  isPortraitOrCompact
                    ? 'mx-2.5 mb-2 p-2.5 sm:p-3'
                    : 'mx-3 mb-3 sm:mx-4 sm:mb-4 p-3.5 sm:p-4'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-sm sm:text-base font-extrabold text-amber-200 tracking-wide shrink-0">
                      {npcConfig.name}
                    </span>
                    {npcConfig.title && (
                      <span className="text-xs text-amber-300/75 font-semibold truncate">
                        · {npcConfig.title}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const now = new Date();
                        setLiveNow(now);
                        const chatter = getRandomChatter(guildStats, tasks, staleList, now);
                        speak(chatter.text, chatter.expression);
                      }}
                      className="text-xs px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-amber-200 font-semibold cursor-pointer transition-colors"
                    >
                      💬 闲聊
                    </button>
                  </div>
                </div>

                <div
                  onClick={() => {
                    if (isTyping) setTypedLength(dialogueText.length);
                  }}
                  className={`grid text-amber-50 font-medium cursor-pointer ${
                    isPortraitOrCompact
                      ? 'text-xs sm:text-sm leading-snug min-h-[2rem]'
                      : 'text-sm sm:text-base xl:text-lg leading-relaxed min-h-[3.75rem]'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="col-start-1 row-start-1 invisible select-none pointer-events-none"
                  >
                    {dialogueText}
                  </span>
                  <span className="col-start-1 row-start-1">
                    <span>{displayedDialogue}</span>
                    {isTyping && (
                      <span className="inline-block w-1.5 h-4 ml-1 bg-amber-400 animate-pulse align-middle" />
                    )}
                  </span>
                </div>

                {/* Quick Affair Switcher Bar */}
                <div
                  className={`border-t border-amber-500/25 ${
                    isPortraitOrCompact
                      ? 'pt-1.5 mt-1.5 flex flex-wrap gap-1.5'
                      : 'pt-2.5 mt-2.5 grid grid-cols-3 gap-1.5'
                  }`}
                >
                    <button
                      type="button"
                      onClick={startCheckInFlow}
                      className={`rounded-lg text-xs font-bold border transition-colors cursor-pointer truncate ${
                        isPortraitOrCompact ? 'px-2.5 py-1' : 'px-2 py-1.5 text-center'
                      } ${
                        activeOverlay === 'none' &&
                        (dialogueMode === 'select_checkin_task' || dialogueMode === 'checkin_form')
                          ? 'bg-amber-500 text-amber-950 border-amber-300'
                          : 'bg-[#2a2019] hover:bg-[#382b22] text-amber-100 border-amber-500/35'
                      }`}
                    >
                      📝 汇报打卡
                    </button>
                    <button
                      type="button"
                      onClick={() => startCreateTask('in_progress')}
                      className={`rounded-lg text-xs font-bold border transition-colors cursor-pointer truncate ${
                        isPortraitOrCompact ? 'px-2.5 py-1' : 'px-2 py-1.5 text-center'
                      } ${
                        activeOverlay === 'none' && dialogueMode === 'create_task'
                          ? 'bg-amber-500 text-amber-950 border-amber-300'
                          : 'bg-[#2a2019] hover:bg-[#382b22] text-amber-100 border-amber-500/35'
                      }`}
                    >
                      ✨ 新建委托
                    </button>
                    <button
                      type="button"
                      onClick={() => switchSection('ledger')}
                      className={`rounded-lg text-xs font-bold border transition-colors cursor-pointer truncate ${
                        isPortraitOrCompact ? 'px-2.5 py-1' : 'px-2 py-1.5 text-center'
                      } ${
                        activeOverlay === 'ledger'
                          ? 'bg-amber-500 text-amber-950 border-amber-300'
                          : 'bg-[#2a2019] hover:bg-[#382b22] text-amber-100 border-amber-500/35'
                      }`}
                    >
                      📖 委托账本
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerRandomPick()}
                      className={`rounded-lg text-xs font-bold border transition-colors cursor-pointer truncate ${
                        isPortraitOrCompact ? 'px-2.5 py-1' : 'px-2 py-1.5 text-center'
                      } ${
                        activeOverlay === 'none' && dialogueMode === 'random_pick'
                          ? 'bg-amber-500 text-amber-950 border-amber-300'
                          : 'bg-[#2a2019] hover:bg-[#382b22] text-amber-100 border-amber-500/35'
                      }`}
                    >
                      🎲 帮我抽坑
                    </button>
                    <button
                      type="button"
                      onClick={startStaleReview}
                      className={`rounded-lg text-xs font-bold border transition-colors cursor-pointer truncate ${
                        isPortraitOrCompact ? 'px-2.5 py-1' : 'px-2 py-1.5 text-center'
                      } ${
                        activeOverlay === 'none' && dialogueMode === 'stale_review'
                          ? 'bg-amber-500 text-amber-950 border-amber-300'
                          : 'bg-[#2a2019] hover:bg-[#382b22] text-amber-100 border-amber-500/35'
                      }`}
                    >
                      🔔 催更{staleList.length > 0 ? `(${staleList.length})` : ''}
                    </button>
                    {!isPortraitOrCompact && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveOverlay('none');
                          setViewMode('kanban');
                          setDialogueMode('sync_menu');
                          speak(
                            `需要同步云端卷宗还是备份到本地文件夹呢？可以在右侧同步中心直接操作~`,
                            'thinking'
                          );
                        }}
                        className={`px-2 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer truncate text-center ${
                          activeOverlay === 'none' && dialogueMode === 'sync_menu'
                            ? 'bg-amber-500 text-amber-950 border-amber-300'
                            : 'bg-[#2a2019] hover:bg-[#382b22] text-amber-100 border-amber-500/35'
                        }`}
                      >
                        ☁️ 同步备份
                      </button>
                    )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Right Side Information & Interactive Workspace (Split-Stage Mode) ── */}
        {isSplitStage && (
          <div
            className={`relative z-10 flex-1 min-w-0 h-full min-h-0 flex flex-col p-1.5 sm:p-3 xl:p-5 overflow-hidden overflow-x-hidden ${
              npcConfig.displayMode === 'sprite'
                ? 'bg-[#140e0a]/65 backdrop-blur-md'
                : 'bg-[#140e0a]/95'
            }`}
          >
            {/* OVERLAY A: PARCHMENT QUEST LEDGER */}
            {activeOverlay === 'ledger' && (
              <div className="flex-1 min-h-0 guild-parchment rounded-2xl border-2 border-amber-700/60 dark:border-amber-600/50 shadow-2xl flex flex-col overflow-hidden overflow-x-hidden">
                <div className="px-4 sm:px-5 pt-3.5 pb-0 border-b border-amber-800/20 dark:border-amber-700/30 bg-[#f3e6c8]/90 dark:bg-[#2a221a]/95 shrink-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <BookOpen className="w-5 h-5 text-amber-800 dark:text-amber-400 shrink-0" />
                      <h3 className="text-base sm:text-lg font-extrabold text-amber-950 dark:text-amber-100 tracking-wide">
                        公会委托账本
                      </h3>
                      <span className="hidden xl:inline text-xs text-amber-800/75 dark:text-amber-300/75">
                        · 拖拽卡片可排序，拖至页签可跨状态调动
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {renderCompanionToggle('parchment')}
                      <button
                        type="button"
                        onClick={() => startCreateTask(activeLedgerTab)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-amber-50 text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>登记新委托</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => switchSection('none')}
                        className="px-3 py-1.5 rounded-xl text-amber-900/80 dark:text-amber-200/80 hover:bg-black/10 dark:hover:bg-white/10 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                      >
                        返回大厅
                      </button>
                    </div>
                  </div>

                  {/* 4 Status Bookmark Tabs */}
                  <div className="flex items-center flex-wrap gap-1.5">
                    {LEDGER_TABS.map((statusKey) => {
                      const meta = RPG_STATUS_META[statusKey];
                      const count = tasksByStatus[statusKey].length;
                      const isActive = activeLedgerTab === statusKey;
                      const isDropTarget = dragOverTab === statusKey && draggedTaskStatus !== statusKey;

                      return (
                        <button
                          key={statusKey}
                          type="button"
                          onClick={() => setActiveLedgerTab(statusKey)}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (draggedTaskStatus !== statusKey) {
                              setDragOverTab(statusKey);
                            }
                          }}
                          onDragLeave={() => {
                            if (dragOverTab === statusKey) setDragOverTab(null);
                          }}
                          onDrop={(e) => handleTabDrop(e, statusKey)}
                          className={`px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-extrabold flex items-center gap-1.5 border-t border-x transition-all cursor-pointer shrink-0 ${
                            isDropTarget
                              ? 'bg-blue-100 dark:bg-blue-900/70 border-blue-500 text-blue-900 dark:text-blue-100 scale-[1.03]'
                              : isActive
                              ? `${meta.tabAccent} border-amber-700/40 dark:border-amber-600/50 shadow-2xs`
                              : 'bg-black/5 dark:bg-white/5 border-transparent text-stone-600 dark:text-stone-400 hover:bg-black/10 dark:hover:bg-white/10'
                          }`}
                        >
                          <span>{meta.icon}</span>
                          <span>{meta.rpgLabel}</span>
                          <span className="text-xs font-mono px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/10">
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Ledger Pages Body */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5">
                  {currentLedgerTasks.length === 0 ? (
                    <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center border-2 border-dashed border-amber-800/25 dark:border-amber-700/35 rounded-2xl p-8">
                      <p className="text-sm sm:text-base font-semibold text-amber-900/75 dark:text-amber-200/75">
                        「{RPG_STATUS_META[activeLedgerTab].rpgLabel}」这一页目前还是空白的呢~
                      </p>
                      <button
                        type="button"
                        onClick={() => startCreateTask(activeLedgerTab)}
                        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold shadow-xs transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>在此页登记新委托</span>
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`grid grid-cols-1 gap-3 ${
                        !showLeftNpcStage ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2'
                      }`}
                    >
                      {currentLedgerTasks.map((task) => {
                        const cat = getQuestCategoryBadge(task.tags);
                        const latestLog = getLatestLogForTask(task.id);
                        const todayLog = getLog(task.id, todayStr);
                        const totalHours = getTaskTotalHours(task.id);
                        const progressDays = getLogsForTask(task.id).filter(
                          (l) => l.progressType === 'progress' || l.progressType === 'completed'
                        ).length;

                        const isDropBefore = dragOverCardId === task.id && dropPosition === 'before';
                        const isDropAfter = dragOverCardId === task.id && dropPosition === 'after';

                        return (
                          <div
                            key={task.id}
                            ref={(el) => {
                              if (el) cardRefs.current.set(task.id, el);
                              else cardRefs.current.delete(task.id);
                            }}
                            draggable
                            onDragStart={(e) => handleCardDragStart(e, task)}
                            onDragOver={(e) => handleCardDragOver(e, task.id, task.status)}
                            onDragLeave={() => {
                              if (dragOverCardId === task.id) setDragOverCardId(null);
                            }}
                            onDrop={(e) => handleCardDrop(e, task)}
                            onDragEnd={() => handleCardDragEnd(task.id)}
                            className="relative group rounded-2xl bg-white/88 dark:bg-[#2a231c]/92 border border-amber-800/25 dark:border-amber-700/40 hover:border-amber-600 dark:hover:border-amber-500 p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3 cursor-grab active:cursor-grabbing min-w-0"
                          >
                            {isDropBefore && (
                              <div className="absolute -top-1.5 inset-x-2 h-0.5 bg-amber-500 rounded-full z-10 pointer-events-none" />
                            )}
                            {isDropAfter && (
                              <div className="absolute -bottom-1.5 inset-x-2 h-0.5 bg-amber-500 rounded-full z-10 pointer-events-none" />
                            )}

                            <div className="flex items-start justify-between gap-2 min-w-0">
                              <div className="flex items-start gap-2 min-w-0">
                                <GripVertical className="w-4 h-4 text-amber-800/35 dark:text-amber-300/35 mt-1 shrink-0" />
                                <span
                                  className={`shrink-0 text-xs px-2 py-0.5 rounded-lg border font-semibold ${cat.ribbonClass}`}
                                >
                                  {cat.icon} {cat.label}
                                </span>
                                <h4
                                  onClick={() => openInspectTask(task)}
                                  className="text-sm sm:text-base font-bold text-stone-900 dark:text-amber-50 leading-snug line-clamp-2 cursor-pointer hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                                  title={task.title}
                                >
                                  {task.title}
                                </h4>
                              </div>

                              {task.status === 'done' ? (
                                <span className="shrink-0 text-[10px] font-black tracking-wider px-2 py-0.5 rounded border-2 border-rose-600/70 text-rose-700 dark:text-rose-300 dark:border-rose-400/70 bg-rose-50/70 dark:bg-rose-950/50 rotate-[-6deg]">
                                  CLEARED
                                </span>
                              ) : todayLog ? (
                                <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                  ✓ 今日{todayLog.hours ? ` ${formatHours(todayLog.hours)}` : '已报'}
                                </span>
                              ) : null}
                            </div>

                            <div className="flex items-center justify-between gap-2 flex-wrap pl-6 text-xs">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {task.tags.slice(1).map((tag) => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTag(selectedTag === tag ? null : tag);
                                    }}
                                    className={`px-2 py-0.5 rounded-md text-xs border transition-colors cursor-pointer ${
                                      selectedTag === tag
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-amber-900/5 dark:bg-white/5 text-stone-600 dark:text-stone-300 border-amber-800/15 dark:border-white/10 hover:bg-amber-900/10'
                                    }`}
                                  >
                                    #{tag}
                                  </button>
                                ))}
                                {latestLog && (
                                  <span className="text-xs text-stone-500 dark:text-stone-400">
                                    {getRelativeTimeString(latestLog.date)}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3 text-xs font-semibold">
                                {progressDays > 0 && (
                                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                    <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                                    {progressDays}天
                                  </span>
                                )}
                                {totalHours > 0 && (
                                  <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                    <Clock className="w-3.5 h-3.5" />
                                    {formatHours(totalHours)}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-800/10 dark:border-white/10">
                              <button
                                type="button"
                                onClick={() => openTaskDetail(task.id)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>档案</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openInspectTask(task)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700 flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <MessageCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                <span>办理</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openCheckInForTask(task, todayStr)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{todayLog ? '改今日报' : '打卡'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* OVERLAY B: UNIFIED RPG GANTT SCROLL */}
            {activeOverlay === 'gantt' && (
              <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 rounded-xl bg-[#231811] border border-amber-600/35 shrink-0 flex-wrap">
                  <div className="flex items-center gap-2 text-amber-100 font-extrabold text-sm sm:text-base">
                    <ScrollText className="w-4 h-4 text-amber-400" />
                    <span>时序卷轴 · 冒险轨迹视图</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {renderCompanionToggle('dark')}
                    <button
                      type="button"
                      onClick={() => switchSection('none')}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-xs sm:text-sm font-bold cursor-pointer"
                    >
                      返回大厅
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <GanttView />
                </div>
              </div>
            )}

            {/* OVERLAY C: UNIFIED RPG STATS SANCTUARY */}
            {activeOverlay === 'stats' && (
              <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 rounded-xl bg-[#231811] border border-amber-600/35 shrink-0 flex-wrap">
                  <div className="flex items-center gap-2 text-amber-100 font-extrabold text-sm sm:text-base">
                    <BarChart3 className="w-4 h-4 text-emerald-400" />
                    <span>战绩圣殿 · 时光分布与统计</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {renderCompanionToggle('dark')}
                    <button
                      type="button"
                      onClick={() => switchSection('none')}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-xs sm:text-sm font-bold cursor-pointer"
                    >
                      返回大厅
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 guild-parchment rounded-2xl border-2 border-amber-700/60 dark:border-amber-600/50 shadow-2xl overflow-y-auto overflow-x-hidden p-4 sm:p-6">
                  <StatsView />
                </div>
              </div>
            )}

            {/* RECEPTIONIST COUNTER AFFAIRS WORKSPACE */}
            {activeOverlay === 'none' && (
              <div className="flex-1 min-h-0 guild-parchment rounded-2xl border-2 border-amber-700/60 dark:border-amber-600/50 shadow-2xl flex flex-col overflow-hidden overflow-x-hidden text-stone-900 dark:text-stone-100">
                {/* Counter Header */}
                <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-amber-800/20 dark:border-amber-700/30 bg-[#f3e6c8]/90 dark:bg-[#2a221a]/95 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg xl:text-xl font-extrabold text-amber-950 dark:text-amber-100 truncate">
                      {counterPanelHeader.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-amber-800/80 dark:text-amber-300/80 mt-0.5 truncate">
                      {counterPanelHeader.subtitle}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    {renderCompanionToggle('parchment')}
                    <button
                      type="button"
                      onClick={returnToHub}
                      className="px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/20 dark:hover:bg-white/15 text-amber-950 dark:text-amber-100 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      <ChevronLeft className="w-4 h-4" />
                      <span>返回大厅中央</span>
                    </button>
                  </div>
                </div>

                {/* Counter Scrollable Body */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-5">
                  {/* MODE 2: SELECT TASK TO CHECK IN */}
                  {dialogueMode === 'select_checkin_task' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setShowAllCheckinStatuses((prev) => !prev)}
                            className="px-3.5 py-2 rounded-xl bg-white/80 dark:bg-[#2a221a] border border-amber-800/25 dark:border-amber-600/40 text-xs sm:text-sm font-bold text-amber-950 dark:text-amber-100 hover:border-amber-600 transition-colors cursor-pointer"
                          >
                            {showAllCheckinStatuses
                              ? `仅看「攻略中」 (${activeInProgressTasks.length})`
                              : `显示全部状态 (${tasks.length})`}
                          </button>
                          <button
                            type="button"
                            onClick={() => switchSection('ledger')}
                            className="px-3.5 py-2 rounded-xl bg-white/80 dark:bg-[#2a221a] border border-amber-800/25 dark:border-amber-600/40 text-xs sm:text-sm font-bold text-amber-950 dark:text-amber-100 hover:border-amber-600 transition-colors cursor-pointer"
                          >
                            📖 翻阅委托账本挑选
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => startCreateTask('in_progress')}
                          className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>登记新委托</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(showAllCheckinStatuses ? tasks : prioritizedInProgressTasks).map((task) => {
                          const cat = getQuestCategoryBadge(task.tags);
                          const todayLog = getLog(task.id, todayStr);
                          const totalHours = getTaskTotalHours(task.id);
                          const affinity = taskTimeAffinityMap.get(task.id);
                          return (
                            <button
                              key={task.id}
                              type="button"
                              onClick={() => openCheckInForTask(task, todayStr)}
                              className="guild-choice-btn px-4 py-3.5 rounded-2xl guild-card border text-left flex items-center justify-between gap-3 cursor-pointer"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-xl shrink-0">{cat.icon}</span>
                                <div className="min-w-0">
                                  <div className="text-sm sm:text-base font-bold text-stone-900 dark:text-amber-50 truncate">
                                    {task.title}
                                  </div>
                                  <div className="flex items-center gap-1.5 flex-wrap text-xs text-stone-600 dark:text-amber-200/75 mt-0.5">
                                    <span>
                                      {RPG_STATUS_META[task.status].rpgLabel} · 累计{' '}
                                      {formatHours(totalHours)}
                                    </span>
                                    {affinity?.isCurrentPeriodMatch ? (
                                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/35 font-bold">
                                        ⚡ {affinity.matchedPeriodLabel ?? affinity.topPeriodLabel}常推
                                      </span>
                                    ) : (
                                      affinity?.topPeriodLabel && (
                                        <span className="text-stone-500 dark:text-amber-300/60">
                                          · {affinity.topPeriodIcon} 常在{affinity.topPeriodLabel}
                                        </span>
                                      )
                                    )}
                                  </div>
                                </div>
                              </div>
                              <span
                                className={`shrink-0 text-xs px-2.5 py-1 rounded-lg font-bold border ${
                                  todayLog
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-700'
                                    : 'bg-amber-500/20 text-amber-900 border-amber-500/40 dark:text-amber-200'
                                }`}
                              >
                                {todayLog
                                  ? `✓ ${todayLog.hours ? formatHours(todayLog.hours) : '已报'}`
                                  : '立即打卡'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* MODE 3: INSPECT SINGLE TASK DOSSIER */}
                  {dialogueMode === 'inspect_task' && selectedTask && (
                    <div className="space-y-5">
                      {/* Title & Tags Banner */}
                      <div className="p-5 rounded-2xl guild-card border space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-xs px-2.5 py-1 rounded-lg border font-bold ${
                                  getQuestCategoryBadge(selectedTask.tags).ribbonClass
                                }`}
                              >
                                {getQuestCategoryBadge(selectedTask.tags).icon}{' '}
                                {getQuestCategoryBadge(selectedTask.tags).label}
                              </span>
                              <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/35 text-amber-900 dark:text-amber-200 font-bold">
                                {RPG_STATUS_META[selectedTask.status].icon}{' '}
                                {RPG_STATUS_META[selectedTask.status].rpgLabel}
                              </span>
                            </div>
                            <h4 className="text-lg sm:text-xl font-extrabold text-stone-900 dark:text-amber-50 break-words">
                              {selectedTask.title}
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedTask.tags.map((t) => (
                                <span
                                  key={t}
                                  className="text-xs px-2 py-0.5 rounded-md bg-amber-900/10 dark:bg-white/10 text-stone-700 dark:text-stone-300"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap shrink-0">
                            {getLog(selectedTask.id, todayStr) ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openCheckInForTask(selectedTask, todayStr, 'append')}
                                  className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-extrabold flex items-center gap-1.5 shadow-md transition-colors cursor-pointer"
                                >
                                  <Plus className="w-4 h-4" />
                                  <span>追加今日记录</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openCheckInForTask(selectedTask, todayStr, 'replace')}
                                  className="px-3.5 py-2.5 rounded-xl guild-card border text-stone-800 dark:text-amber-100 hover:border-amber-500 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>修改汇总</span>
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openCheckInForTask(selectedTask, todayStr)}
                                className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-extrabold flex items-center gap-2 shadow-md transition-colors cursor-pointer"
                              >
                                <CheckCircle2 className="w-4 h-4" />
                                <span>立即汇报进度</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* 3 KPI Stat Boxes */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-4 rounded-2xl guild-card border">
                          <div className="text-xs text-stone-500 dark:text-stone-400 font-semibold">
                            累计投入时长
                          </div>
                          <div className="text-xl sm:text-2xl font-extrabold text-amber-700 dark:text-amber-300 mt-1">
                            {formatHours(getTaskTotalHours(selectedTask.id))}
                          </div>
                        </div>
                        <div className="p-4 rounded-2xl guild-card border">
                          <div className="text-xs text-stone-500 dark:text-stone-400 font-semibold">
                            实质推进天数
                          </div>
                          <div className="text-xl sm:text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">
                            {
                              getLogsForTask(selectedTask.id).filter(
                                (l) => l.progressType === 'progress' || l.progressType === 'completed'
                              ).length
                            }{' '}
                            天
                          </div>
                        </div>
                        <div className="p-4 rounded-2xl guild-card border">
                          <div className="text-xs text-stone-500 dark:text-stone-400 font-semibold">
                            最近活跃时间
                          </div>
                          <div className="text-base sm:text-lg font-extrabold text-stone-800 dark:text-amber-100 mt-1.5">
                            {(() => {
                              const latest = getLatestLogForTask(selectedTask.id);
                              return latest ? getRelativeTimeString(latest.date) : '尚未打卡';
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Frequent Time-of-Day & Post-Work Rest Summary */}
                      {(() => {
                        const profile = computeTaskTimeAndRestProfile(getLogsForTask(selectedTask.id));
                        return (
                          <div className="p-4 rounded-2xl guild-card border grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <div className="text-xs sm:text-sm font-extrabold text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                                <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                <span>经常进行的时间段</span>
                                {profile.peakWindowLabel && (
                                  <span className="ml-auto text-[11px] font-mono px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/30">
                                    常驻 {profile.peakWindowLabel}
                                  </span>
                                )}
                              </div>
                              {profile.frequentPeriods.length > 0 ? (
                                <div className="space-y-1.5">
                                  {profile.frequentPeriods.slice(0, 3).map((fp) => (
                                    <div key={fp.id} className="space-y-0.5">
                                      <div className="flex items-center justify-between text-xs">
                                        <span className="font-semibold text-stone-700 dark:text-amber-100">
                                          {fp.icon} {fp.label} ({fp.rangeLabel})
                                        </span>
                                        <span className="font-mono text-amber-700 dark:text-amber-300 font-bold">
                                          {formatHours(fp.workHours)} · {fp.workSharePct.toFixed(0)}%
                                        </span>
                                      </div>
                                      <div className="h-1.5 rounded-full bg-amber-900/10 dark:bg-black/30 overflow-hidden">
                                        <div
                                          className="h-full rounded-full bg-amber-500"
                                          style={{ width: `${Math.max(6, fp.workSharePct)}%` }}
                                        />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-stone-500 dark:text-stone-400">
                                  暂未采集到带投入时长的活跃时段数据
                                </p>
                              )}
                            </div>

                            <div className="space-y-2">
                              <div className="text-xs sm:text-sm font-extrabold text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                                <Coffee className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                                <span>事后休息情况</span>
                                {profile.totalRestCount > 0 && (
                                  <span className="ml-auto text-[11px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-500/30 font-bold">
                                    累计 {formatRestDuration(profile.totalRestMinutes)}
                                  </span>
                                )}
                              </div>
                              {profile.totalRestCount > 0 ? (
                                <div className="space-y-1.5">
                                  <div className="text-xs text-stone-600 dark:text-stone-300 flex flex-wrap gap-3">
                                    <span>共休息 <strong className="text-emerald-700 dark:text-emerald-300">{profile.totalRestCount} 次</strong></span>
                                    <span>平均每次 <strong>{profile.avgRestMinutes} 分钟</strong></span>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {profile.recentRestSessions.slice(0, 4).map((rs) => (
                                      <span
                                        key={rs.id}
                                        className="text-[11px] px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-mono"
                                      >
                                        {rs.date.slice(5)} {rs.startTime}-{rs.endTime} ({rs.durationMinutes}m)
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-stone-500 dark:text-stone-400">
                                  暂无事后休息记录（当日汇报超过 0.3h 时看板娘会自动询问是否开启休息计时）
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Action Buttons & Status Transfer Cards */}
                      <div className="p-4 rounded-2xl guild-card border space-y-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => openTaskDetail(selectedTask.id)}
                            className="px-3.5 py-2 rounded-xl bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/15 dark:hover:bg-white/15 text-stone-800 dark:text-amber-100 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                            <span>展开完整时间轴抽屉</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => startEditTask(selectedTask)}
                            className="px-3.5 py-2 rounded-xl bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/15 dark:hover:bg-white/15 text-stone-800 dark:text-amber-100 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <span>修改名称/标签</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleDeleteSelectedTask}
                            className="px-3.5 py-2 rounded-xl bg-rose-100/80 dark:bg-rose-950/60 hover:bg-rose-200/80 dark:hover:bg-rose-900/70 text-rose-800 dark:text-rose-200 border border-rose-300/70 dark:border-rose-600/40 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>销毁委托</span>
                          </button>
                        </div>

                        <div className="pt-3 border-t border-amber-800/15 dark:border-white/10">
                          <div className="text-xs font-bold text-stone-600 dark:text-stone-300 mb-2 flex items-center gap-1.5">
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            <span>快速调动委托状态</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {LEDGER_TABS.map((st) => {
                              const meta = RPG_STATUS_META[st];
                              const isCurrent = selectedTask.status === st;
                              return (
                                <button
                                  key={st}
                                  type="button"
                                  disabled={isCurrent}
                                  onClick={() => handleQuickMoveStatus(selectedTask, st)}
                                  className={`px-3 py-2 rounded-xl border text-xs sm:text-sm font-bold transition-all ${
                                    isCurrent
                                      ? 'bg-amber-500/25 border-amber-600 text-amber-950 dark:text-amber-100 cursor-default'
                                      : 'bg-white/60 dark:bg-black/25 border-amber-800/20 dark:border-white/15 text-stone-700 dark:text-stone-300 hover:border-amber-500 cursor-pointer'
                                  }`}
                                >
                                  {meta.icon} {meta.rpgLabel}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Recent Check-in History (Clickable to Edit) */}
                      <div className="p-4 rounded-2xl guild-card border space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-extrabold text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <span>近期打卡记录（点击可补录或修改）</span>
                          </h5>
                        </div>
                        {getLogsForTask(selectedTask.id).length === 0 ? (
                          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 py-2">
                            暂无打卡记录，点击右上角「立即汇报进度」写下第一笔冒险日志吧！
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {getLogsForTask(selectedTask.id)
                              .slice(0, 6)
                              .map((log) => {
                                const intervals = extractLogWorkIntervals(log);
                                const restList = log.restSessions || [];
                                const hasMultiSessions = intervals.length > 1;
                                return (
                                  <button
                                    key={log.id}
                                    type="button"
                                    onClick={() => openCheckInForTask(selectedTask, log.date)}
                                    className="w-full text-left px-3.5 py-2.5 rounded-xl guild-subpanel border hover:border-amber-500 flex items-start justify-between gap-3 transition-colors cursor-pointer"
                                  >
                                    <div className="min-w-0 flex-1 space-y-1.5">
                                      <div className="flex items-center gap-2 text-xs sm:text-sm font-bold flex-wrap">
                                        <span className="font-mono">{log.date}</span>
                                        <span className="text-amber-800 dark:text-amber-300">
                                          {log.progressType === 'completed'
                                            ? '🏆 通关达成'
                                            : log.progressType === 'rest'
                                            ? '☕ 营地休整'
                                            : '⚔️ 实质推进'}
                                        </span>
                                        {hasMultiSessions && (
                                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-900 dark:text-amber-200 font-bold">
                                            含 {intervals.length} 笔分段记录
                                          </span>
                                        )}
                                        {!hasMultiSessions &&
                                          intervals.map((iv) => (
                                            <span
                                              key={iv.id}
                                              className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                                                iv.isBackfill
                                                  ? 'bg-amber-500/15 text-amber-800 dark:text-amber-200'
                                                  : 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                                              }`}
                                            >
                                              {iv.isBackfill ? '🏷️ 补标（不计时段）' : `🕒 ${iv.startTime}-${iv.endTime}`}
                                            </span>
                                          ))}
                                        {!hasMultiSessions &&
                                          restList.map((rs) => (
                                            <span
                                              key={rs.id}
                                              className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                            >
                                              ☕ 休 {rs.startTime}-{rs.endTime} ({rs.durationMinutes}m)
                                            </span>
                                          ))}
                                      </div>

                                      {hasMultiSessions ? (
                                        <div className="space-y-1 pl-2 border-l-2 border-amber-500/35">
                                          {intervals.map((iv, sIdx) => (
                                            <div
                                              key={iv.id}
                                              className="text-xs text-stone-700 dark:text-stone-200 flex items-center gap-1.5 flex-wrap"
                                            >
                                              <span className="font-mono font-bold text-amber-800 dark:text-amber-300">
                                                #{sIdx + 1}
                                              </span>
                                              <span
                                                className={`font-mono ${
                                                  iv.isBackfill
                                                    ? 'text-amber-700 dark:text-amber-200'
                                                    : 'text-sky-700 dark:text-sky-300'
                                                }`}
                                              >
                                                {iv.isBackfill ? '🏷️ 补标（不计时段）' : `${iv.startTime}-${iv.endTime}`}
                                              </span>
                                              {iv.hours > 0 && (
                                                <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
                                                  ({formatHours(iv.hours)})
                                                </span>
                                              )}
                                              {iv.restSessions.map((rs) => (
                                                <span
                                                  key={rs.id}
                                                  className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                                >
                                                  ☕ 休 {rs.durationMinutes}m
                                                </span>
                                              ))}
                                              {iv.note && (
                                                <span className="text-stone-600 dark:text-stone-300 truncate max-w-[260px]">
                                                  · {iv.note}
                                                </span>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        log.note && (
                                          <p className="text-xs text-stone-600 dark:text-stone-300 truncate">
                                            {log.note}
                                          </p>
                                        )
                                      )}
                                    </div>
                                    <span className="shrink-0 text-xs sm:text-sm font-mono font-bold text-blue-700 dark:text-blue-300">
                                      {log.hours ? formatHours(log.hours) : '-'}
                                    </span>
                                  </button>
                                );
                              })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* MODE 4: EMBEDDED CHECK-IN FORM */}
                  {dialogueMode === 'checkin_form' && selectedTask && (
                    <form onSubmit={handleCheckInSubmit} className="space-y-5">
                      {/* Quick In-Progress Switcher Strip */}
                      {activeInProgressTasks.length > 1 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-amber-900/75 dark:text-amber-300/80 mr-1">
                            切换攻略中委托:
                          </span>
                          {activeInProgressTasks.slice(0, 6).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => openCheckInForTask(t, checkInDate)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                                t.id === selectedTask.id
                                  ? 'bg-amber-600 text-white border-amber-700'
                                  : 'bg-white/75 dark:bg-black/25 text-stone-700 dark:text-stone-300 border-amber-800/20 hover:border-amber-500'
                              }`}
                            >
                              {getQuestCategoryBadge(t.tags).icon} {t.title}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Quest Summary & Date Selector */}
                      <div className="p-4 rounded-2xl guild-card border flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-extrabold text-stone-900 dark:text-amber-50 truncate">
                            {getQuestCategoryBadge(selectedTask.tags).icon} 《{selectedTask.title}》
                          </div>
                          <div className="text-xs sm:text-sm text-stone-600 dark:text-amber-200/80 mt-0.5">
                            累计投入 {formatHours(getTaskTotalHours(selectedTask.id, checkInDate))}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setCheckInDate(addDays(checkInDate, -1))}
                            className="p-2 rounded-lg bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/20 text-stone-800 dark:text-amber-100 cursor-pointer"
                            title="前一天"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <input
                            type="date"
                            value={checkInDate}
                            onChange={(e) => setCheckInDate(e.target.value)}
                            className="px-3 py-1.5 text-sm sm:text-base font-mono bg-white dark:bg-[#1a140f] border border-amber-800/30 dark:border-amber-600/40 rounded-lg text-stone-900 dark:text-amber-50 focus:outline-none focus:border-amber-500"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setCheckInDate(addDays(checkInDate, 1))}
                            className="p-2 rounded-lg bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/20 text-stone-800 dark:text-amber-100 cursor-pointer"
                            title="后一天"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <span className="text-xs sm:text-sm font-semibold text-amber-800 dark:text-amber-300 px-1">
                            {getWeekdayChinese(checkInDate)}
                            {checkInDate === todayStr
                              ? ' · 今天'
                              : checkInDate === yesterdayStr
                              ? ' · 昨天'
                              : ''}
                          </span>
                          {checkInDate !== todayStr && (
                            <button
                              type="button"
                              onClick={() => setCheckInDate(todayStr)}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500/20 text-amber-900 dark:text-amber-200 hover:bg-amber-500/30 cursor-pointer"
                            >
                              回今天
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Existing Day Sessions List & Append/Replace Switcher */}
                      {(() => {
                        const existingDayLog = getLog(selectedTask.id, checkInDate);
                        if (!existingDayLog) return null;
                        const daySessions = extractLogWorkIntervals(existingDayLog);
                        const hasSessionsList = daySessions.length > 0;
                        return (
                          <div className="p-4 rounded-2xl guild-subpanel border border-amber-500/40 space-y-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs sm:text-sm font-extrabold text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                                <ScrollText className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                                <span>
                                  {checkInDate} 已登记{' '}
                                  {hasSessionsList ? `${daySessions.length} 笔记录` : '1 笔汇总'}
                                  {existingDayLog.hours ? `（当日合计 ${formatHours(existingDayLog.hours)}）` : ''}
                                </span>
                              </div>
                              <div className="inline-flex items-center p-0.5 rounded-xl bg-amber-900/10 dark:bg-black/35 border border-amber-800/20 text-xs">
                                <button
                                  type="button"
                                  onClick={() =>
                                    loadCheckInFormFields(selectedTask, checkInDate, 'append')
                                  }
                                  className={`px-3 py-1.5 rounded-lg font-extrabold transition-colors cursor-pointer ${
                                    checkInFormMode === 'append'
                                      ? 'bg-amber-600 text-white shadow-xs'
                                      : 'text-stone-700 dark:text-stone-300 hover:text-amber-900'
                                  }`}
                                >
                                  ➕ 追加新记录
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    loadCheckInFormFields(selectedTask, checkInDate, 'replace')
                                  }
                                  className={`px-3 py-1.5 rounded-lg font-extrabold transition-colors cursor-pointer ${
                                    checkInFormMode === 'replace'
                                      ? 'bg-amber-600 text-white shadow-xs'
                                      : 'text-stone-700 dark:text-stone-300 hover:text-amber-900'
                                  }`}
                                >
                                  ✏️ 修改当日汇总
                                </button>
                              </div>
                            </div>

                            {hasSessionsList && (
                              <div className="space-y-1.5">
                                {daySessions.map((iv, idx) => (
                                  <div
                                    key={iv.id}
                                    className="px-3 py-2 rounded-xl bg-white/75 dark:bg-black/25 border border-amber-800/15 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs"
                                  >
                                    <div className="min-w-0 flex-1 space-y-0.5">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono font-extrabold text-amber-800 dark:text-amber-300">
                                          #{idx + 1} {idx > 0 ? '(追加)' : ''}
                                        </span>
                                        <span
                                          className={`font-mono font-semibold ${
                                            iv.isBackfill
                                              ? 'text-amber-700 dark:text-amber-200'
                                              : 'text-sky-700 dark:text-sky-300'
                                          }`}
                                        >
                                          {iv.isBackfill ? '🏷️ 补标（不计时段）' : `🕒 ${iv.startTime}-${iv.endTime}`}
                                        </span>
                                        <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
                                          {iv.hours > 0 ? formatHours(iv.hours) : '0.0h'}
                                        </span>
                                        {iv.restSessions.map((rs) => (
                                          <span
                                            key={rs.id}
                                            className="font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold"
                                          >
                                            ☕ 休 {rs.startTime}-{rs.endTime} ({rs.durationMinutes}m)
                                          </span>
                                        ))}
                                      </div>
                                      {iv.note && (
                                        <div className="text-stone-600 dark:text-stone-300 truncate">
                                          {iv.note}
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {checkInDate === todayStr && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openRestDial({
                                              taskId: selectedTask.id,
                                              taskTitle: selectedTask.title,
                                              date: checkInDate,
                                              sessionId: iv.id,
                                            })
                                          }
                                          className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-800 dark:text-emerald-300 font-bold text-[11px] cursor-pointer"
                                          title="为该笔记录打开休息表盘"
                                        >
                                          ☕ 记休息
                                        </button>
                                      )}
                                      {!iv.isEstimated && (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            deleteWorkSession(selectedTask.id, checkInDate, iv.id)
                                          }
                                          className="p-1.5 rounded-lg text-rose-600 dark:text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                                          title="删除该笔记录"
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                              {checkInFormMode === 'append'
                                ? '当前为「追加模式」：下方填写的时长、备注与休息时间将作为全新一笔记录叠加到当天，不会覆盖已有记录。'
                                : '当前为「修改汇总模式」：提交将覆写当日顶层汇总；如需补充一笔独立时间与备注请切换回「追加新记录」。'}
                            </p>
                          </div>
                        );
                      })()}

                      {/* 3 Large Progress Type Cards */}
                      <div className="space-y-2">
                        <label className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200">
                          今日推进类型
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {(
                            [
                              {
                                key: 'progress',
                                icon: '⚔️',
                                label: '实质推进',
                                desc: '主线推进、阅读或游玩进展',
                              },
                              {
                                key: 'rest',
                                icon: '☕',
                                label: '营地休整',
                                desc: '今天稍作整备保持连击',
                              },
                              {
                                key: 'completed',
                                icon: '🏆',
                                label: '通关达成',
                                desc: '完结全篇并加盖 CLEARED 金印',
                              },
                            ] as const
                          ).map((item) => {
                            const active = checkInType === item.key;
                            return (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => {
                                  setCheckInType(item.key);
                                  if (item.key === 'completed') setMarkAsCompleted(true);
                                }}
                                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                                  active
                                    ? item.key === 'completed'
                                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                                      : item.key === 'rest'
                                      ? 'bg-amber-600 text-white border-amber-400 shadow-md'
                                      : 'bg-blue-600 text-white border-blue-400 shadow-md'
                                    : 'guild-card text-stone-800 dark:text-amber-100 hover:border-amber-500'
                                }`}
                              >
                                <div className="text-sm sm:text-base font-extrabold flex items-center gap-1.5">
                                  <span>{item.icon}</span>
                                  <span>{item.label}</span>
                                </div>
                                <div
                                  className={`text-xs mt-1 ${
                                    active ? 'text-white/90' : 'text-stone-500 dark:text-stone-400'
                                  }`}
                                >
                                  {item.desc}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Hours Input & Presets */}
                      <div className="p-4 rounded-2xl guild-card border space-y-2.5">
                        <label className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200 block">
                          投入时长（小时）
                        </label>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <div className="relative w-32 shrink-0">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="24"
                              placeholder="如 1.5"
                              value={checkInHours}
                              onChange={(e) => setCheckInHours(e.target.value)}
                              className="w-full pl-3.5 pr-7 py-2 text-sm sm:text-base font-mono bg-white dark:bg-[#1a140f] border border-amber-800/30 dark:border-amber-600/40 rounded-xl text-stone-900 dark:text-amber-50 focus:outline-none focus:border-amber-500"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs sm:text-sm font-bold text-stone-500">
                              h
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {[0.5, 1.0, 1.5, 2.0, 3.0, 4.0].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setCheckInHours(String(preset))}
                                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-mono border cursor-pointer transition-colors ${
                                  checkInHours === String(preset)
                                    ? 'bg-amber-600 text-white border-amber-700 font-bold'
                                    : 'bg-white/75 dark:bg-black/25 text-stone-700 dark:text-amber-200 border-amber-800/20 hover:border-amber-500'
                                }`}
                              >
                                {preset.toFixed(1)}h
                              </button>
                            ))}
                          </div>
                        </div>
                        <label className="flex items-center gap-2 pt-1 text-xs sm:text-sm text-amber-900 dark:text-amber-200 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={checkInIsBackfill}
                            onChange={(e) => setCheckInIsBackfill(e.target.checked)}
                            className="w-4 h-4 rounded border-amber-500 text-amber-600 focus:ring-amber-500"
                          />
                          <span className="font-bold">补标记录</span>
                          <span className="text-[11px] text-stone-500 dark:text-stone-400">
                            （计入当日与累计时长，不统计进每日时段分布）
                          </span>
                        </label>
                      </div>

                      {/* Independent Rest Duration Input (Optional) */}
                      <div className="p-4 rounded-2xl guild-card border space-y-2.5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <label className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200 flex items-center gap-1.5">
                            <Coffee className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            <span>本次独立休息时间（分钟，可选）</span>
                          </label>
                          <span className="text-[11px] text-stone-500 dark:text-amber-300/75">
                            留空且今天投入 &gt; 0.3h 时，提交后将由看板娘呼出表盘确认休息
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <div className="relative w-32 shrink-0">
                            <input
                              type="number"
                              step="1"
                              min="0"
                              max="240"
                              placeholder="如 5"
                              value={checkInRestMinutes}
                              onChange={(e) => setCheckInRestMinutes(e.target.value)}
                              className="w-full pl-3.5 pr-9 py-2 text-sm sm:text-base font-mono bg-white dark:bg-[#1a140f] border border-amber-800/30 dark:border-amber-600/40 rounded-xl text-stone-900 dark:text-amber-50 focus:outline-none focus:border-emerald-500"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-stone-500">
                              分钟
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setCheckInRestMinutes('')}
                              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border cursor-pointer transition-colors ${
                                checkInRestMinutes === ''
                                  ? 'bg-emerald-600 text-white border-emerald-700'
                                  : 'bg-white/75 dark:bg-black/25 text-stone-700 dark:text-amber-200 border-amber-800/20 hover:border-emerald-500'
                              }`}
                            >
                              不填（交由表盘）
                            </button>
                            {[5, 10, 15, 20, 30].map((mins) => (
                              <button
                                key={mins}
                                type="button"
                                onClick={() => setCheckInRestMinutes(String(mins))}
                                className={`px-2.5 py-1.5 rounded-xl text-xs sm:text-sm font-mono border cursor-pointer transition-colors ${
                                  checkInRestMinutes === String(mins)
                                    ? 'bg-emerald-600 text-white border-emerald-700 font-bold'
                                    : 'bg-white/75 dark:bg-black/25 text-stone-700 dark:text-amber-200 border-amber-800/20 hover:border-emerald-500'
                                }`}
                              >
                                {mins}m
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Multi-line Adventure Note & Submit */}
                      <div className="space-y-3">
                        <label className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200 block">
                          冒险心得 / 进展备注
                        </label>
                        <textarea
                          rows={3}
                          value={checkInNote}
                          onChange={(e) => setCheckInNote(e.target.value)}
                          placeholder="记录冒险心得或今日进展（如：通关第三章、读完第4章、击败隐藏Boss...）"
                          className="w-full px-4 py-3 text-sm sm:text-base bg-white dark:bg-[#1a140f] border border-amber-800/30 dark:border-amber-600/40 rounded-2xl text-stone-900 dark:text-amber-50 placeholder-stone-400 focus:outline-none focus:border-amber-500 resize-y"
                        />

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <label className="flex items-center gap-2 text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={markAsCompleted || checkInType === 'completed'}
                              onChange={(e) => {
                                setMarkAsCompleted(e.target.checked);
                                if (e.target.checked) setCheckInType('completed');
                              }}
                              className="w-4 h-4 rounded border-emerald-500 text-emerald-600"
                            />
                            <span>同时将委托标记为「已达成」</span>
                          </label>

                          <div className="flex items-center gap-2 flex-wrap">
                            {getLog(selectedTask.id, checkInDate) && (
                              <button
                                type="button"
                                onClick={handleDeleteCurrentCheckIn}
                                className="px-3.5 py-2 rounded-xl bg-rose-100 dark:bg-rose-950/70 hover:bg-rose-200 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-500/40 text-xs sm:text-sm font-bold cursor-pointer"
                              >
                                清空当日记录
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDialogueMode('inspect_task')}
                              className="px-3.5 py-2 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 text-stone-700 dark:text-amber-200 text-xs sm:text-sm font-bold cursor-pointer"
                            >
                              取消
                            </button>
                            <button
                              type="submit"
                              className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm sm:text-base font-extrabold flex items-center gap-2 shadow-md cursor-pointer"
                            >
                              <Send className="w-4 h-4" />
                              <span>
                                {getLog(selectedTask.id, checkInDate) && checkInFormMode === 'append'
                                  ? '追加记录并盖章入账'
                                  : '盖章确认入账'}
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Recent Logs Preview for this Task */}
                      {getLogsForTask(selectedTask.id).length > 0 && (
                        <div className="p-4 rounded-2xl guild-subpanel border space-y-2">
                          <div className="text-xs sm:text-sm font-bold text-amber-900 dark:text-amber-200">
                            该委托最近记录（点击可切换至该日编辑）
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {getLogsForTask(selectedTask.id)
                              .slice(0, 4)
                              .map((log) => (
                                <button
                                  key={log.id}
                                  type="button"
                                  onClick={() => setCheckInDate(log.date)}
                                  className={`px-3 py-2 rounded-xl border text-left text-xs transition-colors cursor-pointer ${
                                    log.date === checkInDate
                                      ? 'bg-amber-500/20 border-amber-500 font-bold'
                                      : 'bg-white/70 dark:bg-black/25 border-amber-800/15 hover:border-amber-500'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-mono">{log.date}</span>
                                    <span>{log.hours ? formatHours(log.hours) : '-'}</span>
                                  </div>
                                  {log.note && (
                                    <div className="text-stone-600 dark:text-stone-300 truncate mt-0.5">
                                      {log.note}
                                    </div>
                                  )}
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </form>
                  )}

                  {/* MODE 4.5: POST-CHECK-IN REST INQUIRY PROMPT */}
                  {dialogueMode === 'rest_prompt' && (
                    <div className="space-y-5">
                      <div className="p-5 rounded-2xl guild-card border-2 border-emerald-500/45 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-base sm:text-lg font-extrabold text-stone-900 dark:text-amber-50">
                            《{lastCheckInResult?.taskTitle || restTaskRef.current?.taskTitle}》
                          </span>
                          <span className="px-3 py-1 rounded-xl bg-emerald-600 text-white text-xs sm:text-sm font-extrabold guild-stamp-slam">
                            {lastCheckInResult?.wasCompleted ? '🏆 CLEARED!' : '✅ 今日已盖章入账'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-stone-600 dark:text-amber-200/80">
                          <span>日期: {lastCheckInResult?.date || todayStr}</span>
                          <span>
                            今日推进投入:{' '}
                            <strong className="text-amber-700 dark:text-amber-300">
                              {lastCheckInResult?.hours ? formatHours(lastCheckInResult.hours) : '> 0.3h'}
                            </strong>
                          </span>
                          <span className="text-rose-600 dark:text-rose-300 font-bold">
                            看板娘默契度 +{lastCheckInResult?.wasCompleted ? 5 : 2}
                          </span>
                        </div>
                      </div>

                      <div className="p-5 rounded-2xl guild-subpanel border border-amber-500/35 space-y-4">
                        <div className="flex items-start gap-3">
                          <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                            <Coffee className="w-6 h-6" />
                          </div>
                          <div>
                            <h4 className="text-sm sm:text-base font-extrabold text-amber-950 dark:text-amber-100">
                              {npcConfig.name} 的茶歇邀约：现在需要开启一段休息吗？
                            </h4>
                            <p className="text-xs sm:text-sm text-stone-600 dark:text-amber-200/80 mt-1">
                              触发条件已满足（当日非补记汇报且投入超过 0.3 小时）。开启休息后可通过表盘确认时长（默认 5 分钟），结束后休息时段与总时长会自动写入该委托档案。
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <button
                            type="button"
                            onClick={() => openRestDial()}
                            className="guild-choice-btn p-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm sm:text-base text-left flex items-center justify-between gap-2 shadow-md cursor-pointer"
                          >
                            <span>☕ 需要休息 · 打开表盘定个时</span>
                            <span className="text-xs px-2 py-0.5 rounded-lg bg-white/20 shrink-0">
                              默认 5m
                            </span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setDialogueMode('checkin_done');
                              speak(
                                `好呀，看来冒险者大人精力依然充沛呢！不过也别太勉强自己哦，随时都可以来汇报新进度~`,
                                'happy'
                              );
                            }}
                            className="guild-choice-btn p-4 rounded-2xl guild-card border font-bold text-sm sm:text-base text-left cursor-pointer"
                          >
                            ⚡ 暂时不用，完成本次汇报
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MODE 4.6: INTERACTIVE CLOCK DIAL DURATION PICKER */}
                  {dialogueMode === 'rest_dial' && (
                    <div className="space-y-5">
                      <div className="p-5 rounded-2xl guild-card border space-y-5">
                        <div className="flex flex-col lg:flex-row items-center gap-6 justify-center">
                          {/* Interactive SVG Pocket-Watch Dial */}
                          <div className="flex flex-col items-center gap-2 shrink-0">
                            <PocketWatchDialSvg
                              dialRef={dialSvgRef}
                              dialAngle={Math.min(360, Math.max(6, restDurationMinutes * 6))}
                              activeMinuteMarker={restDurationMinutes}
                              accent="emerald"
                              interactive={true}
                              isDragging={isDraggingDial}
                              onDraggingChange={setIsDraggingDial}
                              onUpdatePoint={updateDialFromClientPoint}
                            />
                            <span className="text-[11px] text-stone-500 dark:text-amber-300/70">
                              拖动或点击表盘刻度可调节 1 ~ 60 分钟
                            </span>
                          </div>

                          {/* Right Side: Digital Readout, Fine Tune, Presets & Confirm */}
                          <div className="flex-1 w-full max-w-sm space-y-4">
                            <div className="p-4 rounded-2xl guild-subpanel border text-center space-y-1.5">
                              <div className="text-xs font-bold text-stone-500 dark:text-amber-300/75 uppercase tracking-wider">
                                计划休息时长
                              </div>
                              <div className="flex items-center justify-center gap-3">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRestDurationMinutes((prev) => Math.max(1, prev - 1))
                                  }
                                  className="w-9 h-9 rounded-xl bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/20 text-lg font-extrabold cursor-pointer"
                                >
                                  -
                                </button>
                                <div className="text-3xl sm:text-4xl font-mono font-extrabold text-emerald-700 dark:text-emerald-300 tabular-nums min-w-[110px]">
                                  {restDurationMinutes}
                                  <span className="text-base font-bold ml-1">分钟</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setRestDurationMinutes((prev) => Math.min(60, prev + 1))
                                  }
                                  className="w-9 h-9 rounded-xl bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/20 text-lg font-extrabold cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                              <div className="text-xs font-mono text-stone-600 dark:text-stone-300">
                                {(() => {
                                  const nowStr = formatTimeHHMM(new Date());
                                  const endStr = addMinutesToTimeHHMM(nowStr, restDurationMinutes);
                                  return `预计时段：${nowStr} ~ ${endStr}`;
                                })()}
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <div className="text-xs font-bold text-stone-600 dark:text-amber-200/80">
                                快捷刻度预设：
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                {[3, 5, 10, 15, 20, 30].map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => setRestDurationMinutes(preset)}
                                    className={`py-2 px-2 rounded-xl border text-xs sm:text-sm font-mono font-bold transition-all cursor-pointer ${
                                      restDurationMinutes === preset
                                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                                        : 'bg-white/75 dark:bg-black/25 text-stone-700 dark:text-amber-100 border-amber-800/20 hover:border-emerald-500'
                                    }`}
                                  >
                                    {preset}m{preset === 5 ? ' (默认)' : ''}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
                              <button
                                type="button"
                                onClick={() => startRestCountdown(restDurationMinutes)}
                                className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm sm:text-base font-extrabold flex items-center justify-center gap-2 shadow-md cursor-pointer"
                              >
                                <Play className="w-4 h-4 fill-current" />
                                <span>开始 {restDurationMinutes} 分钟倒计时</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDialogueMode('checkin_done');
                                  speak(`好哦，先不休息啦~ 需要的时候随时打开公会怀表！`, 'normal');
                                }}
                                className="py-3 px-4 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 text-stone-700 dark:text-amber-200 text-xs sm:text-sm font-bold cursor-pointer"
                              >
                                跳过
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MODE 4.7: LIVE REST COUNTDOWN RING */}
                  {dialogueMode === 'rest_countdown' && (
                    <div className="space-y-5">
                      <div className="p-6 rounded-2xl guild-card border-2 border-emerald-500/45 flex flex-col items-center text-center space-y-5">
                        <div className="flex items-center gap-2 flex-wrap justify-center">
                          <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/35 text-xs font-extrabold flex items-center gap-1.5">
                            <Timer className="w-3.5 h-3.5" />
                            <span>茶歇倒计时进行中</span>
                          </span>
                          <span className="px-3 py-1 rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-200 border border-amber-500/30 text-xs font-mono font-bold">
                            时段 {restStartTimeStr} ~{' '}
                            {addMinutesToTimeHHMM(restStartTimeStr, restDurationMinutes)}（
                            {restDurationMinutes} 分钟）
                          </span>
                        </div>

                        {/* Circular Countdown Progress SVG */}
                        {(() => {
                          const totalSec = Math.max(1, restDurationMinutes * 60);
                          const fraction = Math.min(1, Math.max(0, restRemainingSeconds / totalSec));
                          const radius = 86;
                          const circumference = 2 * Math.PI * radius;
                          const dashOffset = circumference * (1 - fraction);
                          const mm = String(Math.floor(restRemainingSeconds / 60)).padStart(2, '0');
                          const ss = String(restRemainingSeconds % 60).padStart(2, '0');

                          return (
                            <div className="relative w-52 h-52 flex items-center justify-center">
                              <svg viewBox="0 0 210 210" className="w-full h-full -rotate-90">
                                <circle
                                  cx={105}
                                  cy={105}
                                  r={radius}
                                  fill="none"
                                  className="stroke-amber-900/15 dark:stroke-white/10"
                                  strokeWidth={12}
                                />
                                <circle
                                  cx={105}
                                  cy={105}
                                  r={radius}
                                  fill="none"
                                  stroke="#10b981"
                                  strokeWidth={12}
                                  strokeLinecap="round"
                                  strokeDasharray={circumference}
                                  strokeDashoffset={dashOffset}
                                  className="transition-[stroke-dashoffset] duration-300 ease-linear"
                                />
                              </svg>
                              <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <div className="text-4xl font-mono font-extrabold text-stone-900 dark:text-amber-50 tabular-nums tracking-tight">
                                  {mm}:{ss}
                                </div>
                                <div className="text-xs text-stone-500 dark:text-amber-200/75 mt-1 font-semibold">
                                  《{restTaskRef.current?.taskTitle || selectedTask?.title || '委托'}》
                                </div>
                              </div>
                            </div>
                          );
                        })()}

                        <div className="flex flex-wrap items-center justify-center gap-2.5 w-full max-w-lg">
                          <button
                            type="button"
                            onClick={() => finalizeRestSession(false)}
                            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold shadow-md flex items-center gap-1.5 cursor-pointer"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>结束休息并记入委托</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => extendRestCountdown(5)}
                            className="px-4 py-2.5 rounded-xl guild-card border text-xs sm:text-sm font-bold text-amber-800 dark:text-amber-200 hover:border-emerald-500 flex items-center gap-1.5 cursor-pointer"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>+5 分钟</span>
                          </button>
                          <button
                            type="button"
                            onClick={cancelRestCountdown}
                            className="px-4 py-2.5 rounded-xl bg-rose-100/80 dark:bg-rose-950/60 hover:bg-rose-200 text-rose-800 dark:text-rose-200 border border-rose-300/70 dark:border-rose-700/50 text-xs sm:text-sm font-bold cursor-pointer"
                          >
                            取消休息（不计入）
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MODE 4.8: POMODORO TIMER WORKSPACE */}
                  {dialogueMode === 'pomodoro' && (
                    <div className="space-y-4">
                      {/* Top Daily Harvest Stats + Phase Switcher Bar */}
                      <div className="p-4 rounded-2xl guild-card border flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">🍅</span>
                            <div>
                              <div className="text-xs sm:text-sm font-extrabold text-stone-900 dark:text-amber-50">
                                今日已收获 {pomodoroDailyStats.date === todayStr ? pomodoroDailyStats.count : 0} 颗番茄
                                <span className="text-stone-500 dark:text-amber-200/75 font-semibold ml-1.5">
                                  （累计 {pomodoroDailyStats.date === todayStr ? pomodoroDailyStats.minutes : 0} 分钟）
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 text-[11px] text-stone-600 dark:text-amber-200/75">
                                <span>本轮长休周期：</span>
                                {(() => {
                                  const todayCnt =
                                    pomodoroDailyStats.date === todayStr ? pomodoroDailyStats.count : 0;
                                  const filled =
                                    todayCnt > 0 && todayCnt % 4 === 0 ? 4 : todayCnt % 4;
                                  return (
                                    <span className="inline-flex items-center gap-1">
                                      {[0, 1, 2, 3].map((pip) => (
                                        <span
                                          key={pip}
                                          className={`inline-block w-2.5 h-2.5 rounded-full border ${
                                            pip < filled
                                              ? 'bg-rose-500 border-rose-600 dark:border-rose-400'
                                              : 'bg-amber-900/10 dark:bg-white/10 border-amber-800/25 dark:border-white/20'
                                          }`}
                                          title={`第 ${pip + 1}/4 轮专注`}
                                        />
                                      ))}
                                      <span className="font-mono font-bold ml-1 text-rose-700 dark:text-rose-300">
                                        {filled}/4
                                      </span>
                                      {todayCnt > 0 && todayCnt % 4 === 0 && (
                                        <span className="text-emerald-700 dark:text-emerald-300 font-bold ml-1">
                                          · 建议长休整
                                        </span>
                                      )}
                                    </span>
                                  );
                                })()}
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          {(
                            [
                              {
                                id: 'focus' as PomodoroPhase,
                                label: `🍅 专注 (${pomodoroFocusMinutes}m)`,
                                activeCls: 'bg-rose-600 text-white border-rose-500 shadow-sm',
                              },
                              {
                                id: 'short_break' as PomodoroPhase,
                                label: `☕ 短休 (${pomodoroShortBreakMinutes}m)`,
                                activeCls: 'bg-emerald-600 text-white border-emerald-500 shadow-sm',
                              },
                              {
                                id: 'long_break' as PomodoroPhase,
                                label: `🏕️ 长休 (${pomodoroLongBreakMinutes}m)`,
                                activeCls: 'bg-teal-600 text-white border-teal-500 shadow-sm',
                              },
                            ] as const
                          ).map((tab) => {
                            const isActive = pomodoroPhase === tab.id;
                            return (
                              <button
                                key={tab.id}
                                type="button"
                                disabled={pomodoroRunState === 'running' && !isActive}
                                onClick={() => switchPomodoroPhaseTab(tab.id)}
                                title={
                                  pomodoroRunState === 'running' && !isActive
                                    ? '计时进行中，请先暂停或重置后再切换阶段'
                                    : undefined
                                }
                                className={`px-3 py-1.5 rounded-xl border text-xs sm:text-sm font-bold transition-all ${
                                  isActive
                                    ? tab.activeCls
                                    : pomodoroRunState === 'running'
                                      ? 'bg-amber-900/5 dark:bg-white/5 text-stone-400 dark:text-stone-500 border-amber-800/10 dark:border-white/10 cursor-not-allowed'
                                      : 'bg-white/75 dark:bg-black/25 text-stone-700 dark:text-amber-100 border-amber-800/20 dark:border-white/15 hover:border-amber-500 cursor-pointer'
                                }`}
                              >
                                {tab.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Last Completed Phase Banner */}
                      {pomodoroLastSummary && (
                        <div className="p-4 rounded-2xl bg-emerald-500/15 border-2 border-emerald-500/45 flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-1 min-w-0">
                            <div className="text-sm sm:text-base font-extrabold text-emerald-900 dark:text-emerald-200 flex items-center gap-2 flex-wrap">
                              <span>
                                {pomodoroLastSummary.phase === 'focus'
                                  ? `🎉 专注冲刺完成（${pomodoroLastSummary.minutes} 分钟）`
                                  : `☕ 休整恢复完成（${pomodoroLastSummary.minutes} 分钟）`}
                              </span>
                              <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/35">
                                {pomodoroLastSummary.startTime} ~ {pomodoroLastSummary.endTime}
                              </span>
                            </div>
                            <div className="text-xs sm:text-sm text-emerald-800/90 dark:text-emerald-200/85">
                              {pomodoroLastSummary.taskTitle ? (
                                pomodoroLastSummary.autoRecorded ? (
                                  <span>
                                    已自动记入《{pomodoroLastSummary.taskTitle}》的今日时间档案。
                                  </span>
                                ) : (
                                  <span>关联委托：《{pomodoroLastSummary.taskTitle}》（仅计时，未写入打卡）。</span>
                                )
                              ) : (
                                <span>本次为自由纯计时，未绑定具体委托。</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {pomodoroRunState === 'idle' && (
                              <button
                                type="button"
                                onClick={() => startPomodoroPhase()}
                                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-extrabold shadow-sm cursor-pointer"
                              >
                                {pomodoroPhase === 'focus'
                                  ? `🍅 开启下一轮 (${pomodoroFocusMinutes}m)`
                                  : pomodoroPhase === 'long_break'
                                    ? `🏕️ 开始长休整 (${pomodoroLongBreakMinutes}m)`
                                    : `☕ 开始短休整 (${pomodoroShortBreakMinutes}m)`}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setPomodoroLastSummary(null)}
                              className="p-1.5 rounded-lg text-emerald-800 dark:text-emerald-200 hover:bg-emerald-500/20 cursor-pointer"
                              title="关闭提示"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Quest Binding & Optional Note Card */}
                      <div className="p-4 rounded-2xl guild-card border space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className="text-xs sm:text-sm font-extrabold text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                            <span>📌 绑定攻略委托</span>
                            {pomodoroBoundTask && (
                              <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-400/35">
                                {getQuestCategoryBadge(pomodoroBoundTask.tags).icon} {pomodoroBoundTask.title}
                              </span>
                            )}
                          </label>
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setPomodoroShowAllTasks((prev) => !prev)}
                              className="text-xs px-2.5 py-1 rounded-lg bg-white/75 dark:bg-black/25 border border-amber-800/20 dark:border-white/15 text-stone-700 dark:text-amber-200 hover:border-amber-500 font-semibold cursor-pointer"
                            >
                              {pomodoroShowAllTasks
                                ? `仅看攻略中 (${prioritizedInProgressTasks.length})`
                                : `展开全部未完成 (${tasks.filter((t) => t.status !== 'done').length})`}
                            </button>
                            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-stone-700 dark:text-amber-200 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={pomodoroAutoRecord}
                                onChange={(e) => setPomodoroAutoRecord(e.target.checked)}
                                className="rounded border-amber-600 text-rose-600 focus:ring-rose-500 cursor-pointer"
                              />
                              <span>完成自动记入今日打卡</span>
                            </label>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                          <select
                            value={pomodoroTaskId ?? ''}
                            onChange={(e) => {
                              const nextId = e.target.value || null;
                              setPomodoroTaskId(nextId);
                              if (nextId) setSelectedTaskId(nextId);
                            }}
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-white dark:bg-[#1a140f] border border-amber-800/25 dark:border-amber-600/40 rounded-xl text-stone-900 dark:text-amber-50 focus:outline-none focus:border-rose-500"
                          >
                            <option value="">不绑定特定委托（纯番茄计时）</option>
                            {pomodoroSelectableTasks.map((t) => (
                              <option key={t.id} value={t.id}>
                                {getQuestCategoryBadge(t.tags).icon} {t.title}（{RPG_STATUS_META[t.status].rpgLabel}）
                              </option>
                            ))}
                          </select>

                          <input
                            type="text"
                            value={pomodoroNote}
                            onChange={(e) => setPomodoroNote(e.target.value)}
                            placeholder="本次专注目标 / 备注（可选，专注结束时写入记录）"
                            className="w-full px-3 py-2 text-xs sm:text-sm bg-white dark:bg-[#1a140f] border border-amber-800/25 dark:border-amber-600/40 rounded-xl text-stone-900 dark:text-amber-50 placeholder-stone-400 focus:outline-none focus:border-rose-500"
                          />
                        </div>
                      </div>

                      {/* Main Interactive Pocket-Watch Dial & Controls */}
                      <div className="p-5 rounded-2xl guild-card border">
                        <div className="flex flex-col lg:flex-row items-center gap-6 justify-center">
                          {/* Left: Interactive / Live SVG Pocket-Watch Dial */}
                          <div className="flex flex-col items-center gap-2 shrink-0">
                            <PocketWatchDialSvg
                              dialRef={pomodoroDialSvgRef}
                              dialAngle={
                                pomodoroRunState === 'idle'
                                  ? Math.min(360, Math.max(6, activePomodoroTotalMinutes * 6))
                                  : Math.min(
                                      360,
                                      Math.max(
                                        0.5,
                                        (pomodoroRemainingSeconds /
                                          Math.max(1, activePomodoroTotalMinutes * 60)) *
                                          360
                                      )
                                    )
                              }
                              activeMinuteMarker={
                                pomodoroRunState === 'idle' ? activePomodoroTotalMinutes : null
                              }
                              accent={pomodoroPhase === 'focus' ? 'rose' : 'emerald'}
                              interactive={pomodoroRunState === 'idle'}
                              isDragging={isDraggingPomodoroDial}
                              onDraggingChange={setIsDraggingPomodoroDial}
                              onUpdatePoint={updatePomodoroDialFromClientPoint}
                            />
                            <span className="text-[11px] text-stone-500 dark:text-amber-300/70">
                              {pomodoroRunState === 'idle'
                                ? '拖动或点击表盘刻度可快速调节 1 ~ 60 分钟'
                                : pomodoroRunState === 'running'
                                  ? '怀表运转中 · 扇区随剩余时间实时收拢'
                                  : '已暂停 · 点击继续或提前完成入账'}
                            </span>
                          </div>

                          {/* Right: Countdown Readout, Presets & Action Controls */}
                          <div className="flex-1 w-full max-w-md space-y-4">
                            <div className="p-4 rounded-2xl guild-subpanel border text-center space-y-2">
                              <div className="flex items-center justify-center gap-2">
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold border ${
                                    pomodoroPhase === 'focus'
                                      ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/35'
                                      : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35'
                                  }`}
                                >
                                  {pomodoroRunState === 'running'
                                    ? pomodoroPhase === 'focus'
                                      ? '🔥 专注冲刺中'
                                      : pomodoroPhase === 'long_break'
                                        ? '🏕️ 长休整恢复中'
                                        : '☕ 短休整恢复中'
                                    : pomodoroRunState === 'paused'
                                      ? '⏸ 计时已暂停'
                                      : pomodoroPhase === 'focus'
                                        ? '🍅 专注准备就绪'
                                        : pomodoroPhase === 'long_break'
                                          ? '🏕️ 长休整准备就绪'
                                          : '☕ 短休整准备就绪'}
                                </span>
                              </div>

                              <div className="flex items-center justify-center gap-3">
                                {pomodoroRunState === 'idle' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActivePhaseMinutes(activePomodoroTotalMinutes - 1)
                                    }
                                    className="w-9 h-9 rounded-xl bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/20 text-lg font-extrabold cursor-pointer"
                                    title="减少 1 分钟"
                                  >
                                    -
                                  </button>
                                )}
                                <div
                                  className={`text-4xl sm:text-5xl font-mono font-extrabold tabular-nums tracking-tight min-w-[140px] ${
                                    pomodoroPhase === 'focus'
                                      ? 'text-rose-700 dark:text-rose-300'
                                      : 'text-emerald-700 dark:text-emerald-300'
                                  }`}
                                >
                                  {formatCountdownMMSS(pomodoroRemainingSeconds)}
                                </div>
                                {pomodoroRunState === 'idle' && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setActivePhaseMinutes(activePomodoroTotalMinutes + 1)
                                    }
                                    className="w-9 h-9 rounded-xl bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/20 text-lg font-extrabold cursor-pointer"
                                    title="增加 1 分钟"
                                  >
                                    +
                                  </button>
                                )}
                              </div>

                              <div className="text-xs font-mono text-stone-600 dark:text-stone-300">
                                {pomodoroRunState === 'idle' ? (
                                  (() => {
                                    const nowStr = formatTimeHHMM(new Date());
                                    const endStr = addMinutesToTimeHHMM(
                                      nowStr,
                                      activePomodoroTotalMinutes
                                    );
                                    return `预计时段：${nowStr} ~ ${endStr}（${activePomodoroTotalMinutes} 分钟）`;
                                  })()
                                ) : pomodoroRunState === 'running' && pomodoroTargetEndMs ? (
                                  <span>
                                    开始于 {pomodoroStartedAtStr || '--:--'} · 预计{' '}
                                    {formatTimeHHMM(new Date(pomodoroTargetEndMs))} 完成
                                  </span>
                                ) : (
                                  <span>开始于 {pomodoroStartedAtStr || '--:--'} · 已暂停等待恢复</span>
                                )}
                              </div>
                            </div>

                            {pomodoroRunState === 'idle' && (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs font-bold text-stone-600 dark:text-amber-200/80">
                                  <span>快捷时长预设：</span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActivePhaseMinutes(activePomodoroTotalMinutes - 5)
                                      }
                                      className="px-2 py-0.5 rounded-md bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/20 font-mono cursor-pointer"
                                    >
                                      -5m
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setActivePhaseMinutes(activePomodoroTotalMinutes + 5)
                                      }
                                      className="px-2 py-0.5 rounded-md bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/20 font-mono cursor-pointer"
                                    >
                                      +5m
                                    </button>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {(pomodoroPhase === 'focus'
                                    ? [15, 25, 35, 45, 60]
                                    : pomodoroPhase === 'short_break'
                                      ? [3, 5, 10, 15]
                                      : [10, 15, 20, 30]
                                  ).map((preset) => (
                                    <button
                                      key={preset}
                                      type="button"
                                      onClick={() => setActivePhaseMinutes(preset)}
                                      className={`flex-1 min-w-[54px] py-2 px-2 rounded-xl border text-xs sm:text-sm font-mono font-bold transition-all cursor-pointer ${
                                        activePomodoroTotalMinutes === preset
                                          ? pomodoroPhase === 'focus'
                                            ? 'bg-rose-600 text-white border-rose-500 shadow-sm'
                                            : 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                                          : 'bg-white/75 dark:bg-black/25 text-stone-700 dark:text-amber-100 border-amber-800/20 dark:border-white/15 hover:border-amber-500'
                                      }`}
                                    >
                                      {preset}m
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Action Controls */}
                            <div className="flex flex-wrap items-center gap-2.5 pt-1">
                              {pomodoroRunState === 'idle' ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => startPomodoroPhase()}
                                    className={`flex-1 min-w-[180px] px-5 py-3 rounded-xl text-white text-sm sm:text-base font-extrabold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-colors ${
                                      pomodoroPhase === 'focus'
                                        ? 'bg-rose-600 hover:bg-rose-700'
                                        : 'bg-emerald-600 hover:bg-emerald-700'
                                    }`}
                                  >
                                    <Play className="w-4 h-4" />
                                    <span>
                                      {pomodoroPhase === 'focus'
                                        ? `🍅 开始专注计时 (${activePomodoroTotalMinutes}m)`
                                        : pomodoroPhase === 'long_break'
                                          ? `🏕️ 开始长休整 (${activePomodoroTotalMinutes}m)`
                                          : `☕ 开始短休整 (${activePomodoroTotalMinutes}m)`}
                                    </span>
                                  </button>
                                  {pomodoroPhase !== 'focus' && (
                                    <button
                                      type="button"
                                      onClick={() => switchPomodoroPhaseTab('focus')}
                                      className="px-4 py-3 rounded-xl guild-card border text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-100 hover:border-amber-500 flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <SkipForward className="w-4 h-4" />
                                      <span>跳过休整</span>
                                    </button>
                                  )}
                                </>
                              ) : (
                                <>
                                  {pomodoroRunState === 'running' ? (
                                    <button
                                      type="button"
                                      onClick={pausePomodoro}
                                      className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-extrabold shadow-sm flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <Pause className="w-4 h-4" />
                                      <span>暂停</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={resumePomodoro}
                                      className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-extrabold shadow-sm flex items-center gap-1.5 cursor-pointer"
                                    >
                                      <Play className="w-4 h-4" />
                                      <span>继续</span>
                                    </button>
                                  )}

                                  <button
                                    type="button"
                                    onClick={() => completePomodoroPhase(true)}
                                    className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-extrabold shadow-sm flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>
                                      {pomodoroPhase === 'focus'
                                        ? '提前完成并入账'
                                        : '结束休整并入账'}
                                    </span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => extendPomodoro(5)}
                                    className="px-3.5 py-2.5 rounded-xl guild-card border text-xs sm:text-sm font-bold text-amber-800 dark:text-amber-200 hover:border-amber-500 flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <Timer className="w-4 h-4" />
                                    <span>+5 分钟</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={resetPomodoro}
                                    className="px-3.5 py-2.5 rounded-xl bg-rose-100/80 dark:bg-rose-950/60 hover:bg-rose-200 text-rose-800 dark:text-rose-200 border border-rose-300/70 dark:border-rose-700/50 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    <span>重置</span>
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MODE 5: CHECK-IN DONE CELEBRATION */}
                  {dialogueMode === 'checkin_done' && (
                    <div className="space-y-5">
                      <div className="p-6 rounded-2xl guild-card border-2 border-emerald-500/50 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-lg sm:text-xl font-extrabold text-stone-900 dark:text-amber-50">
                            《{lastCheckInResult?.taskTitle}》
                          </span>
                          <span className="px-3 py-1 rounded-xl bg-emerald-600 text-white text-xs sm:text-sm font-extrabold guild-stamp-slam">
                            {lastCheckInResult?.wasCompleted ? '🏆 CLEARED!' : '✅ 今日已盖章入账'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-stone-600 dark:text-amber-200/80">
                          <span>日期: {lastCheckInResult?.date}</span>
                          <span>
                            投入时长:{' '}
                            {lastCheckInResult?.hours ? formatHours(lastCheckInResult.hours) : '未填写'}
                          </span>
                          <span className="text-rose-600 dark:text-rose-300 font-bold">
                            看板娘默契度 +{lastCheckInResult?.wasCompleted ? 5 : 2}
                          </span>
                        </div>
                        {lastRecordedRest && (
                          <div className="mt-2 px-3.5 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-xs sm:text-sm text-emerald-800 dark:text-emerald-200 font-bold flex items-center gap-2 flex-wrap">
                            <Coffee className="w-4 h-4 shrink-0" />
                            <span>
                              事后休息已记入任务档案：{lastRecordedRest.startTime} ~{' '}
                              {lastRecordedRest.endTime}（共 {lastRecordedRest.durationMinutes} 分钟）
                            </span>
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={startCheckInFlow}
                          className="guild-choice-btn p-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-sm sm:text-base text-left cursor-pointer"
                        >
                          📝 继续汇报其他委托
                        </button>
                        {selectedTask && (
                          <button
                            type="button"
                            onClick={() => openCheckInForTask(selectedTask, todayStr, 'append')}
                            className="guild-choice-btn p-4 rounded-2xl guild-card border font-bold text-sm sm:text-base text-left cursor-pointer"
                          >
                            ➕ 为《{selectedTask.title}》追加今日记录
                          </button>
                        )}
                        {selectedTask && lastCheckInResult?.date === todayStr && (
                          <button
                            type="button"
                            onClick={() =>
                              openRestDial({
                                taskId: selectedTask.id,
                                taskTitle: selectedTask.title,
                                date: todayStr,
                                sessionId: restTaskRef.current?.sessionId,
                              })
                            }
                            className="guild-choice-btn p-4 rounded-2xl guild-card border font-bold text-sm sm:text-base text-left cursor-pointer"
                          >
                            ☕ 开启事后休息表盘
                          </button>
                        )}
                        {selectedTask && (
                          <button
                            type="button"
                            onClick={() => openInspectTask(selectedTask)}
                            className="guild-choice-btn p-4 rounded-2xl guild-card border font-bold text-sm sm:text-base text-left cursor-pointer"
                          >
                            📜 查看该委托卷宗
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => switchSection('ledger')}
                          className="guild-choice-btn p-4 rounded-2xl guild-card border font-bold text-sm sm:text-base text-left cursor-pointer"
                        >
                          📖 打开委托账本
                        </button>
                        <button
                          type="button"
                          onClick={returnToHub}
                          className="guild-choice-btn p-4 rounded-2xl guild-card border font-bold text-sm sm:text-base text-left cursor-pointer"
                        >
                          🏠 返回接待大厅中央
                        </button>
                      </div>
                    </div>
                  )}

                  {/* MODE 6: CREATE / EDIT TASK FORM */}
                  {(dialogueMode === 'create_task' || dialogueMode === 'edit_task') && (
                    <form onSubmit={handleTaskFormSubmit} className="space-y-5">
                      <div className="space-y-2">
                        <label className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200 block">
                          委托名称
                        </label>
                        <input
                          type="text"
                          required
                          autoFocus
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          placeholder="输入委托标题（如：《黑神话：悟空》、《设计心理学》...）"
                          className="w-full px-4 py-3 text-sm sm:text-base bg-white dark:bg-[#1a140f] border border-amber-800/30 dark:border-amber-600/40 rounded-xl text-stone-900 dark:text-amber-50 placeholder-stone-400 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200 block">
                          初始 / 当前状态
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          {LEDGER_TABS.map((st) => {
                            const meta = RPG_STATUS_META[st];
                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() => setFormStatus(st)}
                                className={`px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold border cursor-pointer transition-all ${
                                  formStatus === st
                                    ? 'bg-amber-600 text-white border-amber-700 shadow-sm'
                                    : 'guild-card text-stone-700 dark:text-amber-100 hover:border-amber-500'
                                }`}
                              >
                                {meta.icon} {meta.rpgLabel}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl guild-card border space-y-3">
                        <label className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200 block">
                          分类标签（第一个标签将作为主分类）
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          {formTags.map((tag, idx) => (
                            <span
                              key={tag}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs sm:text-sm font-semibold ${
                                idx === 0
                                  ? 'bg-amber-500/25 text-amber-950 dark:text-amber-100 border border-amber-500/50'
                                  : 'bg-black/5 dark:bg-white/10 text-stone-700 dark:text-stone-200 border border-amber-800/15'
                              }`}
                            >
                              {idx === 0 && <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300">主:</span>}
                              {tag}
                              <button
                                type="button"
                                onClick={() => setFormTags(formTags.filter((t) => t !== tag))}
                                className="hover:text-rose-600 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          ))}
                          <input
                            type="text"
                            value={formNewTag}
                            onChange={(e) => setFormNewTag(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ',') {
                                e.preventDefault();
                                handleAddFormTag(formNewTag);
                              }
                            }}
                            placeholder="+ 自定义标签(回车)"
                            className="w-40 px-3 py-1 text-xs sm:text-sm bg-white dark:bg-[#1a140f] border border-amber-800/30 rounded-lg text-stone-900 dark:text-amber-50 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          {Array.from(new Set([...allTags, ...COMMON_TAG_PRESETS]))
                            .filter((t) => !formTags.includes(t))
                            .slice(0, 10)
                            .map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => handleAddFormTag(preset)}
                                className="text-xs px-2.5 py-1 rounded-lg bg-amber-900/5 dark:bg-white/5 hover:bg-amber-500/15 text-stone-700 dark:text-amber-200 border border-amber-800/15 cursor-pointer"
                              >
                                +{preset}
                              </button>
                            ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2.5 pt-2">
                        <button
                          type="button"
                          onClick={returnToHub}
                          className="px-4 py-2 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 text-stone-700 dark:text-amber-200 text-xs sm:text-sm font-bold cursor-pointer"
                        >
                          取消返回
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm sm:text-base font-extrabold cursor-pointer shadow-md"
                        >
                          {dialogueMode === 'edit_task' ? '💾 保存档案修改' : '✨ 盖章立项'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* MODE 7: RANDOM BACKLOG PICK */}
                  {dialogueMode === 'random_pick' && randomPickedTask && (
                    <div className="space-y-5">
                      <div className="p-6 rounded-2xl guild-card border-2 border-purple-500/45 space-y-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-800 dark:text-purple-200 border border-purple-400/40">
                            🎲 命运之骰选中
                          </span>
                          <span
                            className={`text-xs px-2.5 py-1 rounded-lg border font-semibold ${
                              getQuestCategoryBadge(randomPickedTask.tags).ribbonClass
                            }`}
                          >
                            {getQuestCategoryBadge(randomPickedTask.tags).icon}{' '}
                            {getQuestCategoryBadge(randomPickedTask.tags).label}
                          </span>
                        </div>
                        <h4 className="text-lg sm:text-xl font-extrabold text-stone-900 dark:text-amber-50">
                          《{randomPickedTask.title}》
                        </h4>
                        <div className="flex flex-wrap gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              moveTaskStatus(randomPickedTask.id, 'in_progress');
                              openInspectTask({ ...randomPickedTask, status: 'in_progress' });
                            }}
                            className="guild-choice-btn px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs sm:text-sm cursor-pointer"
                          >
                            🔥 正式接取（移至攻略中）
                          </button>
                          <button
                            type="button"
                            onClick={() => openCheckInForTask(randomPickedTask, todayStr)}
                            className="guild-choice-btn px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm cursor-pointer"
                          >
                            ⚡ 直接打卡开玩
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerRandomPick(randomPickedTask.id)}
                            className="guild-choice-btn px-4 py-2.5 rounded-xl guild-subpanel border font-bold text-xs sm:text-sm cursor-pointer"
                          >
                            🎲 换一个再抽
                          </button>
                        </div>
                      </div>

                      {tasks.filter((t) => t.status === 'backlog').length > 1 && (
                        <div className="p-4 rounded-2xl guild-subpanel border space-y-2.5">
                          <div className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200">
                            「待接取」书架其他候选项
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {tasks
                              .filter((t) => t.status === 'backlog' && t.id !== randomPickedTask.id)
                              .slice(0, 8)
                              .map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => openInspectTask(t)}
                                  className="px-3 py-2 rounded-xl guild-card border text-left text-xs sm:text-sm font-semibold truncate hover:border-amber-500 cursor-pointer"
                                >
                                  {getQuestCategoryBadge(t.tags).icon} {t.title}
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* MODE 8: STALE TASK REVIEW */}
                  {dialogueMode === 'stale_review' && currentStaleItem && (
                    <div className="space-y-5">
                      <div className="p-6 rounded-2xl guild-card border-2 border-rose-500/45 space-y-4">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-200 border border-rose-400/40">
                            🔔 已 {currentStaleItem.daysSinceLastActive} 天未推进 · {currentStaleItem.lastDateLabel}
                          </span>
                          <span className="text-xs font-mono text-stone-500">
                            第 {staleIndex + 1} / {staleList.length} 项
                          </span>
                        </div>
                        <h4 className="text-lg sm:text-xl font-extrabold text-stone-900 dark:text-amber-50">
                          《{currentStaleItem.task.title}》
                        </h4>
                        <div className="flex flex-wrap gap-2.5">
                          <button
                            type="button"
                            onClick={() => openCheckInForTask(currentStaleItem.task, todayStr)}
                            className="guild-choice-btn px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs sm:text-sm cursor-pointer"
                          >
                            ⚡ 今天就推一把（去打卡）
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              moveTaskStatus(currentStaleItem.task.id, 'paused');
                              if (staleIndex + 1 < staleList.length) {
                                const nextItem = staleList[staleIndex + 1];
                                setStaleIndex(staleIndex + 1);
                                setSelectedTaskId(nextItem.task.id);
                                speak(
                                  `好，已将刚才那项冻结~ 下一项《${nextItem.task.title}》也 ${nextItem.daysSinceLastActive} 天没动静了，要怎么处理？`,
                                  'thinking'
                                );
                              } else {
                                setDialogueMode('hub');
                                speak(`巡检完成啦！账本看起来清爽多啦~`, 'happy');
                              }
                            }}
                            className="guild-choice-btn px-4 py-2.5 rounded-xl guild-subpanel border font-bold text-xs sm:text-sm cursor-pointer"
                          >
                            ❄️ 先移至搁置区
                          </button>
                          {staleIndex + 1 < staleList.length && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextItem = staleList[staleIndex + 1];
                                setStaleIndex(staleIndex + 1);
                                setSelectedTaskId(nextItem.task.id);
                                speak(
                                  `跳过这一项~ 再看下一项《${nextItem.task.title}》，已经 ${nextItem.daysSinceLastActive} 天没有进展了哦。`,
                                  'sleepy'
                                );
                              }}
                              className="guild-choice-btn px-4 py-2.5 rounded-xl guild-subpanel border font-bold text-xs sm:text-sm cursor-pointer"
                            >
                              ⏭️ 下一项 ({staleIndex + 2}/{staleList.length})
                            </button>
                          )}
                        </div>
                      </div>

                      {staleList.length > 1 && (
                        <div className="p-4 rounded-2xl guild-subpanel border space-y-2.5">
                          <div className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200">
                            全部待巡检列表 ({staleList.length})
                          </div>
                          <div className="space-y-2">
                            {staleList.map((item, idx) => (
                              <button
                                key={item.task.id}
                                type="button"
                                onClick={() => {
                                  setStaleIndex(idx);
                                  setSelectedTaskId(item.task.id);
                                }}
                                className={`w-full px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2 text-xs sm:text-sm cursor-pointer ${
                                  idx === staleIndex
                                    ? 'bg-amber-500/20 border-amber-500 font-bold'
                                    : 'guild-card hover:border-amber-500'
                                }`}
                              >
                                <span className="truncate">{item.task.title}</span>
                                <span className="shrink-0 text-xs text-rose-600 dark:text-rose-300 font-semibold">
                                  {item.daysSinceLastActive} 天未推进
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* MODE 9: SYNC MENU */}
                  {dialogueMode === 'sync_menu' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setDriveSyncModalOpen(true)}
                        className="guild-choice-btn p-5 rounded-2xl guild-card border text-left flex items-start gap-3.5 cursor-pointer"
                      >
                        <div className="p-3 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 shrink-0">
                          <Cloud className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-sm sm:text-base font-extrabold">GitHub Gist 云端同步</div>
                          <div className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
                            {user
                              ? syncStatus === 'conflict'
                                ? '检测到云端与本地冲突，点击处理并合并'
                                : '已连接 GitHub Gist，支持自动合并同步'
                              : '配置 GitHub Token 实现多设备自动同步'}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setLocalSyncModalOpen(true)}
                        className="guild-choice-btn p-5 rounded-2xl guild-card border text-left flex items-start gap-3.5 cursor-pointer"
                      >
                        <div className="p-3 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0">
                          <FolderSync className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-sm sm:text-base font-extrabold">本地目录实时同步</div>
                          <div className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
                            {localSync.enabled
                              ? '本地文件夹同步已启用，点击查看状态'
                              : '选择本地文件夹实时写入 JSON 卷宗'}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={exportData}
                        className="guild-choice-btn p-5 rounded-2xl guild-card border text-left flex items-start gap-3.5 cursor-pointer"
                      >
                        <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shrink-0">
                          <Download className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-sm sm:text-base font-extrabold">导出 JSON 备份</div>
                          <div className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
                            立即下载完整任务与每日打卡日志备份文件
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="guild-choice-btn p-5 rounded-2xl guild-card border text-left flex items-start gap-3.5 cursor-pointer"
                      >
                        <div className="p-3 rounded-xl bg-purple-500/15 text-purple-700 dark:text-purple-400 shrink-0">
                          <Upload className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-sm sm:text-base font-extrabold">导入 JSON 备份</div>
                          <div className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
                            从历史备份文件一键恢复公会委托与打卡记录
                          </div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Task Detail Drawer scoped inside main view container */}
      <TaskDetailDrawer />

      {/* NPC Customizer Modal */}
      <NpcConfigModal
        isOpen={npcModalOpen}
        config={npcConfig}
        onClose={() => setNpcModalOpen(false)}
        onSave={handleSaveNpcConfig}
        onReset={handleResetNpcConfig}
      />
    </div>
  );
};
