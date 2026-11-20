import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode, useCallback, useRef } from 'react';
import {
  TaskItem,
  DailyLog,
  TaskStatus,
  ProgressType,
  ViewMode,
  WorkSession,
  RestSession,
  PendingRestPrompt,
  TASK_STATUS_CONFIG,
} from '../types';
import { createInitialSampleData } from '../data/initialData';
import { getTodayString } from '../utils/date';
import {
  computeWorkSessionFromNow,
  addMinutesToTimeHHMM,
} from '../utils/timeDistribution';
import {
  GistUser,
  GistFileInfo,
  GistErrorCode,
  GistSyncError,
  DriveSyncPayload,
  buildSyncPayload,
  formatCompactJsonPayload,
  computeContentHash,
  verifyGistToken,
  getGistById,
  findExistingTrackerGist,
  createTrackerGist,
  updateTrackerGist,
  clearRemoteGistCache,
  mergeSyncPayloads,
} from '../services/githubGist';
import { useLocalSync, LocalSyncInfo, ChoiceResult } from '../hooks/useLocalSync';

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
  reorderTasksGlobal: (draggedId: string, targetId: string, position: 'before' | 'after') => void;

  // Log Actions
  addOrUpdateLog: (data: {
    taskId: string;
    date: string;
    progressType: ProgressType;
    hours?: number;
    note?: string;
    isBackfill?: boolean;
    markTaskAsCompleted?: boolean;
    mode?: 'append' | 'replace';
    restMinutes?: number;
    sessionStartTime?: string;
    sessionEndTime?: string;
  }) => DailyLog;
  addRestSession: (
    taskId: string,
    date: string,
    session: { startTime: string; endTime: string; durationMinutes: number; sessionId?: string }
  ) => void;
  deleteWorkSession: (taskId: string, date: string, sessionId: string) => void;
  deleteLog: (id: string) => void;
  getLogsForTask: (taskId: string) => DailyLog[];
  getLog: (taskId: string, date: string) => DailyLog | undefined;
  getLatestLogForTask: (taskId: string) => DailyLog | undefined;
  getTaskTotalHours: (taskId: string, upToDate?: string) => number;
  pendingRestPrompt: PendingRestPrompt | null;
  setPendingRestPrompt: (prompt: PendingRestPrompt | null) => void;

  // Active Modals Control
  checkInModalTask: TaskItem | null;
  checkInModalDate: string | null;
  openCheckInModal: (task: TaskItem, date?: string) => void;
  closeCheckInModal: () => void;

  taskModalData: { isOpen: boolean; task?: TaskItem; defaultStatus?: TaskStatus };
  openTaskModal: (task?: TaskItem, defaultStatus?: TaskStatus) => void;
  closeTaskModal: () => void;

  taskDetailTaskId: string | null;
  openTaskDetail: (taskId: string) => void;
  closeTaskDetail: () => void;

  // Persistence helpers
  resetData: () => void;
  exportData: () => void;
  importData: (jsonStr: string) => boolean;

  // Undo / Redo History
  canUndo: boolean;
  canRedo: boolean;
  lastUndoDescription: string | null;
  lastRedoDescription: string | null;
  undo: () => void;
  redo: () => void;

  // Gantt group order (synced to Gist)
  ganttGroupOrder: string[];
  setGanttGroupOrder: (order: string[]) => void;

  // In-App Confirm Dialog & Toast
  confirmDialogState: ConfirmDialogState | null;
  requestConfirm: (options: ConfirmDialogOptions) => Promise<boolean>;
  toast: { message: string; type: 'success' | 'error' | 'info'; allowUndo?: boolean } | null;
  showToast: (message: string, type?: 'success' | 'error' | 'info', allowUndo?: boolean) => void;
  hideToast: () => void;

  // GitHub Gist Cloud Sync Integration
  user: GistUser | null;
  gistToken: string | null;
  gistPassphrase: string | null;
  gistHtmlUrl: string | null;
  autoSyncEnabled: boolean;
  setAutoSyncEnabled: (enabled: boolean) => void;
  pendingConflictCount: number;
  isLoggingIn: boolean;
  isSyncing: boolean;
  lastSyncTime: string | null;
  syncStatus: 'idle' | 'syncing' | 'success' | 'error' | 'conflict';
  hasUnsyncedDriveChanges: boolean;
  syncErrorMessage: string | null;
  syncErrorCode: GistErrorCode | null;
  driveFileId: string | null;
  driveSyncModalOpen: boolean;
  setDriveSyncModalOpen: (open: boolean) => void;
  connectWithGistToken: (
    token: string,
    customGistId?: string,
    passphrase?: string
  ) => Promise<boolean>;
  updateEncryptionPassphrase: (nextPassphrase: string) => Promise<boolean>;
  logoutFromGist: () => Promise<void>;
  syncWithGist: (options?: { silent?: boolean }) => Promise<boolean>;
  pushToDrive: (skipConfirm?: boolean) => Promise<boolean>;
  pullFromDrive: (skipConfirm?: boolean) => Promise<boolean>;

  // Local folder sync
  localSync: LocalSyncInfo;
  localSyncModalOpen: boolean;
  setLocalSyncModalOpen: (open: boolean) => void;
  enableLocalSync: () => Promise<boolean>;
  resumeLocalSync: () => Promise<boolean>;
  disableLocalSync: () => Promise<void>;
  writeLocalNow: () => Promise<boolean>;
  pullFromLocalFile: () => Promise<boolean>;
}

export type SyncChoiceResult = 'confirm' | 'alt' | 'secondary_alt' | 'cancel';

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'danger';
}

export interface ChoiceDialogOptions {
  title: string;
  message: string;
  confirmText: string;
  altText: string;
  cancelText: string;
}

export interface SyncChoiceDialogOptions extends ChoiceDialogOptions {
  secondaryAltText?: string;
}

export interface ConfirmDialogState extends ConfirmDialogOptions {
  isOpen: boolean;
  /** When set, extra action buttons are rendered and Enter no longer confirms (only Esc/cancel is a safe default). */
  altText?: string;
  secondaryAltText?: string;
  onConfirm: () => void;
  onAlt?: () => void;
  onSecondaryAlt?: () => void;
  onCancel: () => void;
}

const STORAGE_KEY = 'media_task_tracker_data_v1';
const GIST_TOKEN_KEY = 'media_tracker_gist_token_v1';
const GIST_PASSPHRASE_KEY = 'media_tracker_gist_passphrase_v1';
const GIST_ID_KEY = 'media_tracker_gist_id_v1';
const GIST_HTML_URL_KEY = 'media_tracker_gist_html_url_v1';
const GIST_USER_KEY = 'media_tracker_gist_user_v1';
const GIST_LAST_SYNC_KEY = 'media_tracker_gist_last_sync_v1';
const GIST_LAST_SYNC_HASH_KEY = 'media_tracker_gist_last_sync_hash_v1';
const GIST_BASE_SNAPSHOT_KEY = 'media_tracker_gist_base_snapshot_v1';
const GIST_AUTO_SYNC_KEY = 'media_tracker_gist_auto_sync_v1';
const GANTT_GROUP_ORDER_KEY = 'gantt_group_order_v1';
const VIEW_MODE_KEY = 'media_task_tracker_view_mode';
const HISTORY_SESSION_KEY = 'media_task_tracker_history_session_v1';
const MAX_HISTORY_STEPS = 30;

interface HistorySnapshot {
  tasks: TaskItem[];
  logs: DailyLog[];
  ganttGroupOrder: string[];
  description: string;
}

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

  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    try {
      const saved = localStorage.getItem(VIEW_MODE_KEY);
      if (saved === 'kanban' || saved === 'gantt' || saved === 'stats') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'kanban';
  });

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode);
    } catch {
      // ignore
    }
  }, []);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const [ganttGroupOrder, setGanttGroupOrderState] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(GANTT_GROUP_ORDER_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Undo / Redo stacks (persisted in sessionStorage for current browser tab session)
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>(() => {
    try {
      const saved = sessionStorage.getItem(HISTORY_SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.undoStack)) {
          return parsed.undoStack.slice(-MAX_HISTORY_STEPS);
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>(() => {
    try {
      const saved = sessionStorage.getItem(HISTORY_SESSION_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.redoStack)) {
          return parsed.redoStack.slice(-MAX_HISTORY_STEPS);
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  useEffect(() => {
    try {
      sessionStorage.setItem(
        HISTORY_SESSION_KEY,
        JSON.stringify({ undoStack, redoStack })
      );
    } catch (e) {
      console.warn('Failed to save history to sessionStorage:', e);
    }
  }, [undoStack, redoStack]);

  const latestStateRef = useRef({ tasks, logs, ganttGroupOrder });
  latestStateRef.current = { tasks, logs, ganttGroupOrder };

  const cloneLogsForHistory = (sourceLogs: DailyLog[]): DailyLog[] =>
    sourceLogs.map((l) => ({
      ...l,
      workSessions: l.workSessions
        ? l.workSessions.map((s) => ({
            ...s,
            restSessions: s.restSessions ? s.restSessions.map((r) => ({ ...r })) : undefined,
          }))
        : undefined,
      restSessions: l.restSessions ? l.restSessions.map((s) => ({ ...s })) : undefined,
    }));

  const pushHistory = useCallback((description: string) => {
    const current = latestStateRef.current;
    const snapshot: HistorySnapshot = {
      tasks: current.tasks.map((t) => ({ ...t, tags: [...t.tags] })),
      logs: cloneLogsForHistory(current.logs),
      ganttGroupOrder: [...current.ganttGroupOrder],
      description,
    };
    setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY_STEPS - 1)), snapshot]);
    setRedoStack([]);
  }, []);

  const setGanttGroupOrder = useCallback(
    (order: string[]) => {
      pushHistory('调整甘特分组顺序');
      setGanttGroupOrderState(order);
      localStorage.setItem(GANTT_GROUP_ORDER_KEY, JSON.stringify(order));
    },
    [pushHistory]
  );

  const setGanttGroupOrderSilent = useCallback((order: string[]) => {
    setGanttGroupOrderState(order);
    localStorage.setItem(GANTT_GROUP_ORDER_KEY, JSON.stringify(order));
  }, []);

  // Modals state
  const [checkInModalTask, setCheckInModalTask] = useState<TaskItem | null>(null);
  const [checkInModalDate, setCheckInModalDate] = useState<string | null>(null);

  const [taskModalData, setTaskModalData] = useState<{
    isOpen: boolean;
    task?: TaskItem;
    defaultStatus?: TaskStatus;
  }>({ isOpen: false });

  const [taskDetailTaskId, setTaskDetailTaskId] = useState<string | null>(null);
  const [pendingRestPrompt, setPendingRestPrompt] = useState<PendingRestPrompt | null>(null);

  // GitHub Gist state
  const [gistToken, setGistToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(GIST_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [gistPassphrase, setGistPassphrase] = useState<string | null>(() => {
    try {
      return localStorage.getItem(GIST_PASSPHRASE_KEY);
    } catch {
      return null;
    }
  });
  const [user, setUser] = useState<GistUser | null>(() => {
    try {
      const raw = localStorage.getItem(GIST_USER_KEY);
      return raw ? (JSON.parse(raw) as GistUser) : null;
    } catch {
      return null;
    }
  });
  const [autoSyncEnabled, setAutoSyncEnabledState] = useState<boolean>(() => {
    try {
      return localStorage.getItem(GIST_AUTO_SYNC_KEY) !== '0';
    } catch {
      return true;
    }
  });
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error' | 'conflict'>('idle');
  const [syncErrorMessage, setSyncErrorMessage] = useState<string | null>(null);
  const [syncErrorCode, setSyncErrorCode] = useState<GistErrorCode | null>(null);
  const [pendingConflictCount, setPendingConflictCount] = useState<number>(0);
  const [driveFileId, setDriveFileId] = useState<string | null>(() => localStorage.getItem(GIST_ID_KEY));
  const [gistHtmlUrl, setGistHtmlUrl] = useState<string | null>(() => localStorage.getItem(GIST_HTML_URL_KEY));
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(() => localStorage.getItem(GIST_LAST_SYNC_KEY));
  const [driveLastSyncHash, setDriveLastSyncHash] = useState<string | null>(() => localStorage.getItem(GIST_LAST_SYNC_HASH_KEY));
  const [driveSyncModalOpen, setDriveSyncModalOpen] = useState<boolean>(false);
  const [localSyncModalOpen, setLocalSyncModalOpen] = useState<boolean>(false);

  const gistTokenRef = useRef<string | null>(gistToken);
  gistTokenRef.current = gistToken;
  const gistPassphraseRef = useRef<string | null>(gistPassphrase);
  gistPassphraseRef.current = gistPassphrase;
  const gistIdRef = useRef<string | null>(driveFileId);
  gistIdRef.current = driveFileId;
  const syncErrorCodeRef = useRef<GistErrorCode | null>(syncErrorCode);
  syncErrorCodeRef.current = syncErrorCode;
  const isSyncingRef = useRef<boolean>(false);
  const conflictModalActiveRef = useRef<boolean>(false);
  const lastAutoCheckAtRef = useRef<number>(0);
  const dismissedConflictKeyRef = useRef<string | null>(null);

  const setAutoSyncEnabled = useCallback((enabled: boolean) => {
    setAutoSyncEnabledState(enabled);
    try {
      localStorage.setItem(GIST_AUTO_SYNC_KEY, enabled ? '1' : '0');
    } catch {
      // ignore
    }
  }, []);

  const currentDataHash = useMemo(
    () => computeContentHash({ tasks, logs, ganttGroupOrder }),
    [tasks, logs, ganttGroupOrder]
  );

  const hasUnsyncedDriveChanges = useMemo(() => {
    if (!gistToken) return false;
    if (!driveLastSyncHash) return true;
    return currentDataHash !== driveLastSyncHash;
  }, [gistToken, driveLastSyncHash, currentDataHash]);

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

  // Three-way dialog for local sync hook
  const requestChoice = useCallback(
    (options: ChoiceDialogOptions): Promise<ChoiceResult> => {
      return new Promise<ChoiceResult>((resolve) => {
        setConfirmDialogState({
          ...options,
          isOpen: true,
          variant: 'primary',
          onConfirm: () => {
            setConfirmDialogState(null);
            resolve('confirm');
          },
          onAlt: () => {
            setConfirmDialogState(null);
            resolve('alt');
          },
          onCancel: () => {
            setConfirmDialogState(null);
            resolve('cancel');
          },
        });
      });
    },
    []
  );

  // Up to four-way dialog for GitHub Gist conflict resolution
  const requestSyncChoice = useCallback(
    (options: SyncChoiceDialogOptions): Promise<SyncChoiceResult> => {
      return new Promise<SyncChoiceResult>((resolve) => {
        setConfirmDialogState({
          ...options,
          isOpen: true,
          variant: 'primary',
          onConfirm: () => {
            setConfirmDialogState(null);
            resolve('confirm');
          },
          onAlt: () => {
            setConfirmDialogState(null);
            resolve('alt');
          },
          onSecondaryAlt: options.secondaryAltText
            ? () => {
                setConfirmDialogState(null);
                resolve('secondary_alt');
              }
            : undefined,
          onCancel: () => {
            setConfirmDialogState(null);
            resolve('cancel');
          },
        });
      });
    },
    []
  );

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info'; allowUndo?: boolean } | null>(null);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'info' = 'info', allowUndo: boolean = false) => {
      setToast({ message, type, allowUndo });
    },
    []
  );

  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  const canUndo = undoStack.length > 0;
  const canRedo = redoStack.length > 0;
  const lastUndoDescription = undoStack.length > 0 ? undoStack[undoStack.length - 1].description : null;
  const lastRedoDescription = redoStack.length > 0 ? redoStack[redoStack.length - 1].description : null;

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    const current = latestStateRef.current;
    const redoSnapshot: HistorySnapshot = {
      tasks: current.tasks.map((t) => ({ ...t, tags: [...t.tags] })),
      logs: cloneLogsForHistory(current.logs),
      ganttGroupOrder: [...current.ganttGroupOrder],
      description: entry.description,
    };

    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev.slice(-(MAX_HISTORY_STEPS - 1)), redoSnapshot]);

    setTasks(entry.tasks);
    setLogs(entry.logs);
    setGanttGroupOrderSilent(entry.ganttGroupOrder);
    showToast(`已撤销：${entry.description}`, 'info', false);
  }, [undoStack, setGanttGroupOrderSilent, showToast]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    const current = latestStateRef.current;
    const undoSnapshot: HistorySnapshot = {
      tasks: current.tasks.map((t) => ({ ...t, tags: [...t.tags] })),
      logs: cloneLogsForHistory(current.logs),
      ganttGroupOrder: [...current.ganttGroupOrder],
      description: entry.description,
    };

    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY_STEPS - 1)), undoSnapshot]);

    setTasks(entry.tasks);
    setLogs(entry.logs);
    setGanttGroupOrderSilent(entry.ganttGroupOrder);
    showToast(`已重做：${entry.description}`, 'info', false);
  }, [redoStack, setGanttGroupOrderSilent, showToast]);

  // Global keyboard shortcuts: Ctrl+Z / Cmd+Z for Undo, Ctrl+Y / Ctrl+Shift+Z for Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      // Do not intercept inside inputs, textareas, or contenteditable elements
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      // Do not intercept when a modal dialog is open
      if (
        taskModalData.isOpen ||
        !!checkInModalTask ||
        !!confirmDialogState?.isOpen ||
        driveSyncModalOpen ||
        localSyncModalOpen
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) {
          if (undoStack.length > 0) {
            e.preventDefault();
            undo();
          }
        } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
          if (redoStack.length > 0) {
            e.preventDefault();
            redo();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    undo,
    redo,
    undoStack.length,
    redoStack.length,
    taskModalData.isOpen,
    checkInModalTask,
    confirmDialogState?.isOpen,
    driveSyncModalOpen,
    localSyncModalOpen,
  ]);

  // Local folder sync (one-way: app -> file, plus manual one-off read)
  const applyPayload = useCallback(
    (payload: DriveSyncPayload) => {
      setTasks(payload.tasks);
      setLogs(payload.logs);
      if (Array.isArray(payload.ganttGroupOrder)) {
        setGanttGroupOrderSilent(payload.ganttGroupOrder);
      }
    },
    [setGanttGroupOrderSilent]
  );

  const {
    localSync,
    enableLocalSync,
    resumeLocalSync,
    disableLocalSync,
    writeLocalNow,
    pullFromLocalFile,
  } = useLocalSync({
    tasks,
    logs,
    ganttGroupOrder,
    applyPayload,
    requestConfirm,
    requestChoice,
    showToast,
  });

  // Sync tasks & logs to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks, logs }));
    } catch (e) {
      console.error('Failed to save to localStorage:', e);
    }
  }, [tasks, logs]);

  // Refresh stored GitHub user profile quietly when a token is already present
  useEffect(() => {
    const token = gistTokenRef.current;
    if (!token || user) return;
    let cancelled = false;
    verifyGistToken(token)
      .then((profile) => {
        if (cancelled) return;
        setUser(profile);
        try {
          localStorage.setItem(GIST_USER_KEY, JSON.stringify(profile));
        } catch {
          // ignore
        }
      })
      .catch(() => {
        // Error will be surfaced on sync attempt if token is invalid
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const trimmedTitle = data.title.trim();
    pushHistory(`新建任务「${trimmedTitle}」`);
    const today = getTodayString();
    const newTask: TaskItem = {
      id: 'task-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      title: trimmedTitle,
      tags: data.tags.map((t) => t.trim()).filter(Boolean),
      status: data.status,
      order: Date.now(),
      startDate: data.status === 'in_progress' ? today : null,
      completedDate: data.status === 'done' ? today : null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setTasks((prev) => [newTask, ...prev]);
    showToast(`已创建任务「${trimmedTitle}」`, 'success', true);
    return newTask;
  };

  const updateTask = (id: string, updates: Partial<TaskItem>) => {
    const existing = tasks.find((t) => t.id === id);
    if (existing) {
      pushHistory(`编辑任务「${existing.title}」`);
    }
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
    if (existing) {
      showToast(`已更新任务「${updates.title || existing.title}」`, 'success', true);
    }
  };

  const deleteTask = (id: string) => {
    const existing = tasks.find((t) => t.id === id);
    if (existing) {
      pushHistory(`删除任务「${existing.title}」`);
    }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setLogs((prev) => prev.filter((l) => l.taskId !== id));
  };

  const moveTaskStatus = (id: string, newStatus: TaskStatus) => {
    const existing = tasks.find((t) => t.id === id);
    if (!existing || existing.status === newStatus) return;
    pushHistory(`将「${existing.title}」移至${TASK_STATUS_CONFIG[newStatus].label}`);
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
    showToast(`已将「${existing.title}」移至${TASK_STATUS_CONFIG[newStatus].label}`, 'info', true);
  };

  const reorderTasks = (draggedId: string, targetId: string, position: 'before' | 'after') => {
    const draggedTask = tasks.find((t) => t.id === draggedId);
    const targetTask = tasks.find((t) => t.id === targetId);
    if (!draggedTask || !targetTask || draggedId === targetId || draggedTask.status !== targetTask.status) {
      return;
    }
    pushHistory(`调整任务「${draggedTask.title}」排序`);
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

  // Gantt-view variant: no status restriction — tasks in same tag-group can have different statuses
  const reorderTasksGlobal = (draggedId: string, targetId: string, position: 'before' | 'after') => {
    const draggedTask = tasks.find((t) => t.id === draggedId);
    const targetTask = tasks.find((t) => t.id === targetId);
    if (!draggedTask || !targetTask || draggedId === targetId) return;
    pushHistory(`调整任务「${draggedTask.title}」排序`);
    setTasks((prev) => {
      const dragged = prev.find((t) => t.id === draggedId);
      const target = prev.find((t) => t.id === targetId);
      if (!dragged || !target || draggedId === targetId) return prev;

      // Sort all tasks by current order
      const sorted = [...prev].sort((a, b) => {
        const aOrder = a.order ?? -new Date(a.createdAt).getTime();
        const bOrder = b.order ?? -new Date(b.createdAt).getTime();
        return aOrder - bOrder;
      });

      // Remove dragged, reinsert at target position
      const withoutDragged = sorted.filter((t) => t.id !== draggedId);
      const targetIdx = withoutDragged.findIndex((t) => t.id === targetId);
      const insertIdx = position === 'before' ? targetIdx : targetIdx + 1;
      withoutDragged.splice(insertIdx, 0, dragged);

      // Reassign order values with spacing
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
  const recalcTaskMetricsFromLogs = (taskLogs: DailyLog[]) => {
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
    return { totalHours, totalRestMinutes };
  };

  const ensureNormalizedWorkSessions = (log: DailyLog): WorkSession[] => {
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
      typeof log.hours === 'number' && !isNaN(log.hours) ? Math.round(log.hours * 10) / 10 : 0;
    const created = log.createdAt ? new Date(log.createdAt) : new Date();
    const calc = computeWorkSessionFromNow(prevHours > 0 ? prevHours : 0.1, created);
    const wsId = 'ws-init-' + log.id;
    const attachedRests = flatRests.map((rs) => ({ ...rs, sessionId: wsId }));
    const totalRestMinutes = attachedRests.reduce((s, r) => s + r.durationMinutes, 0);

    return [
      {
        id: wsId,
        startTime: prevHours > 0 ? calc.startTime : calc.endTime,
        endTime: calc.endTime,
        hours: prevHours,
        note: log.note,
        progressType: log.progressType,
        isBackfill: log.isBackfill || undefined,
        restSessions: attachedRests.length > 0 ? attachedRests : undefined,
        totalRestMinutes: totalRestMinutes > 0 ? totalRestMinutes : undefined,
        recordedAt: log.createdAt || created.toISOString(),
      },
    ];
  };

  const aggregateLogFromSessions = (
    base: Omit<
      DailyLog,
      'progressType' | 'hours' | 'note' | 'isBackfill' | 'workSessions' | 'restSessions' | 'totalRestMinutes'
    >,
    sessions: WorkSession[],
    extraUnlinkedRests: RestSession[] = []
  ): DailyLog => {
    const rawHoursSum = sessions.reduce(
      (s, ws) => s + (typeof ws.hours === 'number' && !isNaN(ws.hours) ? ws.hours : 0),
      0
    );
    const roundedHours = Math.round(rawHoursSum * 10) / 10;
    const hasExplicitHours = sessions.some(
      (ws) => typeof ws.hours === 'number' && !isNaN(ws.hours) && ws.hours > 0
    );
    const allBackfill = sessions.length > 0 && sessions.every((ws) => Boolean(ws.isBackfill));

    const noteParts = sessions.map((ws) => ws.note?.trim()).filter(Boolean) as string[];
    const mergedNote = noteParts.length > 0 ? noteParts.join(' ｜ ') : undefined;

    let aggProgress: ProgressType = 'rest';
    if (sessions.some((ws) => ws.progressType === 'completed')) {
      aggProgress = 'completed';
    } else if (sessions.some((ws) => (ws.progressType ?? 'progress') === 'progress')) {
      aggProgress = 'progress';
    }

    const restMap = new Map<string, RestSession>();
    sessions.forEach((ws) => {
      (ws.restSessions || []).forEach((rs) => restMap.set(rs.id, rs));
    });
    extraUnlinkedRests.forEach((rs) => {
      if (!restMap.has(rs.id)) restMap.set(rs.id, rs);
    });
    const allRests = Array.from(restMap.values());
    const totalRestMinutes = allRests.reduce((s, r) => s + r.durationMinutes, 0);

    return {
      ...base,
      progressType: aggProgress,
      hours: hasExplicitHours ? roundedHours : undefined,
      note: mergedNote,
      isBackfill: allBackfill ? true : undefined,
      workSessions: sessions,
      restSessions: allRests.length > 0 ? allRests : undefined,
      totalRestMinutes: totalRestMinutes > 0 ? totalRestMinutes : undefined,
    };
  };

  const createWorkSessionEntry = (
    hoursVal: number | undefined,
    noteVal: string | undefined,
    progressType: ProgressType,
    restMinutesVal: number | undefined,
    sessionStartTime?: string,
    sessionEndTime?: string,
    isBackfill?: boolean
  ): WorkSession => {
    const now = new Date();
    const safeHours =
      typeof hoursVal === 'number' && !isNaN(hoursVal) && hoursVal >= 0
        ? Math.round(hoursVal * 100) / 100
        : 0;
    const calc = computeWorkSessionFromNow(safeHours > 0 ? safeHours : 0.1, now);
    const resolvedStartTime = sessionStartTime || (safeHours > 0 ? calc.startTime : calc.endTime);
    const resolvedEndTime = sessionEndTime || calc.endTime;
    const wsId = 'ws-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);

    const parsedRest =
      typeof restMinutesVal === 'number' && !isNaN(restMinutesVal) && restMinutesVal > 0
        ? Math.round(restMinutesVal)
        : 0;
    const restSessions: RestSession[] | undefined =
      parsedRest > 0
        ? [
            {
              id: 'rest-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
              sessionId: wsId,
              startTime: resolvedEndTime,
              endTime: addMinutesToTimeHHMM(resolvedEndTime, parsedRest),
              durationMinutes: parsedRest,
              recordedAt: now.toISOString(),
            },
          ]
        : undefined;

    return {
      id: wsId,
      startTime: resolvedStartTime,
      endTime: resolvedEndTime,
      hours: safeHours,
      note: noteVal?.trim() || undefined,
      progressType,
      isBackfill: isBackfill ? true : undefined,
      restSessions,
      totalRestMinutes: parsedRest > 0 ? parsedRest : undefined,
      recordedAt: now.toISOString(),
    };
  };

  const addOrUpdateLog = ({
    taskId,
    date,
    progressType,
    note,
    hours,
    isBackfill,
    markTaskAsCompleted,
    mode = 'replace',
    restMinutes,
    sessionStartTime,
    sessionEndTime,
  }: {
    taskId: string;
    date: string;
    progressType: ProgressType;
    note?: string;
    hours?: number;
    isBackfill?: boolean;
    markTaskAsCompleted?: boolean;
    mode?: 'append' | 'replace';
    restMinutes?: number;
    sessionStartTime?: string;
    sessionEndTime?: string;
  }): DailyLog => {
    const currentTasks = latestStateRef.current.tasks;
    const currentLogs = latestStateRef.current.logs;
    const targetTask = currentTasks.find((t) => t.id === taskId);
    const existingLog = currentLogs.find((l) => l.taskId === taskId && l.date === date);

    const actionLabel = existingLog
      ? mode === 'append'
        ? '追加记录'
        : '更新打卡'
      : '添加打卡';
    pushHistory(`${actionLabel}「${targetTask?.title || ''}」(${date})`);

    const parsedHours =
      typeof hours === 'number' && !isNaN(hours) && hours >= 0
        ? Math.round(hours * 100) / 100
        : undefined;
    const parsedRestMinutes =
      typeof restMinutes === 'number' && !isNaN(restMinutes) && restMinutes > 0
        ? Math.round(restMinutes)
        : undefined;

    let savedLog: DailyLog;
    let nextLogs: DailyLog[];
    const existingIndex = currentLogs.findIndex((l) => l.taskId === taskId && l.date === date);

    if (existingIndex >= 0 && existingLog) {
      if (mode === 'append') {
        const normalizedPrev = ensureNormalizedWorkSessions(existingLog);
        const newSession = createWorkSessionEntry(
          parsedHours,
          note,
          progressType,
          parsedRestMinutes,
          sessionStartTime,
          sessionEndTime,
          isBackfill
        );
        savedLog = aggregateLogFromSessions(
          {
            id: existingLog.id,
            taskId: existingLog.taskId,
            date: existingLog.date,
            createdAt: existingLog.createdAt,
          },
          [...normalizedPrev, newSession]
        );
      } else {
        const existingSessions = ensureNormalizedWorkSessions(existingLog);
        if (existingSessions.length <= 1) {
          const prevSingle = existingSessions[0];
          const updatedSingle = createWorkSessionEntry(
            parsedHours,
            note,
            progressType,
            parsedRestMinutes,
            sessionStartTime,
            sessionEndTime,
            isBackfill
          );
          const keptRests = prevSingle?.restSessions || [];
          const mergedRests = [
            ...keptRests.map((r) => ({ ...r, sessionId: updatedSingle.id })),
            ...(updatedSingle.restSessions || []),
          ];
          const totalRest = mergedRests.reduce((s, r) => s + r.durationMinutes, 0);
          const rebuiltSession: WorkSession = {
            ...updatedSingle,
            restSessions: mergedRests.length > 0 ? mergedRests : undefined,
            totalRestMinutes: totalRest > 0 ? totalRest : undefined,
          };
          savedLog = aggregateLogFromSessions(
            {
              id: existingLog.id,
              taskId: existingLog.taskId,
              date: existingLog.date,
              createdAt: existingLog.createdAt,
            },
            [rebuiltSession]
          );
          // Preserve explicit 0h if user entered 0
          if (parsedHours === 0) {
            savedLog.hours = 0;
          }
        } else {
          // Multi-session replace modifies top-level log fields without erasing individual sessions
          let nextRestSessions = existingLog.restSessions ? [...existingLog.restSessions] : [];
          if (parsedRestMinutes) {
            const now = new Date();
            const endTime = computeWorkSessionFromNow(0.1, now).endTime;
            nextRestSessions.push({
              id: 'rest-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
              startTime: endTime,
              endTime: addMinutesToTimeHHMM(endTime, parsedRestMinutes),
              durationMinutes: parsedRestMinutes,
              recordedAt: now.toISOString(),
            });
          }
          const totalRestMinutes = nextRestSessions.reduce((s, r) => s + r.durationMinutes, 0);
          savedLog = {
            ...existingLog,
            progressType,
            hours: parsedHours,
            note: note?.trim() || undefined,
            isBackfill: isBackfill !== undefined ? isBackfill || undefined : existingLog.isBackfill,
            workSessions:
              isBackfill !== undefined
                ? existingLog.workSessions?.map((ws) => ({
                    ...ws,
                    isBackfill: isBackfill || undefined,
                  }))
                : existingLog.workSessions,
            restSessions: nextRestSessions.length > 0 ? nextRestSessions : undefined,
            totalRestMinutes: totalRestMinutes > 0 ? totalRestMinutes : undefined,
          };
        }
      }
      nextLogs = [...currentLogs];
      nextLogs[existingIndex] = savedLog;
    } else {
      const initialSession = createWorkSessionEntry(
        parsedHours,
        note,
        progressType,
        parsedRestMinutes,
        sessionStartTime,
        sessionEndTime,
        isBackfill
      );
      savedLog = aggregateLogFromSessions(
        {
          id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          taskId,
          date,
          createdAt: new Date().toISOString(),
        },
        [initialSession]
      );
      if (parsedHours === 0) {
        savedLog.hours = 0;
      }
      nextLogs = [...currentLogs, savedLog];
    }

    const updatedLogsForTask = nextLogs.filter((l) => l.taskId === taskId);
    setLogs(nextLogs);

    setTasks((prev) =>
      prev.map((task) => {
        if (task.id !== taskId) return task;

        const isMarkDone = markTaskAsCompleted || savedLog.progressType === 'completed';
        const newStatus = isMarkDone ? 'done' : task.status === 'backlog' ? 'in_progress' : task.status;
        const newStartDate = task.startDate || date;
        const newCompletedDate = isMarkDone ? (task.completedDate || date) : task.completedDate;
        const { totalHours, totalRestMinutes } = recalcTaskMetricsFromLogs(updatedLogsForTask);

        return {
          ...task,
          status: newStatus,
          startDate: newStartDate,
          completedDate: newCompletedDate,
          totalHours,
          totalRestMinutes,
          updatedAt: new Date().toISOString(),
        };
      })
    );

    return savedLog;
  };

  const addRestSession = useCallback(
    (
      taskId: string,
      date: string,
      session: { startTime: string; endTime: string; durationMinutes: number; sessionId?: string }
    ) => {
      const currentTasks = latestStateRef.current.tasks;
      const currentLogs = latestStateRef.current.logs;
      const targetTask = currentTasks.find((t) => t.id === taskId);
      const mins = Math.max(1, Math.round(session.durationMinutes));

      pushHistory(`记录「${targetTask?.title || ''}」事后休息 ${mins} 分钟`);

      const existingIndex = currentLogs.findIndex((l) => l.taskId === taskId && l.date === date);
      let nextLogs: DailyLog[];

      if (existingIndex >= 0) {
        const prevLog = currentLogs[existingIndex];
        const sessions = ensureNormalizedWorkSessions(prevLog);
        const targetIdx = session.sessionId
          ? sessions.findIndex((s) => s.id === session.sessionId)
          : sessions.length - 1;
        const resolvedSessionId = targetIdx >= 0 ? sessions[targetIdx].id : undefined;

        const newRest: RestSession = {
          id: 'rest-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          sessionId: resolvedSessionId,
          startTime: session.startTime,
          endTime: session.endTime,
          durationMinutes: mins,
          recordedAt: new Date().toISOString(),
        };

        const updatedSessions = sessions.map((s, idx) => {
          if (idx !== targetIdx) return s;
          const nextRs = [...(s.restSessions || []), newRest];
          return {
            ...s,
            restSessions: nextRs,
            totalRestMinutes: nextRs.reduce((sum, r) => sum + r.durationMinutes, 0),
          };
        });

        const updatedLog = aggregateLogFromSessions(
          {
            id: prevLog.id,
            taskId: prevLog.taskId,
            date: prevLog.date,
            createdAt: prevLog.createdAt,
          },
          updatedSessions
        );
        // Preserve multi-session replace top-level hours/note if they differed
        if (prevLog.hours === 0 && !updatedLog.hours) {
          updatedLog.hours = 0;
        }
        nextLogs = [...currentLogs];
        nextLogs[existingIndex] = updatedLog;
      } else {
        const initialSession = createWorkSessionEntry(0, undefined, 'progress', undefined);
        const newRest: RestSession = {
          id: 'rest-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          sessionId: initialSession.id,
          startTime: session.startTime,
          endTime: session.endTime,
          durationMinutes: mins,
          recordedAt: new Date().toISOString(),
        };
        initialSession.restSessions = [newRest];
        initialSession.totalRestMinutes = mins;

        const createdLog = aggregateLogFromSessions(
          {
            id: 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
            taskId,
            date,
            createdAt: new Date().toISOString(),
          },
          [initialSession]
        );
        nextLogs = [...currentLogs, createdLog];
      }

      const { totalRestMinutes: taskTotalRestMinutes } = recalcTaskMetricsFromLogs(
        nextLogs.filter((l) => l.taskId === taskId)
      );

      setLogs(nextLogs);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                totalRestMinutes: taskTotalRestMinutes,
                updatedAt: new Date().toISOString(),
              }
            : t
        )
      );
    },
    [pushHistory]
  );

  const deleteWorkSession = useCallback(
    (taskId: string, date: string, sessionId: string) => {
      const currentTasks = latestStateRef.current.tasks;
      const currentLogs = latestStateRef.current.logs;
      const existingIndex = currentLogs.findIndex((l) => l.taskId === taskId && l.date === date);
      if (existingIndex < 0) return;

      const targetTask = currentTasks.find((t) => t.id === taskId);
      const prevLog = currentLogs[existingIndex];
      const sessions = ensureNormalizedWorkSessions(prevLog);
      const remainingSessions = sessions.filter((s) => s.id !== sessionId);

      pushHistory(`删除「${targetTask?.title || ''}」${date} 的一条记录`);

      let nextLogs: DailyLog[];
      if (remainingSessions.length === 0) {
        nextLogs = currentLogs.filter((l) => l.id !== prevLog.id);
      } else {
        const updatedLog = aggregateLogFromSessions(
          {
            id: prevLog.id,
            taskId: prevLog.taskId,
            date: prevLog.date,
            createdAt: prevLog.createdAt,
          },
          remainingSessions
        );
        nextLogs = [...currentLogs];
        nextLogs[existingIndex] = updatedLog;
      }

      const taskLogs = nextLogs.filter((l) => l.taskId === taskId);
      const { totalHours, totalRestMinutes } = recalcTaskMetricsFromLogs(taskLogs);

      setLogs(nextLogs);
      setTasks((prev) =>
        prev.map((t) =>
          t.id === taskId
            ? {
                ...t,
                totalHours,
                totalRestMinutes,
                updatedAt: new Date().toISOString(),
              }
            : t
        )
      );
    },
    [pushHistory]
  );

  const deleteLog = (id: string) => {
    const currentLogs = latestStateRef.current.logs;
    const currentTasks = latestStateRef.current.tasks;
    const target = currentLogs.find((l) => l.id === id);
    if (target) {
      const targetTask = currentTasks.find((t) => t.id === target.taskId);
      pushHistory(`删除「${targetTask?.title || ''}」${target.date} 的打卡记录`);
    }
    const remainingAllLogs = currentLogs.filter((l) => l.id !== id);
    setLogs(remainingAllLogs);
    if (target) {
      setTasks((prev) =>
        prev.map((task) => {
          if (task.id !== target.taskId) return task;
          const remainingLogs = remainingAllLogs.filter((l) => l.taskId === target.taskId);
          const { totalHours, totalRestMinutes } = recalcTaskMetricsFromLogs(remainingLogs);
          return {
            ...task,
            totalHours,
            totalRestMinutes,
            updatedAt: new Date().toISOString(),
          };
        })
      );
    }
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

  const getTaskTotalHours = useCallback(
    (taskId: string, upToDate?: string): number => {
      let taskLogs = logs.filter((l) => l.taskId === taskId);
      if (upToDate) {
        taskLogs = taskLogs.filter((l) => l.date <= upToDate);
      }
      const sumHours = taskLogs.reduce(
        (sum, l) => sum + (typeof l.hours === 'number' && !isNaN(l.hours) ? l.hours : 0),
        0
      );
      if (sumHours > 0 || upToDate) {
        return Math.round(sumHours * 10) / 10;
      }
      const task = tasks.find((t) => t.id === taskId);
      if (typeof task?.totalHours === 'number' && !isNaN(task.totalHours) && task.totalHours > 0) {
        return Math.round(task.totalHours * 10) / 10;
      }
      return 0;
    },
    [tasks, logs]
  );

  // GitHub Gist Base Snapshot & Sync State Helpers
  const loadBaseSnapshot = useCallback((): DriveSyncPayload | null => {
    try {
      const raw = localStorage.getItem(GIST_BASE_SNAPSHOT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.logs)) {
        return parsed as DriveSyncPayload;
      }
    } catch {
      // ignore
    }
    return null;
  }, []);

  const persistSyncSuccessState = useCallback(
    (gistInfo: { id: string; htmlUrl?: string }, syncedPayload: DriveSyncPayload) => {
      const normalizedPayload: DriveSyncPayload = {
        ...syncedPayload,
        ganttGroupOrder: Array.isArray(syncedPayload.ganttGroupOrder) ? syncedPayload.ganttGroupOrder : [],
      };
      const newHash = computeContentHash({
        tasks: normalizedPayload.tasks,
        logs: normalizedPayload.logs,
        ganttGroupOrder: normalizedPayload.ganttGroupOrder,
      });
      const nowIso = new Date().toISOString();

      gistIdRef.current = gistInfo.id;
      setDriveFileId(gistInfo.id);
      localStorage.setItem(GIST_ID_KEY, gistInfo.id);

      if (gistInfo.htmlUrl) {
        setGistHtmlUrl(gistInfo.htmlUrl);
        localStorage.setItem(GIST_HTML_URL_KEY, gistInfo.htmlUrl);
      }

      setLastSyncTime(nowIso);
      localStorage.setItem(GIST_LAST_SYNC_KEY, nowIso);
      setDriveLastSyncHash(newHash);
      localStorage.setItem(GIST_LAST_SYNC_HASH_KEY, newHash);

      try {
        localStorage.setItem(GIST_BASE_SNAPSHOT_KEY, JSON.stringify(normalizedPayload));
      } catch (e) {
        console.warn('Failed to save Gist base snapshot:', e);
      }

      dismissedConflictKeyRef.current = null;
      setPendingConflictCount(0);
      setSyncErrorMessage(null);
      setSyncErrorCode(null);
      setSyncStatus('success');
    },
    []
  );

  const applyGistPayloadToState = useCallback(
    (payload: DriveSyncPayload) => {
      setTasks(payload.tasks);
      setLogs(payload.logs);
      setGanttGroupOrderSilent(Array.isArray(payload.ganttGroupOrder) ? payload.ganttGroupOrder : []);
    },
    [setGanttGroupOrderSilent]
  );

  const syncWithGist = useCallback(
    async (options?: {
      silent?: boolean;
      overrideToken?: string;
      overrideGistId?: string | null;
      overridePassphrase?: string;
    }): Promise<boolean> => {
      const silent = options?.silent ?? false;
      const token = (options?.overrideToken ?? gistTokenRef.current)?.trim() || '';
      const passphrase =
        options?.overridePassphrase !== undefined
          ? options.overridePassphrase.trim()
          : gistPassphraseRef.current?.trim() || '';

      if (!token) {
        if (!silent) {
          setSyncErrorMessage('尚未配置 GitHub Token，请先连接 GitHub Gist');
          setSyncErrorCode('API_ERROR');
          setSyncStatus('error');
        }
        return false;
      }

      if (isSyncingRef.current || conflictModalActiveRef.current) {
        return false;
      }

      isSyncingRef.current = true;
      lastAutoCheckAtRef.current = Date.now();
      setIsSyncing(true);
      if (!silent) {
        setSyncStatus('syncing');
      }
      setSyncErrorMessage(null);
      setSyncErrorCode(null);

      try {
        const explicitGistId =
          options?.overrideGistId !== undefined ? options.overrideGistId : gistIdRef.current;

        let remoteGist: GistFileInfo | null = null;
        if (explicitGistId) {
          try {
            remoteGist = await getGistById(token, explicitGistId, passphrase);
          } catch (err: any) {
            if (options?.overrideGistId) {
              throw err;
            }
            // If cached gistId was deleted remotely (404), try searching all gists
            if (String(err?.message || '').includes('404')) {
              remoteGist = await findExistingTrackerGist(token, passphrase);
            } else {
              throw err;
            }
          }
        } else {
          remoteGist = await findExistingTrackerGist(token, passphrase);
        }

        // Case A: Cloud file does not exist yet -> create or update gist with current local data
        if (!remoteGist || !remoteGist.payload) {
          const currentPayload = buildSyncPayload(latestStateRef.current);
          const created = remoteGist
            ? await updateTrackerGist(token, remoteGist.id, currentPayload, passphrase)
            : await createTrackerGist(token, currentPayload, passphrase);
          persistSyncSuccessState(created, currentPayload);
          showToast(
            silent ? '已自动初始化 GitHub Gist 云端存档' : '已在 GitHub Gist 创建并上传云端存档',
            'success'
          );
          return true;
        }

        const cloudPayload = remoteGist.payload;
        const baseSnapshot = loadBaseSnapshot();
        const localPayloadNow = buildSyncPayload(latestStateRef.current);
        const analysis = mergeSyncPayloads(baseSnapshot, localPayloadNow, cloudPayload);

        if (analysis.status === 'identical') {
          if (remoteGist.needsShardMigration || remoteGist.needsEncryptionMigration) {
            const migrated = await updateTrackerGist(
              token,
              remoteGist.id,
              localPayloadNow,
              passphrase
            );
            persistSyncSuccessState(migrated, localPayloadNow);
            showToast(
              remoteGist.needsEncryptionMigration
                ? '已将云端存档加密并完成同步'
                : '已将云端存档平滑升级为按月分片格式',
              'success'
            );
          } else {
            persistSyncSuccessState(remoteGist, localPayloadNow);
            if (!silent) {
              showToast('本地与 GitHub Gist 数据已是最新', 'success');
            }
          }
          return true;
        }

        if (analysis.status === 'local-ahead') {
          const updated = await updateTrackerGist(token, remoteGist.id, localPayloadNow, passphrase);
          persistSyncSuccessState(updated, localPayloadNow);
          if (!silent) {
            showToast('已同步本地修改至 GitHub Gist', 'success');
          }
          return true;
        }

        if (analysis.status === 'cloud-ahead') {
          pushHistory('从 GitHub Gist 自动同步云端更新');
          if (remoteGist.needsShardMigration || remoteGist.needsEncryptionMigration) {
            const migrated = await updateTrackerGist(token, remoteGist.id, cloudPayload, passphrase);
            persistSyncSuccessState(migrated, cloudPayload);
          } else {
            persistSyncSuccessState(remoteGist, cloudPayload);
          }
          applyGistPayloadToState(cloudPayload);
          showToast('已从 GitHub Gist 同步最新云端数据', 'success');
          return true;
        }

        if (analysis.status === 'auto-merged') {
          pushHistory('自动合并本地与 GitHub Gist 云端数据');
          const updated = await updateTrackerGist(
            token,
            remoteGist.id,
            analysis.mergedPayload,
            passphrase
          );
          persistSyncSuccessState(updated, analysis.mergedPayload);
          applyGistPayloadToState(analysis.mergedPayload);
          showToast('已自动合并云端与本地变更并完成同步', 'success');
          return true;
        }

        // analysis.status === 'conflict'
        const localHash = computeContentHash(localPayloadNow);
        const cloudHash = computeContentHash(cloudPayload);
        const conflictPairKey = `${localHash}__${cloudHash}`;

        setPendingConflictCount(analysis.conflicts.length);
        setSyncStatus('conflict');

        if (silent && dismissedConflictKeyRef.current === conflictPairKey) {
          return false;
        }

        const previewLines = analysis.conflicts
          .slice(0, 5)
          .map((c) => `• ${c.title}：${c.detail}`);
        if (analysis.conflicts.length > 5) {
          previewLines.push(`• ……另有 ${analysis.conflicts.length - 5} 项冲突记录`);
        }

        const cloudTimeText = remoteGist.updatedAt
          ? new Date(remoteGist.updatedAt).toLocaleString('zh-CN')
          : '未知时间';

        conflictModalActiveRef.current = true;
        let choice: SyncChoiceResult = 'cancel';
        try {
          choice = await requestSyncChoice({
            title: '检测到云端与本地同步冲突',
            message:
              `两端同时修改了以下 ${analysis.conflicts.length} 处记录：\n` +
              `${previewLines.join('\n')}\n\n` +
              `本地：${localPayloadNow.tasks.length} 项任务 · ${localPayloadNow.logs.length} 条打卡\n` +
              `云端：${cloudPayload.tasks.length} 项任务 · ${cloudPayload.logs.length} 条打卡（更新于 ${cloudTimeText}）\n\n` +
              `选择「智能合并」将保留两端所有无冲突的新增任务与打卡，冲突字段以最新修改时间为准。`,
            confirmText: '智能合并并同步（推荐）',
            altText: '用云端覆盖本地',
            secondaryAltText: '用本地覆盖云端',
            cancelText: '暂不处理',
          });
        } finally {
          conflictModalActiveRef.current = false;
        }

        // Re-read latest state in case user somehow modified something while dialog was open
        const latestLocal = buildSyncPayload(latestStateRef.current);
        const latestAnalysis =
          computeContentHash(latestLocal) === localHash
            ? analysis
            : mergeSyncPayloads(baseSnapshot, latestLocal, cloudPayload);

        if (choice === 'confirm') {
          pushHistory('智能合并云端与本地冲突数据');
          const updated = await updateTrackerGist(
            token,
            remoteGist.id,
            latestAnalysis.mergedPayload,
            passphrase
          );
          persistSyncSuccessState(updated, latestAnalysis.mergedPayload);
          applyGistPayloadToState(latestAnalysis.mergedPayload);
          showToast('已完成智能合并并同步至 GitHub Gist', 'success');
          return true;
        }

        if (choice === 'alt') {
          pushHistory('以 GitHub Gist 云端数据覆盖本地');
          if (remoteGist.needsShardMigration || remoteGist.needsEncryptionMigration) {
            const migrated = await updateTrackerGist(token, remoteGist.id, cloudPayload, passphrase);
            persistSyncSuccessState(migrated, cloudPayload);
          } else {
            persistSyncSuccessState(remoteGist, cloudPayload);
          }
          applyGistPayloadToState(cloudPayload);
          showToast('已使用云端数据覆盖本地', 'info');
          return true;
        }

        if (choice === 'secondary_alt') {
          const updated = await updateTrackerGist(token, remoteGist.id, latestLocal, passphrase);
          persistSyncSuccessState(updated, latestLocal);
          showToast('已使用本地数据覆盖 GitHub Gist 云端', 'success');
          return true;
        }

        dismissedConflictKeyRef.current = conflictPairKey;
        setSyncStatus('conflict');
        return false;
      } catch (err: any) {
        console.error('GitHub Gist sync error:', err);
        const errCode: GistErrorCode = err instanceof GistSyncError ? err.code : 'API_ERROR';
        setSyncErrorCode(errCode);
        setSyncErrorMessage(err?.message || 'GitHub Gist 同步失败');
        setSyncStatus('error');
        if (!silent) {
          showToast(err?.message || 'GitHub Gist 同步失败', 'error');
        }
        return false;
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    },
    [
      loadBaseSnapshot,
      persistSyncSuccessState,
      applyGistPayloadToState,
      pushHistory,
      requestSyncChoice,
      showToast,
    ]
  );

  // Manual force push (local -> cloud)
  const pushToDrive = useCallback(
    async (skipConfirm: boolean = false): Promise<boolean> => {
      const token = gistTokenRef.current?.trim();
      const passphrase = gistPassphraseRef.current?.trim() || '';
      if (!token) {
        setSyncErrorMessage('尚未配置 GitHub Token，请先连接 GitHub Gist');
        setSyncErrorCode('API_ERROR');
        setSyncStatus('error');
        return false;
      }

      const snapshot = buildSyncPayload(latestStateRef.current);

      if (!skipConfirm) {
        const confirmed = await requestConfirm({
          title: '上传并覆盖 GitHub Gist 云端数据',
          message: `确定要用当前本地数据强行覆盖 GitHub Gist 云端分片存档吗？\n当前本地包含：${snapshot.tasks.length} 项任务、${snapshot.logs.length} 条打卡日志。\n云端当前内容将被本地完整替换。`,
          confirmText: '确认上传覆盖',
          cancelText: '取消',
          variant: 'primary',
        });
        if (!confirmed) return false;
      }

      if (isSyncingRef.current) return false;
      isSyncingRef.current = true;
      setIsSyncing(true);
      setSyncStatus('syncing');
      setSyncErrorMessage(null);
      setSyncErrorCode(null);

      try {
        let gistId = gistIdRef.current;
        let gistInfo: GistFileInfo;
        if (gistId) {
          gistInfo = await updateTrackerGist(token, gistId, snapshot, passphrase);
        } else {
          // Search existing gist without requiring decryption if we're explicitly overwriting
          const found = await findExistingTrackerGist(token, passphrase).catch(() => null);
          if (found) {
            gistInfo = await updateTrackerGist(token, found.id, snapshot, passphrase);
          } else {
            gistInfo = await createTrackerGist(token, snapshot, passphrase);
          }
        }

        persistSyncSuccessState(gistInfo, snapshot);
        showToast('已将本地数据上传覆盖至 GitHub Gist', 'success');
        return true;
      } catch (err: any) {
        console.error('Push to GitHub Gist error:', err);
        setSyncErrorCode(err instanceof GistSyncError ? err.code : 'API_ERROR');
        setSyncErrorMessage(err?.message || '上传同步到 GitHub Gist 失败');
        setSyncStatus('error');
        return false;
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    },
    [requestConfirm, persistSyncSuccessState, showToast]
  );

  // Manual force pull (cloud -> local)
  const pullFromDrive = useCallback(
    async (skipConfirm: boolean = false): Promise<boolean> => {
      const token = gistTokenRef.current?.trim();
      const passphrase = gistPassphraseRef.current?.trim() || '';
      if (!token) {
        setSyncErrorMessage('尚未配置 GitHub Token，请先连接 GitHub Gist');
        setSyncErrorCode('API_ERROR');
        setSyncStatus('error');
        return false;
      }

      if (!skipConfirm) {
        const confirmed = await requestConfirm({
          title: '从 GitHub Gist 拉取并覆盖本地',
          message: `确定要从 GitHub Gist 云端存档拉取数据并强行覆盖当前本地数据吗？\n拉取后，本地尚未上传的修改将被云端完整覆盖（可通过 Ctrl+Z 撤销）。`,
          confirmText: '确认拉取覆盖',
          cancelText: '取消',
          variant: 'danger',
        });
        if (!confirmed) return false;
      }

      if (isSyncingRef.current) return false;
      isSyncingRef.current = true;
      setIsSyncing(true);
      setSyncStatus('syncing');
      setSyncErrorMessage(null);
      setSyncErrorCode(null);

      try {
        let gistInfo: GistFileInfo | null = null;
        if (gistIdRef.current) {
          gistInfo = await getGistById(token, gistIdRef.current, passphrase);
        } else {
          gistInfo = await findExistingTrackerGist(token, passphrase);
        }

        if (!gistInfo || !gistInfo.payload) {
          throw new Error('GitHub Gist 中尚未找到本系统的数据存档，请先点击「上传本地覆盖云端」');
        }

        pushHistory('从 GitHub Gist 强行拉取覆盖本地');
        persistSyncSuccessState(gistInfo, gistInfo.payload);
        applyGistPayloadToState(gistInfo.payload);
        showToast('已从 GitHub Gist 拉取云端数据覆盖本地', 'success');
        return true;
      } catch (err: any) {
        console.error('Pull from GitHub Gist error:', err);
        setSyncErrorCode(err instanceof GistSyncError ? err.code : 'API_ERROR');
        setSyncErrorMessage(err?.message || '从 GitHub Gist 拉取数据失败');
        setSyncStatus('error');
        return false;
      } finally {
        isSyncingRef.current = false;
        setIsSyncing(false);
      }
    },
    [requestConfirm, pushHistory, persistSyncSuccessState, applyGistPayloadToState, showToast]
  );

  const connectWithGistToken = useCallback(
    async (tokenInput: string, customGistId?: string, passphraseInput?: string): Promise<boolean> => {
      const trimmedToken = tokenInput.trim();
      const trimmedGistId = customGistId?.trim() || null;
      const trimmedPassphrase = passphraseInput?.trim() || '';

      setIsLoggingIn(true);
      setSyncErrorMessage(null);
      setSyncErrorCode(null);
      try {
        const profile = await verifyGistToken(trimmedToken);

        clearRemoteGistCache();
        gistTokenRef.current = trimmedToken;
        setGistToken(trimmedToken);
        localStorage.setItem(GIST_TOKEN_KEY, trimmedToken);

        gistPassphraseRef.current = trimmedPassphrase || null;
        setGistPassphrase(trimmedPassphrase || null);
        if (trimmedPassphrase) {
          localStorage.setItem(GIST_PASSPHRASE_KEY, trimmedPassphrase);
        } else {
          localStorage.removeItem(GIST_PASSPHRASE_KEY);
        }

        setUser(profile);
        localStorage.setItem(GIST_USER_KEY, JSON.stringify(profile));

        if (trimmedGistId) {
          gistIdRef.current = trimmedGistId;
          setDriveFileId(trimmedGistId);
          localStorage.setItem(GIST_ID_KEY, trimmedGistId);
        } else {
          gistIdRef.current = null;
          setDriveFileId(null);
          localStorage.removeItem(GIST_ID_KEY);
          setGistHtmlUrl(null);
          localStorage.removeItem(GIST_HTML_URL_KEY);
        }

        localStorage.removeItem(GIST_BASE_SNAPSHOT_KEY);
        localStorage.removeItem(GIST_LAST_SYNC_HASH_KEY);
        setDriveLastSyncHash(null);

        showToast(`GitHub 账号已连接：${profile.displayName} (@${profile.login})`, 'success');

        await syncWithGist({
          silent: false,
          overrideToken: trimmedToken,
          overrideGistId: trimmedGistId,
          overridePassphrase: trimmedPassphrase,
        });
        return true;
      } catch (err: any) {
        console.error('Connect GitHub Gist failed:', err);
        setSyncErrorCode(err instanceof GistSyncError ? err.code : 'API_ERROR');
        setSyncErrorMessage(err?.message || '连接 GitHub Gist 失败');
        setSyncStatus('error');
        return false;
      } finally {
        setIsLoggingIn(false);
      }
    },
    [showToast, syncWithGist]
  );

  const updateEncryptionPassphrase = useCallback(
    async (nextPassphraseInput: string): Promise<boolean> => {
      const nextPassphrase = nextPassphraseInput.trim();
      const prevPassphrase = gistPassphraseRef.current?.trim() || '';
      const token = gistTokenRef.current?.trim();

      if (!token) {
        gistPassphraseRef.current = nextPassphrase || null;
        setGistPassphrase(nextPassphrase || null);
        try {
          if (nextPassphrase) localStorage.setItem(GIST_PASSPHRASE_KEY, nextPassphrase);
          else localStorage.removeItem(GIST_PASSPHRASE_KEY);
        } catch {
          // ignore
        }
        return true;
      }

      if (isSyncingRef.current || conflictModalActiveRef.current) {
        showToast('当前正在同步或有未处理的冲突，请稍后再试', 'info');
        return false;
      }

      // When changing or disabling an active passphrase on an existing Gist,
      // merge with prevPassphrase first so cloud changes are preserved before re-encrypting/decrypting.
      if (prevPassphrase && prevPassphrase !== nextPassphrase && gistIdRef.current) {
        isSyncingRef.current = true;
        setIsSyncing(true);
        setSyncStatus('syncing');
        setSyncErrorMessage(null);
        setSyncErrorCode(null);
        let shouldRunConflictResolution = false;

        try {
          const remotePrev = await getGistById(token, gistIdRef.current, prevPassphrase);
          if (remotePrev.payload) {
            const base = loadBaseSnapshot();
            const localNow = buildSyncPayload(latestStateRef.current);
            const mergeRes = mergeSyncPayloads(base, localNow, remotePrev.payload);
            if (mergeRes.status === 'conflict') {
              shouldRunConflictResolution = true;
            } else {
              const targetPayload =
                mergeRes.status === 'cloud-ahead'
                  ? remotePrev.payload
                  : mergeRes.status === 'local-ahead' || mergeRes.status === 'identical'
                    ? localNow
                    : mergeRes.mergedPayload;
              if (mergeRes.status === 'cloud-ahead' || mergeRes.status === 'auto-merged') {
                pushHistory('切换加密配置前合并云端数据');
                applyGistPayloadToState(targetPayload);
              }
              const rewritten = await updateTrackerGist(
                token,
                remotePrev.id,
                targetPayload,
                nextPassphrase
              );
              gistPassphraseRef.current = nextPassphrase || null;
              setGistPassphrase(nextPassphrase || null);
              if (nextPassphrase) localStorage.setItem(GIST_PASSPHRASE_KEY, nextPassphrase);
              else localStorage.removeItem(GIST_PASSPHRASE_KEY);
              persistSyncSuccessState(rewritten, targetPayload);
              showToast(
                nextPassphrase
                  ? '已更新同步加密口令并重新加密云端存档'
                  : '已关闭端到端加密，云端已切换为明文存档',
                'success'
              );
              return true;
            }
          }
        } catch (err: any) {
          if (!(err instanceof GistSyncError && err.code === 'E2EE_WRONG_PASSPHRASE')) {
            setSyncErrorCode(err instanceof GistSyncError ? err.code : 'API_ERROR');
            setSyncErrorMessage(err?.message || '更新加密设置失败');
            setSyncStatus('error');
            showToast(err?.message || '更新加密设置失败', 'error');
            return false;
          }
          // prevPassphrase could not decrypt cloud -> fall through to try nextPassphrase directly
        } finally {
          isSyncingRef.current = false;
          setIsSyncing(false);
        }

        if (shouldRunConflictResolution) {
          const resolved = await syncWithGist({ silent: false, overridePassphrase: prevPassphrase });
          if (!resolved || !gistIdRef.current) return false;
          const latestNow = buildSyncPayload(latestStateRef.current);
          isSyncingRef.current = true;
          setIsSyncing(true);
          try {
            const rewritten = await updateTrackerGist(
              token,
              gistIdRef.current,
              latestNow,
              nextPassphrase
            );
            gistPassphraseRef.current = nextPassphrase || null;
            setGistPassphrase(nextPassphrase || null);
            if (nextPassphrase) localStorage.setItem(GIST_PASSPHRASE_KEY, nextPassphrase);
            else localStorage.removeItem(GIST_PASSPHRASE_KEY);
            persistSyncSuccessState(rewritten, latestNow);
            showToast(
              nextPassphrase
                ? '已更新同步加密口令并重新加密云端存档'
                : '已关闭端到端加密，云端已切换为明文存档',
              'success'
            );
            return true;
          } catch (err: any) {
            setSyncErrorCode(err instanceof GistSyncError ? err.code : 'API_ERROR');
            setSyncErrorMessage(err?.message || '重写云端加密存档失败');
            setSyncStatus('error');
            return false;
          } finally {
            isSyncingRef.current = false;
            setIsSyncing(false);
          }
        }
      }

      const backupPrev = gistPassphraseRef.current;
      gistPassphraseRef.current = nextPassphrase || null;
      setGistPassphrase(nextPassphrase || null);
      try {
        if (nextPassphrase) localStorage.setItem(GIST_PASSPHRASE_KEY, nextPassphrase);
        else localStorage.removeItem(GIST_PASSPHRASE_KEY);
      } catch {
        // ignore
      }

      const ok = await syncWithGist({
        silent: false,
        overridePassphrase: nextPassphrase,
      });
      if (!ok && !nextPassphrase && backupPrev) {
        gistPassphraseRef.current = backupPrev;
        setGistPassphrase(backupPrev);
        try {
          localStorage.setItem(GIST_PASSPHRASE_KEY, backupPrev);
        } catch {
          // ignore
        }
      }
      return ok;
    },
    [
      loadBaseSnapshot,
      pushHistory,
      applyGistPayloadToState,
      persistSyncSuccessState,
      syncWithGist,
      showToast,
    ]
  );

  const logoutFromGist = useCallback(async () => {
    clearRemoteGistCache();
    gistTokenRef.current = null;
    gistPassphraseRef.current = null;
    gistIdRef.current = null;
    dismissedConflictKeyRef.current = null;

    localStorage.removeItem(GIST_TOKEN_KEY);
    localStorage.removeItem(GIST_PASSPHRASE_KEY);
    localStorage.removeItem(GIST_ID_KEY);
    localStorage.removeItem(GIST_HTML_URL_KEY);
    localStorage.removeItem(GIST_USER_KEY);
    localStorage.removeItem(GIST_LAST_SYNC_KEY);
    localStorage.removeItem(GIST_LAST_SYNC_HASH_KEY);
    localStorage.removeItem(GIST_BASE_SNAPSHOT_KEY);

    setGistToken(null);
    setGistPassphrase(null);
    setUser(null);
    setDriveFileId(null);
    setGistHtmlUrl(null);
    setLastSyncTime(null);
    setDriveLastSyncHash(null);
    setPendingConflictCount(0);
    setSyncStatus('idle');
    setSyncErrorMessage(null);
    setSyncErrorCode(null);
    showToast('已断开 GitHub Gist 云端同步', 'info');
  }, [showToast]);

  // Auto-sync Trigger 1: Initial mount
  useEffect(() => {
    if (!gistTokenRef.current || !autoSyncEnabled) return;
    void syncWithGist({ silent: true });
    // Run once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync Trigger 2: Window focus / visibility return (15s throttle)
  useEffect(() => {
    if (!gistToken || !autoSyncEnabled) return;
    const handleResumeCheck = () => {
      if (document.visibilityState === 'hidden') return;
      if (isSyncingRef.current || conflictModalActiveRef.current) return;
      if (
        syncErrorCodeRef.current === 'E2EE_PASSPHRASE_REQUIRED' ||
        syncErrorCodeRef.current === 'E2EE_WRONG_PASSPHRASE'
      ) {
        return;
      }
      if (Date.now() - lastAutoCheckAtRef.current < 15_000) return;
      void syncWithGist({ silent: true });
    };

    window.addEventListener('focus', handleResumeCheck);
    document.addEventListener('visibilitychange', handleResumeCheck);
    return () => {
      window.removeEventListener('focus', handleResumeCheck);
      document.removeEventListener('visibilitychange', handleResumeCheck);
    };
  }, [gistToken, autoSyncEnabled, syncWithGist]);

  // Auto-sync Trigger 3: Debounced auto-sync 3s after local edits
  useEffect(() => {
    if (!gistToken || !autoSyncEnabled || !hasUnsyncedDriveChanges) return;
    const timer = window.setTimeout(() => {
      if (isSyncingRef.current || conflictModalActiveRef.current) return;
      if (
        syncErrorCodeRef.current === 'E2EE_PASSPHRASE_REQUIRED' ||
        syncErrorCodeRef.current === 'E2EE_WRONG_PASSPHRASE'
      ) {
        return;
      }
      void syncWithGist({ silent: true });
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [gistToken, autoSyncEnabled, hasUnsyncedDriveChanges, currentDataHash, syncWithGist]);

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

  const openTaskDetail = (taskId: string) => {
    setTaskDetailTaskId(taskId);
  };

  const closeTaskDetail = () => {
    setTaskDetailTaskId(null);
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
      pushHistory('恢复初始示例数据');
      const initial = createInitialSampleData();
      setTasks(initial.tasks);
      setLogs(initial.logs);
      setSelectedTag(null);
      setSearchQuery('');
      showToast('已恢复初始示例数据', 'info', true);
    }
  };

  const exportData = () => {
    const payload = buildSyncPayload({ tasks, logs, ganttGroupOrder });
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(formatCompactJsonPayload(payload));
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
        pushHistory('导入 JSON 备份数据');
        setTasks(parsed.tasks);
        setLogs(parsed.logs);
        if (Array.isArray(parsed.ganttGroupOrder)) {
          setGanttGroupOrderSilent(parsed.ganttGroupOrder);
        }
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
        reorderTasksGlobal,
        addOrUpdateLog,
        addRestSession,
        deleteWorkSession,
        deleteLog,
        getLogsForTask,
        getLog,
        getLatestLogForTask,
        getTaskTotalHours,
        pendingRestPrompt,
        setPendingRestPrompt,
        checkInModalTask,
        checkInModalDate,
        openCheckInModal,
        closeCheckInModal,
        taskModalData,
        openTaskModal,
        closeTaskModal,
        taskDetailTaskId,
        openTaskDetail,
        closeTaskDetail,
        resetData,
        exportData,
        importData,
        canUndo,
        canRedo,
        lastUndoDescription,
        lastRedoDescription,
        undo,
        redo,
        ganttGroupOrder,
        setGanttGroupOrder,
        confirmDialogState,
        requestConfirm,
        toast,
        showToast,
        hideToast,
        user,
        gistToken,
        gistPassphrase,
        gistHtmlUrl,
        autoSyncEnabled,
        setAutoSyncEnabled,
        pendingConflictCount,
        isLoggingIn,
        isSyncing,
        lastSyncTime,
        syncStatus,
        hasUnsyncedDriveChanges,
        syncErrorMessage,
        syncErrorCode,
        driveFileId,
        driveSyncModalOpen,
        setDriveSyncModalOpen,
        connectWithGistToken,
        updateEncryptionPassphrase,
        logoutFromGist,
        syncWithGist,
        pushToDrive,
        pullFromDrive,
        localSync,
        localSyncModalOpen,
        setLocalSyncModalOpen,
        enableLocalSync,
        resumeLocalSync,
        disableLocalSync,
        writeLocalNow,
        pullFromLocalFile,
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
