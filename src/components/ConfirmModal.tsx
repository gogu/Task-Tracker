import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, HelpCircle, X } from 'lucide-react';
import { useTaskContext } from '../context/TaskContext';

export const ConfirmModal: React.FC = () => {
  const { confirmDialogState } = useTaskContext();

  if (!confirmDialogState || !confirmDialogState.isOpen) return null;

  const {
    title,
    message,
    confirmText = '确认',
    cancelText = '取消',
    variant = 'primary',
    onConfirm,
    onCancel,
  } = confirmDialogState;

  const isDanger = variant === 'danger';

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
        onClick={onCancel}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 8 }}
          transition={{ duration: 0.15 }}
          className="w-full max-w-md bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  isDanger
                    ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50'
                    : 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50'
                }`}
              >
                {isDanger ? (
                  <AlertTriangle className="w-5 h-5 stroke-[2]" />
                ) : (
                  <HelpCircle className="w-5 h-5 stroke-[2]" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  {title}
                </h3>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-line">
                  {message}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 rounded-xl text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 transition-colors cursor-pointer"
              >
                {cancelText}
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className={`px-4 py-2 rounded-xl text-xs font-semibold text-white shadow-xs transition-colors cursor-pointer ${
                  isDanger
                    ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800'
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                }`}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
