import { TaskItem, DailyLog, ProgressType, WorkSession, RestSession } from '../types';

export const GIST_DATA_FILENAME = 'media-tracker-data.json';
export const SHARD_SUMMARY_FILENAME = '00-summary.md';
export const SHARD_META_FILENAME = 'meta.json';
export const SHARD_TASKS_FILENAME = 'tasks.json';

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
  shardCount?: number;
  isEncrypted?: boolean;
  needsShardMigration?: boolean;
  needsEncryptionMigration?: boolean;
}

export type GistErrorCode =
  | 'E2EE_PASSPHRASE_REQUIRED'
  | 'E2EE_WRONG_PASSPHRASE'
  | 'E2EE_UNSUPPORTED'
  | 'API_ERROR';

export class GistSyncError extends Error {
  code: GistErrorCode;

  constructor(message: string, code: GistErrorCode = 'API_ERROR') {
    super(message);
    this.name = 'GistSyncError';
    this.code = code;
  }
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
 * Formats an array of records with one compact JSON item per line
 * so large task/log lists remain valid JSON without inflating line count.
 */
function formatRecordArray(items: unknown[]): string {
  if (items.length === 0) return '[]';
  const lines = items.map((item) => `    ${JSON.stringify(item)}`);
  return `[\n${lines.join(',\n')}\n  ]`;
}

/**
 * Serializes a full DriveSyncPayload as standard JSON where each TaskItem
 * and DailyLog occupies a single line.
 */
export function formatCompactJsonPayload(payload: DriveSyncPayload): string {
  const fields: string[] = [
    `  "version": ${JSON.stringify(payload.version)}`,
    `  "appName": ${JSON.stringify(payload.appName)}`,
    `  "updatedAt": ${JSON.stringify(payload.updatedAt)}`,
    `  "tasks": ${formatRecordArray(payload.tasks)}`,
    `  "logs": ${formatRecordArray(payload.logs)}`,
  ];
  if (payload.ganttGroupOrder !== undefined) {
    fields.push(`  "ganttGroupOrder": ${JSON.stringify(payload.ganttGroupOrder)}`);
  }
  return `{\n${fields.join(',\n')}\n}`;
}

function sortLogsDeterministically(logs: DailyLog[]): DailyLog[] {
  return [...logs].sort(
    (a, b) =>
      (a.date || '').localeCompare(b.date || '') ||
      a.taskId.localeCompare(b.taskId) ||
      a.id.localeCompare(b.id)
  );
}

function quickStringHash(str: string): string {
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
    logs: sortLogsDeterministically(data.logs),
    ganttGroupOrder: data.ganttGroupOrder ?? [],
  });
  return quickStringHash(str);
}

/* ───────────── Optional End-to-End Encryption (Web Crypto PBKDF2 + AES-GCM) ───────────── */

const E2EE_ALGORITHM = 'PBKDF2-SHA256-AES256-GCM';
const E2EE_DEFAULT_ITERATIONS = 150_000;

interface EncryptedShardEnvelope {
  __e2ee: 1;
  alg: string;
  iter: number;
  salt: string;
  iv: string;
  ct: string;
}

function isEncryptedEnvelope(parsed: any): parsed is EncryptedShardEnvelope {
  return (
    !!parsed &&
    parsed.__e2ee === 1 &&
    typeof parsed.salt === 'string' &&
    typeof parsed.iv === 'string' &&
    typeof parsed.ct === 'string'
  );
}

function getSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new GistSyncError(
      '当前浏览器环境不支持 Web Crypto 加密（请通过 HTTPS 或 localhost 访问）',
      'E2EE_UNSUPPORTED'
    );
  }
  return subtle;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

const derivedKeyCache = new Map<string, Promise<CryptoKey>>();

function deriveAesGcmKey(
  passphrase: string,
  saltBase64: string,
  iterations: number
): Promise<CryptoKey> {
  const cacheKey = `${passphrase}\u0000${saltBase64}\u0000${iterations}`;
  const existing = derivedKeyCache.get(cacheKey);
  if (existing) return existing;

  const subtle = getSubtleCrypto();
  const promise = (async () => {
    const keyMaterial = await subtle.importKey(
      'raw',
      new TextEncoder().encode(passphrase),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: base64ToBytes(saltBase64),
        iterations,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  })();

  promise.catch(() => {
    derivedKeyCache.delete(cacheKey);
  });
  derivedKeyCache.set(cacheKey, promise);
  return promise;
}

async function encryptShardText(
  plainText: string,
  passphrase: string,
  saltBase64: string
): Promise<string> {
  const subtle = getSubtleCrypto();
  const key = await deriveAesGcmKey(passphrase, saltBase64, E2EE_DEFAULT_ITERATIONS);
  const iv = new Uint8Array(new ArrayBuffer(12));
  globalThis.crypto.getRandomValues(iv);
  const plainBytes = new TextEncoder().encode(plainText);
  const cipherBuffer = await subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
  const envelope: EncryptedShardEnvelope = {
    __e2ee: 1,
    alg: E2EE_ALGORITHM,
    iter: E2EE_DEFAULT_ITERATIONS,
    salt: saltBase64,
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(cipherBuffer)),
  };
  return JSON.stringify(envelope);
}

async function decryptEnvelope(
  envelope: EncryptedShardEnvelope,
  passphrase: string
): Promise<string> {
  const subtle = getSubtleCrypto();
  const iterations =
    typeof envelope.iter === 'number' && envelope.iter >= 1000
      ? envelope.iter
      : E2EE_DEFAULT_ITERATIONS;
  const key = await deriveAesGcmKey(passphrase, envelope.salt, iterations);
  try {
    const plainBuffer = await subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToBytes(envelope.iv) },
      key,
      base64ToBytes(envelope.ct)
    );
    return new TextDecoder().decode(plainBuffer);
  } catch {
    throw new GistSyncError(
      '同步加密口令不正确（解密校验失败），请核对口令后重试',
      'E2EE_WRONG_PASSPHRASE'
    );
  }
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

function isShardLogFilename(filename: string): boolean {
  return /^logs-(?:\d{4}-\d{2}|other)\.json$/.test(filename);
}

function isManagedRemoteFilename(filename: string): boolean {
  return (
    filename === SHARD_SUMMARY_FILENAME ||
    filename === SHARD_META_FILENAME ||
    filename === SHARD_TASKS_FILENAME ||
    filename === GIST_DATA_FILENAME ||
    isShardLogFilename(filename)
  );
}

function isTrackerGistFiles(filesObj: Record<string, any> | undefined): boolean {
  if (!filesObj) return false;
  if (Object.prototype.hasOwnProperty.call(filesObj, GIST_DATA_FILENAME)) return true;
  return (
    Object.prototype.hasOwnProperty.call(filesObj, SHARD_TASKS_FILENAME) &&
    Object.prototype.hasOwnProperty.call(filesObj, SHARD_META_FILENAME)
  );
}

// Cache exact file contents per Gist ID so PATCH updates only upload changed shards
const remoteFilesCache = new Map<string, Record<string, string>>();
const gistSaltCache = new Map<string, string>();
const encryptedShardReuseCache = new Map<
  string,
  Map<string, { passphraseHash: string; plainHash: string; cipherJson: string }>
>();

export function clearRemoteGistCache(gistId?: string): void {
  if (gistId) {
    remoteFilesCache.delete(gistId);
    encryptedShardReuseCache.delete(gistId);
    for (const key of Array.from(gistSaltCache.keys())) {
      if (key.startsWith(`${gistId}::`)) {
        gistSaltCache.delete(key);
      }
    }
  } else {
    remoteFilesCache.clear();
    gistSaltCache.clear();
    encryptedShardReuseCache.clear();
  }
}

function getOrCreateBatchSalt(gistId: string | undefined, passphraseHash: string): string {
  if (gistId) {
    const cached = gistSaltCache.get(`${gistId}::${passphraseHash}`);
    if (cached) return cached;
  }
  const bytes = new Uint8Array(new ArrayBuffer(16));
  globalThis.crypto.getRandomValues(bytes);
  const salt = bytesToBase64(bytes);
  if (gistId) {
    gistSaltCache.set(`${gistId}::${passphraseHash}`, salt);
  }
  return salt;
}

function getLogMonthShardFilename(dateStr: string | undefined): string {
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}/.test(dateStr)) {
    return `logs-${dateStr.slice(0, 7)}.json`;
  }
  return 'logs-other.json';
}

function buildSummaryMarkdown(
  payload: DriveSyncPayload,
  shardFilenames: string[],
  isEncrypted: boolean
): string {
  if (isEncrypted) {
    return [
      '# 个人数字媒体与任务时序跟踪系统 · 已加密云端存档',
      '',
      '- **隐私保护**: 已开启端到端加密（`AES-256-GCM`），云端所有任务、打卡日志与元数据均以密文存储。',
      `- **加密分片数**: ${shardFilenames.length} 个数据分片`,
      '',
      '> 请在各端设置相同的「同步加密口令」后自动解密同步；请勿手动修改或删除分片文件。',
    ].join('\n');
  }

  const inProgress = payload.tasks.filter((t) => t.status === 'in_progress').length;
  const done = payload.tasks.filter((t) => t.status === 'done').length;
  const backlog = payload.tasks.filter((t) => t.status === 'backlog').length;
  const paused = payload.tasks.filter((t) => t.status === 'paused').length;
  const totalHours =
    Math.round(
      payload.logs.reduce(
        (sum, l) => sum + (typeof l.hours === 'number' && !isNaN(l.hours) ? l.hours : 0),
        0
      ) * 10
    ) / 10;

  return [
    '# 个人数字媒体与任务时序跟踪系统 · 云端存档',
    '',
    `- **最近更新**: ${payload.updatedAt}`,
    `- **任务总计**: ${payload.tasks.length} 项（进行中 ${inProgress} · 已完成 ${done} · 未开始 ${backlog} · 搁置 ${paused}）`,
    `- **打卡记录**: ${payload.logs.length} 条（累计投入 ${totalHours.toFixed(1)}h）`,
    `- **分片文件 (${shardFilenames.length})**: ${shardFilenames.map((n) => `\`${n}\``).join(', ')}`,
    '',
    '> 本 Gist 由应用自动按月分片与增量同步维护，每条记录占一行。请勿手动删除或破坏 JSON 分片结构。',
  ].join('\n');
}

async function buildGistFilesMap(
  payload: DriveSyncPayload,
  options?: { passphrase?: string; gistId?: string }
): Promise<{
  files: Record<string, string>;
  plainMap: Record<string, string>;
  saltUsed: string | null;
  passphraseHash: string | null;
}> {
  const passphrase = options?.passphrase?.trim() || '';
  const isEncrypted = passphrase.length > 0;
  const gistId = options?.gistId;

  const plainMap: Record<string, string> = {};

  const metaObj: Record<string, unknown> = {
    version: payload.version,
    appName: payload.appName,
    updatedAt: payload.updatedAt,
  };
  if (payload.ganttGroupOrder !== undefined) {
    metaObj.ganttGroupOrder = payload.ganttGroupOrder;
  }
  plainMap[SHARD_META_FILENAME] = JSON.stringify(metaObj, null, 2);
  plainMap[SHARD_TASKS_FILENAME] = `{\n  "tasks": ${formatRecordArray(payload.tasks)}\n}`;

  const logsByShard = new Map<string, DailyLog[]>();
  for (const log of sortLogsDeterministically(payload.logs)) {
    const shardName = getLogMonthShardFilename(log.date);
    const bucket = logsByShard.get(shardName);
    if (bucket) bucket.push(log);
    else logsByShard.set(shardName, [log]);
  }

  const sortedShardNames = Array.from(logsByShard.keys()).sort();
  for (const shardName of sortedShardNames) {
    const shardLogs = logsByShard.get(shardName) ?? [];
    const monthLabel = shardName.replace(/^logs-/, '').replace(/\.json$/, '');
    plainMap[shardName] = `{\n  "month": ${JSON.stringify(monthLabel)},\n  "logs": ${formatRecordArray(shardLogs)}\n}`;
  }

  const dataShards = [SHARD_META_FILENAME, SHARD_TASKS_FILENAME, ...sortedShardNames];

  if (!isEncrypted) {
    const files: Record<string, string> = {
      ...plainMap,
      [SHARD_SUMMARY_FILENAME]: buildSummaryMarkdown(payload, dataShards, false),
    };
    return { files, plainMap, saltUsed: null, passphraseHash: null };
  }

  const passphraseHash = quickStringHash(passphrase);
  const saltUsed = getOrCreateBatchSalt(gistId, passphraseHash);
  const reuseMap = gistId ? encryptedShardReuseCache.get(gistId) : undefined;

  const encryptedEntries = await Promise.all(
    Object.entries(plainMap).map(async ([name, plainText]) => {
      const plainHash = quickStringHash(plainText);
      const cached = reuseMap?.get(name);
      if (cached && cached.passphraseHash === passphraseHash && cached.plainHash === plainHash) {
        return [name, cached.cipherJson] as const;
      }
      const cipherJson = await encryptShardText(plainText, passphrase, saltUsed);
      return [name, cipherJson] as const;
    })
  );

  const files: Record<string, string> = {
    [SHARD_SUMMARY_FILENAME]: buildSummaryMarkdown(payload, dataShards, true),
  };
  for (const [name, cipherJson] of encryptedEntries) {
    files[name] = cipherJson;
  }

  return { files, plainMap, saltUsed, passphraseHash };
}

function recordEncryptedShardCache(
  gistId: string,
  files: Record<string, string>,
  plainMap: Record<string, string>,
  saltUsed: string | null,
  passphraseHash: string | null
): void {
  if (!gistId) return;
  if (!passphraseHash || !saltUsed) {
    encryptedShardReuseCache.delete(gistId);
    return;
  }
  gistSaltCache.set(`${gistId}::${passphraseHash}`, saltUsed);
  const map = new Map<string, { passphraseHash: string; plainHash: string; cipherJson: string }>();
  for (const [name, plainText] of Object.entries(plainMap)) {
    const cipherJson = files[name];
    if (cipherJson) {
      map.set(name, {
        passphraseHash,
        plainHash: quickStringHash(plainText),
        cipherJson,
      });
    }
  }
  encryptedShardReuseCache.set(gistId, map);
}

async function readGistFileText(file: any, filename: string): Promise<string> {
  if (!file) {
    throw new Error(`Gist 中缺少文件 ${filename}`);
  }
  if (file.truncated && typeof file.raw_url === 'string') {
    const rawRes = await fetch(file.raw_url, { cache: 'no-store' });
    if (!rawRes.ok) {
      throw new Error(`读取 Gist 分片 ${filename} 完整内容失败 (${rawRes.status})`);
    }
    return await rawRes.text();
  }
  if (typeof file.content === 'string') {
    return file.content;
  }
  throw new Error(`Gist 分片 ${filename} 内容为空`);
}

async function decodeShardJson(
  rawText: string,
  filename: string,
  passphrase: string
): Promise<{ parsed: any; plainText: string; wasEncrypted: boolean; salt: string | null }> {
  let parsed: any;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error(`解析云端 ${filename} 失败`);
  }

  if (isEncryptedEnvelope(parsed)) {
    if (!passphrase) {
      throw new GistSyncError(
        '云端存档已启用端到端加密，请先填写「同步加密口令」后再同步',
        'E2EE_PASSPHRASE_REQUIRED'
      );
    }
    const plainText = await decryptEnvelope(parsed, passphrase);
    let decryptedParsed: any;
    try {
      decryptedParsed = JSON.parse(plainText);
    } catch {
      throw new Error(`解密后的云端 ${filename} JSON 结构异常`);
    }
    return {
      parsed: decryptedParsed,
      plainText,
      wasEncrypted: true,
      salt: parsed.salt,
    };
  }

  return {
    parsed,
    plainText: rawText,
    wasEncrypted: false,
    salt: null,
  };
}

export async function parseGistResponse(
  gistJson: any,
  passphraseInput?: string
): Promise<GistFileInfo> {
  const passphrase = passphraseInput?.trim() || '';
  const wantsEncryption = passphrase.length > 0;
  const gistId = String(gistJson?.id ?? '');
  const filesObj: Record<string, any> = gistJson?.files ?? {};
  const hasTasksFile = Object.prototype.hasOwnProperty.call(filesObj, SHARD_TASKS_FILENAME);
  const hasMetaFile = Object.prototype.hasOwnProperty.call(filesObj, SHARD_META_FILENAME);
  const hasLegacyFile = Object.prototype.hasOwnProperty.call(filesObj, GIST_DATA_FILENAME);

  let payload: DriveSyncPayload | null = null;
  let shardCount = 0;
  let isEncrypted = false;
  let needsShardMigration = false;
  let needsEncryptionMigration = false;

  if (hasTasksFile || hasMetaFile) {
    const logShardNames = Object.keys(filesObj).filter(isShardLogFilename).sort();
    const readEntries: Array<{ name: string; file: any }> = [];
    if (hasMetaFile) readEntries.push({ name: SHARD_META_FILENAME, file: filesObj[SHARD_META_FILENAME] });
    if (hasTasksFile) readEntries.push({ name: SHARD_TASKS_FILENAME, file: filesObj[SHARD_TASKS_FILENAME] });
    for (const name of logShardNames) {
      readEntries.push({ name, file: filesObj[name] });
    }

    const rawTexts = await Promise.all(
      readEntries.map(async (entry) => ({
        name: entry.name,
        text: await readGistFileText(entry.file, entry.name),
      }))
    );

    const decodedEntries = await Promise.all(
      rawTexts.map(async ({ name, text }) => ({
        name,
        rawText: text,
        ...(await decodeShardJson(text, name, passphrase)),
      }))
    );

    const cacheMap: Record<string, string> = {};
    const plainMap: Record<string, string> = {};
    let discoveredSalt: string | null = null;
    let hasEncryptedShard = false;
    let hasPlaintextShard = false;

    const decodedByName = new Map<string, (typeof decodedEntries)[number]>();
    for (const item of decodedEntries) {
      cacheMap[item.name] = item.rawText;
      plainMap[item.name] = item.plainText;
      decodedByName.set(item.name, item);
      if (item.wasEncrypted) {
        hasEncryptedShard = true;
        if (!discoveredSalt && item.salt) discoveredSalt = item.salt;
      } else {
        hasPlaintextShard = true;
      }
    }

    if (
      filesObj[SHARD_SUMMARY_FILENAME] &&
      !filesObj[SHARD_SUMMARY_FILENAME].truncated &&
      typeof filesObj[SHARD_SUMMARY_FILENAME].content === 'string'
    ) {
      cacheMap[SHARD_SUMMARY_FILENAME] = filesObj[SHARD_SUMMARY_FILENAME].content;
    }
    if (hasLegacyFile) {
      cacheMap[GIST_DATA_FILENAME] = '';
      needsShardMigration = true;
    }

    isEncrypted = hasEncryptedShard;
    if (wantsEncryption && hasPlaintextShard) {
      needsEncryptionMigration = true;
    }

    const metaParsed = decodedByName.get(SHARD_META_FILENAME)?.parsed ?? {};

    let tasks: TaskItem[] = [];
    const tasksEntry = decodedByName.get(SHARD_TASKS_FILENAME);
    if (tasksEntry) {
      const extracted = Array.isArray(tasksEntry.parsed)
        ? tasksEntry.parsed
        : tasksEntry.parsed?.tasks;
      if (!Array.isArray(extracted)) {
        throw new Error(`云端 ${SHARD_TASKS_FILENAME} 数据结构异常`);
      }
      tasks = extracted;
    }

    const allLogs: DailyLog[] = [];
    for (const shardName of logShardNames) {
      const shardEntry = decodedByName.get(shardName);
      if (!shardEntry) continue;
      const extractedLogs = Array.isArray(shardEntry.parsed)
        ? shardEntry.parsed
        : shardEntry.parsed?.logs;
      if (!Array.isArray(extractedLogs)) {
        throw new Error(`云端 ${shardName} 数据结构异常`);
      }
      allLogs.push(...extractedLogs);
    }

    if (hasTasksFile) {
      payload = {
        version: typeof metaParsed?.version === 'number' ? metaParsed.version : 1,
        appName:
          typeof metaParsed?.appName === 'string'
            ? metaParsed.appName
            : '个人数字媒体与任务时序跟踪系统',
        updatedAt:
          typeof metaParsed?.updatedAt === 'string'
            ? metaParsed.updatedAt
            : String(gistJson?.updated_at ?? new Date().toISOString()),
        tasks,
        logs: sortLogsDeterministically(allLogs),
        ganttGroupOrder: Array.isArray(metaParsed?.ganttGroupOrder)
          ? metaParsed.ganttGroupOrder
          : undefined,
      };
      shardCount = logShardNames.length + (hasMetaFile ? 1 : 0) + 1;
      if (gistId) {
        remoteFilesCache.set(gistId, cacheMap);
        if (wantsEncryption && discoveredSalt) {
          recordEncryptedShardCache(
            gistId,
            cacheMap,
            plainMap,
            discoveredSalt,
            quickStringHash(passphrase)
          );
        }
      }
    }
  } else if (hasLegacyFile) {
    const rawText = await readGistFileText(filesObj[GIST_DATA_FILENAME], GIST_DATA_FILENAME);
    if (rawText.trim().length > 0) {
      const decoded = await decodeShardJson(rawText, GIST_DATA_FILENAME, passphrase);
      if (isValidPayload(decoded.parsed)) {
        payload = decoded.parsed;
        isEncrypted = decoded.wasEncrypted;
        needsShardMigration = true;
        if (wantsEncryption && !decoded.wasEncrypted) {
          needsEncryptionMigration = true;
        }
        shardCount = 1;
      }
    }
    if (gistId) {
      remoteFilesCache.set(gistId, { [GIST_DATA_FILENAME]: rawText });
    }
  }

  return {
    id: gistId,
    description: String(gistJson?.description ?? ''),
    updatedAt: String(gistJson?.updated_at ?? ''),
    htmlUrl: String(gistJson?.html_url ?? ''),
    payload,
    shardCount,
    isEncrypted,
    needsShardMigration,
    needsEncryptionMigration,
  };
}

export async function getGistById(
  token: string,
  gistId: string,
  passphrase?: string
): Promise<GistFileInfo> {
  const res = await fetch(`${GITHUB_API_BASE}/gists/${encodeURIComponent(gistId.trim())}`, {
    method: 'GET',
    cache: 'no-store',
    headers: buildGitHubHeaders(token),
  });

  if (!res.ok) {
    throw new Error(await parseGitHubError(res, '读取 GitHub Gist 失败'));
  }

  const gistJson = await res.json();
  return parseGistResponse(gistJson, passphrase);
}

export async function findExistingTrackerGist(
  token: string,
  passphrase?: string
): Promise<GistFileInfo | null> {
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
    .filter((g: any) => isTrackerGistFiles(g?.files))
    .sort((a: any, b: any) => {
      const ta = a?.updated_at ? new Date(a.updated_at).getTime() : 0;
      const tb = b?.updated_at ? new Date(b.updated_at).getTime() : 0;
      return tb - ta;
    });

  if (matching.length === 0) return null;
  return getGistById(token, String(matching[0].id), passphrase);
}

export async function createTrackerGist(
  token: string,
  data: { tasks: TaskItem[]; logs: DailyLog[]; ganttGroupOrder?: string[] },
  passphrase?: string
): Promise<GistFileInfo> {
  const payload = buildSyncPayload(data);
  const { files: nextFiles, plainMap, saltUsed, passphraseHash } = await buildGistFilesMap(
    payload,
    { passphrase }
  );
  const bodyFiles: Record<string, { content: string }> = {};
  for (const [name, content] of Object.entries(nextFiles)) {
    bodyFiles[name] = { content };
  }

  const res = await fetch(`${GITHUB_API_BASE}/gists`, {
    method: 'POST',
    cache: 'no-store',
    headers: buildGitHubHeaders(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      description: '个人数字媒体与任务时序跟踪系统 - 按月分片自动同步数据 (请勿手动删除)',
      public: false,
      files: bodyFiles,
    }),
  });

  if (!res.ok) {
    throw new Error(await parseGitHubError(res, '创建 GitHub Gist 失败'));
  }

  const gistJson = await res.json();
  const gistId = String(gistJson?.id ?? '');
  if (gistId) {
    remoteFilesCache.set(gistId, nextFiles);
    recordEncryptedShardCache(gistId, nextFiles, plainMap, saltUsed, passphraseHash);
  }
  const shardCount = Object.keys(nextFiles).filter(
    (n) => n !== SHARD_SUMMARY_FILENAME
  ).length;

  return {
    id: gistId,
    description: String(gistJson?.description ?? ''),
    updatedAt: String(gistJson?.updated_at ?? payload.updatedAt),
    htmlUrl: String(gistJson?.html_url ?? ''),
    payload,
    shardCount,
    isEncrypted: Boolean(passphrase && passphrase.trim().length > 0),
    needsShardMigration: false,
    needsEncryptionMigration: false,
  };
}

async function fetchRemoteFileEntriesForPatch(
  token: string,
  gistId: string
): Promise<Record<string, string | null>> {
  const res = await fetch(`${GITHUB_API_BASE}/gists/${encodeURIComponent(gistId.trim())}`, {
    method: 'GET',
    cache: 'no-store',
    headers: buildGitHubHeaders(token),
  });

  if (!res.ok) {
    throw new Error(await parseGitHubError(res, '读取 GitHub Gist 元信息失败'));
  }

  const gistJson = await res.json();
  const filesObj = gistJson?.files ?? {};
  const result: Record<string, string | null> = {};
  for (const [name, info] of Object.entries<any>(filesObj)) {
    result[name] = !info?.truncated && typeof info?.content === 'string' ? info.content : null;
  }
  return result;
}

export async function updateTrackerGist(
  token: string,
  gistId: string,
  data: { tasks: TaskItem[]; logs: DailyLog[]; ganttGroupOrder?: string[] },
  passphrase?: string
): Promise<GistFileInfo> {
  const cleanId = gistId.trim();
  const payload = buildSyncPayload(data);
  const { files: nextFiles, plainMap, saltUsed, passphraseHash } = await buildGistFilesMap(
    payload,
    { passphrase, gistId: cleanId }
  );

  const prevFiles: Record<string, string | null> =
    remoteFilesCache.get(cleanId) ?? (await fetchRemoteFileEntriesForPatch(token, cleanId));

  const patchFiles: Record<string, { content: string } | null> = {};

  for (const [name, content] of Object.entries(nextFiles)) {
    if (prevFiles[name] !== content) {
      patchFiles[name] = { content };
    }
  }

  for (const oldName of Object.keys(prevFiles)) {
    if (isManagedRemoteFilename(oldName) && !Object.prototype.hasOwnProperty.call(nextFiles, oldName)) {
      patchFiles[oldName] = null;
    }
  }

  let updatedAt = payload.updatedAt;
  let description = '个人数字媒体与任务时序跟踪系统 - 按月分片自动同步数据 (请勿手动删除)';
  let htmlUrl = '';

  if (Object.keys(patchFiles).length > 0) {
    const res = await fetch(`${GITHUB_API_BASE}/gists/${encodeURIComponent(cleanId)}`, {
      method: 'PATCH',
      cache: 'no-store',
      headers: buildGitHubHeaders(token, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        files: patchFiles,
      }),
    });

    if (!res.ok) {
      throw new Error(await parseGitHubError(res, '更新 GitHub Gist 失败'));
    }

    const gistJson = await res.json();
    updatedAt = String(gistJson?.updated_at ?? updatedAt);
    description = String(gistJson?.description ?? description);
    htmlUrl = String(gistJson?.html_url ?? '');
  }

  remoteFilesCache.set(cleanId, nextFiles);
  recordEncryptedShardCache(cleanId, nextFiles, plainMap, saltUsed, passphraseHash);
  const shardCount = Object.keys(nextFiles).filter(
    (n) => n !== SHARD_SUMMARY_FILENAME
  ).length;

  return {
    id: cleanId,
    description,
    updatedAt,
    htmlUrl,
    payload,
    shardCount,
    isEncrypted: Boolean(passphrase && passphrase.trim().length > 0),
    needsShardMigration: false,
    needsEncryptionMigration: false,
  };
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
