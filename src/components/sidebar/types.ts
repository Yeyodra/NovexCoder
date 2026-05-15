import { Session } from '@/types';

export type DisplayMode = 'default' | 'minimal';

export interface SessionNode extends Session {
  children: SessionNode[];
  depth: number;
}

export interface ActivityItem {
  sessionId: string;
  projectId: string;
  timestamp: number; // Date.now() when activity occurred
}

export interface GroupSearchData {
  filteredSessions: Session[];
  matchCount: number;
}
