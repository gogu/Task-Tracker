# 时序追踪 · 公会委托账本（Task-Tracker）

> 融合 **AVG 公会接待台**、**四状态委托看板**、**番茄怀表（含桌面画中画 PiP）**、**微观时序甘特图** 与 **24 小时节律统计** 的纯前端 Local-First PWA，面向个人数字媒体（书、影、音、动画、游戏）与日常项目的低阻力进度追踪系统。

```text
Architecture Snapshot (TL;DR)
- Runtime : 100% Client-side React 19 + TypeScript + Vite 8 + Tailwind CSS v4 (零后端)
- State   : Single React Context (`src/context/TaskContext.tsx`) + `localStorage` 实时持久化
- Sync    : GitHub Gist 按月分片双向合并 + 可选 PBKDF2/AES-256-GCM 端到端加密 | Chromium 本地目录实时镜像
- PWA     : `public/manifest.webmanifest` + `vite.config.ts (base: './')` + iPadOS/桌面横竖屏自适应
```

---

## 目录

- [1. 项目理念](#1-项目理念)
- [2. 核心功能全景](#2-核心功能全景)
- [3. 技术栈与快速开始](#3-技术栈与快速开始)
- [4. 代码结构与模块职责](#4-代码结构与模块职责)

---

## 1. 项目理念

1. **轻量化与低阻力记录（Low-Friction Micro-Logging）**
   - 摒弃重型甘特图和繁琐的工单流，以「每日一格 + 单日多时段追加（`WorkSession`）」记录每次推进。
   - 支持 `0.1h` 颗粒度的时长投入、**补标隔离（`isBackfill`）**（计入总时长但不污染时段分析）以及**事后休息追踪（`RestSession`）**。
2. **RPG 公会叙事与情感化陪伴（AVG Receptionist & Gamification）**
   - 将枯燥的“任务列表”和“打卡表单”重构为奇幻公会接待台：任务即“委托”，打卡即向看板娘“汇报进度”。
   - 引入 6 个昼夜时段动态问候、连续推进连击（Streak）、公会冒险者等级/段位（`calculateGuildRank`）、好感度气泡互动、闲置委托巡检（≥3 天未推进提醒）与“帮我抽一个坑填”，缓解“囤积焦虑”与“选择困难”。
3. **时间节律与精力平衡（Circadian Affinity & Rest Balance）**
   - 根据历史 `WorkSession` 的 24 小时分布计算**当前时段亲和度（`computeTaskTimeSlotAffinity`）**，在接待台与看板自动优先推荐“你在当前这个时间点最常做”的委托。
   - 内置可拖拽刻度盘的**专注怀表（番茄钟）**，并在当日非补标专注 `> 0.3h` 后主动唤起**事后休息怀表**，鼓励“有效推进 + 适度休整”的可持续节奏。
4. **数据主权与零后端多端同步（Local-First & Zero-Backend Sync）**
   - 所有数据默认保存在本地浏览器 `localStorage`，离线即可完整使用。
   - 不依赖任何自建后端：通过用户自己的私密 GitHub Gist 实现按月分片存储、增量 `PATCH`、基于本地 Base Snapshot 的三方智能合并与可选客户端端到端加密（E2EE）；同时支持桌面浏览器直连本地文件夹实时落盘与随时 JSON 导入导出。

---

## 2. 核心功能全景

### 2.1 公会接待台（AVG 交互大厅）
- **4 套内置看板娘与场景预设**：
  - `classic_cg`（默认）：古典全场景 CG · **艾莉丝**（全场景插画模式 `scene`）
  - `starry_loft`：星夜手账阁楼 · **小桃**（透明立绘叠加模式 `sprite`）
  - `cyber_tavern`：霓虹星际酒馆 · **琳恩·V**（透明立绘叠加模式 `sprite`）
  - `sakura_shrine`：绯樱古籍茶屋 · **白川朔夜**（透明立绘叠加模式 `sprite`）
- **5 种动态差分表情**：`normal` / `happy` / `cheer` / `thinking` / `sleepy`，随操作结果、时段与闲置状态自动切换；立绘资源通过 Cache API (`guild_npc_image_cache_v1`) + 预解码池缓存，避免切换闪烁。
- **自定义外观与 AI 提示词工坊（`NpcConfigModal`）**：支持修改称呼/头衔、切换 `scene`/`sprite` 模式、外链 URL 或本地图片上传；内置浏览器端 `#00FF00` 绿幕泛洪抠图（4 边泛洪 + 封闭区域抠除 + 2-ring 边缘去溢色羽化）及可直接复制的立绘/背景 AI 生成 Prompt 模板。
- **接待台核心事务流**：今日/常规汇报、登记新委托、当前时段推荐卡片、盲盒抽坑（`random_pick`）、闲置委托巡检（≥3 天未打卡的 `in_progress` 任务）、好感度戳戳乐与随机闲聊。

### 2.2 委托账本（四状态看板）
- **四状态页签**：`in_progress`（攻略中）/ `backlog`（待接取）/ `done`（已达成）/ `paused`（已冻结）。
- **拖拽排序与跨状态流转**：同状态页签内支持拖拽卡片调整 `order`；将卡片直接拖拽至顶部状态页签可立即改变状态并自动维护 `startDate` / `completedDate`。
- **智能排序与全局过滤**：`in_progress` 默认结合 `computeTaskTimeSlotAffinity` 高亮当前时段常做委托；支持顶栏关键词搜索与标签筛选（全局联动委托账本、时序卷轴与公会卷宗）。

### 2.3 时序卷轴（微观甘特图）
- **自适应无滚动窗口**：提供**周（10 天）**、**月（21 天）**、**全部（最多 35 天）**三种视野与前后翻页，全部列自适应容器宽度，无横向滚动条。
- **双层连续渐变时间线**：底层为每日方格网格，上层将同一任务连续多日的打卡自动连接为平滑渐变条带与末端圆球（蓝 = 有实质推进 `progress`，琥珀 = 休息 `rest`，绿 = 通关/全量完成 `completed`）。
- **两级拖拽与快捷补录**：按主标签（`tags[0]`）分组展示，支持**分组排序（`ganttGroupOrder`）**与**任务行跨状态全局排序（`reorderTasksGlobal`）**；悬停显示当日进度摘要、休息与截至当日累计时长；点击任意日期方格弹出 `QuickCheckInModal` 补录或编辑。

### 2.4 公会卷宗（多维统计分析）
- **周期维度切换**：**日卷宗 / 周卷宗 / 月卷宗**，支持日期导航与点击直达任意日期。
- **4 大 KPI 卡片**：周期累计投入（日视图含较前日差值，周/月含日均与活跃日均）、已达成委托时长占比条、头号主打委托集中度、有效推进次数与活跃天数。
- **可视化图表与下钻**：按**任务 / 状态 / 主标签**切换的 SVG 环形占比图、周/月每日柱状堆叠图（点击柱条可下钻单日明细）、**24 小时工作 vs 休息时段分布柱状图**与 6 大时段汇总。

### 2.5 专注怀表（番茄钟）与事后休息
- **交互式 SVG 怀表盘（`PocketWatchDialSvg`）**：支持鼠标/触控拖拽指针直接设定 1–60 分钟时长。
- **三阶段番茄工作法**：支持专注（默认 25m）、短休（默认 5m）、长休（默认 15m）；可绑定特定委托，专注结束时自动写入一条带起止时间的 `WorkSession` 并累加每日番茄统计；结束时触发 Web Audio 合成提示音。
- **桌面画中画置顶小窗（Document Picture-in-Picture）**：通过 `usePomodoroPip` + `PomodoroPipClock` 在 Chrome/Edge 桌面端弹出独立置顶极简表盘窗口，主标签切到后台也能实时盯表与查看完成状态。
- **事后休息提醒**：当日非补标专注打卡超过 `0.3h` 且未手填休息分钟数时，自动引导至 `rest_prompt` / `rest_dial` / `rest_countdown`，结束后记录 `RestSession` 并关联至对应 `WorkSession`。

### 2.6 多端同步、安全备份与撤销重做
- **GitHub Gist 云端智能同步（`githubGist.ts` + `DriveSyncModal`）**：
  - **按月分片格式**：自动拆分为 `00-summary.md`、`meta.json`、`tasks.json` 与 `logs-YYYY-MM.json`（兼容旧版单文件 `media-tracker-data.json` 并平滑迁移）；`PATCH` 时仅上传有变化的片段。
  - **三方合并与冲突解决**：基于本地 `BaseSnapshot`、本地当前状态与云端状态执行字段级（Task）与分段级（`WorkSession`）三方合并；自动合并无冲突修改，遇真实冲突弹出四向决策框（智能合并 / 云端覆盖本地 / 本地覆盖云端 / 暂不处理）。
  - **可选端到端加密（E2EE）**：填写口令后使用 Web Crypto `PBKDF2-SHA256`（150,000 次迭代）派生密钥，各分片以 `AES-256-GCM` 密文上传。
  - **自动同步时机**：启动时检查、窗口聚焦/切回前台检查（15s 节流）、本地数据变更 3s 防抖同步。
- **本地目录实时同步（`localFolder.ts` + `useLocalSync.ts` + `LocalSyncModal`）**：基于 Chromium File System Access API（目录句柄持久化于 IndexedDB），数据变化后 800ms 防抖或页面隐藏时即时写入 `media-tracker-data.json`；覆写冲突文件前自动生成 `media-tracker-data.bak.json`。
- **撤销 / 重做与备份**：内置 30 步历史快照栈（`Ctrl+Z` / `Ctrl+Y` / `Ctrl+Shift+Z`，持久化于 `sessionStorage`）及手动 JSON 导出/导入。

---

## 3. 技术栈与快速开始

### 技术栈
- **核心框架**：React 19、TypeScript、Vite 8
- **样式与动效**：Tailwind CSS v4（`@tailwindcss/vite`）、`lucide-react`、`motion`（`motion/react`）
- **浏览器原生能力**：`localStorage` / `sessionStorage` / `IndexedDB` / `Cache Storage`、Web Crypto API、Web Audio API、Document Picture-in-Picture API、File System Access API

### 常用命令

```bash
# 安装依赖
npm install

# 启动本地开发服务器 (默认端口 8080, --host=0.0.0.0)
npm run dev

# 类型检查（当前项目的主静态检查门禁）
npm run lint

# 生产构建（输出至 dist/，相对路径 base: './'）
npm run build

# 本地预览构建产物 / 部署到 GitHub Pages
npm run preview
npm run deploy
```

### 辅助工具脚本（`scripts/`）

```bash
# 1. 看板娘立绘标准化处理（Python 需安装 numpy, pillow）
#    自动执行 #00FF00 绿幕泛洪抠图、2-ring 去绿边溢色与画布对齐（默认 764x1024, top_y=47）
npm run npc:standardize -- --character momo --normal path/to/raw.png

# 2. 历史打卡备注时长迁移脚本（Node.js）
#    从 note 中提取 "+Xh"（增量）或 "Xh"（累计总长差值，支持周目重置检测）写入 hours 与 totalHours
node scripts/upgrade-hours.js ./media-tracker-data.json --dry-run
```

---

## 4. 代码结构与模块职责

```text
Task-Tracker/
├── index.html                        # PWA meta 与应用入口 HTML
├── package.json                      # 依赖与 npm 脚本（dev/build/lint/deploy/npc:standardize）
├── tsconfig.json                     # TS 配置（@/ 指向根目录）
├── vite.config.ts                    # Vite 配置（base: './', DISABLE_HMR 支持）
├── public/
│   ├── manifest.webmanifest          # PWA 清单（standalone 模式）
│   ├── icons/                        # PWA 图标资源
│   ├── npc/                          # 内置看板娘立绘（momo/lynn/sakuya/guild-*）与背景图
│   └── v1/                           # 历史 v1 静态构建归档（冻结版本，勿直接修改）
├── scripts/
│   ├── standardize-npc-sprites.py    # 看板娘绿幕抠图与画布对齐脚本
│   └── upgrade-hours.js              # 历史 JSON 备注工时批量升级脚本
└── src/
    ├── main.tsx                      # React 19 挂载入口
    ├── App.tsx                       # 根壳：TaskProvider + PWA/软键盘视口适配 + 全局 Modal/Toast
    ├── index.css                     # Tailwind v4 入口、滚动条与移动端适配样式、羊皮纸与 AVG 动效 CSS 类
    ├── types.ts                      # 核心类型与状态/进度常量配置
    ├── data/
    │   └── initialData.ts            # 初始空数据工厂 createInitialSampleData()
    ├── context/
    │   └── TaskContext.tsx           # 单一全局状态中枢（任务/日志 CRUD、撤销重做、同步编排）
    ├── components/
    │   ├── KanbanView.tsx            # 主应用壳：顶部 HUD + AVG 接待台 + 怀表番茄钟 + 4页签账本
    │   ├── GanttView.tsx             # 时序卷轴视图：渐变连线甘特图、分组/行两级拖拽、悬浮详情
    │   ├── StatsView.tsx             # 公会卷宗视图：日/周/月 KPI、环形图、日柱状下钻、24h 分布
    │   ├── QuickCheckInModal.tsx     # 甘特方格点击唤起的快速打卡/编辑弹窗
    │   ├── DurationStepperInput.tsx  # 触控友好的时长步进输入组件（支持 −/+ 轻点与长按连发）
    │   ├── TaskModal.tsx             # 全局新建/编辑任务弹窗（支持标签拖拽排序）
    │   ├── TaskDetailDrawer.tsx      # 任务右侧详情抽屉（时间段画像、休息统计、时间线日志）
    │   ├── NpcConfigModal.tsx        # 看板娘预设切换、自定义上传、前端去绿幕与 Prompt 工坊
    │   ├── DriveSyncModal.tsx        # GitHub Gist 同步配置、E2EE 口令管理与手动推拉弹窗
    │   ├── LocalSyncModal.tsx        # Chromium 本地目录实时同步管理弹窗
    │   ├── PomodoroPipClock.tsx      # Document PiP 置顶小窗内的极简番茄钟视图
    │   ├── ConfirmModal.tsx          # 全局多选项确认弹窗（支持 2~4 个按钮，Promise 驱动）
    │   └── Toast.tsx                 # 全局消息提示（支持内联一键撤销）
    ├── hooks/
    │   ├── useLocalSync.ts           # 本地目录自动防抖写入与权限恢复状态机
    │   └── usePomodoroPip.ts         # Document Picture-in-Picture 窗口生命周期与样式同步
    ├── services/
    │   ├── githubGist.ts             # GitHub Gist API、按月分片、AES-GCM 加密、三方合并算法
    │   └── localFolder.ts            # File System Access API 封装与 IndexedDB 句柄读写
    └── utils/
        ├── date.ts                   # 日期计算、甘特窗口、自然周/月范围与中文格式工具
        ├── timeDistribution.ts       # WorkSession 提取、跨午夜小时切分、24h 分布与时段亲和度
        └── guildNpc.ts               # 看板娘预设/存储、公会等级经验、闲置巡检、Cache 图片预解码
```
