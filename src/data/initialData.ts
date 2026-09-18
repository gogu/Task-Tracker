import { TaskItem, DailyLog } from '../types';
import { getTodayString, addDays } from '../utils/date';

export function createInitialSampleData(): { tasks: TaskItem[]; logs: DailyLog[] } {
  const today = getTodayString();
  const d = (offset: number) => addDays(today, offset);

  const tasks: TaskItem[] = [];

  const logs: DailyLog[] = [];

  return { tasks, logs };
}
