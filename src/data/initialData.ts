import { TaskItem, DailyLog } from '../types';

export function createInitialSampleData(): { tasks: TaskItem[]; logs: DailyLog[] } {
  const tasks: TaskItem[] = [];

  const logs: DailyLog[] = [];

  return { tasks, logs };
}
