import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Tag as TagIcon, Plus, Trash2, Check, Bookmark } from 'lucide-react';
import { useTaskContext } from '../context/TaskContext';
import { TaskStatus, TASK_STATUS_CONFIG } from '../types';

export const TaskModal: React.FC = () => {
  const {
    taskModalData,
    closeTaskModal,
    addTask,
    updateTask,
    deleteTask,
    allTags,
    requestConfirm,
    showToast,
  } = useTaskContext();
  const { isOpen, task, defaultStatus } = taskModalData;

  const [title, setTitle] = useState('');
  const [status, setStatus] = useState<TaskStatus>(defaultStatus || 'in_progress');
  const [tags, setTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');

  const commonTagPresets = ['游戏', '书籍', '影视', '漫画', '音乐', 'Steam', 'PS5', 'Switch', '微信读书', '实体书', '动画'];

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setStatus(task.status);
      setTags([...task.tags]);
    } else {
      setTitle('');
      setStatus(defaultStatus || 'in_progress');
      setTags(['游戏']);
    }
    setNewTagInput('');
  }, [task, defaultStatus, isOpen]);

  if (!isOpen) return null;

  const handleAddTag = (tagToAdd: string) => {
    const trimmed = tagToAdd.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setNewTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleKeyDownTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      handleAddTag(newTagInput);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    if (task) {
      updateTask(task.id, {
        title: title.trim(),
        status,
        tags,
      });
    } else {
      addTask({
        title: title.trim(),
        status,
        tags: tags.length > 0 ? tags : ['未分类'],
      });
    }
    closeTaskModal();
  };

  const handleDelete = async () => {
    if (!task) return;
    const confirmed = await requestConfirm({
      title: '删除任务',
      message: `确定要删除任务「${task.title}」及其所有时序打卡记录吗？此操作无法撤销。`,
      confirmText: '确认删除',
      cancelText: '取消',
      variant: 'danger',
    });
    if (confirmed) {
      deleteTask(task.id);
      closeTaskModal();
      showToast(`已删除任务「${task.title}」`, 'info');
    }
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
        onClick={closeTaskModal}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.16 }}
          className="w-full max-w-lg bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
            <div className="flex items-center gap-2 text-zinc-900 dark:text-zinc-100 font-bold text-base">
              <Bookmark className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <span>{task ? '编辑任务条目' : '新建跟踪任务'}</span>
            </div>
            <button
              onClick={closeTaskModal}
              className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Title Input */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                任务标题 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="例如：《黑神话：悟空》、《设计心理学》、《塞尔达王国之泪》..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                autoFocus
                className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium"
              />
            </div>

            {/* Status Selection */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-1.5">
                当前状态 / 所属泳道
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(['backlog', 'in_progress', 'done', 'paused'] as TaskStatus[]).map((st) => {
                  const cfg = TASK_STATUS_CONFIG[st];
                  const isSelected = status === st;
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStatus(st)}
                      className={`px-3 py-2 text-xs font-medium rounded-xl border flex items-center justify-between transition-all ${
                        isSelected
                          ? `${cfg.badgeBg} border-current shadow-xs ring-2 ring-blue-500/20 font-semibold`
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/40 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${cfg.dotColor}`} />
                        <span>{cfg.label}</span>
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tags Input & Presets */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                  <TagIcon className="w-3.5 h-3.5" />
                  <span>标签分类 (首个标签将作为甘特分组 Primary Tag)</span>
                </label>
                <span className="text-[11px] text-zinc-400">输入回车添加</span>
              </div>

              {/* Tag Input Box with Chips */}
              <div className="p-2 min-h-[46px] flex flex-wrap items-center gap-1.5 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500">
                {tags.map((tag, idx) => (
                  <span
                    key={tag}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
                      idx === 0
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300 ring-1 ring-blue-500/30'
                        : 'bg-zinc-200/80 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200'
                    }`}
                  >
                    {idx === 0 && <span className="text-[10px] uppercase font-bold text-blue-600 dark:text-blue-400">主:</span>}
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  placeholder={tags.length === 0 ? '添加标签...' : ''}
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={handleKeyDownTag}
                  className="flex-1 min-w-[80px] bg-transparent text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 outline-none px-1 py-0.5"
                />
                {newTagInput.trim() && (
                  <button
                    type="button"
                    onClick={() => handleAddTag(newTagInput)}
                    className="p-1 rounded bg-blue-600 text-white hover:bg-blue-700 text-xs"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Tag Suggestions from existing & common presets */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-zinc-400 mr-1">点选常用标签:</span>
                {Array.from(new Set([...allTags, ...commonTagPresets])).slice(0, 10).map((preset) => {
                  const isIncluded = tags.includes(preset);
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => (isIncluded ? handleRemoveTag(preset) : handleAddTag(preset))}
                      className={`text-[11px] px-2 py-0.5 rounded-md border transition-colors ${
                        isIncluded
                          ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300 font-medium'
                          : 'bg-zinc-100 dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200/70'
                      }`}
                    >
                      {isIncluded ? '✓ ' : '+ '}
                      {preset}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Timestamps if editing */}
            {task && (
              <div className="pt-2 text-xs text-zinc-400 dark:text-zinc-500 space-y-1">
                <div className="flex justify-between">
                  <span>首次推进日期：</span>
                  <span className="font-mono text-zinc-600 dark:text-zinc-300">{task.startDate || '未开始'}</span>
                </div>
                {task.completedDate && (
                  <div className="flex justify-between">
                    <span>归档完成日期：</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">{task.completedDate}</span>
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              {task ? (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  删除任务
                </button>
              ) : (
                <div />
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeTaskModal}
                  className="px-4 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors"
                >
                  {task ? '保存更改' : '确认创建'}
                </button>
              </div>
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
