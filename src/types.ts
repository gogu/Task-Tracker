export type TaskStatus = 'backlog' | 'in_progress' | 'done' | 'paused';

export type ProgressType = 'rest' | 'progress' | 'completed';

export interface TaskItem {
  id: string;
  title: string;
  tags: string[];
  status: TaskStatus;
  order?: number;                // 泳道内排序权重，越小越靠前
  startDate: string | null;      // 首次产生有效打卡或进入“进行中”的日期
  completedDate: string | null;  // 进入“已完成”状态的日期
  createdAt: string;
  updatedAt: string;
}

export interface DailyLog {
  id: string;
  taskId: string;
  date: string;                  // YYYY-MM-DD
  progressType: ProgressType;    // 无实质进展/休息 | 有实质推进 | 通关/全量完成
  note?: string;                 // 日志备注（如“通关第3章”）
  createdAt: string;
}

export interface StatusConfig {
  key: TaskStatus;
  label: string;
  enLabel: string;
  badgeBg: string;
  badgeText: string;
  laneBg: string;
  laneBorder: string;
  dotColor: string;
}

export const TASK_STATUS_CONFIG: Record<TaskStatus, StatusConfig> = {
  backlog: {
    key: 'backlog',
    label: '未开始',
    enLabel: 'Backlog',
    badgeBg: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
    badgeText: 'text-zinc-600 dark:text-zinc-400',
    laneBg: 'bg-zinc-50/75 dark:bg-zinc-900/40',
    laneBorder: 'border-zinc-200/80 dark:border-zinc-800',
    dotColor: 'bg-zinc-400',
  },
  in_progress: {
    key: 'in_progress',
    label: '进行中',
    enLabel: 'In Progress',
    badgeBg: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300',
    badgeText: 'text-blue-600 dark:text-blue-400',
    laneBg: 'bg-blue-50/30 dark:bg-blue-950/10',
    laneBorder: 'border-blue-200/70 dark:border-blue-900/40',
    dotColor: 'bg-blue-500',
  },
  done: {
    key: 'done',
    label: '已完成',
    enLabel: 'Done',
    badgeBg: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300',
    badgeText: 'text-emerald-600 dark:text-emerald-400',
    laneBg: 'bg-emerald-50/30 dark:bg-emerald-950/10',
    laneBorder: 'border-emerald-200/70 dark:border-emerald-900/40',
    dotColor: 'bg-emerald-500',
  },
  paused: {
    key: 'paused',
    label: '搁置',
    enLabel: 'Paused',
    badgeBg: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
    badgeText: 'text-amber-600 dark:text-amber-400',
    laneBg: 'bg-amber-50/30 dark:bg-amber-950/10',
    laneBorder: 'border-amber-200/70 dark:border-amber-900/40',
    dotColor: 'bg-amber-500',
  },
};

export interface ProgressConfig {
  key: ProgressType;
  label: string;
  description: string;
  colorClass: string;
  lightBg: string;
  dotBg: string;
  borderColor: string;
}

export const PROGRESS_TYPE_CONFIG: Record<ProgressType, ProgressConfig> = {
  progress: {
    key: 'progress',
    label: '有实质推进',
    description: '今天有了积极且具体的推进',
    colorClass: 'bg-blue-500 text-white hover:bg-blue-600',
    lightBg: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
    dotBg: 'bg-blue-500',
    borderColor: 'border-blue-500',
  },
  rest: {
    key: 'rest',
    label: '无实质进展/休息',
    description: '暂停休息或本日未产生实质进展',
    colorClass: 'bg-amber-500 text-white hover:bg-amber-600',
    lightBg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
    dotBg: 'bg-amber-500',
    borderColor: 'border-amber-500',
  },
  completed: {
    key: 'completed',
    label: '通关/全量完成',
    description: '达到完结、通关或全量交付里程碑',
    colorClass: 'bg-emerald-600 text-white hover:bg-emerald-700',
    lightBg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800',
    dotBg: 'bg-emerald-600',
    borderColor: 'border-emerald-600',
  },
};

export type ViewMode = 'kanban' | 'gantt';
export type GanttTimeRange = 'week' | 'month' | 'all';
