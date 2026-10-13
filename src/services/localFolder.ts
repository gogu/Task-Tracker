import type { DriveSyncPayload } from './googleDrive';

/**
 * Local folder access via the File System Access API (Chromium only).
 *
 * The DOM lib does not ship complete typings for this API, so we declare the
 * minimal surface we use instead of pulling in an extra dependency.
 */

export const LOCAL_DATA_FILENAME = 'media-tracker-data.json';
export const LOCAL_BACKUP_FILENAME = 'media-tracker-data.bak.json';

interface WritableLike {
  write(data: string): Promise<void>;
  close(): Promise<void>;
}

interface FileHandleLike {
  getFile(): Promise<File>;
  createWritable(): Promise<WritableLike>;
}

type PermissionResult = 'granted' | 'denied' | 'prompt';

export interface DirHandle {
  kind: 'directory';
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FileHandleLike>;
  queryPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionResult>;
  requestPermission(descriptor: { mode: 'readwrite' }): Promise<PermissionResult>;
}

export function isLocalFolderSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as any).showDirectoryPicker === 'function';
}

/** Opens the directory picker. Must be called from a user gesture. Throws AbortError if cancelled. */
export async function pickDirectory(): Promise<DirHandle> {
  const picker = (window as any).showDirectoryPicker as (options: {
    id?: string;
    mode?: 'read' | 'readwrite';
  }) => Promise<DirHandle>;
  return picker({ id: 'task-tracker', mode: 'readwrite' });
}

export async function queryPermission(handle: DirHandle): Promise<PermissionResult> {
  return handle.queryPermission({ mode: 'readwrite' });
}

/** Must be called from a user gesture when the current state is "prompt". */
export async function requestPermission(handle: DirHandle): Promise<PermissionResult> {
  return handle.requestPermission({ mode: 'readwrite' });
}

/* ───────────── IndexedDB: persist the directory handle across reloads ───────────── */

const DB_NAME = 'task-tracker-local-sync';
const STORE = 'handles';
const HANDLE_KEY = 'dir';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = run(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveDirHandle(handle: DirHandle): Promise<void> {
  await withStore('readwrite', (s) => s.put(handle, HANDLE_KEY));
}

export async function loadDirHandle(): Promise<DirHandle | null> {
  const handle = await withStore<DirHandle | undefined>('readonly', (s) => s.get(HANDLE_KEY));
  return handle ?? null;
}

export async function clearDirHandle(): Promise<void> {
  await withStore('readwrite', (s) => s.delete(HANDLE_KEY));
}

/* ───────────── Data file read / write ───────────── */

async function readTextFile(handle: DirHandle, name: string): Promise<string | null> {
  try {
    const fileHandle = await handle.getFileHandle(name);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch (e: any) {
    if (e?.name === 'NotFoundError') return null;
    throw e;
  }
}

async function writeTextFile(handle: DirHandle, name: string, text: string): Promise<void> {
  const fileHandle = await handle.getFileHandle(name, { create: true });
  // createWritable() writes to a swap file and atomically replaces on close(),
  // so an interrupted write never corrupts the existing file.
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(text);
  } finally {
    await writable.close();
  }
}

/** Returns null when the file does not exist. Throws SyntaxError when it is not valid JSON. */
export async function readDataFile(handle: DirHandle): Promise<DriveSyncPayload | null> {
  const text = await readTextFile(handle, LOCAL_DATA_FILENAME);
  if (text === null) return null;
  return JSON.parse(text) as DriveSyncPayload;
}

/** Writes the data file. With `backup`, the previous file content is first copied to the .bak.json file. */
export async function writeDataFile(
  handle: DirHandle,
  payload: DriveSyncPayload,
  options: { backup?: boolean } = {}
): Promise<void> {
  if (options.backup) {
    const old = await readTextFile(handle, LOCAL_DATA_FILENAME);
    if (old !== null) {
      await writeTextFile(handle, LOCAL_BACKUP_FILENAME, old);
    }
  }
  await writeTextFile(handle, LOCAL_DATA_FILENAME, JSON.stringify(payload, null, 2));
}

