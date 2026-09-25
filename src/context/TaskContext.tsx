import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback } from 'react';
import { User } from 'firebase/auth';
import { TaskItem, DailyLog, TaskStatus, ProgressType, ViewMode } from '../types';
import { createInitialSampleData } from '../data/initialData';
import { getTodayString } from '../utils/date';
import { initAuth, googleSignIn, logout, getAccessToken, getStoredUser, isTokenExpired, AuthUser } from '../services/auth';
import {
  findDriveFile,
  createDriveFile,
  readDriveFileContent,
  updateDriveFileContent,
  DRIVE_DATA_FILENAME,
} from '../services/googleDrive';

interface TaskContextType {
  tasks: TaskItem[];
  logs: DailyLog[];
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedTag: string | null;
  setSelectedTag: (tag: string | null) => void;
  allTags: string[];
  filteredTasks: TaskItem[];

  // Task Actions
  addTask: (data: { title: string; tags: string[]; status: TaskStatus }) => TaskItem;
  updateTask: (id: string, updates: Partial<TaskItem>) => void;
  deleteTask: (id: string) => void;
  moveTaskStatus: (id: string, newStatus: TaskStatus) => void;
  reorderTasks: (draggedId: string, targetId: string, position: 'before' | 'after') => void;

  // Log Actions
  addOrUpdateLog: (data: {
    taskId: string;
    date: string;
    progressType: ProgressType;
    note?: string;
    markTaskAsCompleted?: boolean;
  }) => DailyLog;
  deleteLog: (id: string) => void;
  getLogsForTask: (taskId: string) => DailyLog[];
  getLog: (taskId: string, date: string) => DailyLog | undefined;
  getLatestLogForTask: (taskId: string) => DailyLog | undefined;

  // Active Modals Control
  checkInModalTask: TaskItem | null;
  checkInModalDate: string | null;
  openCheckInModal: (task: TaskItem, date?: string) => void;
  closeCheckInModal: () => void;

  taskModalData: { isOpen: boolean; task?: TaskItem; defaultStatus?: TaskStatus };
  openTaskModal: (task?: TaskItem, defaultStatus?: TaskStatus) => void;
  closeTaskModal: () => void;

  logModalData: { isOpen: boolean; task?: TaskItem; date?: string; log?: DailyLog };
  openLogModal: (task: TaskItem, date: string, log?: DailyLog) => void;
  closeLogModal: () => void;

  // Persistence helpers
  resetData: () => void;
  exportData: () => void;
  importData: (jsonStr: string) => boolean;

  // In-App Confirm Dialog & Toast
  confirmDialogState: ConfirmDialogState | null;
  requestConfirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  hideToast: () => void;

  // Google Drive Integration
  user: AuthUser | User | null;
  tokenExpired: boolean;
  isLoggingIn: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error';
  syncErrorMessage: string | null;
  driveFileId: string | null;
  driveSyncModalOpen: boolean;
  setDriveSyncModalOpen: (open: boolean) => void;
  loginWithGoogle: (forceConsent?: boolean) => Promise<boolean>;
  logoutFromGoogle: () => Promise<void>;
  pushToDrive: (skipConfirm?: boolean) => Promise<boolean>;
  pullFromDrive: (skipConfirm?: boolean) => Promise<boolean>;
}

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'danger';
}

export interface ConfirmDialogState extends ConfirmDialogOptions {
  isOpen: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const STORAGE_KEY = 'media_task_tracker_data_v1';
const DRIVE_FILE_ID_KEY = 'media_tracker_drive_file_id';
const LAST_SYNC_KEY = 'media_tracker_drive_last_sync';

const TaskContext = createContext<TaskContextType | undefined>(undefined);

export const TaskProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<TaskItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.tasks) && Array.isArray(parsed.logs)) {
          return parsed.tasks;
        }
      }
    } catch (e) {
      console.error('Failed to load storage data:', e);
    }
    return createInitialSampleData().tasks;
  });

  const [logs, setLogs] = useState<DailyLog[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.tasks) && Array.isArray(parsed.logs)) {
          return parsed.logs;
        }
      }
    } catch (e) {
      console.error('Failed to load storage data:', e);
    }
    return createInitialSampleData().logs;
  });

  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Modals state
  const [checkInModalTask, setCheckInModalTask] = useState<TaskItem | null>(null);
  const [checkInModalDate, setCheckInModalDate] = useState<string | null>(null);

  const [taskModalData, setTaskModalData] = useState<{
    isOpen: boolean;
    task?: TaskItem;
    defaultStatus?: TaskStatus;
  }>({ isOpen: false });

  const [logModalData, setLogModalData] = useState<{
    isOpen: boolean;
    task?: TaskItem;
    date?: string;
    log?: DailyLog;
  }>({ isOpen: false });

  // Google Drive state
  const [user, setUser] = useState<AuthUser | User | null>(() => getStoredUser());
  const [tokenExpired, setTokenExpired] = useState<boolean>(() => isTokenExpired());
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [driveFileId, setDriveFileId] = useState<string | null>(() => localStorage.getItem(DRIVE_FILE_ID_KEY));
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => localStorage.getItem(LAST_SYNC_KEY));
  const [driveSyncModalOpen, setDriveSyncModalOpen] = useState<boolean>(false);

  // In-App Confirm Dialog & Toast State
  const [confirmDialogState, setConfirmDialogState] = useState<ConfirmDialogState | null>(null);

  const requestConfirm = useCallback(
    (options: ConfirmDialogOptions): Promise<boolean> => {
      return new Promise<boolean>((resolve) => {
        setConfirmDialogState({
          ...options,
          isOpen: true,
          onConfirm: () => {
            setConfirmDialogState(null);
            resolve(true);
          },
          onCancel: () => {
            setConfirmDialogState(null);
            resolve(false);
          },
        });
      });
    },
    []
  );

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    setToast({ message, type });
  }, []);

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  // Sync tasks & logs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks, logs }));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }, [tasks, logs]);

  // Init Firebase Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser) => {
        setUser(currentUser);
        setTokenExpired(isTokenExpired());
      },
      () => {
        setUser(null);
        setTokenExpired(true);
      }
    );
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    tasks.forEach((t) => {
      t.tags?.forEach((tag) => {
        if (tag.trim()) tagSet.add(tag.trim());
      });
    });
    return Array.from(tagSet).sort();
  }, [tasks]);

  // Filter tasks based on search and tag, then sort by order
  const filteredTasks = useMemo(() => {
    const filtered = tasks.filter((task) => {
      const matchesSearch =
        !searchQuery.trim() ||
        task.title.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        task.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase().trim()));

      const matchesTag = !selectedTag || task.tags.includes(selectedTag);

      return matchesSearch && matchesTag;
    });

    // 按 order 升序排列；无 order 的旧数据以 createdAt 降序兜底（放最前）
    return filtered.sort((a, b) => {
      const aOrder = a.order ?? -new Date(a.createdAt).getTime();
      const bOrder = b.order ?? -new Date(b.createdAt).getTime();
      return aOrder - bOrder;
    });
  }, [tasks, searchQuery, selectedTag]);

  // Task Actions
  const addTask = (data: { title: string; tags: string[]; status: TaskStatus }): TaskItem => {
    const today = getTodayString();
    const newTask: TaskItem = {
      id: 'task-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      title: data.title.trim(),
      tags: data.tags.map((t) => t.trim()).filter(Boolean),
      status: data.status,
      order: Date.now(),
      startDate: data.status === 'in_progress' ? today : null,
      completedDate: data.status === 'done' ? today : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setTasks((prev) => [newTask, ...prev]);
    return newTask;
  };

  const updateTask = (id: string, updates: Partial<TaskItem>) => {
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;
        return {
          ...task,
          ...updates,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  };

  const deleteTask = (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setLogs((prev) => prev.filter((l) => l.taskId !== id));
  };

  const moveTaskStatus = (id: string, newStatus: TaskStatus) => {
    const today = getTodayString();
    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== id) return task;
        if (task.status === newStatus) return task;

        let startDate = task.startDate;
        let completedDate = task.completedDate;

        if (newStatus === 'in_progress' && !startDate) {
          startDate = today;
        }

        if (newStatus === 'done') {
          completedDate = today;
        } else if (task.status === 'done') {
          completedDate = null;
        }

        return {
          ...task,
          status: newStatus,
          startDate,
          completedDate,
          updatedAt: new Date().toISOString(),
        };
      })
    );
  };

  const reorderTasks = (draggedId: string, targetId: string, position: 'before' | 'after') => {
    setTasks((prev) => {
      const dragged = prev.find((t) => t.id === draggedId);
      const target = prev.find((t) => t.id === targetId);
      if (!dragged || !target || draggedId === targetId) return prev;

      // 只在同泳道内排序
      if (dragged.status !== target.status) return prev;

      // 获取同泳道的所有任务，按当前展示顺序排列
      const laneTasks = prev
        .filter((t) => t.status === dragged.status)
        .sort((a, b) => {
          const aOrder = a.order ?? -new Date(a.createdAt).getTime();
          const bOrder = b.order ?? -new Date(b.createdAt).getTime();
          return aOrder - bOrder;
        });

      // 从列表中移除被拖拽的任务，再插入到目标位置
      const withoutDragged = laneTasks.filter((t) => t.id !== draggedId);
      const targetIdx = withoutDragged.findIndex((t) => t.id === targetId);
      const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
      withoutDragged.splice(insertIdx, 0, dragged);

      // 重新分配 order 值（间距 1000，留余量）
      const orderMap = new Map<string, number>();
      withoutDragged.forEach((t, i) => {
        orderMap.set(t.id, (i + 1) * 1000);
      });

      return prev.map((t) => {
        if (orderMap.has(t.id)) {
          return { ...t, order: orderMap.get(t.id)!, updatedAt: new Date().toISOString() };
        }
        return t;
      });
    });
  };

  // Log Actions
  const addOrUpdateLog = ({
    taskId,
    date,
    progressType,
    note,
    markTaskAsCompleted,
  }: {
    taskId: string;
    date: string;
    progressType: ProgressType;
    note?: string;
    markTaskAsCompleted?: boolean;
  }): DailyLog => {
    let savedLog: DailyLog;

    setLogs((prev) => {
      const existingIndex = prev.findIndex((l) => l.taskId === taskId && l.date === date);
      if (existingIndex >= 0) {
        savedLog = {
          ...prev[existingIndex],
          progressType,
          note: note?.trim() || undefined,
        };
        const next = [...prev];
        next[existingIndex] = savedLog;
        return next;
      } else {
        savedLog = {
          id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          taskId,
          date,
          progressType,
          note: note?.trim() || undefined,
          createdAt: new Date().toISOString(),
        };
        return [...prev, savedLog];
      }
    });

    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;

        const isMarkDone = markTaskAsCompleted || progressType === 'completed';
        const newStatus = isMarkDone ? 'done' : task.status === 'backlog' ? 'in_progress' : task.status;
        const newStartDate = task.startDate || date;
        const newCompletedDate = isMarkDone ? (task.completedDate || date) : task.completedDate;

        return {
          ...task,
          status: newStatus,
          startDate: newStartDate,
          completedDate: newCompletedDate,
          updatedAt: new Date().toISOString(),
        };
      })
    );

    return savedLog!;
  };

  const deleteLog = (id: string) => {
    setLogs((prev) => prev.filter((l) => l.id !== id));
  };

  const getLogsForTask = (taskId: string): DailyLog[] => {
    return logs
      .filter((l) => l.taskId === taskId)
      .sort((a, b) => b.date.localeCompare(a.date));
  };

  const getLog = (taskId: string, date: string): DailyLog | undefined => {
    return logs.find((l) => l.taskId === taskId && l.date === date);
  };

  const getLatestLogForTask = (taskId: string): DailyLog | undefined => {
    const taskLogs = getLogsForTask(taskId);
    return taskLogs[0];
  };

  // Google Drive Operations with explicit user confirmation for destructive actions
  const pushToDrive = useCallback(
    async (skipConfirm: boolean = false): Promise<boolean> => {
      let token = await getAccessToken();
      if (!token) {
        setTokenExpired(true);
        if (user) {
          setSyncErrorMessage('Google Drive 访问凭证已到期（1小时安全期），请在下方点击「一键快捷续期」即可恢复同步。');
        } else {
          setSyncErrorMessage('未获得有效 Google Drive 授权，请先连接 Google 账号');
        }
        setSyncStatus('error');
        return false;
      }

      if (!skipConfirm) {
        const confirmed = await requestConfirm({
          title: '上传数据至 Google Drive',
          message: `确定要将本地数据上传并覆盖 Google Drive 中的「${DRIVE_DATA_FILENAME}」吗？\n当前本地包含：${tasks.length} 项任务、${logs.length} 条打卡日志。\n云端现有历史将被完整替换。`,
          confirmText: '确认上传覆盖',
          cancelText: '取消',
          variant: 'primary',
        });
        if (!confirmed) return false;
      }

      setIsSyncing(true);
      setSyncStatus('syncing');
      setSyncErrorMessage(null);

      try {
        let fileId = driveFileId;
        if (!fileId) {
          const found = await findDriveFile(token);
          if (found) {
            fileId = found.id;
          } else {
            const created = await createDriveFile(token, { tasks, logs });
            fileId = created.id;
          }
        } else {
          await updateDriveFileContent(token, fileId, { tasks, logs });
        }

        if (fileId) {
          setDriveFileId(fileId);
          localStorage.setItem(DRIVE_FILE_ID_KEY, fileId);
        }

        const nowIso = new Date().toISOString();
        setLastSyncTime(nowIso);
        localStorage.setItem(LAST_SYNC_KEY, nowIso);
        setSyncStatus('success');
        showToast('已成功上传并同步至 Google Drive', 'success');
        return true;
      } catch (err: any) {
        console.error('Push to Google Drive error:', err);
        setSyncErrorMessage(err.message || '上传同步到 Google Drive 失败');
        setSyncStatus('error');
        return false;
      } finally {
        setIsSyncing(false);
      }
    },
    [driveFileId, tasks, logs, requestConfirm, showToast, user]
  );

  const pullFromDrive = useCallback(
    async (skipConfirm: boolean = false): Promise<boolean> => {
      let token = await getAccessToken();
      if (!token) {
        setTokenExpired(true);
        if (user) {
          setSyncErrorMessage('Google Drive 访问凭证已到期（1小时安全期），请在下方点击「一键快捷续期」即可恢复同步。');
        } else {
          setSyncErrorMessage('未获得有效 Google Drive 授权，请先连接 Google 账号');
        }
        setSyncStatus('error');
        return false;
      }

      if (!skipConfirm) {
        const confirmed = await requestConfirm({
          title: '从 Google Drive 拉取数据',
          message: `确定要从 Google Drive 拉取「${DRIVE_DATA_FILENAME}」并覆盖当前本地数据吗？\n拉取后，本地尚未上传的修改将被云端完整覆盖。`,
          confirmText: '确认拉取覆盖',
          cancelText: '取消',
          variant: 'danger',
        });
        if (!confirmed) return false;
      }

      setIsSyncing(true);
      setSyncStatus('syncing');
      setSyncErrorMessage(null);

      try {
        let fileId = driveFileId;
        if (!fileId) {
          const found = await findDriveFile(token);
          if (found) {
            fileId = found.id;
          } else {
            throw new Error('Google Drive 中尚未找到本系统的数据备份文件，请先点击「上传本地至云端」');
          }
        }

        const payload = await readDriveFileContent(token, fileId);
        if (!payload || !Array.isArray(payload.tasks) || !Array.isArray(payload.logs)) {
          throw new Error('从 Google Drive 读取的数据结构异常或为空');
        }

        setTasks(payload.tasks);
        setLogs(payload.logs);

        setDriveFileId(fileId);
        localStorage.setItem(DRIVE_FILE_ID_KEY, fileId);

        const nowIso = new Date().toISOString();
        setLastSyncTime(nowIso);
        localStorage.setItem(LAST_SYNC_KEY, nowIso);
        setSyncStatus('success');
        showToast('已成功从 Google Drive 拉取云端数据', 'success');
        return true;
      } catch (err: any) {
        console.error('Pull from Google Drive error:', err);
        setSyncErrorMessage(err.message || '从 Google Drive 拉取数据失败');
        setSyncStatus('error');
        return false;
      } finally {
        setIsSyncing(false);
      }
    },
    [driveFileId, requestConfirm, showToast, user]
  );

  const loginWithGoogle = async (forceConsent: boolean = false): Promise<boolean> => {
    setIsLoggingIn(true);
    setSyncErrorMessage(null);
    try {
      const result = await googleSignIn(forceConsent);
      if (result) {
        setUser(result.user);
        setTokenExpired(false);
        showToast(`Google 账号已连接：${result.user.displayName || result.user.email}`, 'success');
        // After login, check if file exists in Drive
        const found = await findDriveFile(result.accessToken);
        if (found) {
          setDriveFileId(found.id);
          localStorage.setItem(DRIVE_FILE_ID_KEY, found.id);
          // Ask user if they want to pull cloud data or push local data
          const wantsPull = await requestConfirm({
            title: '检测到云端已有数据文件',
            message: `已成功连接 Google 账号！检测到您的 Google Drive 中已存在「${DRIVE_DATA_FILENAME}」（最后修改于 ${found.modifiedTime || '未知'}）。\n\n是否立即从云端拉取已有数据覆盖本地？`,
            confirmText: '拉取云端数据',
            cancelText: '保留当前本地',
            variant: 'primary',
          });
          if (wantsPull) {
            await pullFromDrive(true);
          }
        } else {
          // File does not exist yet, prompt to create
          const wantsPush = await requestConfirm({
            title: '初始化云端数据文件',
            message: `已成功连接 Google Drive！目前云端尚未创建「${DRIVE_DATA_FILENAME}」。\n\n是否立即将当前本地的 ${tasks.length} 项任务上传到 Google Drive 初始化云端文件？`,
            confirmText: '立即上传至云端',
            cancelText: '稍后手动上传',
            variant: 'primary',
          });
          if (wantsPush) {
            await pushToDrive(true);
          }
        }
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('Google Sign-in failed:', err);
      setSyncErrorMessage(err.message || 'Google 登录授权失败');
      return false;
    } finally {
      setIsLoggingIn(false);
    }
  };

  const logoutFromGoogle = async () => {
    await logout();
    setUser(null);
    setTokenExpired(true);
    setSyncStatus('idle');
    setSyncErrorMessage(null);
    showToast('已断开 Google Drive 连接', 'info');
  };

  // Modals helpers
  const openCheckInModal = (task: TaskItem, date?: string) => {
    setCheckInModalTask(task);
    setCheckInModalDate(date || getTodayString());
  };

  const closeCheckInModal = () => {
    setCheckInModalTask(null);
    setCheckInModalDate(null);
  };

  const openTaskModal = (task?: TaskItem, defaultStatus?: TaskStatus) => {
    setTaskModalData({ isOpen: true, task, defaultStatus });
  };

  const closeTaskModal = () => {
    setTaskModalData({ isOpen: false });
  };

  const openLogModal = (task: TaskItem, date: string, log?: DailyLog) => {
    setLogModalData({ isOpen: true, task, date, log });
  };

  const closeLogModal = () => {
    setLogModalData({ isOpen: false });
  };

  const resetData = async () => {
    const confirmed = await requestConfirm({
      title: '恢复初始示例数据',
      message: '确定要恢复为初始示例数据吗？当前所有自建与修改数据将被重置。',
      confirmText: '确认恢复',
      cancelText: '取消',
      variant: 'danger',
    });
    if (confirmed) {
      const initial = createInitialSampleData();
      setTasks(initial.tasks);
      setLogs(initial.logs);
      setSelectedTag(null);
      setSearchQuery('');
      showToast('已恢复初始示例数据', 'info');
    }
  };

  const exportData = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify({ tasks, logs }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `media-tracker-backup-${getTodayString()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const importData = (jsonStr: string): boolean => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed.tasks) && Array.isArray(parsed.logs)) {
        setTasks(parsed.tasks);
        setLogs(parsed.logs);
        return true;
      }
    } catch (e) {
      console.error('Import failed:', e);
    }
    return false;
  };

  return (
    <TaskContext.Provider
      value={{
        tasks,
        logs,
        viewMode,
        setViewMode,
        searchQuery,
        setSearchQuery,
        selectedTag,
        setSelectedTag,
        allTags,
        filteredTasks,
        addTask,
        updateTask,
        deleteTask,
        moveTaskStatus,
        reorderTasks,
        addOrUpdateLog,
        deleteLog,
        getLogsForTask,
        getLog,
        getLatestLogForTask,
        checkInModalTask,
        checkInModalDate,
        openCheckInModal,
        closeCheckInModal,
        taskModalData,
        openTaskModal,
        closeTaskModal,
        logModalData,
        openLogModal,
        closeLogModal,
        resetData,
        exportData,
        importData,
        confirmDialogState,
        requestConfirm,
        toast,
        showToast,
        hideToast,
        user,
        tokenExpired,
        isLoggingIn,
        isSyncing,
        lastSyncTime,
        syncStatus,
        syncErrorMessage,
        driveFileId,
        driveSyncModalOpen,
        setDriveSyncModalOpen,
        loginWithGoogle,
        logoutFromGoogle,
        pushToDrive,
        pullFromDrive,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
};

export const useTaskContext = () => {
  const context = useContext(TaskContext);
  if (!context) {
    throw new Error('useTaskContext must be used within a TaskProvider');
  }
  return context;
};
