import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Cloud,
  CloudUpload,
  CloudDownload,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  LogOut,
  RefreshCw,
  HardDrive,
  ShieldCheck,
  ExternalLink,
  HelpCircle,
  FileJson,
  KeyRound,
  Eye,
  EyeOff,
  GitMerge,
  Lock,
  Unlock,
} from 'lucide-react';
import { useTaskContext } from '../context/TaskContext';

const TOKEN_CREATION_URL =
  'https://github.com/settings/tokens/new?scopes=gist&description=Task-Tracker-Sync';

export const DriveSyncModal: React.FC = () => {
  const {
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
    tasks,
    logs,
    requestConfirm,
  } = useTaskContext();

  const [tokenInput, setTokenInput] = useState('');
  const [customGistIdInput, setCustomGistIdInput] = useState('');
  const [connectPassphraseInput, setConnectPassphraseInput] = useState('');
  const [showTokenText, setShowTokenText] = useState(false);
  const [showConnectPassphraseText, setShowConnectPassphraseText] = useState(false);
  const [showGuide, setShowGuide] = useState(true);

  const [editingEncryption, setEditingEncryption] = useState(false);
  const [passphraseDraft, setPassphraseDraft] = useState('');
  const [showPassphraseDraft, setShowPassphraseDraft] = useState(false);

  const isPassphraseError =
    syncErrorCode === 'E2EE_PASSPHRASE_REQUIRED' || syncErrorCode === 'E2EE_WRONG_PASSPHRASE';

  useEffect(() => {
    if (driveSyncModalOpen) {
      setPassphraseDraft(gistPassphrase ?? '');
      setEditingEncryption(isPassphraseError);
    }
  }, [driveSyncModalOpen, gistPassphrase, isPassphraseError]);

  if (!driveSyncModalOpen) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;
    const ok = await connectWithGistToken(tokenInput, customGistIdInput, connectPassphraseInput);
    if (ok) {
      setTokenInput('');
      setCustomGistIdInput('');
      setConnectPassphraseInput('');
    }
  };

  const handleApplyPassphrase = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await updateEncryptionPassphrase(passphraseDraft);
    if (ok) {
      setEditingEncryption(false);
    }
  };

  const handleDisableEncryption = async () => {
    const ok = await requestConfirm({
      title: '关闭端到端加密',
      message:
        '关闭后，云端 Gist 中的任务与打卡文件将转换为明文 JSON（仍然存放在 Secret Gist 中，但知道链接的人可直接查看）。\n\n确定要关闭端到端加密并转为明文同步吗？',
      confirmText: '确认关闭加密',
      cancelText: '取消',
      variant: 'danger',
    });
    if (ok) {
      const done = await updateEncryptionPassphrase('');
      if (done) {
        setPassphraseDraft('');
        setEditingEncryption(false);
      }
    }
  };

  const handleDisconnect = async () => {
    const ok = await requestConfirm({
      title: '断开 GitHub Gist 连接',
      message:
        '确定要断开当前 GitHub Gist 同步吗？\n云端存档和当前本地任务数据都会保留，之后可以随时重新填写 Token 恢复同步。',
      confirmText: '断开连接',
      cancelText: '取消',
      variant: 'primary',
    });
    if (ok) {
      await logoutFromGist();
    }
  };

  const resolvedGistUrl =
    gistHtmlUrl || (driveFileId ? `https://gist.github.com/${driveFileId}` : null);
  const encryptionEnabled = Boolean(gistPassphrase && gistPassphrase.trim().length > 0);

  return (
    <AnimatePresence>
      <div className="guild-modal-overlay z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.16 }}
          className="w-full max-w-lg guild-modal-shell rounded-2xl shadow-2xl overflow-hidden overflow-x-hidden max-h-full overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-4 py-3 sm:px-6 sm:py-4 border-b border-amber-800/20 dark:border-amber-700/30 flex items-center justify-between guild-modal-header">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-100/80 dark:bg-amber-950/60 border border-amber-300/80 dark:border-amber-800 flex items-center justify-center text-amber-700 dark:text-amber-400">
                <Cloud className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  GitHub Gist 云端自动同步
                </h3>
                <p className="text-[11px] text-zinc-500">
                  零后端跨域直连 · 凭证永久有效 · 支持多设备自动合并同步
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDriveSyncModalOpen(false)}
              className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-4 sm:p-6 space-y-4 sm:space-y-5">
            {/* Sync Error Notice */}
            {syncErrorMessage && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed break-all">{syncErrorMessage}</div>
              </div>
            )}

            {/* Not connected */}
            {!gistToken ? (
              <form onSubmit={handleConnect} className="space-y-4">
                <div className="text-center space-y-2 pt-1">
                  <div className="w-12 h-12 rounded-2xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-900/60 mx-auto flex items-center justify-center text-sky-600 dark:text-sky-400 shadow-xs">
                    <KeyRound className="w-6 h-6 stroke-[1.75]" />
                  </div>
                  <h4 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    绑定 GitHub Token 开启自动同步
                  </h4>
                  <p className="text-xs text-zinc-500 leading-relaxed max-w-sm mx-auto">
                    数据保存在您个人的私密 GitHub Gist 中。多设备填入同一个 Token 即可自动识别同一份存档，无需任何代理或后端。
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-1.5">
                      GitHub Personal Access Token
                    </label>
                    <div className="relative">
                      <input
                        type={showTokenText ? 'text' : 'password'}
                        value={tokenInput}
                        onChange={(e) => setTokenInput(e.target.value)}
                        placeholder="粘贴 GitHub Personal Access Token (ghp_... 或 github_pat_...)"
                        autoComplete="off"
                        className="w-full pl-3.5 pr-10 py-2.5 text-xs font-mono rounded-xl border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/25 focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowTokenText((v) => !v)}
                        title={showTokenText ? '隐藏 Token' : '显示 Token'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        {showTokenText ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                      指定 Gist ID（选填）
                    </label>
                    <input
                      type="text"
                      value={customGistIdInput}
                      onChange={(e) => setCustomGistIdInput(e.target.value)}
                      placeholder="选填：已有 Gist ID（留空将自动查找或新建私密 Gist）"
                      autoComplete="off"
                      className="w-full px-3.5 py-2 text-xs font-mono rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-500" />
                      <span>端到端加密口令（选填，留空则不加密）</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showConnectPassphraseText ? 'text' : 'password'}
                        value={connectPassphraseInput}
                        onChange={(e) => setConnectPassphraseInput(e.target.value)}
                        placeholder="选填：填写后云端将以 AES-256-GCM 密文存储"
                        autoComplete="off"
                        className="w-full pl-3.5 pr-10 py-2 text-xs font-mono rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/70 text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConnectPassphraseText((v) => !v)}
                        title={showConnectPassphraseText ? '隐藏口令' : '显示口令'}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        {showConnectPassphraseText ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoggingIn || !tokenInput.trim()}
                  className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-semibold text-xs shadow-xs transition-all disabled:opacity-50 cursor-pointer"
                >
                  <RefreshCw className={`w-4 h-4 ${isLoggingIn ? 'animate-spin' : ''}`} />
                  <span>{isLoggingIn ? '正在验证并同步...' : '连接 GitHub Gist 并开启同步'}</span>
                </button>

                {/* 30s Token Guide */}
                <div className="pt-2 border-t border-zinc-200/70 dark:border-zinc-800">
                  <button
                    type="button"
                    onClick={() => setShowGuide((v) => !v)}
                    className="w-full text-left flex items-center justify-between text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <HelpCircle className="w-3.5 h-3.5 text-blue-500" />
                      <span>30 秒获取 GitHub Token 指南</span>
                    </span>
                    <span className="text-[11px] text-zinc-400">
                      {showGuide ? '收起' : '展开说明'}
                    </span>
                  </button>

                  {showGuide && (
                    <div className="mt-2.5 p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200/80 dark:border-zinc-700/60 text-[11px] text-zinc-600 dark:text-zinc-300 space-y-2 leading-relaxed">
                      <ol className="list-decimal pl-4 space-y-1.5">
                        <li>
                          点击下方快捷链接前往 GitHub（已自动勾选仅限{' '}
                          <code className="px-1 py-0.5 bg-zinc-200/70 dark:bg-zinc-700 rounded">
                            gist
                          </code>{' '}
                          最小权限）：
                          <div className="mt-1">
                            <a
                              href={TOKEN_CREATION_URL}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline"
                            >
                              <span>打开 GitHub Token 生成页</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </li>
                        <li>
                          将 <strong>Expiration</strong> 设为{' '}
                          <strong>No expiration（永不过期）</strong>，拉到底部点击{' '}
                          <strong>Generate token</strong>。
                        </li>
                        <li>
                          复制生成的{' '}
                          <code className="px-1 py-0.5 bg-zinc-200/70 dark:bg-zinc-700 rounded">
                            ghp_...
                          </code>{' '}
                          粘贴到上方输入框即可；在电脑和 iPad 上填入同一个 Token 会自动绑定同一个私密 Gist（若开启加密，两端填入同一加密口令即可）。
                        </li>
                      </ol>
                    </div>
                  )}
                </div>
              </form>
            ) : (
              /* Connected */
              <div className="space-y-4">
                {/* User Card */}
                <div className="p-3.5 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/60 flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    {user?.photoURL ? (
                      <img
                        src={user.photoURL}
                        alt="GitHub Avatar"
                        className="w-9 h-9 rounded-full border border-zinc-300 dark:border-zinc-700 shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-zinc-800 dark:bg-zinc-700 text-white flex items-center justify-center font-bold text-sm shrink-0">
                        {(user?.displayName || user?.login || 'G')[0].toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {user?.displayName || 'GitHub 用户'}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800 font-medium shrink-0">
                          已连接
                        </span>
                      </div>
                      <span className="text-[11px] text-zinc-500 font-mono truncate block">
                        {user?.login ? `@${user.login}` : 'GitHub Gist'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleDisconnect()}
                    className="p-1.5 text-zinc-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-zinc-200/60 dark:hover:bg-zinc-700 rounded-lg transition-colors text-xs flex items-center gap-1 cursor-pointer shrink-0"
                    title="断开 GitHub Gist 连接"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-[11px]">断开</span>
                  </button>
                </div>

                {/* Auto-Sync Toggle Bar */}
                <div className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span>全自动双向同步与智能合并</span>
                    </div>
                    <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
                      修改约 3 秒后自动同步，切回前台自动检查云端更新，遇冲突先合并或弹窗询问
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoSyncEnabled}
                    onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      autoSyncEnabled ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition duration-200 ease-in-out ${
                        autoSyncEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Optional End-to-End Encryption Card */}
                <div
                  className={`p-3 rounded-xl border space-y-2.5 transition-colors ${
                    isPassphraseError
                      ? 'border-rose-300 dark:border-rose-800 bg-rose-50/50 dark:bg-rose-950/20'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {encryptionEnabled ? (
                        <Lock className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <Unlock className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                            端到端加密（可选）
                          </span>
                          <span
                            className={`text-[10px] px-1.5 py-0.2 rounded font-medium border ${
                              encryptionEnabled
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                : 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
                            }`}
                          >
                            {encryptionEnabled ? '已开启 AES-256' : '未开启（明文）'}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-0.5 leading-snug">
                          {encryptionEnabled
                            ? '云端仅保存加密密文，即使 Gist 链接泄露也无法查看内容'
                            : '开启后将在上传前用本地口令加密分片，防止云端链接泄露'}
                        </p>
                      </div>
                    </div>

                    {!editingEncryption && (
                      <button
                        type="button"
                        onClick={() => {
                          setPassphraseDraft(gistPassphrase ?? '');
                          setEditingEncryption(true);
                        }}
                        className="shrink-0 px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 text-[11px] font-medium text-zinc-700 dark:text-zinc-200 transition-colors cursor-pointer"
                      >
                        {encryptionEnabled ? '修改 / 关闭' : '开启加密'}
                      </button>
                    )}
                  </div>

                  {editingEncryption && (
                    <form onSubmit={handleApplyPassphrase} className="space-y-2.5 pt-1 border-t border-zinc-200/70 dark:border-zinc-800">
                      <div className="relative">
                        <input
                          type={showPassphraseDraft ? 'text' : 'password'}
                          value={passphraseDraft}
                          onChange={(e) => setPassphraseDraft(e.target.value)}
                          placeholder="输入加密口令（多设备需填写相同口令）"
                          autoComplete="off"
                          className="w-full pl-3 pr-9 py-2 text-xs font-mono rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/25 focus:border-emerald-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassphraseDraft((v) => !v)}
                          title={showPassphraseDraft ? '隐藏口令' : '显示口令'}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-pointer"
                        >
                          {showPassphraseDraft ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <p className="text-[10px] text-zinc-500 leading-relaxed">
                        口令仅保存在本设备浏览器本地，不会上传至 GitHub。开启后 Gist 网页端将不展示任务明细；请务必牢记口令，遗忘后密文无法恢复。
                      </p>

                      <div className="flex items-center flex-wrap gap-2">
                        <button
                          type="submit"
                          disabled={isSyncing || !passphraseDraft.trim()}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          {isSyncing
                            ? '处理中...'
                            : encryptionEnabled || isPassphraseError
                              ? '应用口令并同步'
                              : '启用加密并同步'}
                        </button>

                        {encryptionEnabled && (
                          <button
                            type="button"
                            disabled={isSyncing}
                            onClick={() => void handleDisableEncryption()}
                            className="px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[11px] font-medium transition-colors disabled:opacity-50 cursor-pointer"
                          >
                            关闭加密（转为明文）
                          </button>
                        )}

                        {!isPassphraseError && (
                          <button
                            type="button"
                            disabled={isSyncing}
                            onClick={() => {
                              setPassphraseDraft(gistPassphrase ?? '');
                              setEditingEncryption(false);
                            }}
                            className="ml-auto px-2.5 py-1.5 rounded-lg text-[11px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 cursor-pointer"
                          >
                            取消
                          </button>
                        )}
                      </div>
                    </form>
                  )}
                </div>

                {/* Gist File Status */}
                <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-500 flex items-center gap-1.5 shrink-0">
                      <FileJson className="w-3.5 h-3.5 text-blue-500" />
                      <span>云端存储结构</span>
                    </span>
                    <span className="font-mono text-zinc-800 dark:text-zinc-200 font-medium truncate">
                      tasks.json + logs-YYYY-MM.json{encryptionEnabled ? '（密文）' : ''}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-500 flex items-center gap-1.5 shrink-0">
                      <Cloud className="w-3.5 h-3.5 text-zinc-400" />
                      <span>Gist ID</span>
                    </span>
                    {driveFileId && resolvedGistUrl ? (
                      <a
                        href={resolvedGistUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-mono text-[11px] text-blue-600 dark:text-blue-400 hover:underline truncate max-w-[240px]"
                        title={`在 GitHub 打开 Gist: ${driveFileId}`}
                      >
                        <span className="truncate">{driveFileId}</span>
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-zinc-400 font-mono text-[11px]">首次同步时自动创建</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-zinc-500 flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-zinc-400" />
                      <span>当前本地数据</span>
                    </span>
                    <span className="text-zinc-700 dark:text-zinc-300 font-medium">
                      {tasks.length} 项任务 · {logs.length} 条打卡日志
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3">
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
                            second: '2-digit',
                          })
                        : '尚未同步'}
                    </span>
                  </div>
                </div>

                {/* Sync Status Banner */}
                {syncStatus === 'conflict' ? (
                  <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-700 dark:text-rose-300">
                    <div className="flex items-center gap-2 min-w-0">
                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                      <span className="truncate">
                        检测到云端与本地存在 {pendingConflictCount > 0 ? `${pendingConflictCount} 处` : ''}冲突记录
                      </span>
                    </div>
                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={() => void syncWithGist({ silent: false })}
                      className="shrink-0 px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      立即处理冲突
                    </button>
                  </div>
                ) : hasUnsyncedDriveChanges ? (
                  <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-200">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>本地数据有修改，待同步至云端</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-200/80 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                      待同步
                    </span>
                  </div>
                ) : lastSyncTime ? (
                  <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200/70 dark:border-emerald-800/50 text-xs text-emerald-700 dark:text-emerald-300">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span>本地数据与 GitHub Gist 已保持最新</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300">
                      已同步
                    </span>
                  </div>
                ) : null}

                {/* Sync Action Buttons */}
                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    disabled={isSyncing}
                    onClick={() => void syncWithGist({ silent: false })}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-xs shadow-xs transition-all disabled:opacity-50 cursor-pointer ${
                      syncStatus === 'conflict'
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : hasUnsyncedDriveChanges
                          ? 'bg-amber-600 hover:bg-amber-700 text-white'
                          : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    <GitMerge className="w-4 h-4" />
                    <span>{isSyncing ? '正在同步与比对...' : '立即智能同步（自动合并推拉）'}</span>
                  </button>

                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={() => void pushToDrive(false)}
                      className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-medium text-xs transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <CloudUpload className="w-3.5 h-3.5" />
                      <span>上传本地覆盖云端</span>
                    </button>

                    <button
                      type="button"
                      disabled={isSyncing}
                      onClick={() => void pullFromDrive(false)}
                      className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-700 font-medium text-xs transition-all disabled:opacity-50 cursor-pointer"
                    >
                      <CloudDownload className="w-3.5 h-3.5" />
                      <span>从云端拉取覆盖本地</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
