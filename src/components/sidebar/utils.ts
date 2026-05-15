import { Session } from '@/types';
import { SessionNode } from './types';

/**
 * Format a date into compact relative form: 3m, 2h, 3d, 1w, 2mo, 1y
 */
export function formatCompactDate(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return 'now';
  if (diffMin < 60) return `${diffMin}m`;
  if (diffHr < 24) return `${diffHr}h`;
  if (diffDay < 7) return `${diffDay}d`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}w`;
  if (diffDay < 365) return `${Math.floor(diffDay / 30)}mo`;
  return `${Math.floor(diffDay / 365)}y`;
}

/**
 * Format a date for session display: "Today", "Yesterday", or "MMM D"
 */
export function formatSessionDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (dateDay.getTime() === today.getTime()) return 'Today';
  if (dateDay.getTime() === yesterday.getTime()) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Normalize a file path for display (extract last segment or shorten)
 */
export function normalizePath(path: string): string {
  const segments = path.replace(/\\/g, '/').split('/').filter(Boolean);
  return segments[segments.length - 1] || path;
}

/**
 * Render highlighted text by wrapping matched portions in <mark> tags.
 * Returns an array of React-renderable elements.
 */
export function getHighlightRanges(text: string, query: string): { text: string; highlighted: boolean }[] {
  if (!query.trim()) return [{ text, highlighted: false }];

  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const ranges: { text: string; highlighted: boolean }[] = [];
  let lastIndex = 0;

  let index = lowerText.indexOf(lowerQuery);
  while (index !== -1) {
    if (index > lastIndex) {
      ranges.push({ text: text.slice(lastIndex, index), highlighted: false });
    }
    ranges.push({ text: text.slice(index, index + query.length), highlighted: true });
    lastIndex = index + query.length;
    index = lowerText.indexOf(lowerQuery, lastIndex);
  }

  if (lastIndex < text.length) {
    ranges.push({ text: text.slice(lastIndex), highlighted: false });
  }

  return ranges.length > 0 ? ranges : [{ text, highlighted: false }];
}

/**
 * Build a tree of SessionNodes from flat sessions array.
 * Sessions with parentSessionId become children of their parent.
 */
export function buildSessionTree(sessions: Session[]): SessionNode[] {
  const nodeMap = new Map<string, SessionNode>();
  const roots: SessionNode[] = [];

  // Create nodes
  for (const session of sessions) {
    nodeMap.set(session.id, { ...session, children: [], depth: 0 });
  }

  // Build tree
  for (const session of sessions) {
    const node = nodeMap.get(session.id)!;
    if (session.parentSessionId && nodeMap.has(session.parentSessionId)) {
      const parent = nodeMap.get(session.parentSessionId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Sort by sortOrder
  const sortByOrder = (a: SessionNode, b: SessionNode) => a.sortOrder - b.sortOrder;
  roots.sort(sortByOrder);
  for (const node of nodeMap.values()) {
    node.children.sort(sortByOrder);
  }

  return roots;
}
