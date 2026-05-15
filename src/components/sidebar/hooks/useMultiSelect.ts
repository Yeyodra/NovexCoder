import { useCallback } from 'react';
import { useSessionSidebarStore } from '@/stores/useSessionSidebarStore';

export function useMultiSelect() {
  const selectionMode = useSessionSidebarStore((s) => s.selectionMode);
  const selectedSessionIds = useSessionSidebarStore((s) => s.selectedSessionIds);
  const toggleSessionSelected = useSessionSidebarStore((s) => s.toggleSessionSelected);
  const clearSelection = useSessionSidebarStore((s) => s.clearSelection);
  const selectAll = useSessionSidebarStore((s) => s.selectAll);
  const setSelectionMode = useSessionSidebarStore((s) => s.setSelectionMode);

  const toggleSelected = useCallback((id: string) => {
    toggleSessionSelected(id);
  }, [toggleSessionSelected]);

  const setRange = useCallback((anchorId: string, targetId: string, orderedIds: string[]) => {
    const anchorIdx = orderedIds.indexOf(anchorId);
    const targetIdx = orderedIds.indexOf(targetId);
    if (anchorIdx === -1 || targetIdx === -1) return;

    const start = Math.min(anchorIdx, targetIdx);
    const end = Math.max(anchorIdx, targetIdx);
    const rangeIds = orderedIds.slice(start, end + 1);
    selectAll(rangeIds);
  }, [selectAll]);

  const handleClick = useCallback((id: string, event: React.MouseEvent, orderedIds: string[]) => {
    if (!selectionMode) return false;

    if (event.shiftKey && selectedSessionIds.size > 0) {
      // Get the last selected as anchor
      const anchor = Array.from(selectedSessionIds).pop()!;
      setRange(anchor, id, orderedIds);
    } else {
      toggleSelected(id);
    }
    return true; // consumed the click
  }, [selectionMode, selectedSessionIds, setRange, toggleSelected]);

  return {
    selectionMode,
    selectedSessionIds,
    selectedCount: selectedSessionIds.size,
    toggleSelected,
    setRange,
    handleClick,
    clearSelection,
    selectAll,
    setSelectionMode,
  };
}
