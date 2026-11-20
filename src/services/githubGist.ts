import { TaskItem, DailyLog, ProgressType, WorkSession, RestSession } from '../types';

export const GIST_DATA_FILENAME = 'media-tracker-data.json';
export const DRIVE_DATA_FILENAME = GIST_DATA_FILENAME;

export interface DriveSyncPayload {
  version: number;
  appName: string;
  updatedAt: string;
  tasks: TaskItem[];
  logs: DailyLog[];
  ganttGroupOrder?: string[];
}

export interface GistUser {
  uid: string;
  login: string;
  displayName: string;
  photoURL: string | null;
  htmlUrl: string;
}

export interface GistFileInfo {
  id: string;
  description: string;
  updatedAt: string;
  htmlUrl: string;
  payload: DriveSyncPayload | null;
}

export interface SyncConflictItem {
  id: string;
  kind: 'task' | 'log';
  title: string;
  detail: string;
}

export interface MergeAnalysisResult {
  status: 'identical' | 'local-ahead' | 'cloud-ahead' | 'auto-merged' | 'conflict';
  mergedPayload: DriveSyncPayload;
  conflicts: SyncConflictItem[];
  summary: {
    addedTasksFromCloud: number;
    updatedTasksFromCloud: number;
    addedLogsFromCloud: number;
    mergedLogsCount: number;
  };
}

/**
 * Builds the on-disk / on-cloud sync payload. Shared by GitHub Gist,
 * local folder sync and JSON export so every copy has the same structure.
 */
export function buildSyncPayload(data: {
  tasks: TaskItem[];
  logs: DailyLog[];
  ganttGroupOrder?: string[];
}): DriveSyncPayload {
  return {
    version: 1,
    appName: '个人数字媒体与任务时序跟踪系统',
    updatedAt: new Date().toISOString(),
    tasks: data.tasks,
    logs: data.logs,
    ganttGroupOrder: data.ganttGroupOrder,
  };
}

/**
 * Fast deterministic hash for comparing task/log/order content
 * to detect unsynced local modifications compared to cloud state.
 */
export function computeContentHash(data: {
  tasks: TaskItem[];
  logs: DailyLog[];
  ganttGroupOrder?: string[];
}): string {
  const str = JSON.stringify({
    tasks: data.tasks,
    logs: data.logs,
    ganttGroupOrder: data.ganttGroupOrder ?? [],
  });
  let h1 = 0xdeadbeef;
  let h2 = 0x41c64e6d;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/* ───────────── GitHub Gist REST API ───────────── */

const GITHUB_API_BASE = 'https://api.github.com';

function buildGitHubHeaders(token: string, extra?: Record<string, string>): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token.trim()}`,
    'X-GitHub-Api-Version': '2022-11-28',
    ...extra,
  };
}

async function parseGitHubError(res: Response, fallbackPrefix: string): Promise<string> {
  const errText = await res.text().catch(() => '');
  if (res.status === 401) {
    return 'GitHub Token 无效或已失效 (401)，请检查 Token 是否正确';
  }
  if (res.status === 403) {
    return `GitHub API 权限不足或触发速率限制 (403)：请确认 Token 已勾选 gist 权限。${errText ? `详情: ${errText}` : ''}`;
  }
  if (res.status === 404) {
    return `未找到目标 Gist 或文件不存在 (404)。${errText ? `详情: ${errText}` : ''}`;
  }
  return `${fallbackPrefix} (${res.status}): ${errText || res.statusText}`;
}

export async function verifyGistToken(token: string): Promise<GistUser> {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error('请输入 GitHub Personal Access Token');
  }

  const res = await fetch(`${GITHUB_API_BASE}/user`, {
    method: 'GET',
    cache: 'no-store',
    headers: buildGitHubHeaders(trimmed),
  });

  if (!res.ok) {
    throw new Error(await parseGitHubError(res, '验证 GitHub Token 失败'));
  }

  const data = await res.json();
  return {
    uid: String(data.id ?? data.login ?? ''),
    login: String(data.login ?? ''),
    displayName: String(data.name || data.login || 'GitHub 用户'),
    photoURL: typeof data.avatar_url === 'string' ? data.avatar_url : null,
    htmlUrl: typeof data.html_url === 'string' ? data.html_url : '',
  };
}

function isValidPayload(parsed: any): parsed is DriveSyncPayload {
  return !!parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.logs);
}

export async function parseGistResponse(gistJson: any, _token: string): Promise<GistFileInfo> {
  const file = gistJson?.files?.[GIST_DATA_FILENAME];
  let payload: DriveSyncPayload | null = null;

  if (file) {
    let rawText: string | null = null;
    if (file.truncated && typeof file.raw_url === 'string') {
      const rawRes = await fetch(file.raw_url, { cache: 'no-store' });
      if (!rawRes.ok) {
        throw new Error(`读取 Gist 完整文件内容失败 (${rawRes.status})`);
      }
      rawText = await rawRes.text();
    } else if (typeof file.content === 'string') {
      rawText = file.content;
    }

    if (rawText !== null && rawText.trim().length > 0) {
      try {
        const parsed = JSON.parse(rawText);
        if (isValidPayload(parsed)) {
          payload = parsed;
        }
      } catch (err) {
        console.error('Failed to parse JSON from GitHub Gist:', err);
        payload = null;
      }
    }
  }

  return {
    id: String(gistJson?.id ?? ''),
    description: String(gistJson?.description ?? ''),
    updatedAt: String(gistJson?.updated_at ?? ''),
    htmlUrl: String(gistJson?.html_url ?? ''),
    payload,
  };
}

export async function getGistById(token: string, gistId: string): Promise<GistFileInfo> {
  const res = await fetch(`${GITHUB_API_BASE}/gists/${encodeURIComponent(gistId.trim())}`, {
    method: 'GET',
    cache: 'no-store',
    headers: buildGitHubHeaders(token),
  });

  if (!res.ok) {
    throw new Error(await parseGitHubError(res, '读取 GitHub Gist 失败'));
  }

  const gistJson = await res.json();
  return parseGistResponse(gistJson, token);
}

export async function findExistingTrackerGist(token: string): Promise<GistFileInfo | null> {
  const res = await fetch(`${GITHUB_API_BASE}/gists?per_page=100`, {
    method: 'GET',
    cache: 'no-store',
    headers: buildGitHubHeaders(token),
  });

  if (!res.ok) {
    throw new Error(await parseGitHubError(res, '查询 GitHub Gist 列表失败'));
  }

  const gists = await res.json();
  if (!Array.isArray(gists) || gists.length === 0) return null;

  const matching = gists
    .filter((g: any) => Boolean(g?.files && Object.prototype.hasOwnProperty.call(g.files, GIST_DATA_FILENAME)))
    .sort((a: any, b: any) => {
      const ta = a?.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b?.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta;
    });

  if (matching.length === 0) return null;
  return getGistById(token, String(matching[0].id));
}

export async function createTrackerGist(
  token: string,
  data: { tasks: TaskItem[]; logs: DailyLog[]; ganttGroupOrder?: string[] }
): Promise<GistFileInfo> {
  const payload = buildSyncPayload(data);
  const res = await fetch(`${GITHUB_API_BASE}/gists`, {
    method: 'POST',
    cache: 'no-store',
    headers: buildGitHubHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      description: '个人数字媒体与任务时序跟踪系统 - 自动同步数据 (请勿手动删除)',
      public: false,
      files: {
        [GIST_DATA_FILENAME]: {
          content: JSON.stringify(payload, null, 2),
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(await parseGitHubError(res, '创建 GitHub Gist 失败'));
  }

  const gistJson = await res.json();
  return parseGistResponse(gistJson, token);
}

export async function updateTrackerGist(
  token: string,
  gistId: string,
  data: { tasks: TaskItem[]; logs: DailyLog[]; ganttGroupOrder?: string[] }
): Promise<GistFileInfo> {
  const payload = buildSyncPayload(data);
  const res = await fetch(`${GITHUB_API_BASE}/gists/${encodeURIComponent(gistId.trim())}`, {
    method: 'PATCH',
    cache: 'no-store',
    headers: buildGitHubHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      files: {
        [GIST_DATA_FILENAME]: {
          content: JSON.stringify(payload, null, 2),
        },
      },
    }),
  });

  if (!res.ok) {
    throw new Error(await parseGitHubError(res, '更新 GitHub Gist 失败'));
  }

  const gistJson = await res.json();
  return parseGistResponse(gistJson, token);
}

/* ───────────── Three-Way Smart Merge & Conflict Detection ───────────── */

function normalizeSessionsForMerge(log: DailyLog): WorkSession[] {
  const flatRests = Array.isArray(log.restSessions) ? log.restSessions : [];
  if (Array.isArray(log.workSessions) && log.workSessions.length > 0) {
    const ownedElsewhere = new Set<string>();
    log.workSessions.forEach((ws) => {
      (ws.restSessions || []).forEach((rs) => ownedElsewhere.add(rs.id));
    });
    flatRests.forEach((rs) => {
      if (rs.sessionId) ownedElsewhere.add(rs.id);
    });

    const isSingle = log.workSessions.length === 1;
    return log.workSessions.map((ws, idx) => {
      const merged = new Map<string, RestSession>();
      (ws.restSessions || []).forEach((rs) => merged.set(rs.id, { ...rs, sessionId: ws.id }));
      flatRests.forEach((rs) => {
        if (rs.sessionId === ws.id) {
          merged.set(rs.id, { ...rs, sessionId: ws.id });
        } else if (idx === 0 && !rs.sessionId && !ownedElsewhere.has(rs.id)) {
          merged.set(rs.id, { ...rs, sessionId: ws.id });
        }
      });
      const restSessions = Array.from(merged.values());
      return {
        ...ws,
        note: ws.note !== undefined ? ws.note : isSingle ? log.note : undefined,
        progressType: ws.progressType ?? (isSingle ? log.progressType : 'progress'),
        isBackfill: ws.isBackfill ?? (isSingle ? log.isBackfill : undefined),
        restSessions: restSessions.length > 0 ? restSessions : undefined,
        totalRestMinutes: restSessions.reduce((s, r) => s + r.durationMinutes, 0) || undefined,
      };
    });
  }

  const prevHours =
    typeof log.hours === 'number' && !isNaN(log.hours) ? Math.round(log.hours * 100) / 100 : 0;
  const wsId = 'ws-init-' + log.id;
  const attachedRests = flatRests.map((rs) => ({ ...rs, sessionId: wsId }));
  const totalRestMinutes = attachedRests.reduce((s, r) => s + r.durationMinutes, 0);

  return [
    {
      id: wsId,
      startTime: '00:00',
      endTime: '00:00',
      hours: prevHours,
      note: log.note,
      progressType: log.progressType,
      isBackfill: log.isBackfill || undefined,
      restSessions: attachedRests.length > 0 ? attachedRests : undefined,
      totalRestMinutes: totalRestMinutes > 0 ? totalRestMinutes : undefined,
      recordedAt: log.createdAt || new Date().toISOString(),
    },
  ];
}

function wsSignature(ws: WorkSession): string {
  const rests = (ws.restSessions || [])
    .map((r) => `${r.id}|${r.startTime}|${r.endTime}|${r.durationMinutes}`)
    .sort();
  return JSON.stringify({
    id: ws.id,
    startTime: ws.startTime,
    endTime: ws.endTime,
    hours: ws.hours ?? 0,
    note: ws.note?.trim() ?? '',
    progressType: ws.progressType ?? 'progress',
    isBackfill: Boolean(ws.isBackfill),
    totalRestMinutes: ws.totalRestMinutes ?? 0,
    rests,
  });
}

function logSignature(log: DailyLog): string {
  const sessions = normalizeSessionsForMerge(log).map(wsSignature);
  return JSON.stringify({
    progressType: log.progressType,
    hours: log.hours ?? 0,
    note: log.note?.trim() ?? '',
    isBackfill: Boolean(log.isBackfill),
    totalRestMinutes: log.totalRestMinutes ?? 0,
    sessions,
  });
}

function aggregateMergedLog(
  baseMeta: { id: string; taskId: string; date: string; createdAt: string },
  sessions: WorkSession[],
  preserveZeroHours: boolean
): DailyLog {
  const sortedSessions = [...sessions].sort((a, b) =>
    (a.recordedAt || '').localeCompare(b.recordedAt || '')
  );
  const rawHoursSum = sortedSessions.reduce(
    (s, ws) => s + (typeof ws.hours === 'number' && !isNaN(ws.hours) ? ws.hours : 0),
    0
  );
  const roundedHours = Math.round(rawHoursSum * 10) / 10;
  const hasExplicitHours = sortedSessions.some(
    (ws) => typeof ws.hours === 'number' && !isNaN(ws.hours) && ws.hours > 0
  );
  const allBackfill = sortedSessions.length > 0 && sortedSessions.every((ws) => Boolean(ws.isBackfill));

  const noteParts = sortedSessions.map((ws) => ws.note?.trim()).filter(Boolean) as string[];
  const mergedNote = noteParts.length > 0 ? noteParts.join(' ｜ ') : undefined;

  let aggProgress: ProgressType = 'rest';
  if (sortedSessions.some((ws) => ws.progressType === 'completed')) {
    aggProgress = 'completed';
  } else if (sortedSessions.some((ws) => (ws.progressType ?? 'progress') === 'progress')) {
    aggProgress = 'progress';
  }

  const restMap = new Map<string, RestSession>();
  sortedSessions.forEach((ws) => {
    (ws.restSessions || []).forEach((rs) => restMap.set(rs.id, rs));
  });
  const allRests = Array.from(restMap.values());
  const totalRestMinutes = allRests.reduce((s, r) => s + r.durationMinutes, 0);

  return {
    id: baseMeta.id,
    taskId: baseMeta.taskId,
    date: baseMeta.date,
    progressType: aggProgress,
    hours: hasExplicitHours ? roundedHours : preserveZeroHours ? 0 : undefined,
    note: mergedNote,
    isBackfill: allBackfill ? true : undefined,
    workSessions: sortedSessions,
    restSessions: allRests.length > 0 ? allRests : undefined,
    totalRestMinutes: totalRestMinutes > 0 ? totalRestMinutes : undefined,
    createdAt: baseMeta.createdAt,
  };
}

function taskCoreEquals(a: TaskItem, b: TaskItem): boolean {
  return (
    a.title === b.title &&
    JSON.stringify(a.tags) === JSON.stringify(b.tags) &&
    a.status === b.status &&
    (a.startDate ?? null) === (b.startDate ?? null) &&
    (a.completedDate ?? null) === (b.completedDate ?? null)
  );
}

function mergeTaskOrders(baseOrder: string[] | undefined, localOrder: string[] | undefined, cloudOrder: string[] | undefined, localUpdatedAt: string, cloudUpdatedAt: string): string[] | undefined {
  const b = baseOrder ?? [];
  const l = localOrder ?? [];
  const c = cloudOrder ?? [];
  if (l.length === 0 && c.length === 0) return undefined;

  const bStr = JSON.stringify(b);
  const lStr = JSON.stringify(l);
  const cStr = JSON.stringify(c);
  if (lStr === cStr) return l;
  if (b.length > 0 && lStr === bStr) return c;
  if (b.length > 0 && cStr === bStr) return l;

  const primary = localUpdatedAt >= cloudUpdatedAt ? l : c;
  const secondary = localUpdatedAt >= cloudUpdatedAt ? c : l;
  const result = [...primary];
  const seen = new Set(primary);
  for (const item of secondary) {
    if (!seen.has(item)) {
      result.push(item);
      seen.add(item);
    }
  }
  return result;
}

export function mergeSyncPayloads(
  base: DriveSyncPayload | null,
  local: DriveSyncPayload,
  cloud: DriveSyncPayload
): MergeAnalysisResult {
  const localHash = computeContentHash(local);
  const cloudHash = computeContentHash(cloud);
  const baseHash = base ? computeContentHash(base) : null;

  const emptySummary = {
    addedTasksFromCloud: 0,
    updatedTasksFromCloud: 0,
    addedLogsFromCloud: 0,
    mergedLogsCount: 0,
  };

  if (localHash === cloudHash) {
    return {
      status: 'identical',
      mergedPayload: local,
      conflicts: [],
      summary: emptySummary,
    };
  }

  if (baseHash !== null) {
    if (localHash === baseHash && cloudHash !== baseHash) {
      return {
        status: 'cloud-ahead',
        mergedPayload: cloud,
        conflicts: [],
        summary: emptySummary,
      };
    }
    if (cloudHash === baseHash && localHash !== baseHash) {
      return {
        status: 'local-ahead',
        mergedPayload: local,
        conflicts: [],
        summary: emptySummary,
      };
    }
  } else {
    if (local.tasks.length === 0 && local.logs.length === 0 && (cloud.tasks.length > 0 || cloud.logs.length > 0)) {
      return {
        status: 'cloud-ahead',
        mergedPayload: cloud,
        conflicts: [],
        summary: emptySummary,
      };
    }
    if (cloud.tasks.length === 0 && cloud.logs.length === 0 && (local.tasks.length > 0 || local.logs.length > 0)) {
      return {
        status: 'local-ahead',
        mergedPayload: local,
        conflicts: [],
        summary: emptySummary,
      };
    }
  }

  const conflicts: SyncConflictItem[] = [];
  const summary = { ...emptySummary };

  const baseTaskMap = new Map<string, TaskItem>((base?.tasks ?? []).map((t) => [t.id, t]));
  const localTaskMap = new Map<string, TaskItem>(local.tasks.map((t) => [t.id, t]));
  const cloudTaskMap = new Map<string, TaskItem>(cloud.tasks.map((t) => [t.id, t]));

  const taskTitleLookup = (taskId: string): string =>
    localTaskMap.get(taskId)?.title ||
    cloudTaskMap.get(taskId)?.title ||
    baseTaskMap.get(taskId)?.title ||
    '未命名任务';

  const logKey = (l: DailyLog) => `${l.taskId}__${l.date}`;
  const baseLogMap = new Map<string, DailyLog>((base?.logs ?? []).map((l) => [logKey(l), l]));
  const localLogMap = new Map<string, DailyLog>(local.logs.map((l) => [logKey(l), l]));
  const cloudLogMap = new Map<string, DailyLog>(cloud.logs.map((l) => [logKey(l), l]));

  // Track whether each task had log modifications relative to base on local or cloud
  const localTaskLogsModified = new Set<string>();
  const cloudTaskLogsModified = new Set<string>();
  const allLogKeys = new Set<string>([
    ...baseLogMap.keys(),
    ...localLogMap.keys(),
    ...cloudLogMap.keys(),
  ]);

  for (const key of allLogKeys) {
    const bLog = baseLogMap.get(key);
    const lLog = localLogMap.get(key);
    const cLog = cloudLogMap.get(key);
    const taskId = lLog?.taskId || cLog?.taskId || bLog?.taskId || '';
    if (!taskId) continue;
    if ((lLog && !bLog) || (lLog && bLog && logSignature(lLog) !== logSignature(bLog))) {
      localTaskLogsModified.add(taskId);
    }
    if ((cLog && !bLog) || (cLog && bLog && logSignature(cLog) !== logSignature(bLog))) {
      cloudTaskLogsModified.add(taskId);
    }
  }

  /* ── 1. Three-way merge DailyLogs ── */
  const mergedLogs: DailyLog[] = [];
  for (const key of allLogKeys) {
    const bLog = baseLogMap.get(key);
    const lLog = localLogMap.get(key);
    const cLog = cloudLogMap.get(key);

    if (lLog && cLog) {
      const lSig = logSignature(lLog);
      const cSig = logSignature(cLog);
      const bSig = bLog ? logSignature(bLog) : null;

      if (lSig === cSig) {
        mergedLogs.push(lLog);
      } else if (bSig !== null && lSig === bSig) {
        mergedLogs.push(cLog);
        summary.addedLogsFromCloud += 1;
      } else if (bSig !== null && cSig === bSig) {
        mergedLogs.push(lLog);
      } else {
        // Both modified (or no base snapshot)
        const bSessions = bLog ? normalizeSessionsForMerge(bLog) : [];
        const lSessions = normalizeSessionsForMerge(lLog);
        const cSessions = normalizeSessionsForMerge(cLog);

        const bWsMap = new Map(bSessions.map((ws) => [ws.id, ws]));
        const lWsMap = new Map(lSessions.map((ws) => [ws.id, ws]));
        const cWsMap = new Map(cSessions.map((ws) => [ws.id, ws]));

        const allWsIds = new Set<string>([...bWsMap.keys(), ...lWsMap.keys(), ...cWsMap.keys()]);
        const mergedSessions: WorkSession[] = [];
        let hasSessionConflict = !bLog;
        let replacedBaseSessionOnBoth = false;

        for (const wsId of allWsIds) {
          const bWs = bWsMap.get(wsId);
          const lWs = lWsMap.get(wsId);
          const cWs = cWsMap.get(wsId);

          if (bWs) {
            const bWsSig = wsSignature(bWs);
            if (lWs && cWs) {
              const lWsSig = wsSignature(lWs);
              const cWsSig = wsSignature(cWs);
              if (lWsSig === cWsSig) {
                mergedSessions.push(lWs);
              } else if (lWsSig === bWsSig) {
                mergedSessions.push(cWs);
              } else if (cWsSig === bWsSig) {
                mergedSessions.push(lWs);
              } else {
                hasSessionConflict = true;
                mergedSessions.push((lWs.recordedAt || '') >= (cWs.recordedAt || '') ? lWs : cWs);
              }
            } else if (lWs && !cWs) {
              if (wsSignature(lWs) === bWsSig) {
                // Cloud deleted unmodified session -> omit
              } else {
                hasSessionConflict = true;
                mergedSessions.push(lWs);
              }
            } else if (cWs && !lWs) {
              if (wsSignature(cWs) === bWsSig) {
                // Local deleted unmodified session -> omit
              } else {
                hasSessionConflict = true;
                mergedSessions.push(cWs);
              }
            } else {
              // Deleted on both sides (or replaced by new sessions on both sides)
              replacedBaseSessionOnBoth = true;
            }
          } else {
            if (lWs && cWs) {
              if (wsSignature(lWs) === wsSignature(cWs)) {
                mergedSessions.push(lWs);
              } else {
                hasSessionConflict = true;
                mergedSessions.push((lWs.recordedAt || '') >= (cWs.recordedAt || '') ? lWs : cWs);
              }
            } else if (lWs) {
              mergedSessions.push(lWs);
            } else if (cWs) {
              mergedSessions.push(cWs);
            }
          }
        }

        if (replacedBaseSessionOnBoth && mergedSessions.length > 0) {
          // Both sides replaced the base session with new sessions
          hasSessionConflict = true;
        }

        if (mergedSessions.length > 0) {
          const preserveZero = lLog.hours === 0 || cLog.hours === 0;
          const winnerMeta = (lLog.createdAt || '') <= (cLog.createdAt || '') ? lLog : cLog;
          const mergedLog = aggregateMergedLog(
            {
              id: winnerMeta.id,
              taskId: winnerMeta.taskId,
              date: winnerMeta.date,
              createdAt: winnerMeta.createdAt,
            },
            mergedSessions,
            preserveZero
          );
          mergedLogs.push(mergedLog);
        }

        if (hasSessionConflict) {
          conflicts.push({
            id: key,
            kind: 'log',
            title: `${taskTitleLookup(lLog.taskId)} (${lLog.date})`,
            detail: !bLog
              ? '两端首次同步前均在该日存在不同打卡记录'
              : '两端同时覆盖修改了同一日打卡记录',
          });
        } else {
          summary.mergedLogsCount += 1;
        }
      }
    } else if (lLog && !cLog) {
      if (!bLog) {
        mergedLogs.push(lLog);
      } else if (logSignature(lLog) === logSignature(bLog)) {
        // Cloud deleted, local unchanged -> delete
      } else {
        mergedLogs.push(lLog);
        conflicts.push({
          id: key,
          kind: 'log',
          title: `${taskTitleLookup(lLog.taskId)} (${lLog.date})`,
          detail: '云端已删除该日打卡，但本地有修改',
        });
      }
    } else if (cLog && !lLog) {
      if (!bLog) {
        mergedLogs.push(cLog);
        summary.addedLogsFromCloud += 1;
      } else if (logSignature(cLog) === logSignature(bLog)) {
        // Local deleted, cloud unchanged -> delete
      } else {
        mergedLogs.push(cLog);
        conflicts.push({
          id: key,
          kind: 'log',
          title: `${taskTitleLookup(cLog.taskId)} (${cLog.date})`,
          detail: '本地已删除该日打卡，但云端有修改',
        });
      }
    }
  }

  /* ── 2. Three-way merge Tasks ── */
  const allTaskIds: string[] = [];
  const seenTaskIds = new Set<string>();
  for (const t of local.tasks) {
    if (!seenTaskIds.has(t.id)) {
      seenTaskIds.add(t.id);
      allTaskIds.push(t.id);
    }
  }
  for (const t of cloud.tasks) {
    if (!seenTaskIds.has(t.id)) {
      seenTaskIds.add(t.id);
      allTaskIds.push(t.id);
    }
  }
  for (const t of base?.tasks ?? []) {
    if (!seenTaskIds.has(t.id)) {
      seenTaskIds.add(t.id);
      allTaskIds.push(t.id);
    }
  }

  const mergedTasks: TaskItem[] = [];
  for (const taskId of allTaskIds) {
    const bTask = baseTaskMap.get(taskId);
    const lTask = localTaskMap.get(taskId);
    const cTask = cloudTaskMap.get(taskId);

    if (lTask && cTask) {
      if (taskCoreEquals(lTask, cTask)) {
        const newer = lTask.updatedAt >= cTask.updatedAt ? lTask : cTask;
        mergedTasks.push({
          ...lTask,
          order: newer.order,
          updatedAt: newer.updatedAt,
        });
      } else if (bTask && taskCoreEquals(lTask, bTask)) {
        mergedTasks.push(cTask);
        summary.updatedTasksFromCloud += 1;
      } else if (bTask && taskCoreEquals(cTask, bTask)) {
        mergedTasks.push(lTask);
      } else {
        // Per-field 3-way merge
        const conflictFields: string[] = [];
        const localNewer = lTask.updatedAt >= cTask.updatedAt;

        let title = lTask.title;
        if (lTask.title !== cTask.title) {
          if (bTask && lTask.title === bTask.title) {
            title = cTask.title;
          } else if (bTask && cTask.title === bTask.title) {
            title = lTask.title;
          } else {
            title = localNewer ? lTask.title : cTask.title;
            conflictFields.push('标题');
          }
        }

        let tags = lTask.tags;
        const lTagsStr = JSON.stringify(lTask.tags);
        const cTagsStr = JSON.stringify(cTask.tags);
        const bTagsStr = bTask ? JSON.stringify(bTask.tags) : null;
        if (lTagsStr !== cTagsStr) {
          if (bTagsStr !== null && lTagsStr === bTagsStr) {
            tags = cTask.tags;
          } else if (bTagsStr !== null && cTagsStr === bTagsStr) {
            tags = lTask.tags;
          } else {
            tags = Array.from(new Set([...lTask.tags, ...cTask.tags]));
            conflictFields.push('标签');
          }
        }

        let status = lTask.status;
        if (lTask.status !== cTask.status) {
          if (bTask && lTask.status === bTask.status) {
            status = cTask.status;
          } else if (bTask && cTask.status === bTask.status) {
            status = lTask.status;
          } else {
            status = localNewer ? lTask.status : cTask.status;
            conflictFields.push('状态');
          }
        }

        let dateConflicted = false;
        let startDate = lTask.startDate ?? null;
        const lStart = lTask.startDate ?? null;
        const cStart = cTask.startDate ?? null;
        const bStart = bTask ? (bTask.startDate ?? null) : undefined;
        if (lStart !== cStart) {
          if (bStart !== undefined && lStart === bStart) {
            startDate = cStart;
          } else if (bStart !== undefined && cStart === bStart) {
            startDate = lStart;
          } else {
            startDate = localNewer ? lStart : cStart;
            dateConflicted = true;
          }
        }

        let completedDate = lTask.completedDate ?? null;
        const lComp = lTask.completedDate ?? null;
        const cComp = cTask.completedDate ?? null;
        const bComp = bTask ? (bTask.completedDate ?? null) : undefined;
        if (lComp !== cComp) {
          if (bComp !== undefined && lComp === bComp) {
            completedDate = cComp;
          } else if (bComp !== undefined && cComp === bComp) {
            completedDate = lComp;
          } else {
            completedDate = localNewer ? lComp : cComp;
            dateConflicted = true;
          }
        }
        if (dateConflicted) {
          conflictFields.push('起止日期');
        }

        let order = lTask.order;
        if (lTask.order !== cTask.order) {
          if (bTask && lTask.order === bTask.order) {
            order = cTask.order;
          } else if (bTask && cTask.order === bTask.order) {
            order = lTask.order;
          } else {
            order = localNewer ? lTask.order : cTask.order;
          }
        }

        mergedTasks.push({
          ...lTask,
          title,
          tags,
          status,
          startDate,
          completedDate,
          order,
          createdAt: lTask.createdAt <= cTask.createdAt ? lTask.createdAt : cTask.createdAt,
          updatedAt: localNewer ? lTask.updatedAt : cTask.updatedAt,
        });

        if (conflictFields.length > 0) {
          conflicts.push({
            id: taskId,
            kind: 'task',
            title: lTask.title,
            detail: `两端同时修改了：${conflictFields.join('、')}`,
          });
        } else {
          summary.updatedTasksFromCloud += 1;
        }
      }
    } else if (lTask && !cTask) {
      if (!bTask) {
        mergedTasks.push(lTask);
      } else if (taskCoreEquals(lTask, bTask) && !localTaskLogsModified.has(taskId)) {
        // Deleted in cloud, untouched locally -> delete
      } else {
        mergedTasks.push(lTask);
        conflicts.push({
          id: taskId,
          kind: 'task',
          title: lTask.title,
          detail: `任务「${lTask.title}」在云端被删除，但本地有修改或新打卡`,
        });
      }
    } else if (cTask && !lTask) {
      if (!bTask) {
        mergedTasks.push(cTask);
        summary.addedTasksFromCloud += 1;
      } else if (taskCoreEquals(cTask, bTask) && !cloudTaskLogsModified.has(taskId)) {
        // Deleted locally, untouched in cloud -> delete
      } else {
        mergedTasks.push(cTask);
        conflicts.push({
          id: taskId,
          kind: 'task',
          title: cTask.title,
          detail: `任务「${cTask.title}」在本地被删除，但云端有修改或新打卡`,
        });
      }
    }
  }

  /* ── 3. Filter orphan logs & recalculate task metrics ── */
  const survivingTaskIds = new Set(mergedTasks.map((t) => t.id));
  const finalLogs = mergedLogs.filter((l) => survivingTaskIds.has(l.taskId));

  const logsByTaskId = new Map<string, DailyLog[]>();
  for (const l of finalLogs) {
    const arr = logsByTaskId.get(l.taskId);
    if (arr) arr.push(l);
    else logsByTaskId.set(l.taskId, [l]);
  }

  const anyHistoricalLogsTaskIds = new Set<string>([
    ...(base?.logs ?? []).map((l) => l.taskId),
    ...local.logs.map((l) => l.taskId),
    ...cloud.logs.map((l) => l.taskId),
  ]);

  const finalTasks = mergedTasks.map((task) => {
    const taskLogs = logsByTaskId.get(task.id) ?? [];
    let nextStatus = task.status;
    let nextCompletedDate = task.completedDate;

    const completedLogs = taskLogs.filter((l) => l.progressType === 'completed');
    if (completedLogs.length > 0 && nextStatus !== 'done') {
      nextStatus = 'done';
      if (!nextCompletedDate) {
        const latestCompletedDate = completedLogs
          .map((l) => l.date)
          .sort()
          .pop();
        nextCompletedDate = latestCompletedDate ?? null;
      }
    }

    if (taskLogs.length === 0 && !anyHistoricalLogsTaskIds.has(task.id)) {
      return {
        ...task,
        status: nextStatus,
        completedDate: nextCompletedDate,
      };
    }

    const totalHours =
      Math.round(
        taskLogs.reduce(
          (sum, l) => sum + (typeof l.hours === 'number' && !isNaN(l.hours) ? l.hours : 0),
          0
        ) * 10
      ) / 10;

    const totalRestMinutes = taskLogs.reduce((sum, l) => {
      if (typeof l.totalRestMinutes === 'number' && !isNaN(l.totalRestMinutes)) {
        return sum + l.totalRestMinutes;
      }
      if (Array.isArray(l.restSessions)) {
        return sum + l.restSessions.reduce((s, r) => s + r.durationMinutes, 0);
      }
      return sum;
    }, 0);

    return {
      ...task,
      status: nextStatus,
      completedDate: nextCompletedDate,
      totalHours,
      totalRestMinutes,
    };
  });

  const mergedOrder = mergeTaskOrders(
    base?.ganttGroupOrder,
    local.ganttGroupOrder,
    cloud.ganttGroupOrder,
    local.updatedAt,
    cloud.updatedAt
  );

  const mergedPayload = buildSyncPayload({
    tasks: finalTasks,
    logs: finalLogs,
    ganttGroupOrder: mergedOrder,
  });

  return {
    status: conflicts.length > 0 ? 'conflict' : 'auto-merged',
    mergedPayload,
    conflicts,
    summary,
  };
}
