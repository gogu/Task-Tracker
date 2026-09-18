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

export function getYesterdayString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return formatDate(d);
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
    // Show 14 days around today (e.g. past 10 days + next 3 days)
    const startDate = addDays(today, -11);
    const endDate = addDays(today, 2);
    return { startDate, endDate, dates: generateDateRange(startDate, endDate) };
  }

  if (range === 'month') {
    // Show 35 days (past 28 days + next 6 days)
    const startDate = addDays(today, -28);
    const endDate = addDays(today, 6);
    return { startDate, endDate, dates: generateDateRange(startDate, endDate) };
  }

  // Range === 'all'
  // Find minimum start date, or at least 20 days ago
  const effectiveStart = earliestDate && earliestDate < today 
    ? addDays(earliestDate, -2) 
    : addDays(today, -20);
    
  const effectiveEnd = latestDate && latestDate > today 
    ? addDays(latestDate, 2) 
    : addDays(today, 3);

  // Guard against runaway ranges (max 180 days for optimal performance)
  let start = effectiveStart;
  if (diffInDays(start, effectiveEnd) > 120) {
    start = addDays(effectiveEnd, -120);
  }

  return {
    startDate: start,
    endDate: effectiveEnd,
    dates: generateDateRange(start, effectiveEnd),
  };
}
