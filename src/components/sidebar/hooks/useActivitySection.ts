import { useState, useEffect, useCallback } from 'react';
import { ActivityItem } from '../types';
import { loadActivityItems, saveActivityItems, addActivityItem, pruneExpired } from '../activitySections';

export function useActivitySection() {
  const [items, setItems] = useState<ActivityItem[]>([]);

  useEffect(() => {
    setItems(loadActivityItems());
  }, []);

  const addActivity = useCallback((sessionId: string, projectId: string) => {
    setItems((prev) => {
      const next = addActivityItem(prev, sessionId, projectId);
      saveActivityItems(next);
      return next;
    });
  }, []);

  const prune = useCallback(() => {
    setItems((prev) => {
      const next = pruneExpired(prev);
      saveActivityItems(next);
      return next;
    });
  }, []);

  return { items, addActivity, prune };
}
