import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TaskItem, DailyLog } from '../types';
import { buildSyncPayload, DriveSyncPayload } from '../services/googleDrive';
import {
  DirHandle,
  LOCAL_DATA_FILENAME,
  LOCAL_BACKUP_FILENAME,
  clearDirHandle,
  isLocalFolderSupported,
  loadDirHandle,
  pickDirectory,
  queryPermission,
  readDataFile,
  requestPermission,
  saveDirHandle,
  writeDataFile,
} from '../services/localFolder';

export type LocalSyncStatus = 'off' | 'idle' | 'syncing' | 'success' | 'error' | 'needs-permission';

export interface LocalSyncInfo {
  supported: boolean;
  enabled: boolean;
  status: LocalSyncStatus;
  folderName: string | null;
  lastWriteTime: string | null;
  errorMessage: string | null;
}

export type ChoiceResult = 'confirm' | 'alt' | 'cancel';

interface ChoiceOptions {
  title: string;
  message: string;
  confirmText: string;
  altText: string;
  cancelText: string;
}

interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'danger';
}

interface UseLocalSyncParams {
  tasks: TaskItem[];
  logs: DailyLog[];
  ganttGroupOrder: string[];
  /** Replaces app state with the given payload (file -> local). */
  applyPayload: (payload: DriveSyncPayload) => void;
  requestConfirm: (options: ConfirmOptions) => Promise<boolean>;
  requestChoice: (options: ChoiceOptions) => Promise<ChoiceResult>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ENABLED_KEY = 'media_tracker_local_sync_enabled';
const LAST_WRITE_KEY = 'media_tracker_local_sync_last_write';
const WRITE_DEBOUNCE_MS = 800;

const isPayloadValid = (p: any): p is DriveSyncPayload =>
  !!p && Array.isArray(p.tasks) && Array.isArray(p.logs);

/** Content-only comparison (ignores version / updatedAt). */
const contentKey = (p: { tasks: TaskItem[]; logs: DailyLog[]; ganttGroupOrder?: string[] }) =>
  JSON.stringify({ tasks: p.tasks, logs: p.logs, ganttGroupOrder: p.ganttGroupOrder ?? [] });

const formatTime = (iso?: string) => (iso ? new Date(iso).toLocaleString('zh-CN') : '未知时间');

export function useLocalSync({
  tasks,
  logs,
  ganttGroupOrder,
  applyPayload,
  requestConfirm,
  requestChoice,
  showToast,
}: UseLocalSyncParams) {
  const supported = useMemo(() => isLocalFolderSupported(), []);

  const [enabled, setEnabled] = useState<boolean>(
    () => supported && localStorage.getItem(ENABLED_KEY) === '1'
  );
  // Until the stored handle's permission is verified we must not write.
  const [status, setStatus] = useState<LocalSyncStatus>(enabled ? 'needs-permission' : 'off');
  const [folderName, setFolderName] = useState<string | null>(null);
  const [lastWriteTime, setLastWriteTime] = useState<string | null>(() =>
    localStorage.getItem(LAST_WRITE_KEY)
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRef = useRef<DirHandle | null>(null);
  const pendingRef = useRef(false);
  const writeChainRef = useRef<Promise<boolean>>(Promise.resolve(true));

  // Always-fresh view of the data so deferred writes never use stale closures.
  const dataRef = useRef({ tasks, logs, ganttGroupOrder });
  dataRef.current = { tasks, logs, ganttGroupOrder };

  const applyWriteError = useCallback((e: any) => {
    const name = e?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      setStatus('needs-permission');
      setErrorMessage('目录访问权限已失效，请点击「恢复授权」。');
    } else if (name === 'NotFoundError') {
      setStatus('error');
      setErrorMessage('找不到已选择的目录（可能已被删除或移动），请重新选择目录。');
    } else {
      setStatus('error');
      setErrorMessage(e?.message || '写入本地文件失败');
    }
  }, []);

  /** Serialised write of the latest data. Resolves true on success. */
  const flush = useCallback((): Promise<boolean> => {
    writeChainRef.current = writeChainRef.current.then(async () => {
      const handle = handleRef.current;
      if (!handle || !pendingRef.current) return true;
      pendingRef.current = false;
      setStatus('syncing');
      try {
        await writeDataFile(handle, buildSyncPayload(dataRef.current));
        const now = new Date().toISOString();
        setLastWriteTime(now);
        localStorage.setItem(LAST_WRITE_KEY, now);
        setStatus('success');
        setErrorMessage(null);
        return true;
      } catch (e) {
        console.error('Local folder write failed:', e);
        applyWriteError(e);
        return false;
      }
    });
    return writeChainRef.current;
  }, [applyWriteError]);

  // Restore the stored handle after a reload.
  useEffect(() => {
    if (!enabled || !supported) return;
    let cancelled = false;
    (async () => {
      try {
        const handle = await loadDirHandle();
        if (cancelled) return;
        if (!handle) {
          localStorage.removeItem(ENABLED_KEY);
          setEnabled(false);
          setStatus('off');
          return;
        }
        handleRef.current = handle;
        setFolderName(handle.name);
        const perm = await queryPermission(handle);
        if (cancelled) return;
        if (perm === 'granted') {
          setStatus('idle');
          setErrorMessage(null);
        } else {
          setStatus('needs-permission');
        }
      } catch (e: any) {
        if (!cancelled) {
          console.error('Failed to restore local sync handle:', e);
          setStatus('error');
          setErrorMessage(e?.message || '恢复本地同步目录失败');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Run once on mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canWrite = enabled && (status === 'idle' || status === 'syncing' || status === 'success');

  // Debounced auto-write whenever data changes (and when writing becomes possible again).
  useEffect(() => {
    if (!canWrite) return;
    pendingRef.current = true;
    const timer = setTimeout(() => {
      void flush();
    }, WRITE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [tasks, logs, ganttGroupOrder, canWrite, flush]);

  // Flush immediately when the tab is hidden so a pending debounce is not lost.
  useEffect(() => {
    if (!canWrite) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && pendingRef.current) {
        void flush();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [canWrite, flush]);

  /** Pick a folder, grant permission, resolve conflicts, then turn sync on. Must run from a user gesture. */
  const enableLocalSync = useCallback(async (): Promise<boolean> => {
    if (!supported) return false;

    let handle: DirHandle;
    try {
      handle = await pickDirectory();
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        console.error('Directory picker failed:', e);
        showToast(e?.message || '无法打开目录选择器', 'error');
      }
      return false;
    }

    try {
      const perm = await requestPermission(handle);
      if (perm !== 'granted') {
        showToast('未授予目录读写权限，无法开启本地同步', 'error');
        return false;
      }

      const local = buildSyncPayload(dataRef.current);

      let existing: DriveSyncPayload | null = null;
      let existingBroken = false;
      try {
        existing = await readDataFile(handle);
        if (existing && !isPayloadValid(existing)) existingBroken = true;
      } catch {
        existingBroken = true;
      }

      let backup = false;
      if (existing === null && !existingBroken) {
        // Empty folder: just write local data below.
      } else if (existingBroken) {
        const ok = await requestConfirm({
          title: '目录中的数据文件无法识别',
          message: `所选目录里已有「${LOCAL_DATA_FILENAME}」，但内容不是有效的数据格式。\n\n是否先将它备份为「${LOCAL_BACKUP_FILENAME}」，再用当前本地数据覆盖？`,
          confirmText: '备份并覆盖',
          cancelText: '取消',
          variant: 'danger',
        });
        if (!ok) return false;
        backup = true;
      } else if (existing && contentKey(existing) !== contentKey(local)) {
        const choice = await requestChoice({
          title: '目录中已有不同的数据文件',
          message:
            `所选目录里已有「${LOCAL_DATA_FILENAME}」，内容与当前本地数据不同。\n\n` +
            `目录文件：${existing.tasks.length} 项任务 · ${existing.logs.length} 条日志（更新于 ${formatTime(existing.updatedAt)}）\n` +
            `当前本地：${local.tasks.length} 项任务 · ${local.logs.length} 条日志\n\n` +
            `请选择以哪一份为准（不会合并）。选择「用本地覆盖文件」时，原文件会先备份为「${LOCAL_BACKUP_FILENAME}」。`,
          confirmText: '用文件覆盖本地',
          altText: '用本地覆盖文件',
          cancelText: '取消开启',
        });
        if (choice === 'cancel') return false;
        if (choice === 'confirm') {
          applyPayload(existing);
        } else {
          backup = true;
        }
      }

      // `existing` identical to local, or file -> local applied: nothing to write now,
      // the auto-write effect will mirror the final state. For the other branches write immediately.
      if (existing === null || existingBroken || backup) {
        await writeDataFile(handle, buildSyncPayload(dataRef.current), { backup });
      }

      await saveDirHandle(handle);
      localStorage.setItem(ENABLED_KEY, '1');
      const now = new Date().toISOString();
      localStorage.setItem(LAST_WRITE_KEY, now);
      handleRef.current = handle;
      pendingRef.current = false;
      setFolderName(handle.name);
      setLastWriteTime(now);
      setErrorMessage(null);
      setEnabled(true);
      setStatus('success');
      showToast(`已开启本地同步：${handle.name}`, 'success');
      return true;
    } catch (e: any) {
      console.error('Enable local sync failed:', e);
      showToast(e?.message || '开启本地同步失败', 'error');
      return false;
    }
  }, [supported, requestConfirm, requestChoice, applyPayload, showToast]);

  /** Re-grant permission after a reload. Must run from a user gesture. */
  const resumeLocalSync = useCallback(async (): Promise<boolean> => {
    const handle = handleRef.current;
    if (!handle) return false;
    try {
      const perm = await requestPermission(handle);
      if (perm === 'granted') {
        setErrorMessage(null);
        // Becoming writable re-triggers the auto-write effect, which flushes the latest data.
        setStatus('idle');
        showToast('已恢复本地同步授权', 'success');
        return true;
      }
      setStatus('needs-permission');
      showToast('未授予权限，本地同步保持暂停', 'info');
      return false;
    } catch (e) {
      applyWriteError(e);
      return false;
    }
  }, [applyWriteError, showToast]);

  const disableLocalSync = useCallback(async (): Promise<void> => {
    try {
      await clearDirHandle();
    } catch (e) {
      console.error('Failed to clear stored directory handle:', e);
    }
    localStorage.removeItem(ENABLED_KEY);
    handleRef.current = null;
    pendingRef.current = false;
    setEnabled(false);
    setStatus('off');
    setFolderName(null);
    setErrorMessage(null);
    showToast('已关闭本地同步（目录中的文件已保留）', 'info');
  }, [showToast]);

  const writeLocalNow = useCallback(async (): Promise<boolean> => {
    if (!handleRef.current) return false;
    pendingRef.current = true;
    const ok = await flush();
    if (ok) showToast('已写入本地文件', 'success');
    return ok;
  }, [flush, showToast]);

  /** Manual one-off read: directory file -> app state (with overwrite confirmation). */
  const pullFromLocalFile = useCallback(async (): Promise<boolean> => {
    const handle = handleRef.current;
    if (!handle) return false;
    try {
      const perm = await queryPermission(handle);
      if (perm !== 'granted') {
        setStatus('needs-permission');
        showToast('请先恢复目录授权', 'info');
        return false;
      }
      let payload: DriveSyncPayload | null;
      try {
        payload = await readDataFile(handle);
      } catch {
        showToast(`「${LOCAL_DATA_FILENAME}」不是有效的 JSON 文件`, 'error');
        return false;
      }
      if (!payload) {
        showToast(`目录中没有「${LOCAL_DATA_FILENAME}」`, 'error');
        return false;
      }
      if (!isPayloadValid(payload)) {
        showToast('目录中的数据文件结构异常', 'error');
        return false;
      }
      const ok = await requestConfirm({
        title: '从本地文件读取数据',
        message: `确定要用目录中的「${LOCAL_DATA_FILENAME}」覆盖当前数据吗？\n文件内容：${payload.tasks.length} 项任务 · ${payload.logs.length} 条日志（更新于 ${formatTime(payload.updatedAt)}）。\n当前本地尚未写入文件的修改将被替换。`,
        confirmText: '确认读取覆盖',
        cancelText: '取消',
        variant: 'danger',
      });
      if (!ok) return false;
      applyPayload(payload);
      showToast('已从本地文件读取数据', 'success');
      return true;
    } catch (e) {
      applyWriteError(e);
      return false;
    }
  }, [requestConfirm, applyPayload, applyWriteError, showToast]);

  const localSync: LocalSyncInfo = {
    supported,
    enabled,
    status,
    folderName,
    lastWriteTime,
    errorMessage,
  };

  return {
    localSync,
    enableLocalSync,
    resumeLocalSync,
    disableLocalSync,
    writeLocalNow,
    pullFromLocalFile,
  };
}

