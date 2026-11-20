export function formatDate(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

export function getTodayString(): string {
  return formatDate(new Date());
}

export function addDays(dateStr: string, days: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

export function diffInDays(dateStrA: string, dateStrB: string): number {
  const d1 = parseDate(dateStrA).getTime();
  const d2 = parseDate(dateStrB).getTime();
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

export function getRelativeTimeString(dateStr?: string | null): string {
  if (!dateStr) return '暂无打卡';
  const today = getTodayString();
  const diff = diffInDays(dateStr, today);
  if (diff === 0) return '今日打卡';
  if (diff === 1) return '昨天打卡';
  if (diff === 2) return '前天打卡';
  if (diff > 0 && diff <= 30) return `${diff} 天前`;
  return dateStr;
}

export function getWeekdayChinese(dateStr: string): string {
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  const day = parseDate(dateStr).getDay();
  return weekdays[day];
}

export function isWeekend(dateStr: string): boolean {
  const day = parseDate(dateStr).getDay();
  return day === 0 || day === 6;
}

/**
 * Generates an array of continuous date strings between start and end inclusive
 */
export function generateDateRange(startStr: string, endStr: string): string[] {
  const dates: string[] = [];
  let current = startStr;
  while (current <= endStr) {
    dates.push(current);
    current = addDays(current, 1);
  }
  return dates;
}

/**
 * Calculates start and end dates based on selected range
 */
export function getGanttDateWindow(
  range: 'week' | 'month' | 'all',
  earliestDate: string | null,
  latestDate: string | null,
  pivotDate: string = getTodayString()
): { startDate: string; endDate: string; dates: string[] } {
  const today = pivotDate;
  
  if (range === 'week') {
    // Show 10 days around pivotDate (7 past + pivot + 2 next) so columns fit 100% width with zero horizontal overflow
    const startDate = addDays(today, -7);
    const endDate = addDays(today, 2);
    return { startDate, endDate, dates: generateDateRange(startDate, endDate) };
  }

  if (range === 'month') {
    // Show 21 days around pivotDate (16 past + pivot + 4 next)
    const startDate = addDays(today, -16);
    const endDate = addDays(today, 4);
    return { startDate, endDate, dates: generateDateRange(startDate, endDate) };
  }

  // Range === 'all': up to 35 days so all columns fit cleanly without horizontal scrollbars
  const effectiveStart = earliestDate && earliestDate < today
    ? addDays(earliestDate, -2)
    : addDays(today, -24);

  const effectiveEnd = latestDate && latestDate > today
    ? addDays(latestDate, 2)
    : addDays(today, 3);

  const totalSpan = diffInDays(effectiveStart, effectiveEnd) + 1;
  if (totalSpan > 35) {
    const start = addDays(today, -27);
    const end = addDays(today, 7);
    return {
      startDate: start,
      endDate: end,
      dates: generateDateRange(start, end),
    };
  }

  return {
    startDate: effectiveStart,
    endDate: effectiveEnd,
    dates: generateDateRange(effectiveStart, effectiveEnd),
  };
}

/**
 * Formats hours with one decimal place and 'h' unit, e.g. 1.5 -> '1.5h', 0 -> '0.0h'
 */
export function formatHours(hours: number | undefined | null): string {
  const val = typeof hours === 'number' && !isNaN(hours) ? hours : 0;
  return `${val.toFixed(1)}h`;
}

/**
 * Returns the natural week range (Monday to Sunday) containing dateStr
 */
export function getWeekRange(dateStr: string): { startDate: string; endDate: string; dates: string[] } {
  const d = parseDate(dateStr);
  const dayOfWeek = d.getDay(); // 0 (Sun) to 6 (Sat)
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const startDate = addDays(dateStr, diffToMonday);
  const endDate = addDays(startDate, 6);
  return {
    startDate,
    endDate,
    dates: generateDateRange(startDate, endDate),
  };
}

/**
 * Returns the natural month range (1st to last day of month) containing dateStr
 */
export function getMonthRange(dateStr: string): {
  startDate: string;
  endDate: string;
  dates: string[];
  year: number;
  month: number;
} {
  const [y, m] = dateStr.split('-').map(Number);
  const firstDay = new Date(y, m - 1, 1, 12, 0, 0);
  const lastDay = new Date(y, m, 0, 12, 0, 0);
  const startDate = formatDate(firstDay);
  const endDate = formatDate(lastDay);
  return {
    startDate,
    endDate,
    dates: generateDateRange(startDate, endDate),
    year: y,
    month: m,
  };
}

/**
 * Shifts a date string by N months, clamping the day to the target month's max days
 */
export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetYear = y + Math.floor((m - 1 + months) / 12);
  const targetMonthIndex = (((m - 1 + months) % 12) + 12) % 12;
  const maxDay = new Date(targetYear, targetMonthIndex + 1, 0).getDate();
  const clampedDay = Math.min(d, maxDay);
  return formatDate(new Date(targetYear, targetMonthIndex, clampedDay, 12, 0, 0));
}

/**
 * Formats a human-readable period label in Chinese for day, week, or month
 */
export function formatPeriodLabel(period: 'day' | 'week' | 'month', pivotDate: string): string {
  if (period === 'day') {
    const [y, m, d] = pivotDate.split('-').map(Number);
    return `${y}年${m}月${d}日 ${getWeekdayChinese(pivotDate)}`;
  }
  if (period === 'week') {
    const { startDate, endDate } = getWeekRange(pivotDate);
    const [sy, sm, sd] = startDate.split('-').map(Number);
    const [ey, em, ed] = endDate.split('-').map(Number);
    if (sy === ey) {
      return `${sy}年${sm}月${sd}日 - ${em}月${ed}日`;
    }
    return `${sy}年${sm}月${sd}日 - ${ey}年${em}月${ed}日`;
  }
  const [y, m] = pivotDate.split('-').map(Number);
  return `${y}年${m}月`;
}

