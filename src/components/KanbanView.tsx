import React, { useState, useRef } from 'react';
import { Plus, CheckCircle2, PlayCircle, PauseCircle, Layers } from 'lucide-react';
import { TaskStatus, TASK_STATUS_CONFIG } from '../types';
import { useTaskContext } from '../context/TaskContext';
import { TaskCard } from './TaskCard';

export const KanbanView: React.FC = () => {
  const { filteredTasks, moveTaskStatus, reorderTasks, openTaskModal } = useTaskContext();

  // 跨泳道拖拽状态
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedTaskStatus, setDraggedTaskStatus] = useState<TaskStatus | null>(null);
  const [dragOverLane, setDragOverLane] = useState<TaskStatus | null>(null);

  // 泳道内排序状态
  const [dragOverCardId, setDragOverCardId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'before' | 'after'>('after');

  // 用于保存卡片 DOM 节点，以计算鼠标相对位置
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const lanes: { key: TaskStatus; icon: React.ReactNode }[] = [
    { key: 'backlog', icon: <Layers className="w-4 h-4 text-zinc-500" /> },
    { key: 'in_progress', icon: <PlayCircle className="w-4 h-4 text-blue-500" /> },
    { key: 'done', icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" /> },
    { key: 'paused', icon: <PauseCircle className="w-4 h-4 text-amber-500" /> },
  ];

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    setDraggedTaskId(taskId);
    const task = filteredTasks.find((t) => t.id === taskId);
    setDraggedTaskStatus(task?.status ?? null);
    // 小延迟让浏览器生成拖拽预览图后再隐藏样式（避免闪烁）
    setTimeout(() => {
      const el = cardRefs.current.get(taskId);
      if (el) el.style.opacity = '0.4';
    }, 0);
  };

  const handleDragEnd = (taskId: string) => {
    const el = cardRefs.current.get(taskId);
    if (el) el.style.opacity = '';
    setDraggedTaskId(null);
    setDraggedTaskStatus(null);
    setDragOverLane(null);
    setDragOverCardId(null);
  };

  // 泳道级悬停（跨泳道移动时高亮整个泳道）
  const handleLaneDragOver = (e: React.DragEvent, lane: TaskStatus) => {
    e.preventDefault();
    // 仅当拖拽到不同泳道时才高亮泳道
    if (draggedTaskStatus !== lane) {
      if (dragOverLane !== lane) setDragOverLane(lane);
    }
  };

  const handleLaneDragLeave = (e: React.DragEvent, lane: TaskStatus) => {
    if (dragOverLane === lane) setDragOverLane(null);
  };

  // 卡片级悬停（用于同泳道内排序位置检测）
  const handleCardDragOver = (e: React.DragEvent, cardId: string, cardStatus: TaskStatus) => {
    e.preventDefault();
    e.stopPropagation(); // 阻止事件冒泡到泳道，避免同泳道内触发泳道高亮

    // 同泳道内：计算插入位置
    if (draggedTaskStatus === cardStatus && draggedTaskId !== cardId) {
      const cardEl = cardRefs.current.get(cardId);
      if (cardEl) {
        const rect = cardEl.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        const pos: 'before' | 'after' = e.clientY < midY ? 'before' : 'after';
        setDragOverCardId(cardId);
        setDropPosition(pos);
      }
      // 同泳道内不高亮泳道
      setDragOverLane(null);
    }
  };

  const handleDrop = (e: React.DragEvent, targetLane: TaskStatus) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain') || draggedTaskId;
    if (!taskId) return;

    if (dragOverCardId && draggedTaskStatus === targetLane) {
      // 同泳道内排序
      reorderTasks(taskId, dragOverCardId, dropPosition);
    } else if (draggedTaskStatus !== targetLane) {
      // 跨泳道移动
      moveTaskStatus(taskId, targetLane);
    }

    setDraggedTaskId(null);
    setDraggedTaskStatus(null);
    setDragOverLane(null);
    setDragOverCardId(null);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start min-h-[calc(100vh-220px)]">
      {lanes.map(({ key, icon }) => {
        const config = TASK_STATUS_CONFIG[key];
        const laneTasks = filteredTasks.filter((t) => t.status === key);
        const isCrossLaneDragTarget = dragOverLane === key && draggedTaskStatus !== key;

        return (
          <div
            key={key}
            onDragOver={(e) => handleLaneDragOver(e, key)}
            onDragLeave={(e) => handleLaneDragLeave(e, key)}
            onDrop={(e) => handleDrop(e, key)}
            className={`flex flex-col rounded-2xl border transition-all duration-150 min-h-[480px] bg-zinc-50/70 dark:bg-zinc-900/30 ${
              isCrossLaneDragTarget
                ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/30 dark:bg-blue-950/20'
                : 'border-zinc-200/80 dark:border-zinc-800'
            }`}
          >
            {/* Lane Header */}
            <div className="p-3.5 border-b border-zinc-200/60 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {icon}
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-200">
                  {config.label}
                </h3>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  {laneTasks.length}
                </span>
              </div>

              <button
                type="button"
                onClick={() => openTaskModal(undefined, key)}
                className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-white dark:hover:bg-zinc-800 rounded-lg transition-colors"
                title={`在此泳道添加任务`}
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Cards Container */}
            <div className="p-3 pb-4 flex-1 flex flex-col gap-3">
              {laneTasks.map((task) => {
                const isDropBefore = dragOverCardId === task.id && dropPosition === 'before';
                const isDropAfter = dragOverCardId === task.id && dropPosition === 'after';

                return (
                  <div
                    key={task.id}
                    ref={(el) => {
                      if (el) cardRefs.current.set(task.id, el);
                      else cardRefs.current.delete(task.id);
                    }}
                    className="relative"
                  >
                    {/* 上方插入指示线 */}
                    {isDropBefore && (
                      <div className="absolute -top-1.5 left-0 right-0 h-0.5 bg-blue-500 rounded-full z-10 pointer-events-none">
                        <div className="absolute -left-0.5 -top-1 w-2.5 h-2.5 rounded-full bg-blue-500" />
                      </div>
                    )}

                    <TaskCard
                      task={task}
                      onDragStart={handleDragStart}
                      onDragOver={(e) => handleCardDragOver(e, task.id, task.status)}
                      onDragEnd={handleDragEnd}
                    />

                    {/* 下方插入指示线 */}
                    {isDropAfter && (
                      <div className="absolute -bottom-1.5 left-0 right-0 h-0.5 bg-blue-500 rounded-full z-10 pointer-events-none">
                        <div className="absolute -left-0.5 -top-1 w-2.5 h-2.5 rounded-full bg-blue-500" />
                      </div>
                    )}
                  </div>
                );
              })}

              {laneTasks.length === 0 && (
                <div
                  onClick={() => openTaskModal(undefined, key)}
                  className={`flex-1 min-h-[140px] flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                    isCrossLaneDragTarget
                      ? 'border-blue-400 bg-blue-50/50 dark:bg-blue-950/30'
                      : 'border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700'
                  }`}
                >
                  <p className="text-xs font-medium text-zinc-400 dark:text-zinc-500">
                    {isCrossLaneDragTarget ? '释放以移至此泳道' : '暂无任务，点击添加'}
                  </p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
