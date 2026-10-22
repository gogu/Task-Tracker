import React, { useRef } from 'react';
import {
  Kanban,
  CalendarDays,
  BarChart3,
  Plus,
  Search,
  Tag,
  Download,
  Upload,
  Flame,
  CheckCircle2,
  Clock,
  SlidersHorizontal,
  Cloud,
  FolderSync,
  Undo2,
  Redo2,
} from 'lucide-react';
import { useTaskContext } from '../context/TaskContext';
import { getTodayString } from '../utils/date';

export const Header: React.FC = () => {
  const {
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    selectedTag,
    setSelectedTag,
    allTags,
    tasks,
    logs,
    openTaskModal,
    exportData,
    importData,
    canUndo,
    canRedo,
    lastUndoDescription,
    lastRedoDescription,
    undo,
    redo,
    user,
    isSyncing,
    syncStatus,
    hasUnsyncedDriveChanges,
    setDriveSyncModalOpen,
    localSync,
    setLocalSyncModalOpen,
    showToast,
  } = useTaskContext();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const todayStr = getTodayString();

  // Metrics
  const inProgressCount = tasks.filter((t) => t.status === 'in_progress').length;
  const todayCheckedCount = tasks.filter((t) =>
    logs.some((l) => l.taskId === t.id && l.date === todayStr)
  ).length;
  const totalCompletedCount = tasks.filter((t) => t.status === 'done').length;

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
          } else {
            showToast('导入失败：文件格式不符合要求', 'error');
          }
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <header className="space-y-3">
      {/* Top Main Navigation Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 shadow-xs">
        {/* Brand & Stats */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm">
            <CalendarDays className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                时序追踪
              </h1>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800">
                看板 × 甘特 × 统计
              </span>
            </div>
            {/* Quick Micro-Stats */}
            <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-blue-500" />
                <span>进行中: <strong>{inProgressCount}</strong></span>
              </span>
              <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <span className="flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-500" />
                <span>今日已打卡: <strong className="text-emerald-600 dark:text-emerald-400">{todayCheckedCount}</strong></span>
              </span>
              <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                <span>已通关: <strong>{totalCompletedCount}</strong></span>
              </span>
            </div>
          </div>
        </div>

        {/* View Mode Toggle & Primary Action */}
        <div className="flex items-center flex-wrap gap-2.5">
          {/* View Mode Switcher (Kanban / Gantt / Stats) */}
          <div className="flex items-center bg-zinc-100 dark:bg-zinc-800 p-1 rounded-xl border border-zinc-200/80 dark:border-zinc-700/60">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>看板视图</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('gantt')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'gantt'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              <span>时序甘特</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('stats')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'stats'
                  ? 'bg-white dark:bg-zinc-900 text-blue-600 dark:text-blue-400 shadow-2xs'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>统计视图</span>
            </button>
          </div>

          {/* New Task Button */}
          <button
            type="button"
            onClick={() => openTaskModal()}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] rounded-xl shadow-xs hover:shadow transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>新建任务</span>
          </button>

          {/* Undo / Redo Controls */}
          <div className="flex items-center gap-1 border-l border-zinc-200 dark:border-zinc-800 pl-2">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              title={canUndo ? `撤销：${lastUndoDescription} (Ctrl+Z)` : '暂无可撤销操作 (Ctrl+Z)'}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                canUndo
                  ? 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer shadow-2xs'
                  : 'border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-900/40 text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
              }`}
            >
              <Undo2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">撤销</span>
            </button>

            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              title={canRedo ? `重做：${lastRedoDescription} (Ctrl+Y)` : '暂无可重做操作 (Ctrl+Y)'}
              className={`p-1.5 rounded-xl border text-xs font-semibold transition-all ${
                canRedo
                  ? 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer shadow-2xs'
                  : 'border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-900/40 text-zinc-300 dark:text-zinc-600 cursor-not-allowed'
              }`}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Backup, Sync & Import/Export Menu */}
          <div className="flex items-center gap-1.5 border-l border-zinc-200 dark:border-zinc-800 pl-2.5">
            {/* Google Drive Cloud Sync Button */}
            {user ? (() => {
              const dotClass =
                syncStatus === 'error'
                  ? 'bg-rose-500'
                  : isSyncing
                    ? 'bg-blue-500 animate-pulse'
                    : hasUnsyncedDriveChanges
                      ? 'bg-amber-500'
                      : 'bg-emerald-500';

              const title =
                syncStatus === 'error'
                  ? 'Google Drive 同步出错 - 点击查看详情'
                  : isSyncing
                    ? 'Google Drive 正在同步中...'
                    : hasUnsyncedDriveChanges
                      ? `Google Drive 已连接 (${user.email || user.displayName || '已连接'}) - 本地有修改，待同步至云端`
                      : `Google Drive 已连接 (${user.email || user.displayName || '已连接'}) - 已是最新，点击管理云端同步`;

              const btnClass =
                syncStatus === 'error'
                  ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100/80'
                  : isSyncing
                    ? 'border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                    : hasUnsyncedDriveChanges
                      ? 'border-amber-300 dark:border-amber-700/80 bg-amber-50/90 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100/90'
                      : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/80';

              const iconClass =
                syncStatus === 'error'
                  ? 'text-rose-600 dark:text-rose-400'
                  : isSyncing
                    ? 'animate-pulse text-blue-500'
                    : hasUnsyncedDriveChanges
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-emerald-600 dark:text-emerald-400';

              return (
                <button
                  type="button"
                  onClick={() => setDriveSyncModalOpen(true)}
                  title={title}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer shadow-2xs ${btnClass}`}
                >
                  <div className="relative">
                    <Cloud className={`w-3.5 h-3.5 ${iconClass}`} />
                    <span
                      className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ring-2 ring-white dark:ring-zinc-900 ${dotClass}`}
                    />
                  </div>
                  <span className="hidden sm:inline">Drive 同步</span>
                </button>
              );
            })() : (
              <button
                type="button"
                onClick={() => setDriveSyncModalOpen(true)}
                title="连接 Google Drive 实现云端直连同步"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-all shadow-2xs cursor-pointer"
              >
                <Cloud className="w-3.5 h-3.5 text-blue-500" />
                <span className="hidden sm:inline">Drive 同步</span>
              </button>
            )}

            {/* Local Folder Sync Button */}
            {(() => {
              const { supported, enabled, status } = localSync;
              const dotClass =
                status === 'error'
                  ? 'bg-rose-500'
                  : status === 'needs-permission'
                    ? 'bg-amber-500'
                    : status === 'syncing'
                      ? 'bg-blue-500 animate-pulse'
                      : 'bg-emerald-500';

              const title = !supported
                ? '当前浏览器不支持本地目录同步，请使用 Chrome / Edge'
                : !enabled
                  ? '开启本地目录实时同步'
                  : status === 'needs-permission'
                    ? `本地同步已暂停（${localSync.folderName ?? ''}）- 点击恢复授权`
                    : status === 'error'
                      ? `本地同步出错 - 点击查看详情`
                      : `本地同步已开启（${localSync.folderName ?? ''}）- 点击管理`;

              const btnClass = !supported
                ? 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/40 text-zinc-400 dark:text-zinc-500'
                : !enabled
                  ? 'border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700'
                  : status === 'error'
                    ? 'border-rose-200 dark:border-rose-900/60 bg-rose-50/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100/80'
                    : status === 'syncing'
                      ? 'border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                      : status === 'needs-permission'
                        ? 'border-amber-300 dark:border-amber-700/80 bg-amber-50/90 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 hover:bg-amber-100/90'
                        : 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100/80';

              const iconClass = !supported
                ? 'text-zinc-400'
                : !enabled
                  ? 'text-blue-500'
                  : status === 'error'
                    ? 'text-rose-600 dark:text-rose-400'
                    : status === 'syncing'
                      ? 'animate-pulse text-blue-500'
                      : status === 'needs-permission'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-emerald-600 dark:text-emerald-400';

              return (
                <button
                  type="button"
                  onClick={() => setLocalSyncModalOpen(true)}
                  title={title}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-2xs cursor-pointer ${btnClass}`}
                >
                  <div className="relative">
                    <FolderSync className={`w-3.5 h-3.5 ${iconClass}`} />
                    {supported && enabled && (
                      <span
                        className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ring-2 ring-white dark:ring-zinc-900 ${dotClass}`}
                      />
                    )}
                  </div>
                  <span className="hidden sm:inline">本地同步</span>
                </button>
              );
            })()}

            {/* Export JSON */}
            <button
              type="button"
              onClick={exportData}
              title="导出当前全部数据 JSON 备份"
              className="p-2 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Import JSON */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="导入 JSON 备份"
              className="p-2 text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer"
            >
              <Upload className="w-4 h-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5 px-1">
        {/* Tag Filters (Scrollable Row) */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 no-scrollbar text-xs">
          <div className="flex items-center gap-1 text-zinc-400 shrink-0 mr-1">
            <Tag className="w-3.5 h-3.5" />
            <span className="text-[11px] font-medium">标签:</span>
          </div>

          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className={`px-3 py-1 rounded-lg text-xs font-medium shrink-0 transition-all ${
              selectedTag === null
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-2xs font-semibold'
                : 'bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50'
            }`}
          >
            全部 ({tasks.length})
          </button>

          {[...allTags]
            .sort((a, b) => {
              const countA = tasks.filter((t) => t.tags.includes(a)).length;
              const countB = tasks.filter((t) => t.tags.includes(b)).length;
              return countB - countA;
            })
            .map((tag) => {
              const count = tasks.filter((t) => t.tags.includes(tag)).length;
              const isSelected = selectedTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(isSelected ? null : tag)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium shrink-0 flex items-center gap-1 border transition-all ${
                    isSelected
                      ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-950/70 dark:border-blue-800 dark:text-blue-300 font-semibold'
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800'
                  }`}
                >
                  <span>{tag}</span>
                  <span className="text-[10px] opacity-70">({count})</span>
                </button>
              );
            })}
        </div>

        {/* Real-time Search Box */}
        <div className="relative w-full md:w-64 shrink-0">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="搜索任务标题或标签..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white dark:bg-zinc-900 border border-zinc-200/90 dark:border-zinc-800 rounded-xl text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-xs"
            >
              ×
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
