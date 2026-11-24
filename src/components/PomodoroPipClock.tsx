import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { formatTimeHHMM } from '../utils/timeDistribution';

export type PipPomodoroPhase = 'focus' | 'short_break' | 'long_break';
export type PipPomodoroRunState = 'idle' | 'running' | 'paused';

export interface PomodoroPipCompletedNotice {
  phase: PipPomodoroPhase;
  minutes: number;
  taskTitle?: string;
  autoRecorded: boolean;
}

export interface PomodoroPipClockProps {
  phase: PipPomodoroPhase;
  runState: PipPomodoroRunState;
  remainingSeconds: number;
  totalMinutes: number;
  targetEndMs: number | null;
  boundTaskTitle?: string | null;
  completedNotice: PomodoroPipCompletedNotice | null;
  onReturnToMain: () => void;
}

function formatMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/** Minimal clock-only view rendered inside the Document Picture-in-Picture window. */
export const PomodoroPipClock: React.FC<PomodoroPipClockProps> = ({
  phase,
  runState,
  remainingSeconds,
  totalMinutes,
  targetEndMs,
  boundTaskTitle,
  completedNotice,
  onReturnToMain,
}) => {
  if (completedNotice !== null && runState === 'idle') {
    const isFocusDone = completedNotice.phase === 'focus';
    return (
      <div className="w-full h-full guild-parchment text-stone-900 dark:text-amber-50 p-3 flex flex-col items-center justify-center">
        <div className="w-full h-full rounded-2xl guild-card border-2 border-emerald-500/60 px-3 py-3 flex flex-col items-center justify-between text-center gap-2 shadow-inner">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/35">
              <span>{isFocusDone ? '🎉' : '☕'}</span>
              <span>{isFocusDone ? '专注结束' : '休整结束'}</span>
            </div>

            <div className="text-xs font-bold text-stone-800 dark:text-amber-100 leading-snug pt-1">
              本次 {completedNotice.minutes} 分钟
              {completedNotice.autoRecorded && (
                <span className="text-emerald-700 dark:text-emerald-300"> · 已自动入账</span>
              )}
            </div>

            {completedNotice.taskTitle && (
              <div
                className="text-[11px] text-stone-600 dark:text-amber-200/80 truncate max-w-[190px] mx-auto"
                title={completedNotice.taskTitle}
              >
                《{completedNotice.taskTitle}》
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onReturnToMain}
            className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white text-xs font-extrabold shadow-sm flex items-center justify-center gap-1.5 cursor-pointer transition-all"
          >
            <span>回到主界面</span>
            <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>
      </div>
    );
  }

  const totalSeconds = Math.max(1, totalMinutes * 60);
  const progressRatio =
    runState === 'idle' ? 1 : Math.min(1, Math.max(0, remainingSeconds / totalSeconds));
  const ringRadius = 54;
  const circumference = 2 * Math.PI * ringRadius;
  const strokeDashoffset = circumference * (1 - progressRatio);

  const ringStroke =
    runState === 'paused' ? '#d97706' : phase === 'focus' ? '#e11d48' : '#10b981';

  const statusPill =
    runState === 'paused'
      ? {
          text: '⏸ 已暂停',
          cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-200 border-amber-500/35',
        }
      : runState === 'idle'
        ? {
            text: phase === 'focus' ? '🍅 准备就绪' : phase === 'long_break' ? '🏕️ 长休就绪' : '☕ 短休就绪',
            cls:
              phase === 'focus'
                ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/35'
                : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35',
          }
        : phase === 'focus'
          ? {
              text: '🍅 专注中',
              cls: 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/35',
            }
          : phase === 'long_break'
            ? {
                text: '🏕️ 长休中',
                cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35',
              }
            : {
                text: '☕ 短休中',
                cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/35',
              };

  const secondaryLine =
    runState === 'running' && targetEndMs
      ? `预计 ${formatTimeHHMM(new Date(targetEndMs))}`
      : runState === 'paused'
        ? '已暂停'
        : `${totalMinutes} 分钟`;

  return (
    <div className="w-full h-full guild-parchment text-stone-900 dark:text-amber-50 px-3 py-2.5 flex flex-col items-center justify-between select-none">
      {/* Top status row */}
      <div className="w-full flex items-center justify-between gap-2 shrink-0">
        <span
          className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold border truncate ${statusPill.cls}`}
        >
          {statusPill.text}
        </span>
        <button
          type="button"
          onClick={onReturnToMain}
          title="回到主界面"
          className="p-1 rounded-lg text-stone-600 dark:text-amber-200/80 hover:bg-amber-900/10 dark:hover:bg-white/10 hover:text-stone-900 dark:hover:text-amber-50 transition-colors cursor-pointer shrink-0"
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Center circular progress ring + countdown */}
      <div className="relative flex items-center justify-center w-[132px] h-[132px] shrink-0">
        <svg viewBox="0 0 132 132" className="w-full h-full -rotate-90">
          <circle
            cx={66}
            cy={66}
            r={ringRadius}
            fill="none"
            className="stroke-amber-900/15 dark:stroke-amber-200/15"
            strokeWidth={7}
          />
          <circle
            cx={66}
            cy={66}
            r={ringRadius}
            fill="none"
            stroke={ringStroke}
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className="transition-[stroke-dashoffset] duration-300 ease-linear"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span
            className={`text-3xl font-mono font-extrabold tabular-nums tracking-tight leading-none ${
              runState === 'paused'
                ? 'text-amber-700 dark:text-amber-300'
                : phase === 'focus'
                  ? 'text-rose-700 dark:text-rose-300'
                  : 'text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {formatMMSS(remainingSeconds)}
          </span>
          <span className="mt-1 text-[10px] font-mono text-stone-600 dark:text-amber-200/75">
            {secondaryLine}
          </span>
        </div>
      </div>

      {/* Bottom single-line context */}
      <div className="w-full text-center min-h-[16px] shrink-0">
        {boundTaskTitle ? (
          <div
            className="text-[11px] font-semibold text-stone-700 dark:text-amber-100/85 truncate px-1"
            title={boundTaskTitle}
          >
            📌 {boundTaskTitle}
          </div>
        ) : runState === 'idle' ? (
          <div className="text-[11px] text-stone-500 dark:text-amber-200/65 truncate px-1">
            请在主界面开始计时
          </div>
        ) : null}
      </div>
    </div>
  );
};
