import { ActivityItem } from './types';

const STORAGE_KEY = 'enowx-sidebar-activity';
const TTL_MS = 36 * 60 * 60 * 1000; // 36 hours

export function loadActivityItems(): ActivityItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const items: ActivityItem[] = JSON.parse(raw);
    return pruneExpired(items);
  } catch {
    return [];
  }
}

export function saveActivityItems(items: ActivityItem[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function addActivityItem(items: ActivityItem[], sessionId: string, projectId: string): ActivityItem[] {
  const filtered = items.filter((i) => i.sessionId !== sessionId);
  const newItem: ActivityItem = { sessionId, projectId, timestamp: Date.now() };
  return [newItem, ...filtered];
}

export function pruneExpired(items: ActivityItem[]): ActivityItem[] {
  const cutoff = Date.now() - TTL_MS;
  return items.filter((i) => i.timestamp > cutoff);
}
