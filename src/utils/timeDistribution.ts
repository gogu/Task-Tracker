import { DailyLog, ProgressType, RestSession } from '../types';

export interface HourlyBucket {
  hour: number; // 0..23
  label: string; // e.g. "00:00"
  shortLabel: string; // e.g. "00"
  workHours: number;
  restMinutes: number;
  workSessionCount: number;
  restSessionCount: number;
}

export interface PeriodBucketMeta {
  id: string;
  label: string;
  rangeLabel: string;
  icon: string;
  startHour: number;
  endHour: number; // exclusive (1..24)
}

export interface PeriodBucketSummary extends PeriodBucketMeta {
  workHours: number;
  restMinutes: number;
  workSharePct: number;
  workSessionCount: number;
  restSessionCount: number;
}

export interface HourlyDistributionResult {
  hours: HourlyBucket[];
  periods: PeriodBucketSummary[];
  totalWorkHours: number;
  totalRestMinutes: number;
  totalRestCount: number;
  peakHour: HourlyBucket | null;
  peakPeriod: PeriodBucketSummary | null;
  maxWorkHoursInHour: number;
  maxRestMinutesInHour: number;
}

export interface ExtractedWorkInterval {
  id: string;
  startTime: string;
  endTime: string;
  hours: number;
  note?: string;
  progressType?: ProgressType;
  restSessions: RestSession[];
  totalRestMinutes: number;
  isEstimated: boolean;
}

export interface RestSessionRecord extends RestSession {
  date: string;
}

export interface TaskTimeAndRestProfile {
  frequentPeriods: PeriodBucketSummary[];
  peakWindowLabel: string | null;
  totalWorkSessions: number;
  totalRestMinutes: number;
  totalRestCount: number;
  avgRestMinutes: number;
  restRatePct: number; // percentage of work logs (> 0.3h) that have post-work rest
  recentRestSessions: RestSessionRecord[];
}

export interface TaskTimeSlotAffinity {
  score: number;
  isCurrentPeriodMatch: boolean;
  currentPeriodHours: number;
  currentPeriodSessions: number;
  matchedPeriodLabel: string | null;
  topPeriodLabel: string | null;
  topPeriodIcon: string | null;
}

export const TIME_PERIOD_BUCKETS: PeriodBucketMeta[] = [
  { id: 'late_night', label: '凌晨', rangeLabel: '00:00-06:00', icon: '🌙', startHour: 0, endHour: 6 },
  { id: 'early_morning', label: '清晨', rangeLabel: '06:00-09:00', icon: '🌅', startHour: 6, endHour: 9 },
  { id: 'morning', label: '上午', rangeLabel: '09:00-12:00', icon: '☀️', startHour: 9, endHour: 12 },
  { id: 'afternoon', label: '下午', rangeLabel: '12:00-18:00', icon: '🌤️', startHour: 12, endHour: 18 },
  { id: 'evening', label: '夜晚', rangeLabel: '18:00-22:00', icon: '🌆', startHour: 18, endHour: 22 },
  { id: 'midnight', label: '深夜', rangeLabel: '22:00-24:00', icon: '✨', startHour: 22, endHour: 24 },
];

function pad2(n: number): string {
  return String(Math.floor(Math.max(0, n))).padStart(2, '0');
}

function round1(num: number): number {
  return Math.round(num * 10) / 10;
}

function round2(num: number): number {
  return Math.round(num * 100) / 100;
}

export function formatTimeHHMM(date: Date): string {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function addMinutesToTimeHHMM(hhmm: string, deltaMinutes: number): string {
  const baseMin = parseHHMMToMinutes(hhmm);
  const wrapped = ((baseMin + Math.round(deltaMinutes)) % 1440 + 1440) % 1440;
  return `${pad2(Math.floor(wrapped / 60))}:${pad2(wrapped % 60)}`;
}

export function parseHHMMToMinutes(hhmm: string): number {
  const parts = hhmm.split(':');
  if (parts.length !== 2) return 0;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (isNaN(h) || isNaN(m)) return 0;
  return Math.max(0, Math.min(23, h)) * 60 + Math.max(0, Math.min(59, m));
}

export function computeWorkSessionFromNow(
  hours: number,
  now: Date = new Date()
): { startTime: string; endTime: string; hours: number } {
  const safeHours = Math.max(0.1, Math.min(24, hours));
  const endTime = formatTimeHHMM(now);
  const startDate = new Date(now.getTime() - safeHours * 3600_000);
  const startTime = formatTimeHHMM(startDate);
  return {
    startTime,
    endTime,
    hours: round1(safeHours),
  };
}

export function formatRestDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem > 0 ? `${h} 小时 ${rem} 分钟` : `${h} 小时`;
}

export function extractLogWorkIntervals(log: DailyLog): ExtractedWorkInterval[] {
  const allLogRests = Array.isArray(log.restSessions) ? log.restSessions : [];

  if (Array.isArray(log.workSessions) && log.workSessions.length > 0) {
    const ownedElsewhere = new Set<string>();
    log.workSessions.forEach((ws) => {
      (ws.restSessions || []).forEach((rs) => ownedElsewhere.add(rs.id));
    });
    allLogRests.forEach((rs) => {
      if (rs.sessionId) ownedElsewhere.add(rs.id);
    });

    const isSingle = log.workSessions.length === 1;
    return log.workSessions.map((ws, idx) => {
      const mergedMap = new Map<string, RestSession>();
      (ws.restSessions || []).forEach((rs) => mergedMap.set(rs.id, rs));
      allLogRests.forEach((rs) => {
        if (rs.sessionId === ws.id) {
          mergedMap.set(rs.id, rs);
        } else if (idx === 0 && !rs.sessionId && !ownedElsewhere.has(rs.id)) {
          mergedMap.set(rs.id, rs);
        }
      });
      const restSessions = Array.from(mergedMap.values());
      const totalRestMinutes = restSessions.reduce((s, r) => s + r.durationMinutes, 0);

      return {
        id: ws.id,
        startTime: ws.startTime,
        endTime: ws.endTime,
        hours: ws.hours,
        note: ws.note !== undefined ? ws.note : isSingle ? log.note : undefined,
        progressType: ws.progressType ?? (isSingle ? log.progressType : 'progress'),
        restSessions,
        totalRestMinutes,
        isEstimated: false,
      };
    });
  }

  // Fallback for logs recorded before explicit workSessions tracking
  if (
    log.progressType !== 'rest' &&
    typeof log.hours === 'number' &&
    !isNaN(log.hours) &&
    log.hours > 0 &&
    log.createdAt
  ) {
    const created = new Date(log.createdAt);
    if (!isNaN(created.getTime())) {
      const clampedHours = Math.min(12, log.hours);
      const startDate = new Date(created.getTime() - clampedHours * 3600_000);
      const totalRestMinutes = allLogRests.reduce((s, r) => s + r.durationMinutes, 0);
      return [
        {
          id: `est-${log.id}`,
          startTime: formatTimeHHMM(startDate),
          endTime: formatTimeHHMM(created),
          hours: round1(log.hours),
          note: log.note,
          progressType: log.progressType,
          restSessions: allLogRests,
          totalRestMinutes,
          isEstimated: true,
        },
      ];
    }
  }

  return [];
}

function getMinuteSlices(startMin: number, endMin: number): Array<[number, number]> {
  if (startMin === endMin) {
    return [];
  }
  if (endMin > startMin) {
    return [[startMin, endMin]];
  }
  // Crosses midnight (e.g. 23:30 -> 00:30)
  return [
    [startMin, 1440],
    [0, endMin],
  ];
}

function distributeValueAcrossHours(
  startTime: string,
  endTime: string,
  totalValue: number,
  onHourWeight: (hour: number, value: number, isStartHour: boolean) => void
) {
  if (totalValue <= 0) return;
  const startMin = parseHHMMToMinutes(startTime);
  const endMin = parseHHMMToMinutes(endTime);
  const slices = getMinuteSlices(startMin, endMin);
  const startHour = Math.floor(startMin / 60) % 24;

  if (slices.length === 0) {
    onHourWeight(startHour, totalValue, true);
    return;
  }

  const overlaps = new Array<number>(24).fill(0);
  let totalOverlapMinutes = 0;

  slices.forEach(([s, e]) => {
    for (let h = 0; h < 24; h++) {
      const hStart = h * 60;
      const hEnd = (h + 1) * 60;
      const overlap = Math.max(0, Math.min(e, hEnd) - Math.max(s, hStart));
      if (overlap > 0) {
        overlaps[h] += overlap;
        totalOverlapMinutes += overlap;
      }
    }
  });

  if (totalOverlapMinutes <= 0) {
    onHourWeight(startHour, totalValue, true);
    return;
  }

  let markedPeak = false;
  for (let h = 0; h < 24; h++) {
    if (overlaps[h] > 0) {
      const share = (overlaps[h] / totalOverlapMinutes) * totalValue;
      // Count session occurrence in the hour with largest overlap (or startHour)
      const isMainHour = h === startHour || (!markedPeak && overlaps[h] === Math.max(...overlaps));
      if (isMainHour) markedPeak = true;
      onHourWeight(h, share, isMainHour);
    }
  }
}

export function computeHourlyDistribution(logs: DailyLog[]): HourlyDistributionResult {
  const hours: HourlyBucket[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    label: `${pad2(h)}:00`,
    shortLabel: pad2(h),
    workHours: 0,
    restMinutes: 0,
    workSessionCount: 0,
    restSessionCount: 0,
  }));

  let totalRestCount = 0;
  let totalRestMinutes = 0;
  let totalWorkHours = 0;

  logs.forEach((log) => {
    const intervals = extractLogWorkIntervals(log);
    intervals.forEach((interval) => {
      totalWorkHours += interval.hours;
      distributeValueAcrossHours(
        interval.startTime,
        interval.endTime,
        interval.hours,
        (h, val, isMain) => {
          hours[h].workHours += val;
          if (isMain) hours[h].workSessionCount += 1;
        }
      );
    });

    if (Array.isArray(log.restSessions) && log.restSessions.length > 0) {
      log.restSessions.forEach((rs) => {
        totalRestCount += 1;
        totalRestMinutes += rs.durationMinutes;
        distributeValueAcrossHours(
          rs.startTime,
          rs.endTime,
          rs.durationMinutes,
          (h, val, isMain) => {
            hours[h].restMinutes += val;
            if (isMain) hours[h].restSessionCount += 1;
          }
        );
      });
    } else if (typeof log.totalRestMinutes === 'number' && log.totalRestMinutes > 0) {
      // Edge fallback if totalRestMinutes exists without restSessions array
      totalRestCount += 1;
      totalRestMinutes += log.totalRestMinutes;
      const created = new Date(log.createdAt);
      const h = !isNaN(created.getTime()) ? created.getHours() : 12;
      hours[h].restMinutes += log.totalRestMinutes;
      hours[h].restSessionCount += 1;
    }
  });

  hours.forEach((b) => {
    b.workHours = round2(b.workHours);
    b.restMinutes = Math.round(b.restMinutes);
  });

  const roundedTotalWork = round1(totalWorkHours);

  const periods: PeriodBucketSummary[] = TIME_PERIOD_BUCKETS.map((meta) => {
    let wHours = 0;
    let rMins = 0;
    let wCount = 0;
    let rCount = 0;
    for (let h = meta.startHour; h < meta.endHour; h++) {
      wHours += hours[h].workHours;
      rMins += hours[h].restMinutes;
      wCount += hours[h].workSessionCount;
      rCount += hours[h].restSessionCount;
    }
    wHours = round1(wHours);
    rMins = Math.round(rMins);
    return {
      ...meta,
      workHours: wHours,
      restMinutes: rMins,
      workSharePct: totalWorkHours > 0 ? Math.min(100, (wHours / totalWorkHours) * 100) : 0,
      workSessionCount: wCount,
      restSessionCount: rCount,
    };
  });

  const activeHours = hours.filter((h) => h.workHours > 0 || h.restMinutes > 0);
  const peakHour =
    activeHours.length > 0
      ? [...activeHours].sort((a, b) => {
          if (b.workHours !== a.workHours) return b.workHours - a.workHours;
          return b.restMinutes - a.restMinutes;
        })[0]
      : null;

  const activePeriods = periods.filter((p) => p.workHours > 0 || p.restMinutes > 0);
  const peakPeriod =
    activePeriods.length > 0
      ? [...activePeriods].sort((a, b) => {
          if (b.workHours !== a.workHours) return b.workHours - a.workHours;
          return b.restMinutes - a.restMinutes;
        })[0]
      : null;

  const maxWorkHoursInHour = Math.max(...hours.map((h) => h.workHours), 0.1);
  const maxRestMinutesInHour = Math.max(...hours.map((h) => h.restMinutes), 1);

  return {
    hours,
    periods,
    totalWorkHours: roundedTotalWork,
    totalRestMinutes: Math.round(totalRestMinutes),
    totalRestCount,
    peakHour,
    peakPeriod,
    maxWorkHoursInHour,
    maxRestMinutesInHour,
  };
}

export function computeTaskTimeAndRestProfile(logs: DailyLog[]): TaskTimeAndRestProfile {
  const dist = computeHourlyDistribution(logs);
  const frequentPeriods = dist.periods
    .filter((p) => p.workHours > 0 || p.workSessionCount > 0)
    .sort((a, b) => {
      if (b.workHours !== a.workHours) return b.workHours - a.workHours;
      return b.workSessionCount - a.workSessionCount;
    });

  // Find peak 2-hour sliding window
  let bestWindowStart = -1;
  let bestWindowHours = 0;
  for (let h = 0; h < 24; h++) {
    const nextH = (h + 1) % 24;
    const sum = dist.hours[h].workHours + dist.hours[nextH].workHours;
    if (sum > bestWindowHours) {
      bestWindowHours = sum;
      bestWindowStart = h;
    }
  }
  const peakWindowLabel =
    bestWindowStart >= 0 && bestWindowHours > 0
      ? `${pad2(bestWindowStart)}:00 - ${pad2((bestWindowStart + 2) % 24)}:00`
      : null;

  const totalWorkSessions = logs.reduce(
    (sum, l) => sum + extractLogWorkIntervals(l).length,
    0
  );

  const recentRestSessions: RestSessionRecord[] = [];
  let eligibleWorkLogs = 0;
  let logsWithRest = 0;

  logs.forEach((log) => {
    const hasLongWork =
      log.progressType !== 'rest' && typeof log.hours === 'number' && log.hours > 0.3;
    if (hasLongWork) {
      eligibleWorkLogs += 1;
      if (
        (Array.isArray(log.restSessions) && log.restSessions.length > 0) ||
        (typeof log.totalRestMinutes === 'number' && log.totalRestMinutes > 0)
      ) {
        logsWithRest += 1;
      }
    }
    if (Array.isArray(log.restSessions)) {
      log.restSessions.forEach((rs) => {
        recentRestSessions.push({
          ...rs,
          date: log.date,
        });
      });
    }
  });

  recentRestSessions.sort((a, b) => {
    const dateCmp = b.date.localeCompare(a.date);
    if (dateCmp !== 0) return dateCmp;
    return b.startTime.localeCompare(a.startTime);
  });

  const avgRestMinutes =
    dist.totalRestCount > 0 ? Math.round(dist.totalRestMinutes / dist.totalRestCount) : 0;
  const restRatePct =
    eligibleWorkLogs > 0 ? Math.round((logsWithRest / eligibleWorkLogs) * 100) : 0;

  return {
    frequentPeriods,
    peakWindowLabel,
    totalWorkSessions,
    totalRestMinutes: dist.totalRestMinutes,
    totalRestCount: dist.totalRestCount,
    avgRestMinutes,
    restRatePct,
    recentRestSessions,
  };
}

/**
 * Scores a task's historical activity affinity for the given wall-clock hour/period
 * so active tasks normally worked on around this time of day can be prioritized.
 */
export function computeTaskTimeSlotAffinity(
  logs: DailyLog[],
  now: Date = new Date()
): TaskTimeSlotAffinity {
  const currentHour = now.getHours();
  const currentBucket =
    TIME_PERIOD_BUCKETS.find((b) => currentHour >= b.startHour && currentHour < b.endHour) ??
    TIME_PERIOD_BUCKETS[0];

  const hourActivity = new Array<number>(24).fill(0);
  const hourRawHours = new Array<number>(24).fill(0);
  const hourSessionCounts = new Array<number>(24).fill(0);
  const nowMs = now.getTime();

  logs.forEach((log) => {
    if (log.progressType === 'rest') return;

    let recencyMultiplier = 1.0;
    const dateParts = log.date.split('-').map(Number);
    if (dateParts.length === 3 && !dateParts.some(isNaN)) {
      const logMs = new Date(dateParts[0], dateParts[1] - 1, dateParts[2], 12, 0, 0).getTime();
      const ageDays = Math.max(0, (nowMs - logMs) / 86_400_000);
      if (ageDays <= 14) recencyMultiplier = 1.2;
    }

    const intervals = extractLogWorkIntervals(log);
    if (intervals.length > 0) {
      intervals.forEach((iv) => {
        const effHours =
          typeof iv.hours === 'number' && !isNaN(iv.hours) && iv.hours > 0 ? iv.hours : 0;
        const sessionWeight = (1.0 + Math.min(effHours, 4) * 0.5) * recencyMultiplier;
        distributeValueAcrossHours(iv.startTime, iv.endTime, sessionWeight, (h, val, isMain) => {
          hourActivity[h] += val;
          if (isMain) hourSessionCounts[h] += 1;
        });
        if (effHours > 0) {
          distributeValueAcrossHours(iv.startTime, iv.endTime, effHours, (h, val) => {
            hourRawHours[h] += val;
          });
        }
      });
    } else if (log.createdAt) {
      const created = new Date(log.createdAt);
      if (!isNaN(created.getTime())) {
        const h = created.getHours();
        const effHours =
          typeof log.hours === 'number' && !isNaN(log.hours) && log.hours > 0 ? log.hours : 0;
        const sessionWeight = (1.0 + Math.min(effHours, 4) * 0.5) * recencyMultiplier;
        hourActivity[h] += sessionWeight;
        hourSessionCounts[h] += 1;
        hourRawHours[h] += effHours;
      }
    }
  });

  const totalActivity = hourActivity.reduce((s, v) => s + v, 0);
  if (totalActivity <= 0) {
    return {
      score: 0,
      isCurrentPeriodMatch: false,
      currentPeriodHours: 0,
      currentPeriodSessions: 0,
      matchedPeriodLabel: null,
      topPeriodLabel: null,
      topPeriodIcon: null,
    };
  }

  let hourWindowScore = 0;
  for (let h = 0; h < 24; h++) {
    if (hourActivity[h] <= 0) continue;
    const rawDist = Math.abs(h - currentHour);
    const dist = Math.min(rawDist, 24 - rawDist);
    if (dist === 0) {
      hourWindowScore += hourActivity[h];
    } else if (dist === 1) {
      hourWindowScore += hourActivity[h] * 0.7;
    } else if (dist === 2) {
      hourWindowScore += hourActivity[h] * 0.35;
    }
  }

  let periodScore = 0;
  let currentPeriodHours = 0;
  let currentPeriodSessions = 0;
  for (let h = currentBucket.startHour; h < currentBucket.endHour; h++) {
    periodScore += hourActivity[h];
    currentPeriodHours += hourRawHours[h];
    currentPeriodSessions += hourSessionCounts[h];
  }

  const periodShare = periodScore / totalActivity;
  const rawScore = (hourWindowScore * 1.6 + periodScore) * (0.65 + 0.35 * periodShare);
  const score = round2(rawScore);

  let topBucket: PeriodBucketMeta | null = null;
  let topBucketScore = 0;
  TIME_PERIOD_BUCKETS.forEach((b) => {
    let bScore = 0;
    for (let h = b.startHour; h < b.endHour; h++) {
      bScore += hourActivity[h];
    }
    if (bScore > topBucketScore) {
      topBucketScore = bScore;
      topBucket = b;
    }
  });

  const resolvedTop = topBucket as PeriodBucketMeta | null;

  return {
    score,
    isCurrentPeriodMatch: score > 0,
    currentPeriodHours: round1(currentPeriodHours),
    currentPeriodSessions,
    matchedPeriodLabel: score > 0 ? currentBucket.label : null,
    topPeriodLabel: resolvedTop ? resolvedTop.label : null,
    topPeriodIcon: resolvedTop ? resolvedTop.icon : null,
  };
}
