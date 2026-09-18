import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Cloud,
  CloudUpload,
  CloudDownload,
  CheckCircle2,
  AlertCircle,
  LogOut,
  RefreshCw,
  HardDrive,
  ShieldCheck,
  ExternalLink,
  HelpCircle,
  FileJson,
  FolderSync,
} from 'lucide-react';
import { useTaskContext } from '../context/TaskContext';
import { DRIVE_DATA_FILENAME } from '../services/googleDrive';

export const DriveSyncModal: React.FC = () => {
  const {
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
    tasks,
    logs,
  } = useTaskContext();

  const [showSelfHostGuide, setShowSelfHostGuide] = useState(false);

  if (!driveSyncModalOpen) return null;

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
        onClick={() => setDriveSyncModalOpen(false)}
      >
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
                <Cloud className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Google Drive 云端直连同步
                </h3>
                <p className="text-[11px] text-zinc-500">
                  零后端服务器 · 本地持久化凭据 · 网页直连个人云盘
                </p>
              </div>
            </div>
            <button
              onClick={() => setDriveSyncModalOpen(false)}
              className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-6 space-y-5">
            {/* Sync Error Notice */}
            {syncErrorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 space-y-2 text-xs text-rose-700 dark:text-rose-300">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">{syncErrorMessage}</div>
                </div>
                {syncErrorMessage.includes('403') && (
                  <div className="pt-1 pl-6">
                    <button
                      type="button"
                      onClick={() => loginWithGoogle(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>重新勾选并授予 Drive 权限</span>
                    </button>
                  </div>
                )}
                {(syncErrorMessage.includes('401') || syncErrorMessage.includes('过期') || syncErrorMessage.includes('到期')) && (
                  <div className="pt-1 pl-6">
                    <button
                      type="button"
                      onClick={() => loginWithGoogle(false)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>一键快速续期凭据</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* If NOT signed in */}
            {!user ? (
              <div className="text-center py-5 space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-900/60 mx-auto flex items-center justify-center text-blue-600 dark:text-blue-400 shadow-xs">
                  <FolderSync className="w-7 h-7 stroke-[1.75]" />
                </div>

                <div className="max-w-sm mx-auto space-y-1">
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    一键连接您的 Google 账号
                  </h4>
                  <p className="text-xs text-zinc-500 leading-relaxed">
                    连接后，打卡进度与任务将以标准的 JSON 文件保存在您的 Google Drive，跨设备自由同步。授权状态会自动持久化保存到 LocalStorage，刷新页面无需重复登录。
                  </p>
                </div>

                {/* Official Sign in with Google Button */}
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    onClick={() => loginWithGoogle(false)}
                    disabled={isLoggingIn}
                    className="inline-flex items-center gap-3 px-5 py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 font-medium text-xs hover:bg-zinc-50 dark:hover:bg-zinc-700/80 shadow-xs hover:shadow transition-all disabled:opacity-60 cursor-pointer"
                  >
                    {/* Google G Logo */}
                    <svg className="w-4 h-4" viewBox="0 0 48 48">
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                    <span>{isLoggingIn ? '正在连接授权...' : '使用 Google 账号登录并连接'}</span>
                  </button>
                </div>

                {/* Privacy Badge */}
                <div className="pt-2 flex items-center justify-center gap-1.5 text-[11px] text-zinc-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>最小权限保护：仅读写本应用自身创建的数据文件</span>
                </div>
              </div>
            ) : (
              /* If ALREADY signed in */
              <div className="space-y-4">
                {/* User Card */}
                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {user.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt="User Avatar"
                        className="w-9 h-9 rounded-full border border-zinc-300 dark:border-zinc-700"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm">
                        {user.email?.[0].toUpperCase() || 'U'}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {user.displayName || 'Google 用户'}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 font-medium">
                          已连接
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-500 font-mono">{user.email}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={logoutFromGoogle}
                    className="p-1.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-700 rounded-lg transition-colors text-xs flex items-center gap-1 cursor-pointer"
                    title="断开 Google Drive 连接"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-[11px]">断开</span>
                  </button>
                </div>

                {/* LocalStorage Persistence Indicator */}
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/50 text-[11px] text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                  <span>已保存在 LocalStorage：刷新页面或下次打开自动保持连接</span>
                </div>

                {/* Token Expired Notification Banner */}
                {tokenExpired && (
                  <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center justify-between text-xs text-amber-800 dark:text-amber-200">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                      <div className="text-[11px] leading-tight">
                        <span className="font-semibold">访问令牌已达1小时安全期限</span>
                        <p className="text-[10px] text-amber-600 dark:text-amber-400">账号已保持连接，点击一键续期即可恢复同步</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => loginWithGoogle(false)}
                      disabled={isLoggingIn}
                      className="shrink-0 px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-medium text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-60"
                    >
                      {isLoggingIn ? '续期中...' : '一键快捷续期'}
                    </button>
                  </div>
                )}

                {/* Drive File Status */}
                <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 flex items-center gap-1.5">
                      <FileJson className="w-3.5 h-3.5 text-blue-500" />
                      <span>云端目标文件</span>
                    </span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200 font-medium">
                      {DRIVE_DATA_FILENAME}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
                      <span>当前本地缓存</span>
                    </span>
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                      {tasks.length} 项任务 · {logs.length} 条打卡日志
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 flex items-center gap-1.5">
                      <RefreshCw className={`w-3.5 h-3.5 text-zinc-400 ${isSyncing ? 'animate-spin' : ''}`} />
                      <span>最近同步时间</span>
                    </span>
                    <span className="text-zinc-700 dark:text-zinc-300 font-mono text-[11px]">
                      {lastSyncTime
                        ? new Date(lastSyncTime).toLocaleString('zh-CN', {
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '尚未同步'}
                    </span>
                  </div>
                </div>

                {/* Sync Action Buttons with Confirmation */}
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  {/* Push to Drive */}
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={() => pushToDrive(false)}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-medium text-xs shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <CloudUpload className="w-4 h-4" />
                    <span>上传覆盖至云端</span>
                  </button>

                  {/* Pull from Drive */}
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={() => pullFromDrive(false)}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 font-medium text-xs transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <CloudDownload className="w-4 h-4" />
                    <span>从云端拉取覆盖本地</span>
                  </button>
                </div>
              </div>
            )}

            {/* Self-hosting Guide for Localhost & GitHub Pages (Collapsible) */}
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setShowSelfHostGuide(!showSelfHostGuide)}
                className="w-full text-left flex items-center justify-between text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
              >
                <span className="flex items-center gap-1.5 font-medium">
                  <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
                  <span>如何托管在 GitHub Pages 或本地 localhost？</span>
                </span>
                <span className="text-[11px] text-zinc-400">
                  {showSelfHostGuide ? '收起' : '展开说明'}
                </span>
              </button>

              {showSelfHostGuide && (
                <div className="mt-2 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/60 text-[11px] text-zinc-600 dark:text-zinc-300 space-y-2 leading-relaxed">
                  <p>
                    本系统是<strong>纯前端单页架构（SPA）</strong>，零后端服务器依赖，完美支持通过 GitHub Pages 或本地运行：
                  </p>
                  <ol className="list-decimal pl-4 space-y-1">
                    <li>
                      <strong>本地 localhost</strong>：直接运行 <code className="px-1 py-0.5 bg-zinc-200/70 dark:bg-zinc-700 rounded">npm run dev</code>，当前预配置的客户端凭据即可开箱即用。
                    </li>
                    <li>
                      <strong>GitHub Pages</strong>：打包静态文件（<code className="px-1 py-0.5 bg-zinc-200/70 dark:bg-zinc-700 rounded">npm run build</code>）推送到仓库开启 Pages。前往 Google Cloud Console 中的 OAuth 凭据设置，将您的 GitHub Pages 域名（例如 <code className="px-1 py-0.5 bg-zinc-200/70 dark:bg-zinc-700 rounded">https://yourname.github.io</code>）加入「已获授权的 JavaScript 来源」即可。
                    </li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
