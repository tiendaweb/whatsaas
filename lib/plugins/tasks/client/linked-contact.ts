import type { TaskDetails } from './types';

export function getLinkedContactIds(taskId: number, details?: TaskDetails): number[] {
  const ids = new Set<number>();
  for (const rel of details?.relations ?? []) {
    if (rel.sourceType === 'contact' && rel.targetType === 'task' && rel.targetId === taskId) {
      ids.add(rel.sourceId);
    }
    if (rel.targetType === 'contact' && rel.sourceType === 'task' && rel.sourceId === taskId) {
      ids.add(rel.targetId);
    }
  }
  return Array.from(ids);
}

export function getPrimaryLinkedContactId(taskId: number, details?: TaskDetails): number | null {
  const ids = getLinkedContactIds(taskId, details);
  return ids[0] ?? null;
}