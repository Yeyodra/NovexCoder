import { useState, useCallback } from 'react';
import {
  DragStartEvent,
  DragOverEvent,
  DragEndEvent,
  DragCancelEvent,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

type DragItemType = 'project' | 'session';

interface UseSessionDnDProps {
  onReorderProjects: (projectIds: string[]) => void;
  onReorderSessions: (sessionIds: string[]) => void;
  onMoveSessionToFolder: (sessionId: string, folderId: string | null) => void;
  projectIds: string[];
  sessionIds: string[];
}

export function useSessionDnD({
  onReorderProjects,
  onReorderSessions,
  onMoveSessionToFolder,
  projectIds,
  sessionIds,
}: UseSessionDnDProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<DragItemType | null>(null);
  const [overFolderId, setOverFolderId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    if (projectIds.includes(active.id as string)) {
      setActiveType('project');
    } else {
      setActiveType('session');
    }
  }, [projectIds]);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over } = event;
    if (over && (over.id as string).startsWith('folder-')) {
      setOverFolderId((over.id as string).replace('folder-', ''));
    } else {
      setOverFolderId(null);
    }
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setActiveType(null);
    setOverFolderId(null);

    if (!over || active.id === over.id) return;

    if (activeType === 'project') {
      const oldIndex = projectIds.indexOf(active.id as string);
      const newIndex = projectIds.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        const newOrder = arrayMove(projectIds, oldIndex, newIndex);
        onReorderProjects(newOrder);
      }
    } else if (activeType === 'session') {
      const overId = over.id as string;
      if (overId.startsWith('folder-')) {
        const folderId = overId.replace('folder-', '');
        onMoveSessionToFolder(active.id as string, folderId);
      } else {
        const oldIndex = sessionIds.indexOf(active.id as string);
        const newIndex = sessionIds.indexOf(overId);
        if (oldIndex !== -1 && newIndex !== -1) {
          const newOrder = arrayMove(sessionIds, oldIndex, newIndex);
          onReorderSessions(newOrder);
        }
      }
    }
  }, [activeType, projectIds, sessionIds, onReorderProjects, onReorderSessions, onMoveSessionToFolder]);

  const handleDragCancel = useCallback((_event: DragCancelEvent) => {
    setActiveId(null);
    setActiveType(null);
    setOverFolderId(null);
  }, []);

  return {
    activeId,
    activeType,
    overFolderId,
    sensors,
    handleDragStart,
    handleDragOver,
    handleDragEnd,
    handleDragCancel,
  };
}
