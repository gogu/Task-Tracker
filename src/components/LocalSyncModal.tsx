import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  FolderSync,
  FolderOpen,
  FileJson,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  FileDown,
  FileUp,
  Power,
  ShieldAlert,
} from 'lucide-react';
import { useTaskContext } from '../context/TaskContext';
import { LOCAL_DATA_FILENAME } from '../services/localFolder';

export const LocalSyncModal: React.FC = () => {
  const {
    localSync,
    localSyncModalOpen,
    setLocalSyncModalOpen,
    enableLocalSync,
    resumeLocalSync,
    disableLocalSync,
    writeLocalNow,
    pullFromLocalFile,
    tasks,
    logs,
    requestConfirm,
  } = useTaskContext();

  if (!localSyncModalOpen) return null;

  const { supported, enabled, status, folderName, lastWriteTime, errorMessage } = localSync;
  const isWriting = status === 'syncing';

  const handleDisable = async () => {
    const ok = await requestConfirm({
      title: '关闭本地同步',
      message: `关闭后将不再自动写入目录，已有的「${LOCAL_DATA_FILENAME}」会保留在原目录中。\n之后可以随时重新开启。`,
      confirmText: '关闭同步',
      cancelText: '取消',
      variant: 'primary',
    });
    if (ok) await disableLocalSync();
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.16 }}
          className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200/80 dark:border-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-400">
                <FolderSync className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">本地目录实时同步</h3>
                <p className="text-[11px] text-zinc-500">数据变化后自动写入你指定的本地目录</p>
              </div>
            </div>
            <button
              onClick={() => setLocalSyncModalOpen(false)}
              className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-4">
            {/* Unsupported browser */}
            {!supported && (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-800 dark:text-amber-200">
                <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  当前浏览器不支持访问本地目录（File System Access API）。请使用桌面版 <strong>Chrome</strong> 或{' '}
                  <strong>Edge</strong> 打开本页面，并通过 <code className="px-1 rounded bg-amber-100 dark:bg-amber-900/50">https</code> 或{' '}
                  <code className="px-1 rounded bg-amber-100 dark:bg-amber-900/50">localhost</code> 访问。
                </div>
              </div>
            )}

            {/* Error banner */}
            {supported && errorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{errorMessage}</div>
              </div>
            )}

            {/* Not enabled */}
            {supported && !enabled && (
              <div className="text-center py-4 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/60 mx-auto flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-xs">
                  <FolderOpen className="w-7 h-7 stroke-[1.75]" />
                </div>
                <div className="max-w-sm mx-auto space-y-1">
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">选择一个目录来保存数据</h4>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    开启后需要授予该目录的读写权限。之后每次任务、打卡或排序变化，都会自动写入目录下的{' '}
                    <code className="px-1 rounded bg-zinc-100 dark:bg-zinc-800">{LOCAL_DATA_FILENAME}</code>。
                    这是单向同步：应用不会监听文件的外部修改。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void enableLocalSync()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-medium text-xs shadow-xs transition-all cursor-pointer"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>选择目录并开启</span>
                </button>
              </div>
            )}

            {/* Enabled */}
            {supported && enabled && (
              <div className="space-y-4">
                {status === 'needs-permission' && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between gap-3 text-xs text-amber-800 dark:text-amber-200">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <div className="text-[11px] leading-tight">
                        <span className="font-semibold">同步已暂停：需要重新授权</span>
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">
                          刷新页面后浏览器会收回目录权限，点击恢复后会立即补写最新数据
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void resumeLocalSync()}
                      className="shrink-0 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer"
                    >
                      恢复授权
                    </button>
                  </div>
                )}

                {status === 'success' && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/50 text-[11px] text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                    <span>实时同步已开启：数据变化后约 1 秒内自动写入</span>
                  </div>
                )}

                <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-500 flex items-center gap-1.5 shrink-0">
                      <FolderOpen className="w-3.5 h-3.5 text-blue-500" />
                      <span>同步目录</span>
                    </span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200 font-medium truncate">
                      {folderName ?? '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-500 flex items-center gap-1.5 shrink-0">
                      <FileJson className="w-3.5 h-3.5 text-zinc-400" />
                      <span>目标文件</span>
                    </span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200 font-medium">{LOCAL_DATA_FILENAME}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-500">当前数据</span>
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                      {tasks.length} 项任务 · {logs.length} 条打卡日志
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-500 flex items-center gap-1.5">
                      <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${isWriting ? 'animate-spin' : ''}`} />
                      <span>最近写入时间</span>
                    </span>
                    <span className="text-zinc-700 dark:text-zinc-300 font-mono text-[11px]">
                      {lastWriteTime
                        ? new Date(lastWriteTime).toLocaleString('zh-CN', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })
                        : '尚未写入'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    disabled={isWriting || status === 'needs-permission'}
                    onClick={() => void writeLocalNow()}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-medium text-xs shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <FileDown className="w-4 h-4" />
                    <span>立即写入文件</span>
                  </button>
                  <button
                    type="button"
                    disabled={isWriting}
                    onClick={() => void pullFromLocalFile()}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-medium text-xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <FileUp className="w-4 h-4" />
                    <span>从文件读取覆盖</span>
                  </button>
                  <button
                    type="button"
                    disabled={isWriting}
                    onClick={() => void enableLocalSync()}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium text-xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>更换目录</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDisable()}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 font-medium text-xs transition-all cursor-pointer"
                  >
                    <Power className="w-4 h-4" />
                    <span>关闭同步</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

