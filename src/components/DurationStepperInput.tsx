import React, { useEffect, useRef } from 'react';
import { Minus, Plus } from 'lucide-react';

interface DurationStepperInputProps {
  value: string;
  onChange: (value: string) => void;
  step: number;
  min: number;
  max: number;
  unit: string;
  placeholder?: string;
  accent?: 'amber' | 'emerald' | 'blue';
  variant?: 'guild' | 'modal';
  className?: string;
  ariaLabel?: string;
}

const ACCENT_STYLES: Record<
  NonNullable<DurationStepperInputProps['accent']>,
  { guildFocus: string; modalFocus: string; buttonHover: string }
> = {
  amber: {
    guildFocus: 'focus-within:border-amber-500',
    modalFocus: 'focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:border-amber-500',
    buttonHover:
      'hover:bg-amber-500/15 active:bg-amber-500/25 text-stone-700 dark:text-amber-200',
  },
  emerald: {
    guildFocus: 'focus-within:border-emerald-500',
    modalFocus: 'focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-500',
    buttonHover:
      'hover:bg-emerald-500/15 active:bg-emerald-500/25 text-stone-700 dark:text-emerald-200',
  },
  blue: {
    guildFocus: 'focus-within:border-blue-500',
    modalFocus: 'focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500',
    buttonHover:
      'hover:bg-blue-500/15 active:bg-blue-500/25 text-zinc-700 dark:text-blue-200',
  },
};

export const DurationStepperInput: React.FC<DurationStepperInputProps> = ({
  value,
  onChange,
  step,
  min,
  max,
  unit,
  placeholder,
  accent = 'amber',
  variant = 'guild',
  className = '',
  ariaLabel,
}) => {
  const valueRef = useRef(value);
  valueRef.current = value;

  const holdTimeoutRef = useRef<number | undefined>(undefined);
  const repeatIntervalRef = useRef<number | undefined>(undefined);
  const didRepeatRef = useRef(false);

  const decimals = step < 1 ? Math.max(1, String(step).split('.')[1]?.length ?? 1) : 0;

  const clearRepeat = () => {
    window.clearTimeout(holdTimeoutRef.current);
    window.clearInterval(repeatIntervalRef.current);
    holdTimeoutRef.current = undefined;
    repeatIntervalRef.current = undefined;
  };

  useEffect(() => clearRepeat, []);

  const applyStep = (direction: -1 | 1) => {
    const raw = valueRef.current.trim();
    const parsed = raw === '' ? Number.NaN : Number(raw);

    if (Number.isNaN(parsed)) {
      if (direction === 1) {
        const initial = Math.min(max, Math.max(min, step));
        onChange(String(Number(initial.toFixed(decimals))));
      }
      return;
    }

    const next = Math.min(max, Math.max(min, Number((parsed + direction * step).toFixed(decimals))));
    onChange(String(next));
  };

  const handlePointerDown = (direction: -1 | 1) => (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    clearRepeat();
    didRepeatRef.current = false;
    holdTimeoutRef.current = window.setTimeout(() => {
      didRepeatRef.current = true;
      applyStep(direction);
      repeatIntervalRef.current = window.setInterval(() => {
        applyStep(direction);
      }, 85);
    }, 380);
  };

  const handleClick = (direction: -1 | 1) => () => {
    if (didRepeatRef.current) {
      didRepeatRef.current = false;
      return;
    }
    applyStep(direction);
  };

  const trimmed = value.trim();
  const parsedValue = trimmed === '' ? Number.NaN : Number(trimmed);
  const isDecreaseDisabled = Number.isNaN(parsedValue) || parsedValue <= min;
  const isIncreaseDisabled = !Number.isNaN(parsedValue) && parsedValue >= max;

  const accentStyle = ACCENT_STYLES[accent];
  const shellClass =
    variant === 'guild'
      ? `bg-white dark:bg-[#1a140f] border border-amber-800/30 dark:border-amber-600/40 ${accentStyle.guildFocus}`
      : `bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 ${accentStyle.modalFocus}`;

  const dividerClass =
    variant === 'guild'
      ? 'border-amber-800/20 dark:border-amber-600/30'
      : 'border-zinc-200 dark:border-zinc-700';

  const inputTextClass =
    variant === 'guild'
      ? 'text-stone-900 dark:text-amber-50 placeholder-stone-400'
      : 'text-zinc-800 dark:text-zinc-200 placeholder-zinc-400';

  const unitTextClass =
    variant === 'guild'
      ? 'text-stone-500'
      : 'text-zinc-400 dark:text-zinc-500';

  return (
    <div
      className={`flex items-stretch rounded-xl overflow-hidden transition-colors ${shellClass} ${className}`}
    >
      <button
        type="button"
        onPointerDown={handlePointerDown(-1)}
        onPointerUp={clearRepeat}
        onPointerLeave={clearRepeat}
        onPointerCancel={clearRepeat}
        onClick={handleClick(-1)}
        disabled={isDecreaseDisabled}
        aria-label={`减少 ${step} ${unit}`}
        className={`w-10 shrink-0 flex items-center justify-center border-r ${dividerClass} ${accentStyle.buttonHover} transition-colors cursor-pointer touch-manipulation select-none disabled:opacity-35 disabled:cursor-not-allowed`}
      >
        <Minus className="w-4 h-4" />
      </button>

      <div className="relative flex-1 min-w-0 flex items-center">
        <input
          type="number"
          inputMode={step < 1 ? 'decimal' : 'numeric'}
          step={step}
          min={min}
          max={max}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={ariaLabel}
          className={`no-number-spinner w-full h-full pl-2.5 ${
            unit.length > 1 ? 'pr-9' : 'pr-6'
          } py-2 text-sm sm:text-base font-mono text-center bg-transparent focus:outline-none ${inputTextClass}`}
        />
        <span
          className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold pointer-events-none select-none ${unitTextClass}`}
        >
          {unit}
        </span>
      </div>

      <button
        type="button"
        onPointerDown={handlePointerDown(1)}
        onPointerUp={clearRepeat}
        onPointerLeave={clearRepeat}
        onPointerCancel={clearRepeat}
        onClick={handleClick(1)}
        disabled={isIncreaseDisabled}
        aria-label={`增加 ${step} ${unit}`}
        className={`w-10 shrink-0 flex items-center justify-center border-l ${dividerClass} ${accentStyle.buttonHover} transition-colors cursor-pointer touch-manipulation select-none disabled:opacity-35 disabled:cursor-not-allowed`}
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};
