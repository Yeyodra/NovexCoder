import { useState, useEffect, useMemo } from 'react';
import { Session } from '@/types';

export function useSessionSearch(sessions: Session[], query: string) {
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { filteredSessions, matchCount } = useMemo(() => {
    if (!debouncedQuery.trim()) {
      return { filteredSessions: sessions, matchCount: 0 };
    }
    const lower = debouncedQuery.toLowerCase();
    const filtered = sessions.filter((s) => s.title.toLowerCase().includes(lower));
    return { filteredSessions: filtered, matchCount: filtered.length };
  }, [sessions, debouncedQuery]);

  return { filteredSessions, matchCount, debouncedQuery };
}
