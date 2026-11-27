# AGENTS.md — AI Coding Agent Guide

> Repository context, engineering invariants, routing table, and gotchas for **Task-Tracker (时序追踪 · 公会委托账本)**.

## 1. Architecture Snapshot

- **Runtime**: 100% client-side React 19 + TypeScript + Vite 8 + Tailwind CSS v4 (zero backend).
- **State**: Single React Context (`src/context/TaskContext.tsx`) + `localStorage` persistence + `sessionStorage` 30-step undo/redo stack.
- **Sync**: GitHub Gist monthly sharded 3-way merge (`src/services/githubGist.ts`) with optional client-side PBKDF2/AES-256-GCM E2EE | Chromium File System Access local folder real-time mirror (`src/services/localFolder.ts`, `src/hooks/useLocalSync.ts`).
- **PWA & Viewport**: `public/manifest.webmanifest` + `vite.config.ts` (`base: './'`) + `visualViewport` height/offsetTop tracking (`src/App.tsx`, `src/index.css`) for iOS/iPadOS virtual keyboard & orientation adaptation.

---

## 2. Read Strategy & Verification

1. **Read `src/types.ts` first** for core domain types and status/progress constants.
2. **Slice-read large files — never read whole files blindly**:
   - Large files: `src/components/KanbanView.tsx` (~6,260 lines), `src/context/TaskContext.tsx` (~2,423 lines), `src/services/githubGist.ts` (~1,698 lines), `src/components/StatsView.tsx` (~1,667 lines), `src/components/GanttView.tsx` (~1,156 lines).
   - Search with `rg`/`Select-String` using the grep anchors below, then read only the relevant line range.
3. **Verification gate**:
   - No Jest/Vitest unit test suite is configured.
   - After any code change, always run `npm run lint` (`tsc --noEmit`) and `npm run build` (`vite build`) and confirm exit code `0`.
4. **Documentation sync**:
   - When adding/renaming modules, modifying data models, changing storage keys, or altering user-facing features, update `AGENTS.md` (agent index) and `README.md` (human-facing docs) to stay in sync.

---

## 3. Core Data Model & Business Invariants

- **`TaskItem` (`src/types.ts`)**:
  - `status`: `'backlog' | 'in_progress' | 'done' | 'paused'`.
  - `tags[0]` is the **Primary Tag**: determines Gantt grouping, Stats tag ring chart dimension, and quest category badge icon (`getQuestCategoryBadge`).
  - `order`: lane/global sort weight (re-indexed as `(idx + 1) * 1000` on reorder).
  - `startDate`: set on first valid check-in or move to `in_progress`; `completedDate`: set when entering `done`, cleared to `null` when leaving `done`.
- **`DailyLog` & Session Model (`src/types.ts`, `src/context/TaskContext.tsx`, `src/utils/timeDistribution.ts`)**:
  - Exactly **one** `DailyLog` per `(taskId, date)`.
  - Multiple check-ins on the same day live in `DailyLog.workSessions` (`WorkSession[]`). `aggregateLogFromSessions` derives day-level `hours` (1 decimal place), `note` (joined by `' ｜ '`), `progressType` (priority: `completed > progress > rest`), `isBackfill` (`true` only if all sessions are backfill), and `restSessions` / `totalRestMinutes`.
  - Legacy logs without `workSessions` are normalized via `ensureNormalizedWorkSessions` / `extractLogWorkIntervals` using `createdAt` and `hours` (marked `isEstimated: true`).
- **Key Business Thresholds**:
  - **Backfill (`isBackfill`)**: included in `DailyLog.hours` and `TaskItem.totalHours`, but **excluded** from `computeHourlyDistribution` and `computeTaskTimeSlotAffinity`.
  - **Auto Post-Work Rest Prompt**: triggered when `date === todayStr && !isBackfill && progressType !== 'rest' && hours > 0.3 && !restMinutes`.
  - **Stale Task Check (`getStaleInProgressTasks`)**: `status === 'in_progress'`, last active date `>= 3` days ago, and not logged today.
  - **Guild Exp Formula (`calculateGuildRank`)**: `exp = Math.round(totalProgressDays * 15 + totalHours * 10 + completedCount * 100)`, 200 exp per level.

---

## 4. `KanbanView.tsx` Fast Grep Anchors

`KanbanView.tsx` serves as the main navigation shell, AVG stage state machine, and inline transaction panel. Search these symbols/comments to jump directly:

- **State machine types**:
  - `type OverlayMode = 'none' | 'ledger' | 'gantt' | 'stats'`
  - `type DialogueMode` (14 states): `'hub' | 'select_checkin_task' | 'inspect_task' | 'checkin_form' | 'pomodoro' | 'rest_prompt' | 'rest_dial' | 'rest_countdown' | 'checkin_done' | 'create_task' | 'edit_task' | 'random_pick' | 'stale_review' | 'sync_menu'`
- **Section comment anchors**:
  - `const PocketWatchDialSvg` — shared interactive 60-min SVG watch dial
  - `// ── Reactive Wall-Clock Time & Viewport Tracking` — live clock & portrait/compact detection
  - `// ── Pomodoro Timer State` & `// ── Pomodoro Timer Derived State & Lifecycle Actions`
  - `// ── Post-Work Rest Inquiry, Dial & Countdown State`
  - `// ── Primary Navigation Switching` (`switchSection`)
  - `{/* ── Layer 0: Unified Guild Primary Navigation & Top HUD`
  - `{/* ── Layer 1: Dynamic Center Reception / Left-Right Split Interactive Stage`
  - End of file: `<TaskDetailDrawer />`, `<NpcConfigModal />`, Document PiP `createPortal(<PomodoroPipClock />)`

---

## 5. Task -> Files Routing Table

| Task | Files to Check / Edit | Notes |
| :--- | :--- | :--- |
| Task or log schema changes | `src/types.ts`, `src/context/TaskContext.tsx`, `src/services/githubGist.ts` | Update `computeContentHash`, `mergeSyncPayloads`, and `pushHistory` cloning for any new fields |
| Check-in form fields / validation / submit | `src/components/KanbanView.tsx` (`checkin_form`), `src/components/QuickCheckInModal.tsx`, `src/components/DurationStepperInput.tsx` | **Dual entry points** (inline reception form vs Gantt cell modal); keep consistent |
| Task create/edit form | `src/components/KanbanView.tsx` (`create_task` / `edit_task`), `src/components/TaskModal.tsx` | **Dual entry points** (inline reception form vs global modal); keep consistent |
| Mobile / iOS / iPadOS virtual keyboard & modal layout | `src/App.tsx`, `src/index.css`, `src/components/KanbanView.tsx`, `index.html`, modal components | Sync both `--app-height` and `--app-offset-top`; modals use `.guild-modal-overlay` |
| Gantt rendering, date window, or sorting | `src/components/GanttView.tsx`, `src/utils/date.ts` (`getGanttDateWindow`), `src/context/TaskContext.tsx` (`reorderTasksGlobal`) | Rows use `React.memo(GanttTaskRow)` + Ref callbacks to avoid table re-render on hover |
| Stats metrics or 24h distribution | `src/components/StatsView.tsx`, `src/utils/timeDistribution.ts` | Respect `isBackfill` exclusion & midnight-crossing slices (`getMinuteSlices`) |
| Pomodoro timer or Document PiP | `src/components/KanbanView.tsx`, `src/hooks/usePomodoroPip.ts`, `src/components/PomodoroPipClock.tsx` | `openPip` must run synchronously inside user-gesture stack (no preceding `await`) |
| NPC presets, rank, stale review | `src/utils/guildNpc.ts`, `src/components/NpcConfigModal.tsx`, `src/components/KanbanView.tsx`, `scripts/standardize-npc-sprites.py` | Presets live in `public/npc/` and are cached via Cache API |
| GitHub Gist cloud sync / E2EE | `src/services/githubGist.ts`, `src/context/TaskContext.tsx`, `src/components/DriveSyncModal.tsx` | Mind `remoteFilesCache` and `gistSaltCache` |
| Local folder sync | `src/services/localFolder.ts`, `src/hooks/useLocalSync.ts`, `src/components/LocalSyncModal.tsx` | `showDirectoryPicker` / `requestPermission` require user gesture |

---

## 6. Client Storage Registry

| Storage | Key / Name | Owner File | Purpose |
| :--- | :--- | :--- | :--- |
| `localStorage` | `media_task_tracker_data_v1` | `TaskContext.tsx` | Core `{ tasks, logs }` payload |
| `localStorage` | `gantt_group_order_v1` | `TaskContext.tsx` | Gantt primary-tag group order (synced to Gist `meta.json`) |
| `localStorage` | `media_task_tracker_view_mode` | `TaskContext.tsx` | Active main view (`kanban` / `gantt` / `stats`) |
| `localStorage` | `media_tracker_gist_token_v1` | `TaskContext.tsx` | GitHub Personal Access Token |
| `localStorage` | `media_tracker_gist_passphrase_v1` | `TaskContext.tsx` | E2EE sync passphrase (never uploaded) |
| `localStorage` | `media_tracker_gist_id_v1` | `TaskContext.tsx` | Bound Gist ID |
| `localStorage` | `media_tracker_gist_html_url_v1` | `TaskContext.tsx` | Gist web URL |
| `localStorage` | `media_tracker_gist_user_v1` | `TaskContext.tsx` | Cached GitHub user info |
| `localStorage` | `media_tracker_gist_last_sync_v1` | `TaskContext.tsx` | Last successful sync timestamp |
| `localStorage` | `media_tracker_gist_last_sync_hash_v1` | `TaskContext.tsx` | Content hash at last sync (dirty check) |
| `localStorage` | `media_tracker_gist_base_snapshot_v1` | `TaskContext.tsx` | 3-way merge base snapshot `DriveSyncPayload` |
| `localStorage` | `media_tracker_gist_auto_sync_v1` | `TaskContext.tsx` | Auto-sync toggle (`'0'` = off, default on) |
| `localStorage` | `media_tracker_local_sync_enabled` | `useLocalSync.ts` | Local folder sync enabled flag (`'1'`) |
| `localStorage` | `media_tracker_local_sync_last_write` | `useLocalSync.ts` | Last local folder write timestamp |
| `localStorage` | `guild_npc_custom_config_v2` | `guildNpc.ts` | Active NPC config `NpcConfig` |
| `localStorage` | `guild_npc_affection_v1` | `guildNpc.ts` | NPC affection points |
| `localStorage` | `questkeeper_pomodoro_daily_v1` | `KanbanView.tsx` | Daily Pomodoro completions & focus minutes |
| `sessionStorage` | `media_task_tracker_history_session_v1` | `TaskContext.tsx` | 30-step undo/redo stack `{ undoStack, redoStack }` |
| `IndexedDB` | DB `task-tracker-local-sync` / Store `handles` / Key `dir` | `localFolder.ts` | Persisted directory handle `DirHandle` |
| `Cache Storage` | `guild_npc_image_cache_v1` | `guildNpc.ts` | Offline cache for NPC sprites & backgrounds |

---

## 7. Critical Gotchas & Legacy Naming

1. **Legacy Naming**:
   - `KanbanView.tsx` is the **AVG Guild Reception + Main Stage container**, not a simple column board; the 4-tab board inside it is the **Quest Ledger**.
   - `DriveSyncModal.tsx` and `DriveSyncPayload` / `hasUnsyncedDriveChanges` / `pushToDrive` / `pullFromDrive` in `TaskContext.tsx` & `githubGist.ts` come from an early Google Drive design — **sync is now 100% GitHub Gist** (Google Drive was removed).
2. **Unused Template Dependencies**:
   - `package.json` still lists `firebase`, `@google/genai`, `express`, `dotenv` (alongside `.env.example` and `metadata.json`). **Zero files in `src/` import them**; do not look for or build backend services.
3. **Dual Entry Points**:
   - Check-in exists in both `KanbanView.tsx` (`checkin_form`) and `QuickCheckInModal.tsx`; Task create/edit exists in both `KanbanView.tsx` and `TaskModal.tsx`. Keep fields, duration steppers, and validation synchronized.
4. **Dark Mode Mechanism**:
   - `src/index.css` uses `@media (prefers-color-scheme: dark)` directly for custom classes (`.guild-parchment`, `.guild-card`, `.guild-modal-shell`, etc.). **There is no `.dark` class toggle.**
5. **iOS / iPadOS Keyboard & Modal Rules**:
   - Root container in `src/App.tsx` tracks both `visualViewport.height` (`--app-height`) and `visualViewport.offsetTop` (`--app-offset-top`) to prevent iPadOS/iOS first-focus upward layout shift and bottom black gap.
   - All modal backdrops must use `.guild-modal-overlay` (not `fixed inset-0`) so they stay aligned with the visual viewport when the soft keyboard opens.
   - `src/index.css` enforces `font-size: max(16px, 1rem)` on touch/small screens to prevent Safari focus zoom; `KanbanView.tsx` computes `isPortraitMode` from `layoutHeight` (not `vvH`) so a shrinking keyboard viewport does not flip portrait mode to landscape.
   - In `DurationStepperInput.tsx`, never call `e.preventDefault()` inside `onPointerDown` on step buttons (iOS Safari suppresses the subsequent `click`).
6. **Frozen Archive & HMR Flag**:
   - Never modify `public/v1/` (frozen v1 build archive).
   - Preserve `DISABLE_HMR === 'true'` handling in `vite.config.ts`.
