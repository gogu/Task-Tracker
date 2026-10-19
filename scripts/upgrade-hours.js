#!/usr/bin/env node
/**
 * upgrade-hours.js
 * 
 * 升级任务与打卡数据：将备注（note）中的时间自动提取并写入对应的 hours 与 totalHours 字段。
 * 
 * 支持两种历史记录方式：
 * 1. 累计总时长模式（如 "0.5h"、"1.5h"、"3.5h"）：按时序计算当天实际增加的小时数 (delta)。
 * 2. 增量打卡模式（如 "+0.5h"、"+1.5h"、"+2h"）：直接作为当天投入小时数写入。
 * 
 * 使用方式：
 *   node scripts/upgrade-hours.js [文件路径] [选项]
 * 
 * 示例：
 *   node scripts/upgrade-hours.js media-tracker-data.json
 *   node scripts/upgrade-hours.js ./media-tracker-data.json --dry-run
 *   node scripts/upgrade-hours.js "D:/备份/media-tracker-data.json" --force
 */

import fs from 'fs';
import path from 'path';

// ── 命令行参数解析 ──────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run') || args.includes('-n');
const isForce = args.includes('--force') || args.includes('-f');
const isHelp = args.includes('--help') || args.includes('-h');

if (isHelp) {
  console.log(`
使用方式:
  node scripts/upgrade-hours.js [文件路径] [选项]

参数:
  [文件路径]      指定待升级的 JSON 数据文件（默认自动在当前目录查找 media-tracker-data.json）

选项:
  --dry-run, -n  预览模式，仅在控制台显示解析与升级结果，不修改文件
  --force, -f    强制覆盖已有打卡 hours 字段（默认若已有有效 hours 则保留）
  --help, -h     显示此帮助信息
`);
  process.exit(0);
}

// 寻找输入文件
let inputFilePath = args.find((a) => !a.startsWith('-'));

if (!inputFilePath) {
  const candidateFiles = [
    path.resolve(process.cwd(), 'media-tracker-data.json'),
    path.resolve(process.cwd(), 'tasks-data.json'),
    path.resolve(process.cwd(), 'data.json'),
  ];
  inputFilePath = candidateFiles.find((f) => fs.existsSync(f));
}

if (!inputFilePath || !fs.existsSync(inputFilePath)) {
  console.error(`\n❌ 未找到有效的数据文件！`);
  console.error(`请在命令行中指定 JSON 文件路径，例如：`);
  console.error(`  node scripts/upgrade-hours.js ./media-tracker-data.json\n`);
  process.exit(1);
}

const resolvedPath = path.resolve(inputFilePath);
console.log(`\n📂 正在读取数据文件: ${resolvedPath}`);

let rawContent = '';
let data = null;

try {
  rawContent = fs.readFileSync(resolvedPath, 'utf-8');
  data = JSON.parse(rawContent);
} catch (err) {
  console.error(`❌ 读取或解析 JSON 失败: ${err.message}`);
  process.exit(1);
}

if (!data || typeof data !== 'object') {
  console.error(`❌ 文件内容不是合法的 JSON 对象！`);
  process.exit(1);
}

const tasks = Array.isArray(data.tasks) ? data.tasks : [];
const logs = Array.isArray(data.logs) ? data.logs : [];

console.log(`📊 读取到 ${tasks.length} 个任务，${logs.length} 条打卡记录。`);

if (logs.length === 0) {
  console.log(`ℹ️ 没有找到打卡记录，无需升级。`);
  process.exit(0);
}

// ── 核心解析逻辑 ──────────────────────────────────────────────

/**
 * 从 note 文本中提取时间信息
 * 返回 { type: 'incremental' | 'total', hours: number } 或 null
 */
function parseNoteTime(note) {
  if (!note || typeof note !== 'string') return null;
  const trimmed = note.trim();

  // 1. 增量形式：带 '+' 前缀，如 "+0.5h"、"+1.5h"、"+2h"、"+0.5小时"、"+ 1.5 h"
  const incUnitMatch = trimmed.match(/(?:^|[^\d])\+\s*(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|小时|个?小时)/i);
  if (incUnitMatch) {
    return { type: 'incremental', hours: parseFloat(incUnitMatch[1]) };
  }
  // 纯符号增量，如单独的 "+0.5" 或 "+1"
  const incPureMatch = trimmed.match(/^\s*\+\s*(\d+(?:\.\d+)?)\s*$/);
  if (incPureMatch) {
    return { type: 'incremental', hours: parseFloat(incPureMatch[1]) };
  }

  // 2. 总时长形式：带 'h' 或 '小时' 单位，且数值前没有 '+'，如 "0.5h"、"1.5h"、"10h"、"2.5小时"
  const totMatch = trimmed.match(/(?:^|[^\d.+])(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|小时|个?小时)/i);
  if (totMatch) {
    return { type: 'total', hours: parseFloat(totMatch[1]) };
  }

  return null;
}

const round1 = (val) => Math.round(val * 10) / 10;

/**
 * 从 note 文本中提取周目信息（例如 "一周目"、"2周目"、"二周目"）
 */
function parsePlaythrough(note) {
  if (!note || typeof note !== 'string') return null;
  const numMap = { '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 10 };
  const m = note.match(/([一二三四五六七八九十\d]+)周目/i);
  if (m) {
    const raw = m[1];
    return numMap[raw] || parseInt(raw, 10) || raw;
  }
  return null;
}

// 按 taskId 分组整理打卡记录
const logsByTask = new Map();
for (const log of logs) {
  if (!logsByTask.has(log.taskId)) {
    logsByTask.set(log.taskId, []);
  }
  logsByTask.get(log.taskId).push(log);
}

let totalLogsUpgraded = 0;
let totalIncrementalMatched = 0;
let totalCumulativeMatched = 0;
const taskUpgradeSummary = [];

// 遍历每个任务及其按日期时序排序的打卡记录
for (const task of tasks) {
  const taskLogs = logsByTask.get(task.id) || [];
  if (taskLogs.length === 0) continue;

  // 严格按日期升序排列（同天按创建时间升序）
  taskLogs.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return (a.createdAt || '').localeCompare(b.createdAt || '');
  });

  let currentCycleLastTotal = 0; // 当前周目/存档内部的上次累计值
  let cycleIndex = 1;            // 周目/存档周期序号
  let lastPlaythrough = null;    // 上次记录的周目标识（如 1、2）
  let taskLogsUpdated = 0;
  const changes = [];

  for (const log of taskLogs) {
    const parsed = parseNoteTime(log.note);

    if (!parsed) {
      // 备注中无时间；若已有 hours 则计入基准累计
      if (typeof log.hours === 'number' && log.hours > 0) {
        currentCycleLastTotal = round1(currentCycleLastTotal + log.hours);
      }
      continue;
    }

    const currentPlaythrough = parsePlaythrough(log.note);
    let isReset = false;

    // 1. 周目序号明确变更（如从“一周目”变为“二周目”）
    if (currentPlaythrough !== null && lastPlaythrough !== null && currentPlaythrough !== lastPlaythrough) {
      isReset = true;
      lastPlaythrough = currentPlaythrough;
    } else if (currentPlaythrough !== null && lastPlaythrough === null) {
      lastPlaythrough = currentPlaythrough;
    }

    let dayHours = 0;

    if (parsed.type === 'incremental') {
      // 增量模式：直接作为当天投入小时数
      dayHours = round1(parsed.hours);
      currentCycleLastTotal = round1(currentCycleLastTotal + dayHours);
      totalIncrementalMatched++;
    } else if (parsed.type === 'total') {
      const recordedTotal = round1(parsed.hours);

      // 2. 存档时长回落检测：若新记录的时间小于当前存档累计（如 22h 之后记录 2h），判定开启了新周目/新存档！
      if (!isReset && currentCycleLastTotal > 0 && recordedTotal < currentCycleLastTotal) {
        isReset = true;
      }

      if (isReset) {
        cycleIndex++;
        // 新周目/新存档第一天：从 0 开始累计，当天投入即为该存档当前的 recordedTotal
        dayHours = recordedTotal;
        currentCycleLastTotal = recordedTotal;
      } else {
        // 同一周目/存档内的正常推进：按差值计算
        dayHours = round1(recordedTotal - currentCycleLastTotal);
        currentCycleLastTotal = recordedTotal;
      }
      totalCumulativeMatched++;
    }

    const prevHours = log.hours;
    if (isForce || prevHours === undefined) {
      log.hours = dayHours;
      taskLogsUpdated++;
      totalLogsUpgraded++;
      changes.push({
        date: log.date,
        note: log.note,
        parsedType: parsed.type === 'incremental'
          ? '增量 (+Xh)'
          : isReset
          ? `新周目/新档起步 (第${cycleIndex}档)`
          : `总长差值 (第${cycleIndex}档)`,
        assignedHours: dayHours,
        cycle: cycleIndex,
        cycleTotal: currentCycleLastTotal,
      });
    }
  }

  // 重新计算任务累计小时数
  const prevTotalHours = task.totalHours;
  const newTotalHours = round1(
    taskLogs.reduce((sum, l) => sum + (typeof l.hours === 'number' && !isNaN(l.hours) ? l.hours : 0), 0)
  );
  task.totalHours = newTotalHours;

  if (taskLogsUpdated > 0 || (newTotalHours > 0 && prevTotalHours !== newTotalHours)) {
    taskUpgradeSummary.push({
      title: task.title,
      updatedCount: taskLogsUpdated,
      totalHours: newTotalHours,
      changes,
    });
  }
}

// ── 输出升级详情 ──────────────────────────────────────────────
console.log(`\n================== 升级明细报告 ==================`);

if (taskUpgradeSummary.length === 0) {
  console.log(`ℹ️ 没有从备注中匹配到新的时间记录，数据无变动。`);
} else {
  for (const item of taskUpgradeSummary) {
    console.log(`\n📌 任务: 「${item.title}」 -> 累计总时长: ${item.totalHours.toFixed(1)}h (更新了 ${item.updatedCount} 条打卡)`);
    for (const c of item.changes) {
      console.log(`   • ${c.date} | 备注: "${c.note}"`);
      console.log(`     └─ 识别模式: ${c.parsedType} -> 当天计入: ${c.assignedHours.toFixed(1)}h (该档累计: ${c.cycleTotal.toFixed(1)}h)`);
    }
  }
}

console.log(`\n================== 汇总统计 ==================`);
console.log(`• 处理任务总数:       ${tasks.length}`);
console.log(`• 处理打卡总数:       ${logs.length}`);
console.log(`• 成功提取打卡数:     ${totalLogsUpgraded} 条`);
console.log(`  ├─ 识别为增量模式 (+Xh):   ${totalIncrementalMatched} 次`);
console.log(`  └─ 识别为总长差值 (Xh):    ${totalCumulativeMatched} 次`);

if (isDryRun) {
  console.log(`\n🔍 当前为 [预览模式 (--dry-run)]，未做任何实际写入。`);
  console.log(`如需真正应用升级，请运行：`);
  console.log(`  node scripts/upgrade-hours.js "${resolvedPath}"\n`);
  process.exit(0);
}

// ── 写入文件与创建备份 ──────────────────────────────────────────
const backupPath = `${resolvedPath}.bak-${Date.now()}`;
try {
  fs.writeFileSync(backupPath, rawContent, 'utf-8');
  console.log(`\n🛡️ 已创建原始文件备份: ${backupPath}`);
} catch (err) {
  console.error(`⚠️ 创建备份失败: ${err.message}`);
}

data.updatedAt = new Date().toISOString();

try {
  fs.writeFileSync(resolvedPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✅ 数据升级成功！已保存至: ${resolvedPath}\n`);
} catch (err) {
  console.error(`❌ 写入升级后数据失败: ${err.message}`);
  process.exit(1);
}

