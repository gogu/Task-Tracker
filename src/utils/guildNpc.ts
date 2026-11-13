import { TaskItem, DailyLog, TaskStatus } from '../types';
import { getTodayString, diffInDays, formatHours } from './date';

export type NpcExpression = 'normal' | 'happy' | 'cheer' | 'thinking' | 'sleepy';

export interface NpcConfig {
  presetId?: string;
  name: string;
  title: string;
  displayMode: 'scene' | 'sprite';
  expressions: Record<NpcExpression, string>;
  customBgUrl?: string;
}

export interface NpcPreset {
  id: string;
  badge: string;
  themeName: string;
  desc: string;
  greeting: string;
  config: NpcConfig;
}

export const NPC_STORAGE_KEY = 'guild_npc_custom_config_v2';
export const NPC_AFFECTION_STORAGE_KEY = 'guild_npc_affection_v1';

export const EXPRESSION_META: Record<
  NpcExpression,
  { label: string; badge: string; desc: string }
> = {
  normal: {
    label: '日常微笑',
    badge: '微笑接待',
    desc: '平时站在公会柜台时的温和欢迎表情',
  },
  happy: {
    label: '开心喜悦',
    badge: '元气满满',
    desc: '完成日常打卡或互动聊天的欣喜表情',
  },
  cheer: {
    label: '通关欢呼',
    badge: '庆典喝彩',
    desc: '达成通关里程碑或晋升等级时的欢呼表情',
  },
  thinking: {
    label: '查阅思考',
    badge: '翻阅账本',
    desc: '登记新委托、抽签或审阅记录时的专注神情',
  },
  sleepy: {
    label: '犯困催促',
    badge: '托腮等待',
    desc: '夜间时段或巡检久未推进委托时的俏皮神情',
  },
};

export const NPC_PRESETS: NpcPreset[] = [
  {
    id: 'fantasy_guild',
    badge: '🏰 奇幻公会',
    themeName: '晨曦冒险者公会',
    desc: '暖木与琉璃花窗交织的古典公会大厅，温柔可靠的首席接待员',
    greeting: '欢迎回到晨曦冒险者公会！我是首席接待员艾莉丝，今天要登记新委托还是汇报进度呢？',
    config: {
      presetId: 'fantasy_guild',
      name: '艾莉丝',
      title: '公会首席接待员',
      displayMode: 'sprite',
      customBgUrl: './npc/bg-guild-hall.jpg',
      expressions: {
        normal: './npc/alice-normal.png',
        happy: './npc/alice-happy.png',
        cheer: './npc/alice-happy.png',
        thinking: './npc/alice-thinking.png',
        sleepy: './npc/alice-thinking.png',
      },
    },
  },
  {
    id: 'cyber_tavern',
    badge: '🌃 赛博酒馆',
    themeName: '霓虹星际酒馆',
    desc: '霓虹雨夜与全息街机环绕的地下酒馆，酷飒的夜城情报调酒师',
    greeting: 'Yo，欢迎光临霓虹星际酒馆！我是调酒师琳恩·V，今晚想开哪款赛博委托还是先来打卡补给？',
    config: {
      presetId: 'cyber_tavern',
      name: '琳恩·V',
      title: '夜城情报调酒师',
      displayMode: 'sprite',
      customBgUrl: './npc/bg-cyber-bar.jpg',
      expressions: {
        normal: './npc/lynn-normal.png',
        happy: './npc/lynn-happy.png',
        cheer: './npc/lynn-happy.png',
        thinking: './npc/lynn-thinking.png',
        sleepy: './npc/lynn-thinking.png',
      },
    },
  },
  {
    id: 'sakura_shrine',
    badge: '🌸 绯樱书院',
    themeName: '绯樱古籍茶屋',
    desc: '落樱庭院与古籍茶香相伴的和风书院，恬静博学的司书巫女',
    greeting: '贵安，欢迎来到绯樱古籍茶屋~ 我是司书白川朔夜，先沏一盏清茶，再慢慢梳理今天的游历吧。',
    config: {
      presetId: 'sakura_shrine',
      name: '白川朔夜',
      title: '绯樱书院司书',
      displayMode: 'sprite',
      customBgUrl: './npc/bg-sakura-shrine.jpg',
      expressions: {
        normal: './npc/sakuya-normal.png',
        happy: './npc/sakuya-happy.png',
        cheer: './npc/sakuya-cheer.png',
        thinking: './npc/sakuya-thinking.png',
        sleepy: './npc/sakuya-sleepy.png',
      },
    },
  },
  {
    id: 'classic_cg',
    badge: '🖼️ 原版CG',
    themeName: '古典全场景CG',
    desc: '自带背景的横版视觉小说全场景插画模式',
    greeting: '已切换至古典全场景 CG 模式！需要我为你调阅哪一份委托档案呢？',
    config: {
      presetId: 'classic_cg',
      name: '艾莉丝',
      title: '公会首席接待员',
      displayMode: 'scene',
      customBgUrl: '',
      expressions: {
        normal: './npc/guild-normal.jpg',
        happy: './npc/guild-happy.jpg',
        cheer: './npc/guild-cheer.jpg',
        thinking: './npc/guild-thinking.jpg',
        sleepy: './npc/guild-sleepy.jpg',
      },
    },
  },
];

const CLASSIC_CG_PRESET =
  NPC_PRESETS.find((preset) => preset.id === 'classic_cg') ?? NPC_PRESETS[0];

export const DEFAULT_NPC_CONFIG: NpcConfig = {
  ...CLASSIC_CG_PRESET.config,
  expressions: { ...CLASSIC_CG_PRESET.config.expressions },
};

export function loadNpcConfig(): NpcConfig {
  try {
    const raw = localStorage.getItem(NPC_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_NPC_CONFIG, expressions: { ...DEFAULT_NPC_CONFIG.expressions } };
    const parsed = JSON.parse(raw) as Partial<NpcConfig>;
    return {
      presetId: typeof parsed.presetId === 'string' ? parsed.presetId : undefined,
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : DEFAULT_NPC_CONFIG.name,
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : DEFAULT_NPC_CONFIG.title,
      displayMode: parsed.displayMode === 'scene' ? 'scene' : 'sprite',
      customBgUrl: typeof parsed.customBgUrl === 'string' ? parsed.customBgUrl : DEFAULT_NPC_CONFIG.customBgUrl,
      expressions: {
        normal: parsed.expressions?.normal || DEFAULT_NPC_CONFIG.expressions.normal,
        happy: parsed.expressions?.happy || DEFAULT_NPC_CONFIG.expressions.happy,
        cheer: parsed.expressions?.cheer || DEFAULT_NPC_CONFIG.expressions.cheer,
        thinking: parsed.expressions?.thinking || DEFAULT_NPC_CONFIG.expressions.thinking,
        sleepy: parsed.expressions?.sleepy || DEFAULT_NPC_CONFIG.expressions.sleepy,
      },
    };
  } catch {
    return { ...DEFAULT_NPC_CONFIG, expressions: { ...DEFAULT_NPC_CONFIG.expressions } };
  }
}

export function saveNpcConfig(config: NpcConfig): void {
  try {
    localStorage.setItem(NPC_STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn('Failed to save NPC config:', e);
  }
}

export function resetNpcConfig(): NpcConfig {
  try {
    localStorage.removeItem(NPC_STORAGE_KEY);
  } catch {
    // ignore
  }
  return { ...DEFAULT_NPC_CONFIG, expressions: { ...DEFAULT_NPC_CONFIG.expressions } };
}

export function loadAffectionPoints(): number {
  try {
    const raw = localStorage.getItem(NPC_AFFECTION_STORAGE_KEY);
    const num = raw ? parseInt(raw, 10) : 10;
    return Number.isFinite(num) && num >= 0 ? num : 10;
  } catch {
    return 10;
  }
}

export function saveAffectionPoints(points: number): void {
  try {
    localStorage.setItem(NPC_AFFECTION_STORAGE_KEY, String(points));
  } catch {
    // ignore
  }
}

export interface GuildRankInfo {
  level: number;
  exp: number;
  nextLevelExp: number;
  levelProgressPct: number;
  rankTitle: string;
  tierName: string;
  tierColorClass: string;
  totalHours: number;
  totalProgressDays: number;
  completedCount: number;
  inProgressCount: number;
  backlogCount: number;
  pausedCount: number;
  todayCheckedCount: number;
  streakDays: number;
}

export function calculateGuildRank(tasks: TaskItem[], logs: DailyLog[]): GuildRankInfo {
  const todayStr = getTodayString();
  let totalHours = 0;
  let totalProgressDays = 0;
  const activeDateSet = new Set<string>();
  const todayTaskIds = new Set<string>();

  logs.forEach((log) => {
    const h = typeof log.hours === 'number' && !isNaN(log.hours) ? log.hours : 0;
    totalHours += h;
    if (log.progressType === 'progress' || log.progressType === 'completed') {
      totalProgressDays += 1;
    }
    if (h > 0 || log.progressType !== 'rest') {
      activeDateSet.add(log.date);
    }
    if (log.date === todayStr) {
      todayTaskIds.add(log.taskId);
    }
  });

  const completedCount = tasks.filter((t) => t.status === 'done').length;
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
  const backlogCount = tasks.filter((t) => t.status === 'backlog').length;
  const pausedCount = tasks.filter((t) => t.status === 'paused').length;

  // Calculate consecutive active days streak ending today or yesterday
  let streakDays = 0;
  const sortedDates = Array.from(activeDateSet).sort((a, b) => (a > b ? -1 : 1));
  if (sortedDates.length > 0) {
    const latest = sortedDates[0];
    const gapFromToday = diffInDays(latest, todayStr);
    if (gapFromToday <= 1 && gapFromToday >= 0) {
      streakDays = 1;
      for (let i = 1; i < sortedDates.length; i++) {
        const diff = diffInDays(sortedDates[i], sortedDates[i - 1]);
        if (diff === 1) {
          streakDays += 1;
        } else {
          break;
        }
      }
    }
  }

  const exp = Math.round(totalProgressDays * 15 + totalHours * 10 + completedCount * 100);
  const levelSize = 200;
  const level = Math.floor(exp / levelSize) + 1;
  const expInLevel = exp % levelSize;
  const levelProgressPct = Math.min(100, Math.round((expInLevel / levelSize) * 100));

  let rankTitle = '见习冒险者';
  let tierName = '黑铁阶';
  let tierColorClass = 'from-stone-400 to-stone-600 text-stone-100 border-stone-400/50';

  if (level >= 20) {
    rankTitle = '传说缔造者';
    tierName = '秘银传奇';
    tierColorClass = 'from-rose-500 via-amber-400 to-amber-600 text-amber-50 border-amber-300/70';
  } else if (level >= 12) {
    rankTitle = '王牌猎人';
    tierName = '白金阶';
    tierColorClass = 'from-cyan-400 to-blue-600 text-cyan-50 border-cyan-300/60';
  } else if (level >= 7) {
    rankTitle = '资深攻略者';
    tierName = '黄金阶';
    tierColorClass = 'from-amber-400 to-amber-600 text-amber-950 border-amber-300/80';
  } else if (level >= 3) {
    rankTitle = '正式冒险者';
    tierName = '白银阶';
    tierColorClass = 'from-slate-300 to-slate-500 text-slate-950 border-slate-200/70';
  }

  return {
    level,
    exp,
    nextLevelExp: level * levelSize,
    levelProgressPct,
    rankTitle,
    tierName,
    tierColorClass,
    totalHours: Math.round(totalHours * 10) / 10,
    totalProgressDays,
    completedCount,
    inProgressCount,
    backlogCount,
    pausedCount,
    todayCheckedCount: todayTaskIds.size,
    streakDays,
  };
}

export interface QuestCategoryBadge {
  icon: string;
  label: string;
  ribbonClass: string;
}

export function getQuestCategoryBadge(tags: string[]): QuestCategoryBadge {
  const primary = (tags[0] || '').toLowerCase();

  if (/游戏|steam|ps5|ps4|switch|ns|xbox|pc|rpg|肉鸽|gal/.test(primary)) {
    return {
      icon: '🎮',
      label: tags[0] || '游戏',
      ribbonClass: 'bg-indigo-100 text-indigo-800 border-indigo-300/80 dark:bg-indigo-950/70 dark:text-indigo-200 dark:border-indigo-700/60',
    };
  }
  if (/书|阅读|小说|微信读书|实体书|kindle|学习|技术|论文/.test(primary)) {
    return {
      icon: '📖',
      label: tags[0] || '书籍',
      ribbonClass: 'bg-amber-100 text-amber-900 border-amber-300/80 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-700/60',
    };
  }
  if (/影|剧|电影|纪录片|美剧|日剧|韩剧/.test(primary)) {
    return {
      icon: '🎬',
      label: tags[0] || '影视',
      ribbonClass: 'bg-rose-100 text-rose-800 border-rose-300/80 dark:bg-rose-950/70 dark:text-rose-200 dark:border-rose-700/60',
    };
  }
  if (/动画|番剧|漫|acg|漫画/.test(primary)) {
    return {
      icon: '✨',
      label: tags[0] || '动画',
      ribbonClass: 'bg-pink-100 text-pink-800 border-pink-300/80 dark:bg-pink-950/70 dark:text-pink-200 dark:border-pink-700/60',
    };
  }
  if (/音|歌|专辑|播客|podcast/.test(primary)) {
    return {
      icon: '🎵',
      label: tags[0] || '音乐',
      ribbonClass: 'bg-teal-100 text-teal-800 border-teal-300/80 dark:bg-teal-950/70 dark:text-teal-200 dark:border-teal-700/60',
    };
  }
  if (/运动|健身|跑步|锻炼/.test(primary)) {
    return {
      icon: '⚔️',
      label: tags[0] || '体能',
      ribbonClass: 'bg-emerald-100 text-emerald-800 border-emerald-300/80 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-700/60',
    };
  }

  return {
    icon: '📜',
    label: tags[0] || '委托',
    ribbonClass: 'bg-stone-200/80 text-stone-800 border-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:border-stone-700',
  };
}

export const RPG_STATUS_META: Record<
  TaskStatus,
  { rpgLabel: string; shortLabel: string; icon: string; tabAccent: string; badgeClass: string }
> = {
  in_progress: {
    rpgLabel: '攻略中',
    shortLabel: '攻略中',
    icon: '🔥',
    tabAccent: 'border-amber-500 text-amber-900 dark:text-amber-200 bg-amber-100/90 dark:bg-amber-900/40',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/70 dark:text-blue-200 dark:border-blue-800',
  },
  backlog: {
    rpgLabel: '待接取',
    shortLabel: '待接取',
    icon: '📌',
    tabAccent: 'border-stone-500 text-stone-900 dark:text-stone-200 bg-stone-200/80 dark:bg-stone-800',
    badgeClass: 'bg-stone-200 text-stone-700 border-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700',
  },
  done: {
    rpgLabel: '已达成',
    shortLabel: '已达成',
    icon: '🏆',
    tabAccent: 'border-emerald-500 text-emerald-900 dark:text-emerald-200 bg-emerald-100/90 dark:bg-emerald-900/40',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/70 dark:text-emerald-200 dark:border-emerald-800',
  },
  paused: {
    rpgLabel: '已冻结',
    shortLabel: '搁置',
    icon: '❄️',
    tabAccent: 'border-amber-600 text-amber-900 dark:text-amber-200 bg-amber-100/80 dark:bg-amber-950/50',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-800',
  },
};

export interface StaleTaskInfo {
  task: TaskItem;
  daysSinceLastActive: number;
  lastDateLabel: string;
}

export function getStaleInProgressTasks(tasks: TaskItem[], logs: DailyLog[]): StaleTaskInfo[] {
  const todayStr = getTodayString();
  const latestLogMap = new Map<string, string>();

  logs.forEach((l) => {
    const prev = latestLogMap.get(l.taskId);
    if (!prev || l.date > prev) {
      latestLogMap.set(l.taskId, l.date);
    }
  });

  const stale: StaleTaskInfo[] = [];

  tasks
    .filter((t) => t.status === 'in_progress')
    .forEach((task) => {
      const latestLogDate = latestLogMap.get(task.id);
      const refDate = latestLogDate || task.startDate || task.createdAt.slice(0, 10);
      const days = diffInDays(refDate, todayStr);
      if (days >= 3 && latestLogDate !== todayStr) {
        stale.push({
          task,
          daysSinceLastActive: days,
          lastDateLabel: latestLogDate ? `${days} 天前打卡` : `开坑 ${days} 天暂无记录`,
        });
      }
    });

  return stale.sort((a, b) => b.daysSinceLastActive - a.daysSinceLastActive);
}

export function getTimeGreeting(stats: GuildRankInfo): {
  periodLabel: string;
  greeting: string;
  expression: NpcExpression;
} {
  const hour = new Date().getHours();

  if (hour >= 5 && hour < 11) {
    return {
      periodLabel: '晨间柜台',
      expression: stats.todayCheckedCount > 0 ? 'happy' : 'normal',
      greeting:
        stats.todayCheckedCount > 0
          ? `早安，冒险者大人！今天已经完成了 ${stats.todayCheckedCount} 项委托汇报，真是元气满满的开局呢！`
          : `早安，冒险者大人！清晨的委托柜台已经准备就绪，今天打算先攻略哪一项呢？`,
    };
  }
  if (hour >= 11 && hour < 14) {
    return {
      periodLabel: '午间小憩',
      expression: 'normal',
      greeting: `午安！忙里偷闲来公会坐坐吧~ 目前手头有 ${stats.inProgressCount} 项攻略中的委托，需要汇报进度吗？`,
    };
  }
  if (hour >= 14 && hour < 19) {
    return {
      periodLabel: '午后营业',
      expression: stats.todayCheckedCount > 0 ? 'happy' : 'normal',
      greeting:
        stats.todayCheckedCount > 0
          ? `下午好！今天已经汇报推进 ${stats.todayCheckedCount} 项委托了，继续保持这个节奏吧！`
          : `下午好！目前共有 ${stats.inProgressCount} 项正在攻略的委托。今天有新的推进成果要登记吗？`,
    };
  }
  if (hour >= 19 && hour < 23) {
    return {
      periodLabel: '夜间灯火',
      expression: stats.todayCheckedCount > 0 ? 'happy' : 'thinking',
      greeting:
        stats.todayCheckedCount > 0
          ? `晚上好！今日已累计达成 ${stats.todayCheckedCount} 次汇报，真是充实的一天呢！还要继续登记吗？`
          : `晚上好，忙碌了一天辛苦啦！趁着夜色灯火，把今天的进展记录到委托账本里吧~`,
    };
  }

  return {
    periodLabel: '深夜值守',
    expression: 'sleepy',
    greeting: `呼啊…这么晚还来公会吗，冒险者大人？虽然柜台随时为你亮着灯，但汇报完也别忘了早点休息哦~`,
  };
}

export function getRandomChatter(
  stats: GuildRankInfo,
  tasks: TaskItem[],
  staleList: StaleTaskInfo[]
): { text: string; expression: NpcExpression } {
  const pool: Array<{ text: string; expression: NpcExpression }> = [
    {
      text: `只要每天推进一点点，哪怕只有 0.5h，积少成多也能达成「${stats.rankTitle}」以上的传说成就哦！`,
      expression: 'happy',
    },
    {
      text: `翻了翻总账本，你已经累计投入了 ${formatHours(stats.totalHours)}，成功达成了 ${stats.completedCount} 份委托呢，好厉害！`,
      expression: 'cheer',
    },
    {
      text: `如果「待接取」里囤了太多想玩的坑不知道选哪个，尽管用「帮我抽一个坑填」交给命运决定吧~`,
      expression: 'thinking',
    },
    {
      text: `悄悄告诉你：打开「委托账本」后，把委托卡片直接拖到顶部的状态书签上，就能立刻改派状态哦！`,
      expression: 'normal',
    },
  ];

  if (stats.streakDays >= 2) {
    pool.push({
      text: `哇！你已经保持连续 ${stats.streakDays} 天都有推进记录了，公会大厅的火把都跟着越烧越旺啦！`,
      expression: 'cheer',
    });
  }

  if (staleList.length > 0) {
    const first = staleList[0];
    pool.push({
      text: `那个…《${first.task.title}》已经 ${first.daysSinceLastActive} 天没收到新汇报了，今天有空推一推吗？`,
      expression: 'sleepy',
    });
  }

  if (tasks.length === 0) {
    return {
      text: `账本目前还是空白的呢！点击「登记新委托」，让我们把第一个想攻略的游戏、书籍或目标写上去吧！`,
      expression: 'happy',
    };
  }

  return pool[Math.floor(Math.random() * pool.length)];
}
