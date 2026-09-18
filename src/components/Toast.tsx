import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { useTaskContext } from '../context/TaskContext';

export const Toast: React.FC = () => {
  const { toast, hideToast } = useTaskContext();

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        hideToast();
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [toast, hideToast]);

  if (!toast) return null;

  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';

  return (
    <AnimatePresence>
      <div className="fixed bottom-5 right-5 z-70 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.95 }}
          transition={{ duration: 0.15 }}
          className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg border text-xs font-medium ${
            isSuccess
              ? 'bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
              : isError
              ? 'bg-rose-50 dark:bg-rose-950 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
              : 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-700'
          }`}
        >
          {isSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />}
          {isError && <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />}
          {!isSuccess && !isError && <Info className="w-4 h-4 text-blue-400 shrink-0" />}
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={hideToast}
            className="ml-2 p-0.5 opacity-60 hover:opacity-100 transition-opacity"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
