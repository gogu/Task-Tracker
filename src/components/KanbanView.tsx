import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  BookOpen,
  Settings,
  Sparkles,
  Flame,
  Clock,
  CheckCircle2,
  Heart,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Plus,
  X,
  Dices,
  BellRing,
  FileText,
  ArrowRightLeft,
  Send,
  Edit3,
  MessageCircle,
  GripVertical,
  Award,
  Home,
  ScrollText,
  BarChart3,
  Search,
  Tag,
  Undo2,
  Redo2,
  Cloud,
  FolderSync,
  Download,
  Upload,
  SlidersHorizontal,
  Calendar,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import {
  TaskItem,
  TaskStatus,
  ProgressType,
} from '../types';
import { useTaskContext } from '../context/TaskContext';
import {
  getTodayString,
  getYesterdayString,
  addDays,
  getWeekdayChinese,
  getRelativeTimeString,
  formatHours,
} from '../utils/date';
import {
  NpcConfig,
  NpcExpression,
  EXPRESSION_META,
  loadNpcConfig,
  saveNpcConfig,
  resetNpcConfig,
  loadAffectionPoints,
  saveAffectionPoints,
  calculateGuildRank,
  getQuestCategoryBadge,
  RPG_STATUS_META,
  getStaleInProgressTasks,
  getTimeGreeting,
  getRandomChatter,
} from '../utils/guildNpc';
import { NpcConfigModal } from './NpcConfigModal';
import { GanttView } from './GanttView';
import { StatsView } from './StatsView';
import { TaskDetailDrawer } from './TaskDetailDrawer';

type OverlayMode = 'none' | 'ledger' | 'gantt' | 'stats';

type DialogueMode =
  | 'hub'
  | 'select_checkin_task'
  | 'inspect_task'
  | 'checkin_form'
  | 'checkin_done'
  | 'create_task'
  | 'edit_task'
  | 'random_pick'
  | 'stale_review'
  | 'sync_menu';

interface FloatingHeart {
  id: number;
  x: number;
  y: number;
}

const COMMON_TAG_PRESETS = [
  '游戏',
  '书籍',
  '影视',
  '漫画',
  '音乐',
  'Steam',
  'PS5',
  'Switch',
  '微信读书',
  '实体书',
  '动画',
];

const LEDGER_TABS: TaskStatus[] = ['in_progress', 'backlog', 'done', 'paused'];

export const KanbanView: React.FC = () => {
  const {
    viewMode,
    setViewMode,
    filteredTasks,
    tasks,
    logs,
    allTags,
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    addTask,
    updateTask,
    deleteTask,
    moveTaskStatus,
    reorderTasks,
    addOrUpdateLog,
    deleteLog,
    getLog,
    getLogsForTask,
    getLatestLogForTask,
    getTaskTotalHours,
    openTaskDetail,
    requestConfirm,
    showToast,
    canUndo,
    canRedo,
    lastUndoDescription,
    lastRedoDescription,
    undo,
    redo,
    exportData,
    importData,
    user,
    isSyncing,
    syncStatus,
    hasUnsyncedDriveChanges,
    setDriveSyncModalOpen,
    localSync,
    setLocalSyncModalOpen,
  } = useTaskContext();

  const todayStr = getTodayString();
  const yesterdayStr = getYesterdayString();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── NPC Appearance & Affection State ───────────────────────────────────────
  const [npcConfig, setNpcConfig] = useState<NpcConfig>(() => loadNpcConfig());
  const [npcModalOpen, setNpcModalOpen] = useState(false);
  const [affection, setAffection] = useState<number>(() => loadAffectionPoints());
  const [floatingHearts, setFloatingHearts] = useState<FloatingHeart[]>([]);
  const [imgLoadFailed, setImgLoadFailed] = useState(false);

  // ── Primary Navigation & Overlay State ─────────────────────────────────────
  const [activeOverlay, setActiveOverlay] = useState<OverlayMode>(() => {
    if (viewMode === 'gantt') return 'gantt';
    if (viewMode === 'stats') return 'stats';
    return 'none';
  });
  const [wideOverlayMode, setWideOverlayMode] = useState<boolean>(false);
  const [showFilterBar, setShowFilterBar] = useState<boolean>(false);
  const [showAllTagChips, setShowAllTagChips] = useState<boolean>(false);

  // Keep activeOverlay aligned when viewMode changes externally
  useEffect(() => {
    if (viewMode === 'gantt' && activeOverlay !== 'gantt') {
      setActiveOverlay('gantt');
    } else if (viewMode === 'stats' && activeOverlay !== 'stats') {
      setActiveOverlay('stats');
    } else if (viewMode === 'kanban' && (activeOverlay === 'gantt' || activeOverlay === 'stats')) {
      setActiveOverlay('none');
    }
  }, [viewMode, activeOverlay]);

  // ── Derived Guild Stats & Alerts ───────────────────────────────────────────
  const guildStats = useMemo(() => calculateGuildRank(tasks, logs), [tasks, logs]);
  const staleList = useMemo(() => getStaleInProgressTasks(tasks, logs), [tasks, logs]);
  const timeGreeting = useMemo(() => getTimeGreeting(guildStats), [guildStats]);

  // ── AVG Scene & Dialogue State ─────────────────────────────────────────────
  const [dialogueMode, setDialogueMode] = useState<DialogueMode>('hub');
  const [expression, setExpression] = useState<NpcExpression>(timeGreeting.expression);
  const [dialogueText, setDialogueText] = useState<string>(timeGreeting.greeting);
  const [typedLength, setTypedLength] = useState<number>(0);

  // ── Selected Task & Active Sub-flows ───────────────────────────────────────
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const selectedTask = useMemo(
    () => (selectedTaskId ? tasks.find((t) => t.id === selectedTaskId) ?? null : null),
    [tasks, selectedTaskId]
  );
  const [showAllCheckinStatuses, setShowAllCheckinStatuses] = useState(false);
  const [randomPickedId, setRandomPickedId] = useState<string | null>(null);
  const [staleIndex, setStaleIndex] = useState(0);
  const [lastCheckInResult, setLastCheckInResult] = useState<{
    taskTitle: string;
    date: string;
    progressType: ProgressType;
    hours?: number;
    wasCompleted: boolean;
  } | null>(null);

  // ── Quest Ledger (4-Status Tabbed Book Overlay) ────────────────────────────
  const [activeLedgerTab, setActiveLedgerTab] = useState<TaskStatus>('in_progress');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedTaskStatus, setDraggedTaskStatus] = useState<TaskStatus | null>(null);
  const [dragOverTab, setDragOverTab] = useState<TaskStatus | null>(null);
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after'>('after');
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // ── Inline Check-in Form State ─────────────────────────────────────────────
  const [checkInDate, setCheckInDate] = useState<string>(todayStr);
  const [checkInType, setCheckInType] = useState<ProgressType>('progress');
  const [checkInHours, setCheckInHours] = useState<string>('');
  const [checkInNote, setCheckInNote] = useState<string>('');
  const [markAsCompleted, setMarkAsCompleted] = useState<boolean>(false);

  // ── Inline Create / Edit Task Form State ───────────────────────────────────
  const [formTitle, setFormTitle] = useState('');
  const [formStatus, setFormStatus] = useState<TaskStatus>('in_progress');
  const [formTags, setFormTags] = useState<string[]>(['游戏']);
  const [formNewTag, setFormNewTag] = useState('');

  // ── Typewriter Effect ──────────────────────────────────────────────────────
  useEffect(() => {
    setTypedLength(0);
    if (!dialogueText) return;
    const total = dialogueText.length;
    const step = total > 80 ? 2 : 1;
    const timer = window.setInterval(() => {
      setTypedLength((prev) => {
        if (prev + step >= total) {
          window.clearInterval(timer);
          return total;
        }
        return prev + step;
      });
    }, 18);
    return () => window.clearInterval(timer);
  }, [dialogueText]);

  const speak = useCallback((text: string, nextExpr: NpcExpression) => {
    setExpression(nextExpr);
    setDialogueText(text);
  }, []);

  const activeImgSrc = npcConfig.expressions[expression] || npcConfig.expressions.normal;
  useEffect(() => {
    setImgLoadFailed(false);
  }, [activeImgSrc]);

  useEffect(() => {
    Object.values(npcConfig.expressions).forEach((src) => {
      if (src) {
        const img = new Image();
        img.src = src;
      }
    });
  }, [npcConfig.expressions]);

  useEffect(() => {
    if (
      (dialogueMode === 'inspect_task' ||
        dialogueMode === 'checkin_form' ||
        dialogueMode === 'edit_task') &&
      !selectedTask
    ) {
      setDialogueMode('hub');
    }
  }, [dialogueMode, selectedTask]);

  useEffect(() => {
    if (dialogueMode === 'checkin_form' && selectedTask) {
      const existing = getLog(selectedTask.id, checkInDate);
      if (existing) {
        setCheckInType(existing.progressType);
        setCheckInHours(
          typeof existing.hours === 'number' && !isNaN(existing.hours) ? String(existing.hours) : ''
        );
        setCheckInNote(existing.note || '');
        setMarkAsCompleted(existing.progressType === 'completed' || selectedTask.status === 'done');
      } else {
        setCheckInType('progress');
        setCheckInHours('');
        setCheckInNote('');
        setMarkAsCompleted(false);
      }
    }
  }, [dialogueMode, selectedTask, checkInDate, getLog]);

  const tasksByStatus = useMemo(() => {
    const map: Record<TaskStatus, TaskItem[]> = {
      in_progress: [],
      backlog: [],
      done: [],
      paused: [],
    };
    filteredTasks.forEach((t) => {
      if (map[t.status]) map[t.status].push(t);
    });
    return map;
  }, [filteredTasks]);

  const activeInProgressTasks = useMemo(
    () => tasks.filter((t) => t.status === 'in_progress'),
    [tasks]
  );

  const pinnedActiveTasks = useMemo(() => {
    const unchecked: TaskItem[] = [];
    const checked: TaskItem[] = [];
    activeInProgressTasks.forEach((t) => {
      if (getLog(t.id, todayStr)) {
        checked.push(t);
      } else {
        unchecked.push(t);
      }
    });
    return [...unchecked, ...checked].slice(0, 5);
  }, [activeInProgressTasks, getLog, todayStr]);

  const sortedAllTags = useMemo(() => {
    return [...allTags].sort((a, b) => {
      const countA = tasks.filter((t) => t.tags.includes(a)).length;
      const countB = tasks.filter((t) => t.tags.includes(b)).length;
      return countB - countA;
    });
  }, [allTags, tasks]);

  // ── Primary Navigation Switching ───────────────────────────────────────────
  const switchSection = (next: OverlayMode) => {
    setActiveOverlay(next);
    if (next === 'gantt') {
      setViewMode('gantt');
      setDialogueMode('hub');
      speak(
        `已为你展开「时序卷轴」！点击任意方格即可登记或修改当天的打卡详情，也可以使用右上角的周/月/全景进行翻页~`,
        'thinking'
      );
    } else if (next === 'stats') {
      setViewMode('stats');
      setDialogueMode('hub');
      speak(
        `欢迎来到「战绩圣殿」！截至目前你已累计投入 ${formatHours(
          guildStats.totalHours
        )}，共达成了 ${guildStats.completedCount} 份公会委托！`,
        'cheer'
      );
    } else if (next === 'ledger') {
      setViewMode('kanban');
      setDialogueMode('hub');
      speak(
        `已摊开「公会委托账本」！共有 ${filteredTasks.length} 份委托记录在册，拖拽卡片至顶部书签即可快速调动状态哦~`,
        'normal'
      );
    } else {
      setViewMode('kanban');
      setDialogueMode('hub');
      const fresh = getTimeGreeting(guildStats);
      speak(fresh.greeting, fresh.expression);
    }
  };

  // ── File Import Handler ────────────────────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) {
          const success = importData(content);
          if (success) {
            showToast('数据导入成功！', 'success', true);
            speak(`已成功将备份卷宗导入公会账本！所有委托与记录都已就绪~`, 'happy');
          } else {
            showToast('导入失败：文件格式不符合要求', 'error');
            speak(`唔…这份卷宗的格式好像不太对呢，请确认是本公会导出的 JSON 备份文件哦。`, 'thinking');
          }
        }
      };
      reader.readAsText(file);
    }
    e.target.value = '';
  };

  // ── Affection & Stage Click Chatter ────────────────────────────────────────
  const handleNpcStageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeOverlay !== 'none') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const heartId = Date.now() + Math.random();
    const x = Math.max(40, Math.min(rect.width - 40, e.clientX - rect.left));
    const y = Math.max(40, Math.min(rect.height - 160, e.clientY - rect.top));

    setFloatingHearts((prev) => [...prev.slice(-6), { id: heartId, x, y }]);
    window.setTimeout(() => {
      setFloatingHearts((prev) => prev.filter((h) => h.id !== heartId));
    }, 1300);

    setAffection((prev) => {
      const next = prev + 1;
      saveAffectionPoints(next);
      return next;
    });

    if (dialogueMode === 'hub') {
      const chatter = getRandomChatter(guildStats, tasks, staleList);
      speak(chatter.text, chatter.expression);
    }
  };

  // ── Navigation & Dialogue Flow Actions ─────────────────────────────────────
  const returnToHub = () => {
    setDialogueMode('hub');
    setSelectedTaskId(null);
    const fresh = getTimeGreeting(guildStats);
    speak(fresh.greeting, fresh.expression);
  };

  const openInspectTask = (task: TaskItem) => {
    setActiveOverlay('none');
    setViewMode('kanban');
    setSelectedTaskId(task.id);
    setDialogueMode('inspect_task');

    const latest = getLatestLogForTask(task.id);
    const totalHours = getTaskTotalHours(task.id);
    const progressDays = getLogsForTask(task.id).filter(
      (l) => l.progressType === 'progress' || l.progressType === 'completed'
    ).length;

    const statusLabel = RPG_STATUS_META[task.status].rpgLabel;
    const latestStr = latest
      ? `最近记录在 ${getRelativeTimeString(latest.date)}${latest.note ? `（“${latest.note}”）` : ''}`
      : '还没有打卡记录';

    speak(
      `让我看看《${task.title}》的卷宗~ 目前处于【${statusLabel}】状态，累计投入 ${formatHours(
        totalHours
      )}（推进 ${progressDays} 天），${latestStr}。接下来要怎么处理呢？`,
      task.status === 'done' ? 'cheer' : 'thinking'
    );
  };

  const openCheckInForTask = (task: TaskItem, date: string = todayStr) => {
    setActiveOverlay('none');
    setViewMode('kanban');
    setSelectedTaskId(task.id);
    setCheckInDate(date);
    setDialogueMode('checkin_form');

    const existing = getLog(task.id, date);
    if (existing) {
      speak(
        `已调出《${task.title}》在 ${date} 的打卡记录，可以直接修改投入时长或补充今天的心得哦！`,
        'thinking'
      );
    } else {
      speak(
        `准备好记录《${task.title}》的进展了吗？选好状态、投入时长和心得，我来为你盖上公会印章！`,
        'happy'
      );
    }
  };

  const startCheckInFlow = () => {
    setActiveOverlay('none');
    setViewMode('kanban');
    if (activeInProgressTasks.length === 1 && !showAllCheckinStatuses) {
      openCheckInForTask(activeInProgressTasks[0], todayStr);
      return;
    }
    setDialogueMode('select_checkin_task');
    if (activeInProgressTasks.length === 0) {
      setShowAllCheckinStatuses(true);
      speak(
        `目前「攻略中」列表是空的呢~ 我帮你把其他状态的委托也列出来啦，点选一个就能直接打卡！`,
        'thinking'
      );
    } else {
      speak(
        `今天推进了哪一份委托呢？当前有 ${activeInProgressTasks.length} 项正在攻略中，点选一项就能立刻汇报！`,
        'normal'
      );
    }
  };

  const startCreateTask = (defaultStatus: TaskStatus = 'in_progress') => {
    setActiveOverlay('none');
    setViewMode('kanban');
    setFormTitle('');
    setFormStatus(defaultStatus);
    setFormTags(['游戏']);
    setFormNewTag('');
    setDialogueMode('create_task');
    speak(
      `又有新目标了吗？告诉我委托名称和分类标签，我立刻在公会账本上为你立项登记！`,
      'thinking'
    );
  };

  const startEditTask = (task: TaskItem) => {
    setActiveOverlay('none');
    setViewMode('kanban');
    setSelectedTaskId(task.id);
    setFormTitle(task.title);
    setFormStatus(task.status);
    setFormTags(task.tags.length > 0 ? [...task.tags] : ['游戏']);
    setFormNewTag('');
    setDialogueMode('edit_task');
    speak(`要调整《${task.title}》的档案内容吗？改好后点击保存就行啦~`, 'thinking');
  };

  const triggerRandomPick = (excludeId?: string) => {
    setActiveOverlay('none');
    setViewMode('kanban');
    const backlogPool = tasks.filter((t) => t.status === 'backlog');
    if (backlogPool.length === 0) {
      setDialogueMode('hub');
      speak(
        `「待接取」书架上目前空空如也呢！不如先登记几个想玩的游戏或想看的书进去？`,
        'thinking'
      );
      return;
    }
    const candidates =
      backlogPool.length > 1 && excludeId
        ? backlogPool.filter((t) => t.id !== excludeId)
        : backlogPool;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    setRandomPickedId(chosen.id);
    setSelectedTaskId(chosen.id);
    setDialogueMode('random_pick');

    const cat = getQuestCategoryBadge(chosen.tags);
    speak(
      `命运的骰子停在了 ${cat.icon}《${chosen.title}》！这份待接取委托一直在等你开启呢，要现在就把它移入「攻略中」正式开坑吗？`,
      'happy'
    );
  };

  const startStaleReview = () => {
    setActiveOverlay('none');
    setViewMode('kanban');
    if (staleList.length === 0) {
      const chatter = getRandomChatter(guildStats, tasks, staleList);
      speak(chatter.text, chatter.expression);
      return;
    }
    setStaleIndex(0);
    const first = staleList[0];
    setSelectedTaskId(first.task.id);
    setDialogueMode('stale_review');
    speak(
      `我巡检账本时发现《${first.task.title}》已经 ${first.daysSinceLastActive} 天没有推进记录啦（${first.lastDateLabel}）。今天要推一把，还是先帮它移到「搁置区」？`,
      'sleepy'
    );
  };

  // ── Check-in Form Submission ───────────────────────────────────────────────
  const handleCheckInSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTask) return;

    const effectiveType: ProgressType = markAsCompleted ? 'completed' : checkInType;
    const parsedHours = checkInHours.trim() !== '' ? parseFloat(checkInHours) : undefined;
    const validHours = parsedHours !== undefined && !isNaN(parsedHours) ? parsedHours : undefined;

    addOrUpdateLog({
      taskId: selectedTask.id,
      date: checkInDate,
      progressType: effectiveType,
      hours: validHours,
      note: checkInNote.trim(),
      markTaskAsCompleted: markAsCompleted || effectiveType === 'completed',
    });

    const isCompleted = markAsCompleted || effectiveType === 'completed';
    setLastCheckInResult({
      taskTitle: selectedTask.title,
      date: checkInDate,
      progressType: effectiveType,
      hours: validHours,
      wasCompleted: isCompleted,
    });

    setAffection((prev) => {
      const next = prev + (isCompleted ? 5 : 2);
      saveAffectionPoints(next);
      return next;
    });

    setDialogueMode('checkin_done');

    if (isCompleted) {
      speak(
        `太棒啦！恭喜正式通关《${selectedTask.title}》！！我已经帮你加盖了「已达成」金印并归档，冒险者大人真是太可靠了！`,
        'cheer'
      );
      showToast(`🎉 通关达成！已归档「${selectedTask.title}」`, 'success', true);
    } else if (effectiveType === 'rest') {
      speak(
        `偶尔在营地休整也是冒险的重要一环！已经把《${selectedTask.title}》在 ${checkInDate} 的休整记录登记妥当啦~`,
        'normal'
      );
      showToast(`已登记「${selectedTask.title}」(${checkInDate}) 休整记录`, 'info', true);
    } else {
      const hoursText = validHours && validHours > 0 ? `（投入 ${formatHours(validHours)}）` : '';
      speak(
        `收到！《${selectedTask.title}》在 ${checkInDate} 的推进成果${hoursText}已经盖章入账！继续加油，离完全攻略又近了一步！`,
        'happy'
      );
      showToast(`已登记「${selectedTask.title}」(${checkInDate}) 推进打卡`, 'success', true);
    }
  };

  const handleDeleteCurrentCheckIn = () => {
    if (!selectedTask) return;
    const existing = getLog(selectedTask.id, checkInDate);
    if (!existing) return;
    deleteLog(existing.id);
    showToast(`已清空 ${checkInDate} 的打卡记录`, 'info', true);
    speak(`已经帮你擦除了《${selectedTask.title}》在 ${checkInDate} 的那笔记录。`, 'normal');
    setDialogueMode('inspect_task');
  };

  // ── Create / Edit Task Form Submission ─────────────────────────────────────
  const handleAddFormTag = (tagToAdd: string) => {
    const trimmed = tagToAdd.trim();
    if (trimmed && !formTags.includes(trimmed)) {
      setFormTags([...formTags, trimmed]);
    }
    setFormNewTag('');
  };

  const handleTaskFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = formTitle.trim();
    if (!trimmedTitle) return;

    let finalTags = [...formTags];
    const pendingTag = formNewTag.trim();
    if (pendingTag && !finalTags.includes(pendingTag)) {
      finalTags.push(pendingTag);
    }
    if (finalTags.length === 0) finalTags = ['未分类'];

    if (dialogueMode === 'edit_task' && selectedTask) {
      updateTask(selectedTask.id, {
        title: trimmedTitle,
        status: formStatus,
        tags: finalTags,
      });
      setDialogueMode('inspect_task');
      speak(`已经帮你将《${trimmedTitle}》的委托档案修改妥当啦！`, 'happy');
    } else {
      const created = addTask({
        title: trimmedTitle,
        status: formStatus,
        tags: finalTags,
      });
      setSelectedTaskId(created.id);
      setDialogueMode('inspect_task');
      setAffection((prev) => {
        const next = prev + 2;
        saveAffectionPoints(next);
        return next;
      });
      speak(
        `好耶！新委托《${created.title}》已正式写入公会账本的「${RPG_STATUS_META[created.status].rpgLabel}」名录！要顺便为它打第一卡吗？`,
        'happy'
      );
    }
  };

  const handleDeleteSelectedTask = async () => {
    if (!selectedTask) return;
    const title = selectedTask.title;
    const confirmed = await requestConfirm({
      title: '销毁委托档案',
      message: `确定要将「${title}」及其所有打卡记录从公会账本中移除吗？移除后可通过顶部「撤销」恢复。`,
      confirmText: '确认销毁',
      cancelText: '再想想',
      variant: 'danger',
    });
    if (confirmed) {
      deleteTask(selectedTask.id);
      showToast(`已移除委托「${title}」`, 'info', true);
      setSelectedTaskId(null);
      setDialogueMode('hub');
      speak(`已经将《${title}》的委托卷宗妥善清理掉了。如果有后悔，还可以用顶部的「撤销」找回哦~`, 'normal');
    }
  };

  const handleQuickMoveStatus = (task: TaskItem, targetStatus: TaskStatus) => {
    if (task.status === targetStatus) return;
    moveTaskStatus(task.id, targetStatus);
    if (targetStatus === 'done') {
      speak(`恭喜！《${task.title}》已光荣归入「已达成」殿堂！`, 'cheer');
    } else if (targetStatus === 'in_progress') {
      speak(`《${task.title}》已转为「攻略中」状态，祝你冒险愉快！`, 'happy');
    } else if (targetStatus === 'paused') {
      speak(`好，先把《${task.title}》放入「冻结书架」保存起来，想继续时随时唤醒它~`, 'normal');
    } else {
      speak(`已将《${task.title}》放回「待接取」名录。`, 'normal');
    }
  };

  // ── Ledger Drag & Drop Handlers ────────────────────────────────────────────
  const handleCardDragStart = (e: React.DragEvent, task: TaskItem) => {
    e.dataTransfer.setData('text/plain', task.id);
    setDraggedTaskId(task.id);
    setDraggedTaskStatus(task.status);
    setTimeout(() => {
      const el = cardRefs.current.get(task.id);
      if (el) el.style.opacity = '0.4';
    }, 0);
  };

  const handleCardDragEnd = (taskId: string) => {
    const el = cardRefs.current.get(taskId);
    if (el) el.style.opacity = '';
    setDraggedTaskId(null);
    setDraggedTaskStatus(null);
    setDragOverTab(null);
    setDragOverCardId(null);
  };

  const handleCardDragOver = (e: React.DragEvent, cardId: string, cardStatus: TaskStatus) => {
    e.preventDefault();
    e.stopPropagation();
    if (draggedTaskStatus === cardStatus && draggedTaskId !== cardId) {
      const cardEl = cardRefs.current.get(cardId);
      if (cardEl) {
        const rect = cardEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        setDragOverCardId(cardId);
        setDropPosition(e.clientY < midY ? 'before' : 'after');
      }
    }
  };

  const handleCardDrop = (e: React.DragEvent, targetTask: TaskItem) => {
    e.preventDefault();
    e.stopPropagation();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (!taskId || taskId === targetTask.id) return;
    if (draggedTaskStatus === targetTask.status) {
      reorderTasks(taskId, targetTask.id, dropPosition);
    }
    setDraggedTaskId(null);
    setDraggedTaskStatus(null);
    setDragOverCardId(null);
    setDragOverTab(null);
  };

  const handleTabDrop = (e: React.DragEvent, targetTab: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (!taskId) return;
    const task = tasks.find((t) => t.id === taskId);
    if (task && task.status !== targetTab) {
      handleQuickMoveStatus(task, targetTab);
      setActiveLedgerTab(targetTab);
    }
    setDraggedTaskId(null);
    setDraggedTaskStatus(null);
    setDragOverTab(null);
    setDragOverCardId(null);
  };

  const handleSaveNpcConfig = (next: NpcConfig) => {
    setNpcConfig(next);
    saveNpcConfig(next);
    showToast(`已更新看板娘「${next.name}」的设定`, 'success');
  };

  const handleResetNpcConfig = () => {
    const def = resetNpcConfig();
    setNpcConfig(def);
    showToast('已恢复默认公会看板娘立绘与设定', 'info');
  };

  const displayedDialogue = dialogueText.slice(0, typedLength);
  const isTyping = typedLength < dialogueText.length;

  const currentLedgerTasks = tasksByStatus[activeLedgerTab];
  const randomPickedTask = randomPickedId ? tasks.find((t) => t.id === randomPickedId) ?? null : null;
  const currentStaleItem = staleList[staleIndex] || null;
  const isSplitStage = activeOverlay !== 'none' || dialogueMode !== 'hub';
  const showLeftNpcStage = !isSplitStage || activeOverlay === 'none' || !wideOverlayMode;
  const hasActiveFilters = Boolean(searchQuery.trim() || selectedTag);

  const counterPanelHeader = useMemo(() => {
    switch (dialogueMode) {
      case 'select_checkin_task':
        return {
          title: '选择今日要汇报的委托',
          subtitle: '点击任意委托即可登记或更新今日推进与时长',
        };
      case 'inspect_task':
        return {
          title: selectedTask ? `委托卷宗 · ${selectedTask.title}` : '委托卷宗详情',
          subtitle: '查看进度统计、调动委托状态或快捷汇报打卡',
        };
      case 'checkin_form':
        return {
          title: selectedTask ? `进度汇报柜台 · ${selectedTask.title}` : '进度汇报柜台',
          subtitle: '填写当日状态、投入时长与心得体会并盖章入账',
        };
      case 'checkin_done':
        return {
          title: '公会印章已盖妥',
          subtitle: '本笔冒险推进成果已正式写入公会账本',
        };
      case 'create_task':
        return {
          title: '登记新的公会委托',
          subtitle: '填入目标标题、初始状态与分类标签即可正式立项',
        };
      case 'edit_task':
        return {
          title: selectedTask ? `修订委托档案 · ${selectedTask.title}` : '修订委托档案',
          subtitle: '调整标题、当前状态或分类标签',
        };
      case 'random_pick':
        return {
          title: '命运骰子 · 抽坑开玩',
          subtitle: '从「待接取」书架抽取下一场冒险',
        };
      case 'stale_review':
        return {
          title: '公会账本 · 催更巡检',
          subtitle: '梳理超过 3 天未推进的「攻略中」委托',
        };
      case 'sync_menu':
        return {
          title: '卷宗同步与备份中心',
          subtitle: '管理 Google Drive 云端同步、本地目录实时同步或 JSON 备份',
        };
      default:
        return {
          title: '公会接待柜台',
          subtitle: '随时在此办理日常委托事务',
        };
    }
  }, [dialogueMode, selectedTask]);

  // Drive & Local sync dot color helpers
  const driveDotClass = !user
    ? 'bg-stone-400'
    : syncStatus === 'error'
      ? 'bg-rose-500'
      : isSyncing
        ? 'bg-blue-400 animate-pulse'
        : hasUnsyncedDriveChanges
          ? 'bg-amber-400'
          : 'bg-emerald-400';

  const localDotClass = !localSync.supported || !localSync.enabled
    ? 'bg-stone-400'
    : localSync.status === 'error'
      ? 'bg-rose-500'
      : localSync.status === 'needs-permission'
        ? 'bg-amber-400'
        : localSync.status === 'syncing'
          ? 'bg-blue-400 animate-pulse'
          : 'bg-emerald-400';

  return (
    <div className="relative flex flex-col w-full h-full flex-1 min-h-0 rounded-2xl border-2 border-amber-800/70 dark:border-amber-700/50 bg-[#1a130e] shadow-2xl overflow-hidden overflow-x-hidden select-none">
      {/* Hidden JSON Import Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* ── Layer 0: Unified Guild Primary Navigation & Top HUD ── */}
      <header className="relative z-40 bg-[#231811]/95 border-b border-amber-600/40 px-4 sm:px-6 py-2.5 sm:py-3 shrink-0 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* Left: Rank Badge & Guild Micro-Stats */}
          <div className="flex items-center gap-2.5 flex-wrap min-w-0">
            <div
              className={`flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r ${guildStats.tierColorClass} border shadow-sm`}
              title={`经验值 ${guildStats.exp} EXP（距下一级还需 ${guildStats.nextLevelExp - guildStats.exp} EXP）`}
            >
              <Award className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
              <div className="leading-none">
                <div className="text-xs sm:text-sm font-extrabold tracking-wide flex items-center gap-1.5">
                  <span>Lv.{guildStats.level}</span>
                  <span>{guildStats.rankTitle}</span>
                </div>
                <div className="w-24 sm:w-28 h-1.5 bg-black/25 rounded-full overflow-hidden mt-1">
                  <div
                    className="h-full bg-white/90 rounded-full transition-all duration-300"
                    style={{ width: `${guildStats.levelProgressPct}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="hidden xl:flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-black/40 border border-amber-500/25 text-xs sm:text-sm text-amber-100">
              <span className="text-amber-300 font-bold">{timeGreeting.periodLabel}</span>
              <span className="w-1 h-1 rounded-full bg-amber-500/40" />
              <span className="flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                <span>连击 {guildStats.streakDays} 天</span>
              </span>
              <span className="w-1 h-1 rounded-full bg-amber-500/40" />
              <span>今日 {guildStats.todayCheckedCount} 卡</span>
              <span className="w-1 h-1 rounded-full bg-amber-500/40" />
              <span className="flex items-center gap-1 text-rose-300 font-semibold" title="点击看板娘可提升默契度">
                <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-400" />
                <span>{affection}</span>
              </span>
            </div>
          </div>

          {/* Center: Primary Guild Navigation Tabs */}
          <nav className="flex items-center flex-wrap gap-1.5 bg-black/45 p-1.5 rounded-xl border border-amber-600/35">
            <button
              type="button"
              onClick={() => switchSection('none')}
              className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                activeOverlay === 'none'
                  ? 'bg-amber-500 text-amber-950 shadow-sm'
                  : 'text-amber-100/85 hover:text-amber-50 hover:bg-white/10'
              }`}
            >
              <Home className="w-4 h-4" />
              <span>接待大厅</span>
            </button>

            <button
              type="button"
              onClick={() => switchSection(activeOverlay === 'ledger' ? 'none' : 'ledger')}
              className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                activeOverlay === 'ledger'
                  ? 'bg-amber-500 text-amber-950 shadow-sm'
                  : 'text-amber-100/85 hover:text-amber-50 hover:bg-white/10'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              <span>委托账本</span>
              <span
                className={`text-xs font-mono px-1.5 py-0.2 rounded-full ${
                  activeOverlay === 'ledger' ? 'bg-black/15 text-amber-950' : 'bg-amber-500/25 text-amber-200'
                }`}
              >
                {filteredTasks.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => switchSection(activeOverlay === 'gantt' ? 'none' : 'gantt')}
              className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                activeOverlay === 'gantt'
                  ? 'bg-amber-500 text-amber-950 shadow-sm'
                  : 'text-amber-100/85 hover:text-amber-50 hover:bg-white/10'
              }`}
            >
              <ScrollText className="w-4 h-4" />
              <span>时序卷轴</span>
            </button>

            <button
              type="button"
              onClick={() => switchSection(activeOverlay === 'stats' ? 'none' : 'stats')}
              className={`flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-extrabold transition-all cursor-pointer ${
                activeOverlay === 'stats'
                  ? 'bg-amber-500 text-amber-950 shadow-sm'
                  : 'text-amber-100/85 hover:text-amber-50 hover:bg-white/10'
              }`}
            >
              <BarChart3 className="w-4 h-4" />
              <span>战绩圣殿</span>
            </button>
          </nav>

          {/* Right: Global Actions, Undo/Redo, Sync & NPC Settings */}
          <div className="flex items-center flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => startCreateTask('in_progress')}
              className="flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-amber-950 text-xs sm:text-sm font-extrabold shadow-xs transition-colors cursor-pointer"
              title="向看板娘登记新委托"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span className="hidden sm:inline">新委托</span>
            </button>

            <button
              type="button"
              onClick={() => setShowFilterBar((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 sm:py-2 rounded-xl border text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                showFilterBar || hasActiveFilters
                  ? 'bg-amber-500/20 border-amber-400/60 text-amber-200'
                  : 'bg-black/40 border-amber-600/30 text-amber-100/85 hover:bg-white/10'
              }`}
              title="展开/收起搜索与标签筛选"
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden md:inline">筛选</span>
              {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-amber-400" />}
            </button>

            {/* Undo / Redo */}
            <div className="flex items-center gap-1 pl-1.5 border-l border-amber-600/25">
              <button
                type="button"
                onClick={undo}
                disabled={!canUndo}
                title={canUndo ? `撤销：${lastUndoDescription} (Ctrl+Z)` : '暂无可撤销操作'}
                className={`p-2 rounded-lg border text-xs sm:text-sm transition-colors ${
                  canUndo
                    ? 'bg-black/40 border-amber-600/30 text-amber-100 hover:bg-white/10 cursor-pointer'
                    : 'bg-black/20 border-white/5 text-stone-600 cursor-not-allowed'
                }`}
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={redo}
                disabled={!canRedo}
                title={canRedo ? `重做：${lastRedoDescription} (Ctrl+Y)` : '暂无可重做操作'}
                className={`p-2 rounded-lg border text-xs sm:text-sm transition-colors ${
                  canRedo
                    ? 'bg-black/40 border-amber-600/30 text-amber-100 hover:bg-white/10 cursor-pointer'
                    : 'bg-black/20 border-white/5 text-stone-600 cursor-not-allowed'
                }`}
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>

            {/* Cloud & Local Sync + JSON Backup */}
            <div className="flex items-center gap-1.5 pl-1.5 border-l border-amber-600/25">
              <button
                type="button"
                onClick={() => setDriveSyncModalOpen(true)}
                title={user ? 'Google Drive 云端同步管理' : '连接 Google Drive'}
                className="relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-black/40 hover:bg-white/10 border border-amber-600/30 text-amber-100 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                <Cloud className="w-4 h-4 text-sky-400" />
                <span className="hidden lg:inline">云同步</span>
                <span className={`w-2 h-2 rounded-full ${driveDotClass}`} />
              </button>

              <button
                type="button"
                onClick={() => setLocalSyncModalOpen(true)}
                title="本地目录实时同步管理"
                className="relative flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-black/40 hover:bg-white/10 border border-amber-600/30 text-amber-100 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              >
                <FolderSync className="w-4 h-4 text-amber-300" />
                <span className="hidden lg:inline">本地</span>
                <span className={`w-2 h-2 rounded-full ${localDotClass}`} />
              </button>

              <button
                type="button"
                onClick={exportData}
                title="导出 JSON 备份"
                className="p-2 rounded-lg bg-black/40 hover:bg-white/10 border border-amber-600/30 text-amber-100/85 hover:text-amber-50 transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                title="导入 JSON 备份"
                className="p-2 rounded-lg bg-black/40 hover:bg-white/10 border border-amber-600/30 text-amber-100/85 hover:text-amber-50 transition-colors cursor-pointer"
              >
                <Upload className="w-4 h-4" />
              </button>
            </div>

            {/* NPC Settings */}
            <button
              type="button"
              onClick={() => setNpcModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-black/40 hover:bg-white/10 border border-amber-600/30 text-amber-100 text-xs sm:text-sm font-semibold transition-colors cursor-pointer"
              title="自定义看板娘名字、预设与立绘"
            >
              <Settings className="w-4 h-4 text-amber-300" />
              <span className="hidden xl:inline">看板娘</span>
            </button>
          </div>
        </div>

        {/* Collapsible Search & Tag Filter Bar (Zero Horizontal Overflow, uses flex-wrap) */}
        {(showFilterBar || hasActiveFilters) && (
          <div className="pt-2 border-t border-amber-600/20 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5 flex-wrap text-xs sm:text-sm">
              <span className="flex items-center gap-1 text-amber-300/85 text-xs sm:text-sm font-semibold mr-1">
                <Tag className="w-3.5 h-3.5" />
                <span>标签:</span>
              </span>

              <button
                type="button"
                onClick={() => setSelectedTag(null)}
                className={`px-3 py-1 rounded-lg text-xs sm:text-sm font-bold border transition-colors cursor-pointer ${
                  selectedTag === null
                    ? 'bg-amber-500 text-amber-950 border-amber-300'
                    : 'bg-black/35 text-amber-100/85 border-amber-600/30 hover:bg-white/10'
                }`}
              >
                全部 ({tasks.length})
              </button>

              {(showAllTagChips ? sortedAllTags : sortedAllTags.slice(0, 8)).map((tag) => {
                const count = tasks.filter((t) => t.tags.includes(tag)).length;
                const isSelected = selectedTag === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setSelectedTag(isSelected ? null : tag)}
                    className={`px-3 py-1 rounded-lg text-xs sm:text-sm font-semibold border transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-amber-400 text-amber-950 border-amber-200'
                        : 'bg-black/35 text-amber-100/85 border-amber-600/25 hover:bg-white/10'
                    }`}
                  >
                    {tag} <span className="opacity-75">({count})</span>
                  </button>
                );
              })}

              {sortedAllTags.length > 8 && (
                <button
                  type="button"
                  onClick={() => setShowAllTagChips((p) => !p)}
                  className="text-xs sm:text-sm text-amber-300 hover:underline px-1.5 cursor-pointer"
                >
                  {showAllTagChips ? '收起' : `+${sortedAllTags.length - 8} 更多`}
                </button>
              )}
            </div>

            <div className="relative w-full md:w-72 shrink-0">
              <Search className="w-4 h-4 text-amber-300/60 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="搜索委托标题或标签..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 text-xs sm:text-sm bg-black/45 border border-amber-600/35 rounded-lg text-amber-50 placeholder-amber-200/40 focus:outline-none focus:border-amber-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-300/70 hover:text-amber-100 text-xs cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ── Layer 1: Dynamic Center Reception / Left-Right Split Interactive Stage ── */}
      <div className="relative flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden overflow-x-hidden bg-[#1a110b]">
        {/* Continuous Full-Stage Background Layer for Sprite Overlay Mode */}
        {npcConfig.displayMode === 'sprite' && (
          <div
            className="absolute inset-0 bg-cover bg-center transition-all duration-500 pointer-events-none"
            style={{
              backgroundImage: `url(${npcConfig.customBgUrl || './npc/bg-guild-hall.jpg'})`,
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/45" />
          </div>
        )}

        {/* Left / Center NPC Visual Stage */}
        {showLeftNpcStage && (
          <div
            onClick={handleNpcStageClick}
            className={`relative z-10 min-h-0 flex flex-col justify-end overflow-hidden cursor-pointer group/stage transition-[width] duration-300 ease-out ${
              !isSplitStage
                ? 'w-full flex-1 h-full'
                : activeOverlay === 'none'
                  ? 'w-full lg:w-[40%] xl:w-[38%] 2xl:w-[36%] h-[360px] sm:h-[400px] lg:h-full shrink-0 border-b lg:border-b-0 lg:border-r border-amber-500/35'
                  : 'w-full lg:w-[31%] xl:w-[29%] 2xl:w-[27%] h-[330px] sm:h-[370px] lg:h-full shrink-0 border-b lg:border-b-0 lg:border-r border-amber-500/35'
            }`}
          >
            {/* Warm fantasy fallback backdrop (when in scene mode or no custom bg) */}
            {npcConfig.displayMode !== 'sprite' && (
              <div className="absolute inset-0 bg-gradient-to-b from-[#332216] via-[#261810] to-[#1a110b]">
                <div className="absolute -top-20 left-1/4 w-96 h-96 rounded-full bg-amber-500/15 blur-3xl pointer-events-none" />
                <div className="absolute top-10 right-1/4 w-72 h-72 rounded-full bg-orange-400/10 blur-3xl pointer-events-none" />
              </div>
            )}

            {/* Full-Bleed Scene CG Layer (when in scene mode) */}
            {npcConfig.displayMode === 'scene' && !imgLoadFailed && (
              <AnimatePresence mode="wait">
                <motion.img
                  key={`scene-${expression}-${activeImgSrc}`}
                  src={activeImgSrc}
                  alt={`${npcConfig.name} - ${EXPRESSION_META[expression].label}`}
                  onError={() => setImgLoadFailed(true)}
                  initial={{ opacity: 0.72, scale: 1.015 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0.72 }}
                  transition={{ duration: 0.28, ease: 'easeOut' }}
                  className="absolute inset-0 w-full h-full object-cover object-[center_18%]"
                  draggable={false}
                />
              </AnimatePresence>
            )}

            {/* Bottom cinematic vignette */}
            <div
              className={`absolute inset-x-0 bottom-0 pointer-events-none ${
                npcConfig.displayMode === 'scene'
                  ? 'h-44 bg-gradient-to-t from-[#140e0a] via-[#140e0a]/65 to-transparent'
                  : 'h-32 bg-gradient-to-t from-[#140e0a]/85 via-[#140e0a]/35 to-transparent'
              }`}
            />

            {/* Floating Hearts on Click */}
            {floatingHearts.map((h) => (
              <div
                key={h.id}
                style={{ left: h.x, top: h.y }}
                className="absolute pointer-events-none z-30 flex items-center gap-1 text-rose-400 font-bold text-sm drop-shadow-md guild-heart-rise"
              >
                <Heart className="w-5 h-5 fill-rose-500 text-rose-400" />
                <span>+1</span>
              </div>
            ))}

            {/* Center Mode: Pinned Active Quests Board (floating top-left) */}
            {!isSplitStage && activeInProgressTasks.length > 0 && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="hidden md:flex flex-col gap-2 absolute top-4 left-4 sm:top-6 sm:left-6 z-20 w-72 sm:w-80 cursor-default"
              >
                <div className="flex items-center justify-between px-1.5">
                  <span className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-amber-200 drop-shadow">
                    📌 当前攻略中 ({activeInProgressTasks.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveLedgerTab('in_progress');
                      switchSection('ledger');
                    }}
                    className="text-xs text-amber-300/90 hover:text-amber-100 underline cursor-pointer"
                  >
                    全部 →
                  </button>
                </div>
                {pinnedActiveTasks.map((task) => {
                  const cat = getQuestCategoryBadge(task.tags);
                  const todayLog = getLog(task.id, todayStr);
                  return (
                    <div
                      key={task.id}
                      onClick={() => openInspectTask(task)}
                      className="px-3.5 py-2 rounded-xl bg-black/65 hover:bg-black/85 border border-amber-500/40 hover:border-amber-400/80 backdrop-blur-md text-amber-50 flex items-center justify-between gap-2.5 cursor-pointer transition-all shadow-lg"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-base shrink-0">{cat.icon}</span>
                        <span className="text-xs sm:text-sm font-bold truncate">{task.title}</span>
                      </div>
                      {todayLog ? (
                        <span className="shrink-0 text-xs px-2 py-0.5 rounded-md bg-emerald-500/25 text-emerald-300 border border-emerald-400/45 font-bold">
                          ✓ 已报
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCheckInForTask(task, todayStr);
                          }}
                          className="shrink-0 text-xs px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-amber-950 font-extrabold transition-colors cursor-pointer"
                        >
                          打卡
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Split-Stage Mode: Top Companion Floating Controls */}
            {isSplitStage && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute top-3 left-3 right-3 z-20 flex items-center justify-between gap-2 cursor-default"
              >
                <button
                  type="button"
                  onClick={() => {
                    setActiveOverlay('none');
                    setViewMode('kanban');
                    returnToHub();
                  }}
                  className="px-3 py-1.5 rounded-xl bg-black/70 hover:bg-black/85 border border-amber-400/50 text-amber-100 text-xs sm:text-sm font-bold flex items-center gap-1.5 backdrop-blur-md shadow-md cursor-pointer transition-colors"
                >
                  <Home className="w-3.5 h-3.5 text-amber-300" />
                  <span>返回大厅中央</span>
                </button>

                <div className="px-3 py-1.5 rounded-xl bg-black/70 border border-amber-400/40 text-xs sm:text-sm font-bold text-amber-100 flex items-center gap-2 backdrop-blur-md shadow-md">
                  <span className="flex items-center gap-1 text-rose-300">
                    <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-400" />
                    <span>{affection}</span>
                  </span>
                  <span className="text-amber-400/50">·</span>
                  <span className="text-amber-200">{EXPRESSION_META[expression].badge}</span>
                </div>
              </div>
            )}

            {/* Shared Portrait Stage (decoupled fixed frame so mode-switch & dialogue height never shift or shrink the sprite) */}
            <div className="absolute inset-x-0 top-2 sm:top-3 bottom-[190px] sm:bottom-[210px] xl:bottom-[225px] z-10 pointer-events-none overflow-hidden">
              {imgLoadFailed ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-amber-100/80 p-4 text-center">
                  <div className="w-20 h-20 rounded-full bg-amber-900/50 border-2 border-amber-500/50 flex items-center justify-center text-3xl shadow-lg mb-2.5">
                    {expression === 'cheer'
                      ? '🎉'
                      : expression === 'happy'
                      ? '😊'
                      : expression === 'thinking'
                      ? '🤔'
                      : expression === 'sleepy'
                      ? '🥱'
                      : '✨'}
                  </div>
                  <p className="text-sm sm:text-base font-bold text-amber-200">{npcConfig.name}</p>
                  <p className="text-xs text-amber-300/75 mt-1 max-w-xs">
                    当前表情立绘未加载，可点击右上角「看板娘」设置上传或更换图片
                  </p>
                </div>
              ) : (
                npcConfig.displayMode === 'sprite' && (
                  <div className="w-full h-full flex items-end justify-center pt-6 sm:pt-4">
                    <img
                      src={activeImgSrc}
                      alt={`${npcConfig.name} - ${EXPRESSION_META[expression].label}`}
                      onError={() => setImgLoadFailed(true)}
                      className="h-full w-auto max-w-none shrink-0 object-contain object-bottom drop-shadow-[0_12px_28px_rgba(0,0,0,0.65)] guild-float-slow"
                      draggable={false}
                    />
                  </div>
                )
              )}
            </div>

            {/* ── CENTER RECEPTION MODE UI ── */}
            {!isSplitStage && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="relative mt-auto shrink-0 z-20 px-4 sm:px-8 pb-4 sm:pb-6 pt-4 flex justify-center cursor-default"
              >
                <div className="relative w-full max-w-4xl xl:max-w-5xl max-h-[55vh] sm:max-h-none overflow-y-auto sm:overflow-visible bg-[#18120e]/92 backdrop-blur-md border-2 border-amber-500/70 rounded-3xl shadow-[0_24px_64px_rgba(0,0,0,0.8)] p-4 sm:p-5 xl:p-6 text-amber-50">
                    {/* Nameplate & Affection Pill */}
                    <div className="absolute -top-4 left-6 right-6 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="px-4 py-1 rounded-xl bg-gradient-to-r from-amber-600 to-amber-700 border border-amber-300/80 text-amber-50 text-sm sm:text-base font-extrabold tracking-wider shadow-lg flex items-center gap-1.5">
                          <span>【{npcConfig.title}】</span>
                          <span className="text-amber-200">{npcConfig.name}</span>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-black/80 border border-amber-500/40 text-xs sm:text-sm font-semibold text-amber-200 backdrop-blur-sm">
                          {EXPRESSION_META[expression].badge}
                        </span>
                      </div>

                      <div className="hidden sm:flex items-center gap-2">
                        <span
                          className="px-3 py-1 rounded-lg bg-black/80 border border-rose-500/40 text-xs sm:text-sm font-bold text-rose-300 flex items-center gap-1.5 backdrop-blur-sm"
                          title="点击看板娘可提升默契度"
                        >
                          <Heart className="w-3.5 h-3.5 fill-rose-500 text-rose-400" />
                          <span>默契度 {affection}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            const chatter = getRandomChatter(guildStats, tasks, staleList);
                            speak(chatter.text, chatter.expression);
                          }}
                          className="px-3 py-1 rounded-lg bg-[#2a2019] hover:bg-[#382b22] border border-amber-500/45 text-xs sm:text-sm font-bold text-amber-200 flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                          <span>闲聊互动</span>
                        </button>
                      </div>
                    </div>

                    {/* Large Readable Dialogue Text (pre-sized to prevent layout shift during typing) */}
                    <div
                      onClick={() => {
                        if (isTyping) setTypedLength(dialogueText.length);
                      }}
                      className="grid text-base sm:text-lg xl:text-xl leading-relaxed text-amber-50 font-medium min-h-[3.2rem] mt-1.5 mb-3.5 cursor-pointer"
                    >
                      <span
                        aria-hidden="true"
                        className="col-start-1 row-start-1 invisible select-none pointer-events-none"
                      >
                        {dialogueText}
                      </span>
                      <span className="col-start-1 row-start-1">
                        <span>{displayedDialogue}</span>
                        {isTyping && (
                          <span className="inline-block w-2 h-5 ml-1.5 bg-amber-400 animate-pulse align-middle" />
                        )}
                      </span>
                    </div>

                    {/* 6 Large RPG Choice Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      <button
                        type="button"
                        onClick={startCheckInFlow}
                        className="guild-choice-btn p-3.5 sm:p-4 rounded-2xl bg-gradient-to-br from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-amber-950 border border-amber-200/80 shadow-lg text-left flex items-start gap-3 cursor-pointer"
                      >
                        <div className="p-2 rounded-xl bg-black/15 shrink-0">
                          <CheckCircle2 className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-extrabold leading-tight">
                            汇报今日进度
                          </div>
                          <div className="text-xs text-amber-950/80 font-semibold mt-1 truncate">
                            今日已报 {guildStats.todayCheckedCount} 项 · 攻略中 {guildStats.inProgressCount} 项
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => switchSection('ledger')}
                        className="guild-choice-btn p-3.5 sm:p-4 rounded-2xl bg-[#2a2019]/95 hover:bg-[#382b22] text-amber-50 border border-amber-500/45 text-left flex items-start gap-3 cursor-pointer"
                      >
                        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 shrink-0">
                          <BookOpen className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-extrabold leading-tight">
                            翻阅委托账本
                          </div>
                          <div className="text-xs text-amber-200/75 mt-1 truncate">
                            共 {filteredTasks.length} 份委托 · 四状态分类管理
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => startCreateTask('in_progress')}
                        className="guild-choice-btn p-3.5 sm:p-4 rounded-2xl bg-[#2a2019]/95 hover:bg-[#382b22] text-amber-50 border border-amber-500/45 text-left flex items-start gap-3 cursor-pointer"
                      >
                        <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 shrink-0">
                          <Plus className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-extrabold leading-tight">
                            登记新的委托
                          </div>
                          <div className="text-xs text-amber-200/75 mt-1 truncate">
                            立项新游戏 / 书籍 / 影视目标
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => triggerRandomPick()}
                        className="guild-choice-btn p-3.5 sm:p-4 rounded-2xl bg-[#2a2019]/95 hover:bg-[#382b22] text-amber-50 border border-amber-500/45 text-left flex items-start gap-3 cursor-pointer"
                      >
                        <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 shrink-0">
                          <Dices className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-extrabold leading-tight">
                            帮我抽个坑填
                          </div>
                          <div className="text-xs text-amber-200/75 mt-1 truncate">
                            从 {guildStats.backlogCount} 项待接取中随机抽取
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={startStaleReview}
                        className={`guild-choice-btn p-3.5 sm:p-4 rounded-2xl border text-left flex items-start gap-3 cursor-pointer ${
                          staleList.length > 0
                            ? 'bg-rose-950/75 hover:bg-rose-900/80 text-rose-50 border-rose-400/55'
                            : 'bg-[#2a2019]/95 hover:bg-[#382b22] text-amber-50 border-amber-500/45'
                        }`}
                      >
                        <div
                          className={`p-2 rounded-xl shrink-0 ${
                            staleList.length > 0
                              ? 'bg-rose-500/25 text-rose-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          <BellRing className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-extrabold leading-tight">
                            催更巡检
                          </div>
                          <div className="text-xs text-amber-200/80 mt-1 truncate">
                            {staleList.length > 0
                              ? `${staleList.length} 项委托已超 3 天未推进`
                              : '巡检久未推进的攻略中委托'}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveOverlay('none');
                          setViewMode('kanban');
                          setDialogueMode('sync_menu');
                          speak(
                            `需要同步云端卷宗还是备份到本地文件夹呢？可以在右侧同步中心直接操作~`,
                            'thinking'
                          );
                        }}
                        className="guild-choice-btn p-3.5 sm:p-4 rounded-2xl bg-[#2a2019]/95 hover:bg-[#382b22] text-amber-50 border border-amber-500/45 text-left flex items-start gap-3 cursor-pointer"
                      >
                        <div className="p-2 rounded-xl bg-sky-500/20 text-sky-300 shrink-0">
                          <Cloud className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-extrabold leading-tight">
                            同步与备份
                          </div>
                          <div className="text-xs text-amber-200/75 mt-1 truncate">
                            Google Drive / 本地目录 / JSON 备份
                          </div>
                        </div>
                      </button>
                    </div>
                  </div>
                </div>
            )}

            {/* ── SPLIT-STAGE LEFT COMPANION UI (Bottom Live Speech Bubble & Quick Affair Switcher) ── */}
            {isSplitStage && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="relative mt-auto shrink-0 z-20 mx-3 mb-3 sm:mx-4 sm:mb-4 bg-[#18120e]/92 backdrop-blur-md border-2 border-amber-500/70 rounded-2xl p-3.5 sm:p-4 shadow-2xl text-amber-50 cursor-default"
              >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-sm sm:text-base font-extrabold text-amber-200 tracking-wide shrink-0">
                      {npcConfig.name}
                    </span>
                    {npcConfig.title && (
                      <span className="text-xs text-amber-300/75 font-semibold truncate">
                        · {npcConfig.title}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        const chatter = getRandomChatter(guildStats, tasks, staleList);
                        speak(chatter.text, chatter.expression);
                      }}
                      className="text-xs px-2 py-0.5 rounded-lg bg-white/10 hover:bg-white/20 text-amber-200 font-semibold cursor-pointer transition-colors"
                    >
                      💬 闲聊
                    </button>
                  </div>
                </div>

                <div
                  onClick={() => {
                    if (isTyping) setTypedLength(dialogueText.length);
                  }}
                  className="grid text-sm sm:text-base xl:text-lg leading-relaxed text-amber-50 font-medium min-h-[2.8rem] cursor-pointer"
                >
                  <span
                    aria-hidden="true"
                    className="col-start-1 row-start-1 invisible select-none pointer-events-none"
                  >
                    {dialogueText}
                  </span>
                  <span className="col-start-1 row-start-1">
                    <span>{displayedDialogue}</span>
                    {isTyping && (
                      <span className="inline-block w-1.5 h-4 ml-1 bg-amber-400 animate-pulse align-middle" />
                    )}
                  </span>
                </div>

                {/* Quick Affair Switcher Bar */}
                <div className="pt-2.5 mt-2.5 border-t border-amber-500/25 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={startCheckInFlow}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        activeOverlay === 'none' &&
                        (dialogueMode === 'select_checkin_task' || dialogueMode === 'checkin_form')
                          ? 'bg-amber-500 text-amber-950 border-amber-300'
                          : 'bg-[#2a2019] hover:bg-[#382b22] text-amber-100 border-amber-500/35'
                      }`}
                    >
                      📝 汇报打卡
                    </button>
                    <button
                      type="button"
                      onClick={() => startCreateTask('in_progress')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        activeOverlay === 'none' && dialogueMode === 'create_task'
                          ? 'bg-amber-500 text-amber-950 border-amber-300'
                          : 'bg-[#2a2019] hover:bg-[#382b22] text-amber-100 border-amber-500/35'
                      }`}
                    >
                      ✨ 新建委托
                    </button>
                    <button
                      type="button"
                      onClick={() => switchSection('ledger')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        activeOverlay === 'ledger'
                          ? 'bg-amber-500 text-amber-950 border-amber-300'
                          : 'bg-[#2a2019] hover:bg-[#382b22] text-amber-100 border-amber-500/35'
                      }`}
                    >
                      📖 委托账本
                    </button>
                    <button
                      type="button"
                      onClick={() => triggerRandomPick()}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        activeOverlay === 'none' && dialogueMode === 'random_pick'
                          ? 'bg-amber-500 text-amber-950 border-amber-300'
                          : 'bg-[#2a2019] hover:bg-[#382b22] text-amber-100 border-amber-500/35'
                      }`}
                    >
                      🎲 抽坑
                    </button>
                    <button
                      type="button"
                      onClick={startStaleReview}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                        activeOverlay === 'none' && dialogueMode === 'stale_review'
                          ? 'bg-amber-500 text-amber-950 border-amber-300'
                          : 'bg-[#2a2019] hover:bg-[#382b22] text-amber-100 border-amber-500/35'
                      }`}
                    >
                      🔔 催更{staleList.length > 0 ? `(${staleList.length})` : ''}
                    </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Right Side Information & Interactive Workspace (Split-Stage Mode) ── */}
        {isSplitStage && (
          <div
            className={`relative z-10 flex-1 min-w-0 h-full min-h-0 flex flex-col p-2.5 sm:p-4 xl:p-5 overflow-hidden overflow-x-hidden ${
              npcConfig.displayMode === 'sprite'
                ? 'bg-[#140e0a]/65 backdrop-blur-md'
                : 'bg-[#140e0a]/95'
            }`}
          >
            {/* OVERLAY A: PARCHMENT QUEST LEDGER */}
            {activeOverlay === 'ledger' && (
              <div className="flex-1 min-h-0 guild-parchment rounded-2xl border-2 border-amber-700/60 dark:border-amber-600/50 shadow-2xl flex flex-col overflow-hidden overflow-x-hidden">
                <div className="px-4 sm:px-5 pt-3.5 pb-0 border-b border-amber-800/20 dark:border-amber-700/30 bg-[#f3e6c8]/90 dark:bg-[#2a221a]/95 shrink-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <BookOpen className="w-5 h-5 text-amber-800 dark:text-amber-400 shrink-0" />
                      <h3 className="text-base sm:text-lg font-extrabold text-amber-950 dark:text-amber-100 tracking-wide">
                        公会委托账本
                      </h3>
                      <span className="hidden xl:inline text-xs text-amber-800/75 dark:text-amber-300/75">
                        · 拖拽卡片可排序，拖至页签可跨状态调动
                      </span>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => setWideOverlayMode((p) => !p)}
                        className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/20 dark:hover:bg-white/15 text-amber-950 dark:text-amber-100 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                      >
                        {wideOverlayMode ? (
                          <>
                            <Minimize2 className="w-3.5 h-3.5" />
                            <span>▶ 看板娘伴随</span>
                          </>
                        ) : (
                          <>
                            <Maximize2 className="w-3.5 h-3.5" />
                            <span>◀ 宽屏视图</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => startCreateTask(activeLedgerTab)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-700 hover:bg-amber-800 text-amber-50 text-xs sm:text-sm font-bold shadow-xs transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>登记新委托</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => switchSection('none')}
                        className="px-3 py-1.5 rounded-xl text-amber-900/80 dark:text-amber-200/80 hover:bg-black/10 dark:hover:bg-white/10 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                      >
                        返回大厅
                      </button>
                    </div>
                  </div>

                  {/* 4 Status Bookmark Tabs */}
                  <div className="flex items-center flex-wrap gap-1.5">
                    {LEDGER_TABS.map((statusKey) => {
                      const meta = RPG_STATUS_META[statusKey];
                      const count = tasksByStatus[statusKey].length;
                      const isActive = activeLedgerTab === statusKey;
                      const isDropTarget = dragOverTab === statusKey && draggedTaskStatus !== statusKey;

                      return (
                        <button
                          key={statusKey}
                          type="button"
                          onClick={() => setActiveLedgerTab(statusKey)}
                          onDragOver={(e) => {
                            e.preventDefault();
                            if (draggedTaskStatus !== statusKey) {
                              setDragOverTab(statusKey);
                            }
                          }}
                          onDragLeave={() => {
                            if (dragOverTab === statusKey) setDragOverTab(null);
                          }}
                          onDrop={(e) => handleTabDrop(e, statusKey)}
                          className={`px-3.5 py-2 rounded-t-xl text-xs sm:text-sm font-extrabold flex items-center gap-1.5 border-t border-x transition-all cursor-pointer shrink-0 ${
                            isDropTarget
                              ? 'bg-blue-100 dark:bg-blue-900/70 border-blue-500 text-blue-900 dark:text-blue-100 scale-[1.03]'
                              : isActive
                              ? `${meta.tabAccent} border-amber-700/40 dark:border-amber-600/50 shadow-2xs`
                              : 'bg-black/5 dark:bg-white/5 border-transparent text-stone-600 dark:text-stone-400 hover:bg-black/10 dark:hover:bg-white/10'
                          }`}
                        >
                          <span>{meta.icon}</span>
                          <span>{meta.rpgLabel}</span>
                          <span className="text-xs font-mono px-1.5 py-0.2 rounded-full bg-black/10 dark:bg-white/10">
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Ledger Pages Body */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-5">
                  {currentLedgerTasks.length === 0 ? (
                    <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center border-2 border-dashed border-amber-800/25 dark:border-amber-700/35 rounded-2xl p-8">
                      <p className="text-sm sm:text-base font-semibold text-amber-900/75 dark:text-amber-200/75">
                        「{RPG_STATUS_META[activeLedgerTab].rpgLabel}」这一页目前还是空白的呢~
                      </p>
                      <button
                        type="button"
                        onClick={() => startCreateTask(activeLedgerTab)}
                        className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-bold shadow-xs transition-colors cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>在此页登记新委托</span>
                      </button>
                    </div>
                  ) : (
                    <div
                      className={`grid grid-cols-1 gap-3 ${
                        wideOverlayMode ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2'
                      }`}
                    >
                      {currentLedgerTasks.map((task) => {
                        const cat = getQuestCategoryBadge(task.tags);
                        const latestLog = getLatestLogForTask(task.id);
                        const todayLog = getLog(task.id, todayStr);
                        const totalHours = getTaskTotalHours(task.id);
                        const progressDays = getLogsForTask(task.id).filter(
                          (l) => l.progressType === 'progress' || l.progressType === 'completed'
                        ).length;

                        const isDropBefore = dragOverCardId === task.id && dropPosition === 'before';
                        const isDropAfter = dragOverCardId === task.id && dropPosition === 'after';

                        return (
                          <div
                            key={task.id}
                            ref={(el) => {
                              if (el) cardRefs.current.set(task.id, el);
                              else cardRefs.current.delete(task.id);
                            }}
                            draggable
                            onDragStart={(e) => handleCardDragStart(e, task)}
                            onDragOver={(e) => handleCardDragOver(e, task.id, task.status)}
                            onDragLeave={() => {
                              if (dragOverCardId === task.id) setDragOverCardId(null);
                            }}
                            onDrop={(e) => handleCardDrop(e, task)}
                            onDragEnd={() => handleCardDragEnd(task.id)}
                            className="relative group rounded-2xl bg-white/88 dark:bg-[#2a231c]/92 border border-amber-800/25 dark:border-amber-700/40 hover:border-amber-600 dark:hover:border-amber-500 p-4 shadow-xs hover:shadow-md transition-all flex flex-col justify-between gap-3 cursor-grab active:cursor-grabbing min-w-0"
                          >
                            {isDropBefore && (
                              <div className="absolute -top-1.5 inset-x-2 h-0.5 bg-amber-500 rounded-full z-10 pointer-events-none" />
                            )}
                            {isDropAfter && (
                              <div className="absolute -bottom-1.5 inset-x-2 h-0.5 bg-amber-500 rounded-full z-10 pointer-events-none" />
                            )}

                            <div className="flex items-start justify-between gap-2 min-w-0">
                              <div className="flex items-start gap-2 min-w-0">
                                <GripVertical className="w-4 h-4 text-amber-800/35 dark:text-amber-300/35 mt-1 shrink-0" />
                                <span
                                  className={`shrink-0 text-xs px-2 py-0.5 rounded-lg border font-semibold ${cat.ribbonClass}`}
                                >
                                  {cat.icon} {cat.label}
                                </span>
                                <h4
                                  onClick={() => openInspectTask(task)}
                                  className="text-sm sm:text-base font-bold text-stone-900 dark:text-amber-50 leading-snug line-clamp-2 cursor-pointer hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                                  title={task.title}
                                >
                                  {task.title}
                                </h4>
                              </div>

                              {task.status === 'done' ? (
                                <span className="shrink-0 text-[10px] font-black tracking-wider px-2 py-0.5 rounded border-2 border-rose-600/70 text-rose-700 dark:text-rose-300 dark:border-rose-400/70 bg-rose-50/70 dark:bg-rose-950/50 rotate-[-6deg]">
                                  CLEARED
                                </span>
                              ) : todayLog ? (
                                <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                  ✓ 今日{todayLog.hours ? ` ${formatHours(todayLog.hours)}` : '已报'}
                                </span>
                              ) : null}
                            </div>

                            <div className="flex items-center justify-between gap-2 flex-wrap pl-6 text-xs">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {task.tags.slice(1).map((tag) => (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedTag(selectedTag === tag ? null : tag);
                                    }}
                                    className={`px-2 py-0.5 rounded-md text-xs border transition-colors cursor-pointer ${
                                      selectedTag === tag
                                        ? 'bg-blue-600 text-white border-blue-600'
                                        : 'bg-amber-900/5 dark:bg-white/5 text-stone-600 dark:text-stone-300 border-amber-800/15 dark:border-white/10 hover:bg-amber-900/10'
                                    }`}
                                  >
                                    #{tag}
                                  </button>
                                ))}
                                {latestLog && (
                                  <span className="text-xs text-stone-500 dark:text-stone-400">
                                    {getRelativeTimeString(latestLog.date)}
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-3 text-xs font-semibold">
                                {progressDays > 0 && (
                                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                    <Flame className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                                    {progressDays}天
                                  </span>
                                )}
                                {totalHours > 0 && (
                                  <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                                    <Clock className="w-3.5 h-3.5" />
                                    {formatHours(totalHours)}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-800/10 dark:border-white/10">
                              <button
                                type="button"
                                onClick={() => openTaskDetail(task.id)}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>档案</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openInspectTask(task)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-700 flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <MessageCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                <span>办理</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => openCheckInForTask(task, todayStr)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{todayLog ? '改今日报' : '打卡'}</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* OVERLAY B: UNIFIED RPG GANTT SCROLL */}
            {activeOverlay === 'gantt' && (
              <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-4 py-2 rounded-xl bg-[#231811] border border-amber-600/35 shrink-0">
                  <div className="flex items-center gap-2 text-amber-100 font-extrabold text-sm sm:text-base">
                    <ScrollText className="w-4 h-4 text-amber-400" />
                    <span>时序卷轴 · 冒险轨迹视图</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setWideOverlayMode((p) => !p)}
                      className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 hover:bg-white/10 border border-amber-500/35 text-amber-100 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                    >
                      {wideOverlayMode ? (
                        <>
                          <Minimize2 className="w-3.5 h-3.5" />
                          <span>▶ 看板娘伴随</span>
                        </>
                      ) : (
                        <>
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>◀ 宽屏视图</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => switchSection('none')}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-xs sm:text-sm font-bold cursor-pointer"
                    >
                      返回大厅
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                  <GanttView />
                </div>
              </div>
            )}

            {/* OVERLAY C: UNIFIED RPG STATS SANCTUARY */}
            {activeOverlay === 'stats' && (
              <div className="flex-1 min-h-0 flex flex-col gap-2.5 overflow-hidden">
                <div className="flex items-center justify-between gap-2 px-4 py-2 rounded-xl bg-[#231811] border border-amber-600/35 shrink-0">
                  <div className="flex items-center gap-2 text-amber-100 font-extrabold text-sm sm:text-base">
                    <BarChart3 className="w-4 h-4 text-emerald-400" />
                    <span>战绩圣殿 · 时光分布与统计</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setWideOverlayMode((p) => !p)}
                      className="hidden lg:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 hover:bg-white/10 border border-amber-500/35 text-amber-100 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
                    >
                      {wideOverlayMode ? (
                        <>
                          <Minimize2 className="w-3.5 h-3.5" />
                          <span>▶ 看板娘伴随</span>
                        </>
                      ) : (
                        <>
                          <Maximize2 className="w-3.5 h-3.5" />
                          <span>◀ 宽屏视图</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => switchSection('none')}
                      className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 text-xs sm:text-sm font-bold cursor-pointer"
                    >
                      返回大厅
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 guild-parchment rounded-2xl border-2 border-amber-700/60 dark:border-amber-600/50 shadow-2xl overflow-y-auto overflow-x-hidden p-4 sm:p-6">
                  <StatsView />
                </div>
              </div>
            )}

            {/* RECEPTIONIST COUNTER AFFAIRS WORKSPACE */}
            {activeOverlay === 'none' && (
              <div className="flex-1 min-h-0 guild-parchment rounded-2xl border-2 border-amber-700/60 dark:border-amber-600/50 shadow-2xl flex flex-col overflow-hidden overflow-x-hidden text-stone-900 dark:text-stone-100">
                {/* Counter Header */}
                <div className="px-5 py-4 border-b border-amber-800/20 dark:border-amber-700/30 bg-[#f3e6c8]/90 dark:bg-[#2a221a]/95 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div className="min-w-0">
                    <h3 className="text-base sm:text-lg xl:text-xl font-extrabold text-amber-950 dark:text-amber-100 truncate">
                      {counterPanelHeader.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-amber-800/80 dark:text-amber-300/80 mt-0.5 truncate">
                      {counterPanelHeader.subtitle}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={returnToHub}
                    className="px-3.5 py-2 rounded-xl bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/20 dark:hover:bg-white/15 text-amber-950 dark:text-amber-100 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>返回大厅中央</span>
                  </button>
                </div>

                {/* Counter Scrollable Body */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 space-y-5">
                  {/* MODE 2: SELECT TASK TO CHECK IN */}
                  {dialogueMode === 'select_checkin_task' && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setShowAllCheckinStatuses((prev) => !prev)}
                            className="px-3.5 py-2 rounded-xl bg-white/80 dark:bg-[#2a221a] border border-amber-800/25 dark:border-amber-600/40 text-xs sm:text-sm font-bold text-amber-950 dark:text-amber-100 hover:border-amber-600 transition-colors cursor-pointer"
                          >
                            {showAllCheckinStatuses
                              ? `仅看「攻略中」 (${activeInProgressTasks.length})`
                              : `显示全部状态 (${tasks.length})`}
                          </button>
                          <button
                            type="button"
                            onClick={() => switchSection('ledger')}
                            className="px-3.5 py-2 rounded-xl bg-white/80 dark:bg-[#2a221a] border border-amber-800/25 dark:border-amber-600/40 text-xs sm:text-sm font-bold text-amber-950 dark:text-amber-100 hover:border-amber-600 transition-colors cursor-pointer"
                          >
                            📖 翻阅委托账本挑选
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => startCreateTask('in_progress')}
                          className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                          <span>登记新委托</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(showAllCheckinStatuses ? tasks : activeInProgressTasks).map((task) => {
                          const cat = getQuestCategoryBadge(task.tags);
                          const todayLog = getLog(task.id, todayStr);
                          const totalHours = getTaskTotalHours(task.id);
                          return (
                            <button
                              key={task.id}
                              type="button"
                              onClick={() => openCheckInForTask(task, todayStr)}
                              className="guild-choice-btn px-4 py-3.5 rounded-2xl guild-card border text-left flex items-center justify-between gap-3 cursor-pointer"
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-xl shrink-0">{cat.icon}</span>
                                <div className="min-w-0">
                                  <div className="text-sm sm:text-base font-bold text-stone-900 dark:text-amber-50 truncate">
                                    {task.title}
                                  </div>
                                  <div className="text-xs text-stone-600 dark:text-amber-200/75 mt-0.5">
                                    {RPG_STATUS_META[task.status].rpgLabel} · 累计 {formatHours(totalHours)}
                                  </div>
                                </div>
                              </div>
                              <span
                                className={`shrink-0 text-xs px-2.5 py-1 rounded-lg font-bold border ${
                                  todayLog
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-300 dark:border-emerald-700'
                                    : 'bg-amber-500/20 text-amber-900 border-amber-500/40 dark:text-amber-200'
                                }`}
                              >
                                {todayLog
                                  ? `✓ ${todayLog.hours ? formatHours(todayLog.hours) : '已报'}`
                                  : '立即打卡'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* MODE 3: INSPECT SINGLE TASK DOSSIER */}
                  {dialogueMode === 'inspect_task' && selectedTask && (
                    <div className="space-y-5">
                      {/* Title & Tags Banner */}
                      <div className="p-5 rounded-2xl guild-card border space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="space-y-2 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span
                                className={`text-xs px-2.5 py-1 rounded-lg border font-bold ${
                                  getQuestCategoryBadge(selectedTask.tags).ribbonClass
                                }`}
                              >
                                {getQuestCategoryBadge(selectedTask.tags).icon}{' '}
                                {getQuestCategoryBadge(selectedTask.tags).label}
                              </span>
                              <span className="text-xs px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/35 text-amber-900 dark:text-amber-200 font-bold">
                                {RPG_STATUS_META[selectedTask.status].icon}{' '}
                                {RPG_STATUS_META[selectedTask.status].rpgLabel}
                              </span>
                            </div>
                            <h4 className="text-lg sm:text-xl font-extrabold text-stone-900 dark:text-amber-50 break-words">
                              {selectedTask.title}
                            </h4>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedTask.tags.map((t) => (
                                <span
                                  key={t}
                                  className="text-xs px-2 py-0.5 rounded-md bg-amber-900/10 dark:bg-white/10 text-stone-700 dark:text-stone-300"
                                >
                                  #{t}
                                </span>
                              ))}
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => openCheckInForTask(selectedTask, todayStr)}
                            className="px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-extrabold flex items-center gap-2 shadow-md transition-colors cursor-pointer shrink-0"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{getLog(selectedTask.id, todayStr) ? '修改今日汇报' : '立即汇报进度'}</span>
                          </button>
                        </div>
                      </div>

                      {/* 3 KPI Stat Boxes */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="p-4 rounded-2xl guild-card border">
                          <div className="text-xs text-stone-500 dark:text-stone-400 font-semibold">
                            累计投入时长
                          </div>
                          <div className="text-xl sm:text-2xl font-extrabold text-amber-700 dark:text-amber-300 mt-1">
                            {formatHours(getTaskTotalHours(selectedTask.id))}
                          </div>
                        </div>
                        <div className="p-4 rounded-2xl guild-card border">
                          <div className="text-xs text-stone-500 dark:text-stone-400 font-semibold">
                            实质推进天数
                          </div>
                          <div className="text-xl sm:text-2xl font-extrabold text-emerald-700 dark:text-emerald-300 mt-1">
                            {
                              getLogsForTask(selectedTask.id).filter(
                                (l) => l.progressType === 'progress' || l.progressType === 'completed'
                              ).length
                            }{' '}
                            天
                          </div>
                        </div>
                        <div className="p-4 rounded-2xl guild-card border">
                          <div className="text-xs text-stone-500 dark:text-stone-400 font-semibold">
                            最近活跃时间
                          </div>
                          <div className="text-base sm:text-lg font-extrabold text-stone-800 dark:text-amber-100 mt-1.5">
                            {(() => {
                              const latest = getLatestLogForTask(selectedTask.id);
                              return latest ? getRelativeTimeString(latest.date) : '尚未打卡';
                            })()}
                          </div>
                        </div>
                      </div>

                      {/* Action Buttons & Status Transfer Cards */}
                      <div className="p-4 rounded-2xl guild-card border space-y-3">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            onClick={() => openTaskDetail(selectedTask.id)}
                            className="px-3.5 py-2 rounded-xl bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/15 dark:hover:bg-white/15 text-stone-800 dark:text-amber-100 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <FileText className="w-4 h-4 text-sky-600 dark:text-sky-400" />
                            <span>展开完整时间轴抽屉</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => startEditTask(selectedTask)}
                            className="px-3.5 py-2 rounded-xl bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/15 dark:hover:bg-white/15 text-stone-800 dark:text-amber-100 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <span>修改名称/标签</span>
                          </button>

                          <button
                            type="button"
                            onClick={handleDeleteSelectedTask}
                            className="px-3.5 py-2 rounded-xl bg-rose-100/80 dark:bg-rose-950/60 hover:bg-rose-200/80 dark:hover:bg-rose-900/70 text-rose-800 dark:text-rose-200 border border-rose-300/70 dark:border-rose-600/40 text-xs sm:text-sm font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                            <span>销毁委托</span>
                          </button>
                        </div>

                        <div className="pt-3 border-t border-amber-800/15 dark:border-white/10">
                          <div className="text-xs font-bold text-stone-600 dark:text-stone-300 mb-2 flex items-center gap-1.5">
                            <ArrowRightLeft className="w-3.5 h-3.5" />
                            <span>快速调动委托状态</span>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {LEDGER_TABS.map((st) => {
                              const meta = RPG_STATUS_META[st];
                              const isCurrent = selectedTask.status === st;
                              return (
                                <button
                                  key={st}
                                  type="button"
                                  disabled={isCurrent}
                                  onClick={() => handleQuickMoveStatus(selectedTask, st)}
                                  className={`px-3 py-2 rounded-xl border text-xs sm:text-sm font-bold transition-all ${
                                    isCurrent
                                      ? 'bg-amber-500/25 border-amber-600 text-amber-950 dark:text-amber-100 cursor-default'
                                      : 'bg-white/60 dark:bg-black/25 border-amber-800/20 dark:border-white/15 text-stone-700 dark:text-stone-300 hover:border-amber-500 cursor-pointer'
                                  }`}
                                >
                                  {meta.icon} {meta.rpgLabel}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                      {/* Recent Check-in History (Clickable to Edit) */}
                      <div className="p-4 rounded-2xl guild-card border space-y-3">
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-extrabold text-amber-950 dark:text-amber-100 flex items-center gap-1.5">
                            <Calendar className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                            <span>近期打卡记录（点击可补录或修改）</span>
                          </h5>
                        </div>
                        {getLogsForTask(selectedTask.id).length === 0 ? (
                          <p className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 py-2">
                            暂无打卡记录，点击右上角「立即汇报进度」写下第一笔冒险日志吧！
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {getLogsForTask(selectedTask.id)
                              .slice(0, 6)
                              .map((log) => (
                                <button
                                  key={log.id}
                                  type="button"
                                  onClick={() => openCheckInForTask(selectedTask, log.date)}
                                  className="w-full text-left px-3.5 py-2.5 rounded-xl guild-subpanel border hover:border-amber-500 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                                >
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-xs sm:text-sm font-bold">
                                      <span className="font-mono">{log.date}</span>
                                      <span className="text-amber-800 dark:text-amber-300">
                                        {log.progressType === 'completed'
                                          ? '🏆 通关达成'
                                          : log.progressType === 'rest'
                                          ? '☕ 营地休整'
                                          : '⚔️ 实质推进'}
                                      </span>
                                    </div>
                                    {log.note && (
                                      <p className="text-xs text-stone-600 dark:text-stone-300 truncate mt-0.5">
                                        {log.note}
                                      </p>
                                    )}
                                  </div>
                                  <span className="shrink-0 text-xs sm:text-sm font-mono font-bold text-blue-700 dark:text-blue-300">
                                    {log.hours ? formatHours(log.hours) : '-'}
                                  </span>
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* MODE 4: EMBEDDED CHECK-IN FORM */}
                  {dialogueMode === 'checkin_form' && selectedTask && (
                    <form onSubmit={handleCheckInSubmit} className="space-y-5">
                      {/* Quick In-Progress Switcher Strip */}
                      {activeInProgressTasks.length > 1 && (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs font-bold text-amber-900/75 dark:text-amber-300/80 mr-1">
                            切换攻略中委托:
                          </span>
                          {activeInProgressTasks.slice(0, 6).map((t) => (
                            <button
                              key={t.id}
                              type="button"
                              onClick={() => openCheckInForTask(t, checkInDate)}
                              className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                                t.id === selectedTask.id
                                  ? 'bg-amber-600 text-white border-amber-700'
                                  : 'bg-white/75 dark:bg-black/25 text-stone-700 dark:text-stone-300 border-amber-800/20 hover:border-amber-500'
                              }`}
                            >
                              {getQuestCategoryBadge(t.tags).icon} {t.title}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Quest Summary & Date Selector */}
                      <div className="p-4 rounded-2xl guild-card border flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm sm:text-base font-extrabold text-stone-900 dark:text-amber-50 truncate">
                            {getQuestCategoryBadge(selectedTask.tags).icon} 《{selectedTask.title}》
                          </div>
                          <div className="text-xs sm:text-sm text-stone-600 dark:text-amber-200/80 mt-0.5">
                            累计投入 {formatHours(getTaskTotalHours(selectedTask.id, checkInDate))}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => setCheckInDate(addDays(checkInDate, -1))}
                            className="p-2 rounded-lg bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/20 text-stone-800 dark:text-amber-100 cursor-pointer"
                            title="前一天"
                          >
                            <ChevronLeft className="w-4 h-4" />
                          </button>
                          <input
                            type="date"
                            value={checkInDate}
                            onChange={(e) => setCheckInDate(e.target.value)}
                            className="px-3 py-1.5 text-sm sm:text-base font-mono bg-white dark:bg-[#1a140f] border border-amber-800/30 dark:border-amber-600/40 rounded-lg text-stone-900 dark:text-amber-50 focus:outline-none focus:border-amber-500"
                            required
                          />
                          <button
                            type="button"
                            onClick={() => setCheckInDate(addDays(checkInDate, 1))}
                            className="p-2 rounded-lg bg-amber-900/10 dark:bg-white/10 hover:bg-amber-900/20 text-stone-800 dark:text-amber-100 cursor-pointer"
                            title="后一天"
                          >
                            <ChevronRight className="w-4 h-4" />
                          </button>
                          <span className="text-xs sm:text-sm font-semibold text-amber-800 dark:text-amber-300 px-1">
                            {getWeekdayChinese(checkInDate)}
                            {checkInDate === todayStr
                              ? ' · 今天'
                              : checkInDate === yesterdayStr
                              ? ' · 昨天'
                              : ''}
                          </span>
                          {checkInDate !== todayStr && (
                            <button
                              type="button"
                              onClick={() => setCheckInDate(todayStr)}
                              className="px-2.5 py-1 text-xs font-bold rounded-lg bg-amber-500/20 text-amber-900 dark:text-amber-200 hover:bg-amber-500/30 cursor-pointer"
                            >
                              回今天
                            </button>
                          )}
                        </div>
                      </div>

                      {/* 3 Large Progress Type Cards */}
                      <div className="space-y-2">
                        <label className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200">
                          今日推进类型
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          {(
                            [
                              {
                                key: 'progress',
                                icon: '⚔️',
                                label: '实质推进',
                                desc: '主线推进、阅读或游玩进展',
                              },
                              {
                                key: 'rest',
                                icon: '☕',
                                label: '营地休整',
                                desc: '今天稍作整备保持连击',
                              },
                              {
                                key: 'completed',
                                icon: '🏆',
                                label: '通关达成',
                                desc: '完结全篇并加盖 CLEARED 金印',
                              },
                            ] as const
                          ).map((item) => {
                            const active = checkInType === item.key;
                            return (
                              <button
                                key={item.key}
                                type="button"
                                onClick={() => {
                                  setCheckInType(item.key);
                                  if (item.key === 'completed') setMarkAsCompleted(true);
                                }}
                                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                                  active
                                    ? item.key === 'completed'
                                      ? 'bg-emerald-600 text-white border-emerald-400 shadow-md'
                                      : item.key === 'rest'
                                      ? 'bg-amber-600 text-white border-amber-400 shadow-md'
                                      : 'bg-blue-600 text-white border-blue-400 shadow-md'
                                    : 'guild-card text-stone-800 dark:text-amber-100 hover:border-amber-500'
                                }`}
                              >
                                <div className="text-sm sm:text-base font-extrabold flex items-center gap-1.5">
                                  <span>{item.icon}</span>
                                  <span>{item.label}</span>
                                </div>
                                <div
                                  className={`text-xs mt-1 ${
                                    active ? 'text-white/90' : 'text-stone-500 dark:text-stone-400'
                                  }`}
                                >
                                  {item.desc}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Hours Input & Presets */}
                      <div className="p-4 rounded-2xl guild-card border space-y-2.5">
                        <label className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200 block">
                          投入时长（小时）
                        </label>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <div className="relative w-32 shrink-0">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max="24"
                              placeholder="如 1.5"
                              value={checkInHours}
                              onChange={(e) => setCheckInHours(e.target.value)}
                              className="w-full pl-3.5 pr-7 py-2 text-sm sm:text-base font-mono bg-white dark:bg-[#1a140f] border border-amber-800/30 dark:border-amber-600/40 rounded-xl text-stone-900 dark:text-amber-50 focus:outline-none focus:border-amber-500"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs sm:text-sm font-bold text-stone-500">
                              h
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {[0.5, 1.0, 1.5, 2.0, 3.0, 4.0].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => setCheckInHours(String(preset))}
                                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm font-mono border cursor-pointer transition-colors ${
                                  checkInHours === String(preset)
                                    ? 'bg-amber-600 text-white border-amber-700 font-bold'
                                    : 'bg-white/75 dark:bg-black/25 text-stone-700 dark:text-amber-200 border-amber-800/20 hover:border-amber-500'
                                }`}
                              >
                                {preset.toFixed(1)}h
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Multi-line Adventure Note & Submit */}
                      <div className="space-y-3">
                        <label className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200 block">
                          冒险心得 / 进展备注
                        </label>
                        <textarea
                          rows={3}
                          value={checkInNote}
                          onChange={(e) => setCheckInNote(e.target.value)}
                          placeholder="记录冒险心得或今日进展（如：通关第三章、读完第4章、击败隐藏Boss...）"
                          className="w-full px-4 py-3 text-sm sm:text-base bg-white dark:bg-[#1a140f] border border-amber-800/30 dark:border-amber-600/40 rounded-2xl text-stone-900 dark:text-amber-50 placeholder-stone-400 focus:outline-none focus:border-amber-500 resize-y"
                        />

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <label className="flex items-center gap-2 text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={markAsCompleted || checkInType === 'completed'}
                              onChange={(e) => {
                                setMarkAsCompleted(e.target.checked);
                                if (e.target.checked) setCheckInType('completed');
                              }}
                              className="w-4 h-4 rounded border-emerald-500 text-emerald-600"
                            />
                            <span>同时将委托标记为「已达成」</span>
                          </label>

                          <div className="flex items-center gap-2 flex-wrap">
                            {getLog(selectedTask.id, checkInDate) && (
                              <button
                                type="button"
                                onClick={handleDeleteCurrentCheckIn}
                                className="px-3.5 py-2 rounded-xl bg-rose-100 dark:bg-rose-950/70 hover:bg-rose-200 text-rose-800 dark:text-rose-200 border border-rose-300 dark:border-rose-500/40 text-xs sm:text-sm font-bold cursor-pointer"
                              >
                                清空当日记录
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setDialogueMode('inspect_task')}
                              className="px-3.5 py-2 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 text-stone-700 dark:text-amber-200 text-xs sm:text-sm font-bold cursor-pointer"
                            >
                              取消
                            </button>
                            <button
                              type="submit"
                              className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm sm:text-base font-extrabold flex items-center gap-2 shadow-md cursor-pointer"
                            >
                              <Send className="w-4 h-4" />
                              <span>盖章确认入账</span>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Recent Logs Preview for this Task */}
                      {getLogsForTask(selectedTask.id).length > 0 && (
                        <div className="p-4 rounded-2xl guild-subpanel border space-y-2">
                          <div className="text-xs sm:text-sm font-bold text-amber-900 dark:text-amber-200">
                            该委托最近记录（点击可切换至该日编辑）
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {getLogsForTask(selectedTask.id)
                              .slice(0, 4)
                              .map((log) => (
                                <button
                                  key={log.id}
                                  type="button"
                                  onClick={() => setCheckInDate(log.date)}
                                  className={`px-3 py-2 rounded-xl border text-left text-xs transition-colors cursor-pointer ${
                                    log.date === checkInDate
                                      ? 'bg-amber-500/20 border-amber-500 font-bold'
                                      : 'bg-white/70 dark:bg-black/25 border-amber-800/15 hover:border-amber-500'
                                  }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-mono">{log.date}</span>
                                    <span>{log.hours ? formatHours(log.hours) : '-'}</span>
                                  </div>
                                  {log.note && (
                                    <div className="text-stone-600 dark:text-stone-300 truncate mt-0.5">
                                      {log.note}
                                    </div>
                                  )}
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </form>
                  )}

                  {/* MODE 5: CHECK-IN DONE CELEBRATION */}
                  {dialogueMode === 'checkin_done' && (
                    <div className="space-y-5">
                      <div className="p-6 rounded-2xl guild-card border-2 border-emerald-500/50 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-lg sm:text-xl font-extrabold text-stone-900 dark:text-amber-50">
                            《{lastCheckInResult?.taskTitle}》
                          </span>
                          <span className="px-3 py-1 rounded-xl bg-emerald-600 text-white text-xs sm:text-sm font-extrabold guild-stamp-slam">
                            {lastCheckInResult?.wasCompleted ? '🏆 CLEARED!' : '✅ 今日已盖章入账'}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-stone-600 dark:text-amber-200/80">
                          <span>日期: {lastCheckInResult?.date}</span>
                          <span>
                            投入时长:{' '}
                            {lastCheckInResult?.hours ? formatHours(lastCheckInResult.hours) : '未填写'}
                          </span>
                          <span className="text-rose-600 dark:text-rose-300 font-bold">
                            看板娘默契度 +{lastCheckInResult?.wasCompleted ? 5 : 2}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={startCheckInFlow}
                          className="guild-choice-btn p-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-sm sm:text-base text-left cursor-pointer"
                        >
                          📝 继续汇报其他委托
                        </button>
                        {selectedTask && (
                          <button
                            type="button"
                            onClick={() => openInspectTask(selectedTask)}
                            className="guild-choice-btn p-4 rounded-2xl guild-card border font-bold text-sm sm:text-base text-left cursor-pointer"
                          >
                            📜 查看该委托卷宗
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => switchSection('ledger')}
                          className="guild-choice-btn p-4 rounded-2xl guild-card border font-bold text-sm sm:text-base text-left cursor-pointer"
                        >
                          📖 打开委托账本
                        </button>
                        <button
                          type="button"
                          onClick={returnToHub}
                          className="guild-choice-btn p-4 rounded-2xl guild-card border font-bold text-sm sm:text-base text-left cursor-pointer"
                        >
                          🏠 返回接待大厅中央
                        </button>
                      </div>
                    </div>
                  )}

                  {/* MODE 6: CREATE / EDIT TASK FORM */}
                  {(dialogueMode === 'create_task' || dialogueMode === 'edit_task') && (
                    <form onSubmit={handleTaskFormSubmit} className="space-y-5">
                      <div className="space-y-2">
                        <label className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200 block">
                          委托名称
                        </label>
                        <input
                          type="text"
                          required
                          autoFocus
                          value={formTitle}
                          onChange={(e) => setFormTitle(e.target.value)}
                          placeholder="输入委托标题（如：《黑神话：悟空》、《设计心理学》...）"
                          className="w-full px-4 py-3 text-sm sm:text-base bg-white dark:bg-[#1a140f] border border-amber-800/30 dark:border-amber-600/40 rounded-xl text-stone-900 dark:text-amber-50 placeholder-stone-400 focus:outline-none focus:border-amber-500"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200 block">
                          初始 / 当前状态
                        </label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          {LEDGER_TABS.map((st) => {
                            const meta = RPG_STATUS_META[st];
                            return (
                              <button
                                key={st}
                                type="button"
                                onClick={() => setFormStatus(st)}
                                className={`px-3 py-2.5 rounded-xl text-xs sm:text-sm font-bold border cursor-pointer transition-all ${
                                  formStatus === st
                                    ? 'bg-amber-600 text-white border-amber-700 shadow-sm'
                                    : 'guild-card text-stone-700 dark:text-amber-100 hover:border-amber-500'
                                }`}
                              >
                                {meta.icon} {meta.rpgLabel}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl guild-card border space-y-3">
                        <label className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200 block">
                          分类标签（第一个标签将作为主分类）
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          {formTags.map((tag, idx) => (
                            <span
                              key={tag}
                              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs sm:text-sm font-semibold ${
                                idx === 0
                                  ? 'bg-amber-500/25 text-amber-950 dark:text-amber-100 border border-amber-500/50'
                                  : 'bg-black/5 dark:bg-white/10 text-stone-700 dark:text-stone-200 border border-amber-800/15'
                              }`}
                            >
                              {idx === 0 && <span className="text-xs font-extrabold text-amber-700 dark:text-amber-300">主:</span>}
                              {tag}
                              <button
                                type="button"
                                onClick={() => setFormTags(formTags.filter((t) => t !== tag))}
                                className="hover:text-rose-600 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </span>
                          ))}
                          <input
                            type="text"
                            value={formNewTag}
                            onChange={(e) => setFormNewTag(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ',') {
                                e.preventDefault();
                                handleAddFormTag(formNewTag);
                              }
                            }}
                            placeholder="+ 自定义标签(回车)"
                            className="w-40 px-3 py-1 text-xs sm:text-sm bg-white dark:bg-[#1a140f] border border-amber-800/30 rounded-lg text-stone-900 dark:text-amber-50 focus:outline-none focus:border-amber-500"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap pt-1">
                          {Array.from(new Set([...allTags, ...COMMON_TAG_PRESETS]))
                            .filter((t) => !formTags.includes(t))
                            .slice(0, 10)
                            .map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => handleAddFormTag(preset)}
                                className="text-xs px-2.5 py-1 rounded-lg bg-amber-900/5 dark:bg-white/5 hover:bg-amber-500/15 text-stone-700 dark:text-amber-200 border border-amber-800/15 cursor-pointer"
                              >
                                +{preset}
                              </button>
                            ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2.5 pt-2">
                        <button
                          type="button"
                          onClick={returnToHub}
                          className="px-4 py-2 rounded-xl bg-black/5 dark:bg-white/10 hover:bg-black/10 text-stone-700 dark:text-amber-200 text-xs sm:text-sm font-bold cursor-pointer"
                        >
                          取消返回
                        </button>
                        <button
                          type="submit"
                          className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm sm:text-base font-extrabold cursor-pointer shadow-md"
                        >
                          {dialogueMode === 'edit_task' ? '💾 保存档案修改' : '✨ 盖章立项'}
                        </button>
                      </div>
                    </form>
                  )}

                  {/* MODE 7: RANDOM BACKLOG PICK */}
                  {dialogueMode === 'random_pick' && randomPickedTask && (
                    <div className="space-y-5">
                      <div className="p-6 rounded-2xl guild-card border-2 border-purple-500/45 space-y-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-purple-500/15 text-purple-800 dark:text-purple-200 border border-purple-400/40">
                            🎲 命运之骰选中
                          </span>
                          <span
                            className={`text-xs px-2.5 py-1 rounded-lg border font-semibold ${
                              getQuestCategoryBadge(randomPickedTask.tags).ribbonClass
                            }`}
                          >
                            {getQuestCategoryBadge(randomPickedTask.tags).icon}{' '}
                            {getQuestCategoryBadge(randomPickedTask.tags).label}
                          </span>
                        </div>
                        <h4 className="text-lg sm:text-xl font-extrabold text-stone-900 dark:text-amber-50">
                          《{randomPickedTask.title}》
                        </h4>
                        <div className="flex flex-wrap gap-2.5 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              moveTaskStatus(randomPickedTask.id, 'in_progress');
                              openInspectTask({ ...randomPickedTask, status: 'in_progress' });
                            }}
                            className="guild-choice-btn px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs sm:text-sm cursor-pointer"
                          >
                            🔥 正式接取（移至攻略中）
                          </button>
                          <button
                            type="button"
                            onClick={() => openCheckInForTask(randomPickedTask, todayStr)}
                            className="guild-choice-btn px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm cursor-pointer"
                          >
                            ⚡ 直接打卡开玩
                          </button>
                          <button
                            type="button"
                            onClick={() => triggerRandomPick(randomPickedTask.id)}
                            className="guild-choice-btn px-4 py-2.5 rounded-xl guild-subpanel border font-bold text-xs sm:text-sm cursor-pointer"
                          >
                            🎲 换一个再抽
                          </button>
                        </div>
                      </div>

                      {tasks.filter((t) => t.status === 'backlog').length > 1 && (
                        <div className="p-4 rounded-2xl guild-subpanel border space-y-2.5">
                          <div className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200">
                            「待接取」书架其他候选项
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {tasks
                              .filter((t) => t.status === 'backlog' && t.id !== randomPickedTask.id)
                              .slice(0, 8)
                              .map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => openInspectTask(t)}
                                  className="px-3 py-2 rounded-xl guild-card border text-left text-xs sm:text-sm font-semibold truncate hover:border-amber-500 cursor-pointer"
                                >
                                  {getQuestCategoryBadge(t.tags).icon} {t.title}
                                </button>
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* MODE 8: STALE TASK REVIEW */}
                  {dialogueMode === 'stale_review' && currentStaleItem && (
                    <div className="space-y-5">
                      <div className="p-6 rounded-2xl guild-card border-2 border-rose-500/45 space-y-4">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-rose-500/15 text-rose-700 dark:text-rose-200 border border-rose-400/40">
                            🔔 已 {currentStaleItem.daysSinceLastActive} 天未推进 · {currentStaleItem.lastDateLabel}
                          </span>
                          <span className="text-xs font-mono text-stone-500">
                            第 {staleIndex + 1} / {staleList.length} 项
                          </span>
                        </div>
                        <h4 className="text-lg sm:text-xl font-extrabold text-stone-900 dark:text-amber-50">
                          《{currentStaleItem.task.title}》
                        </h4>
                        <div className="flex flex-wrap gap-2.5">
                          <button
                            type="button"
                            onClick={() => openCheckInForTask(currentStaleItem.task, todayStr)}
                            className="guild-choice-btn px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs sm:text-sm cursor-pointer"
                          >
                            ⚡ 今天就推一把（去打卡）
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              moveTaskStatus(currentStaleItem.task.id, 'paused');
                              if (staleIndex + 1 < staleList.length) {
                                const nextItem = staleList[staleIndex + 1];
                                setStaleIndex(staleIndex + 1);
                                setSelectedTaskId(nextItem.task.id);
                                speak(
                                  `好，已将刚才那项冻结~ 下一项《${nextItem.task.title}》也 ${nextItem.daysSinceLastActive} 天没动静了，要怎么处理？`,
                                  'thinking'
                                );
                              } else {
                                setDialogueMode('hub');
                                speak(`巡检完成啦！账本看起来清爽多啦~`, 'happy');
                              }
                            }}
                            className="guild-choice-btn px-4 py-2.5 rounded-xl guild-subpanel border font-bold text-xs sm:text-sm cursor-pointer"
                          >
                            ❄️ 先移至搁置区
                          </button>
                          {staleIndex + 1 < staleList.length && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextItem = staleList[staleIndex + 1];
                                setStaleIndex(staleIndex + 1);
                                setSelectedTaskId(nextItem.task.id);
                                speak(
                                  `跳过这一项~ 再看下一项《${nextItem.task.title}》，已经 ${nextItem.daysSinceLastActive} 天没有进展了哦。`,
                                  'sleepy'
                                );
                              }}
                              className="guild-choice-btn px-4 py-2.5 rounded-xl guild-subpanel border font-bold text-xs sm:text-sm cursor-pointer"
                            >
                              ⏭️ 下一项 ({staleIndex + 2}/{staleList.length})
                            </button>
                          )}
                        </div>
                      </div>

                      {staleList.length > 1 && (
                        <div className="p-4 rounded-2xl guild-subpanel border space-y-2.5">
                          <div className="text-xs sm:text-sm font-bold text-stone-700 dark:text-amber-200">
                            全部待巡检列表 ({staleList.length})
                          </div>
                          <div className="space-y-2">
                            {staleList.map((item, idx) => (
                              <button
                                key={item.task.id}
                                type="button"
                                onClick={() => {
                                  setStaleIndex(idx);
                                  setSelectedTaskId(item.task.id);
                                }}
                                className={`w-full px-3.5 py-2.5 rounded-xl border text-left flex items-center justify-between gap-2 text-xs sm:text-sm cursor-pointer ${
                                  idx === staleIndex
                                    ? 'bg-amber-500/20 border-amber-500 font-bold'
                                    : 'guild-card hover:border-amber-500'
                                }`}
                              >
                                <span className="truncate">{item.task.title}</span>
                                <span className="shrink-0 text-xs text-rose-600 dark:text-rose-300 font-semibold">
                                  {item.daysSinceLastActive} 天未推进
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* MODE 9: SYNC MENU */}
                  {dialogueMode === 'sync_menu' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <button
                        type="button"
                        onClick={() => setDriveSyncModalOpen(true)}
                        className="guild-choice-btn p-5 rounded-2xl guild-card border text-left flex items-start gap-3.5 cursor-pointer"
                      >
                        <div className="p-3 rounded-xl bg-sky-500/15 text-sky-600 dark:text-sky-400 shrink-0">
                          <Cloud className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-sm sm:text-base font-extrabold">Google Drive 云端同步</div>
                          <div className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
                            {user ? '已连接云端账号，点击管理或立即同步' : '绑定 Google 账号以跨设备自动同步'}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setLocalSyncModalOpen(true)}
                        className="guild-choice-btn p-5 rounded-2xl guild-card border text-left flex items-start gap-3.5 cursor-pointer"
                      >
                        <div className="p-3 rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0">
                          <FolderSync className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-sm sm:text-base font-extrabold">本地目录实时同步</div>
                          <div className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
                            {localSync.enabled
                              ? '本地文件夹同步已启用，点击查看状态'
                              : '选择本地文件夹实时写入 JSON 卷宗'}
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={exportData}
                        className="guild-choice-btn p-5 rounded-2xl guild-card border text-left flex items-start gap-3.5 cursor-pointer"
                      >
                        <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 shrink-0">
                          <Download className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-sm sm:text-base font-extrabold">导出 JSON 备份</div>
                          <div className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
                            立即下载完整任务与每日打卡日志备份文件
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="guild-choice-btn p-5 rounded-2xl guild-card border text-left flex items-start gap-3.5 cursor-pointer"
                      >
                        <div className="p-3 rounded-xl bg-purple-500/15 text-purple-700 dark:text-purple-400 shrink-0">
                          <Upload className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="text-sm sm:text-base font-extrabold">导入 JSON 备份</div>
                          <div className="text-xs sm:text-sm text-stone-500 dark:text-stone-400 mt-1">
                            从历史备份文件一键恢复公会委托与打卡记录
                          </div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Task Detail Drawer scoped inside main view container */}
      <TaskDetailDrawer />

      {/* NPC Customizer Modal */}
      <NpcConfigModal
        isOpen={npcModalOpen}
        config={npcConfig}
        onClose={() => setNpcModalOpen(false)}
        onSave={handleSaveNpcConfig}
        onReset={handleResetNpcConfig}
      />
    </div>
  );
};
