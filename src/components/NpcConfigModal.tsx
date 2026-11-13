import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Upload, RotateCcw, Sparkles, Image as ImageIcon, Check } from 'lucide-react';
import {
  NpcConfig,
  NpcExpression,
  EXPRESSION_META,
  DEFAULT_NPC_CONFIG,
} from '../utils/guildNpc';

interface NpcConfigModalProps {
  isOpen: boolean;
  config: NpcConfig;
  onClose: () => void;
  onSave: (next: NpcConfig) => void;
  onReset: () => void;
}

const EXPRESSION_ORDER: NpcExpression[] = ['normal', 'happy', 'cheer', 'thinking', 'sleepy'];

/**
 * Compresses/resizes uploaded local images so base64 DataURLs fit safely in localStorage.
 */
function readAndCompressImage(file: File, maxDim = 1280): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => resolve(dataUrl);
      img.onload = () => {
        const { width, height } = img;
        if (width <= maxDim && height <= maxDim && file.size <= 400 * 1024) {
          resolve(dataUrl);
          return;
        }
        const scale = Math.min(1, maxDim / Math.max(width, height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const isPng = file.type === 'image/png';
        resolve(canvas.toDataURL(isPng ? 'image/png' : 'image/jpeg', 0.86));
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}

export const NpcConfigModal: React.FC<NpcConfigModalProps> = ({
  isOpen,
  config,
  onClose,
  onSave,
  onReset,
}) => {
  const [draft, setDraft] = useState<NpcConfig>(config);
  const [uploadingKey, setUploadingKey] = useState<NpcExpression | 'bg' | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeTargetRef = useRef<NpcExpression | 'bg' | null>(null);

  useEffect(() => {
    if (isOpen) {
      setDraft({
        ...config,
        expressions: { ...config.expressions },
      });
    }
  }, [isOpen, config]);

  if (!isOpen) return null;

  const triggerFilePicker = (target: NpcExpression | 'bg') => {
    activeTargetRef.current = target;
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = activeTargetRef.current;
    if (!file || !target) return;

    setUploadingKey(target);
    try {
      const dataUrl = await readAndCompressImage(file);
      if (target === 'bg') {
        setDraft((prev) => ({ ...prev, customBgUrl: dataUrl }));
      } else {
        setDraft((prev) => ({
          ...prev,
          expressions: { ...prev.expressions, [target]: dataUrl },
        }));
      }
    } finally {
      setUploadingKey(null);
      activeTargetRef.current = null;
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...draft,
      name: draft.name.trim() || DEFAULT_NPC_CONFIG.name,
      title: draft.title.trim() || DEFAULT_NPC_CONFIG.title,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 10 }}
          transition={{ duration: 0.16 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-2xl bg-[#fbf6ea] dark:bg-[#1e1915] text-stone-900 dark:text-stone-100 rounded-2xl border-2 border-amber-700/50 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="px-5 py-4 border-b border-amber-800/20 dark:border-amber-700/30 bg-[#f4ead1] dark:bg-[#282019] flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-amber-600 text-amber-50 flex items-center justify-center shadow-xs">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold tracking-wide">看板娘 NPC 形象与设定</h3>
                <p className="text-[11px] text-stone-500 dark:text-stone-400">
                  支持修改称呼、立绘展示模式，或为 5 种表情替换图片 URL / 本地上传立绘
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto flex-1">
            {/* Name, Title & Display Mode */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  看板娘名字
                </label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="例如：艾莉丝"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/80 dark:bg-stone-900/80 border border-amber-800/25 dark:border-amber-700/40 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  公会头衔
                </label>
                <input
                  type="text"
                  value={draft.title}
                  onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="例如：公会首席接待员"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white/80 dark:bg-stone-900/80 border border-amber-800/25 dark:border-amber-700/40 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
              </div>
            </div>

            {/* Display Mode */}
            <div className="p-3 rounded-xl bg-amber-900/5 dark:bg-black/25 border border-amber-800/15 dark:border-amber-700/25 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                  立绘渲染模式
                </span>
                <div className="flex items-center gap-1.5 bg-white/70 dark:bg-stone-900 p-1 rounded-lg border border-amber-800/20">
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, displayMode: 'scene' }))}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      draft.displayMode === 'scene'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                    }`}
                  >
                    全场景 CG 模式
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, displayMode: 'sprite' }))}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      draft.displayMode === 'sprite'
                        ? 'bg-amber-600 text-white shadow-2xs'
                        : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-200'
                    }`}
                  >
                    透明立绘叠加模式
                  </button>
                </div>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400">
                {draft.displayMode === 'scene'
                  ? '全场景 CG 模式：图片直接铺满公会接待台背景（推荐用于自带背景的横版插画，默认内置立绘即为此模式）。'
                  : '透明立绘叠加模式：将角色立绘居中悬浮在公会背景之上，适合使用透明背景 PNG 人物立绘时开启。'}
              </p>

              {draft.displayMode === 'sprite' && (
                <div className="pt-1 flex items-center gap-2">
                  <input
                    type="text"
                    value={draft.customBgUrl || ''}
                    onChange={(e) => setDraft((prev) => ({ ...prev, customBgUrl: e.target.value }))}
                    placeholder="可选：自定义背景图 URL（留空则使用默认公会暖光背景）"
                    className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-white/80 dark:bg-stone-900/80 border border-amber-800/20 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  />
                  <button
                    type="button"
                    onClick={() => triggerFilePicker('bg')}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 border border-amber-700/30 hover:bg-amber-200/70 transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>传背景</span>
                  </button>
                </div>
              )}
            </div>

            {/* Expressions List */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-stone-700 dark:text-stone-300">
                  五种情感差分立绘配置
                </span>
                <span className="text-[11px] text-stone-400">支持本地图片（自动压缩存本地）或网络图片 URL</span>
              </div>

              <div className="space-y-2.5">
                {EXPRESSION_ORDER.map((expr) => {
                  const meta = EXPRESSION_META[expr];
                  const val = draft.expressions[expr] || '';
                  return (
                    <div
                      key={expr}
                      className="p-2.5 rounded-xl bg-white/75 dark:bg-stone-900/60 border border-amber-800/20 dark:border-amber-700/30 flex items-center gap-3"
                    >
                      <div className="w-20 h-12 rounded-lg overflow-hidden bg-stone-200 dark:bg-stone-800 border border-amber-800/20 shrink-0 flex items-center justify-center">
                        {val ? (
                          <img
                            src={val}
                            alt={meta.label}
                            className="w-full h-full object-cover object-top"
                          />
                        ) : (
                          <ImageIcon className="w-4 h-4 text-stone-400" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-stone-800 dark:text-stone-100">
                            {meta.label}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800">
                            {meta.badge}
                          </span>
                          <span className="text-[10px] text-stone-400 hidden sm:inline truncate">
                            {meta.desc}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            value={val.startsWith('data:') ? '[已上传本地图片]' : val}
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              if (nextVal === '[已上传本地图片]') return;
                              setDraft((prev) => ({
                                ...prev,
                                expressions: { ...prev.expressions, [expr]: nextVal },
                              }));
                            }}
                            placeholder={DEFAULT_NPC_CONFIG.expressions[expr]}
                            className="flex-1 min-w-0 px-2.5 py-1 text-[11px] font-mono rounded-lg bg-stone-50 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 focus:outline-none focus:ring-1 focus:ring-amber-500"
                          />
                          <button
                            type="button"
                            disabled={uploadingKey === expr}
                            onClick={() => triggerFilePicker(expr)}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300/80 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors cursor-pointer shrink-0 flex items-center gap-1"
                          >
                            <Upload className="w-3 h-3" />
                            <span>{uploadingKey === expr ? '处理中...' : '上传'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer */}
            <div className="pt-3 border-t border-amber-800/20 dark:border-amber-700/30 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setDraft({
                    ...DEFAULT_NPC_CONFIG,
                    expressions: { ...DEFAULT_NPC_CONFIG.expressions },
                  });
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>恢复默认立绘与设定</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-3.5 py-2 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-black/5 dark:hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-xl shadow-sm transition-colors cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>保存设置</span>
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
