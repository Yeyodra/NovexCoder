import { useEffect } from 'react';
import { useSessionSidebarStore } from '@/stores/useSessionSidebarStore';

const KEYS = {
  collapsed: 'enowx-sidebar-collapsed',
  expanded: 'enowx-sidebar-expanded',
};

export function useSidebarPersistence() {
  const collapsedProjects = useSessionSidebarStore((s) => s.collapsedProjects);
  const expandedParents = useSessionSidebarStore((s) => s.expandedParents);
  const setCollapsedProjects = useSessionSidebarStore((s) => s.setCollapsedProjects);
  const setExpandedParents = useSessionSidebarStore((s) => s.setExpandedParents);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const collapsed = localStorage.getItem(KEYS.collapsed);
      if (collapsed) setCollapsedProjects(new Set(JSON.parse(collapsed)));
      const expanded = localStorage.getItem(KEYS.expanded);
      if (expanded) setExpandedParents(new Set(JSON.parse(expanded)));
    } catch { /* ignore parse errors */ }
  }, [setCollapsedProjects, setExpandedParents]);

  // Persist to localStorage on change
  useEffect(() => {
    localStorage.setItem(KEYS.collapsed, JSON.stringify([...collapsedProjects]));
  }, [collapsedProjects]);

  useEffect(() => {
    localStorage.setItem(KEYS.expanded, JSON.stringify([...expandedParents]));
  }, [expandedParents]);
}
