import { useRef, useEffect, useCallback } from 'react';
import { Icon } from '@/components/icon/Icon';
import { useUIStore } from '@/stores/useUIStore';
import { useSessionStore } from '@/stores/useSessionStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { cn } from '@/lib/utils';
import { Project, Session } from '@/types';

interface SidebarHeaderProps {
  searchQuery: string;
  isSearchOpen: boolean;
  onSearchChange: (query: string) => void;
  onToggleSearch: () => void;
}

const headerButtonClass =
  'h-7 w-7 rounded-md flex items-center justify-center hover:bg-accent transition-colors text-muted-foreground hover:text-foreground';

export function SidebarHeader({
  searchQuery,
  isSearchOpen,
  onSearchChange,
  onToggleSearch,
}: SidebarHeaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const toggleLeftSidebar = useUIStore((s) => s.toggleLeftSidebar);
  const addSession = useSessionStore((s) => s.addSession);
  const setActiveSessionId = useSessionStore((s) => s.setActiveSessionId);
  const activeProjectId = useProjectStore((s) => s.activeProjectId);

  useEffect(() => {
    if (isSearchOpen) {
      inputRef.current?.focus();
    }
  }, [isSearchOpen]);

  const addProject = useProjectStore((s) => s.addProject);
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);

  const handleNewSession = useCallback(async () => {
    if (!activeProjectId) {
      // No project exists — trigger project creation flow
      try {
        const selected = await open({ directory: true, multiple: false });
        if (!selected || typeof selected !== 'string') return;

        const folderName = selected.split(/[/\\]/).filter(Boolean).pop() ?? selected;
        const project = await invoke<Project>('create_project', { name: folderName, path: selected });
        addProject(project);
        setActiveProjectId(project.id);

        const session = await invoke<Session>('create_session', { projectId: project.id });
        addSession({
          id: session.id,
          title: session.title,
          projectId: project.id,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          isPinned: false,
          isArchived: false,
          folderId: null,
          parentSessionId: null,
          sortOrder: 0,
        });
        setActiveSessionId(session.id);
      } catch (err) {
        console.error('Failed to create project:', err);
      }
      return;
    }
    try {
      const session = await invoke<{ id: string; title: string; createdAt: string; updatedAt: string }>('create_session', {
        projectId: activeProjectId,
      });
      addSession({
        id: session.id,
        title: session.title,
        projectId: activeProjectId,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        isPinned: false,
        isArchived: false,
        folderId: null,
        parentSessionId: null,
        sortOrder: 0,
      });
      setActiveSessionId(session.id);
    } catch (err) {
      console.error('Failed to create session:', err);
    }
  }, [activeProjectId, addSession, setActiveSessionId, addProject, setActiveProjectId]);

  return (
    <div className="flex flex-col">
      {/* Top row */}
      <div className="flex items-center justify-between px-3 py-2 h-12">
        {/* Left: sidebar collapse */}
        <button
          type="button"
          className={headerButtonClass}
          onClick={toggleLeftSidebar}
          aria-label="Toggle sidebar"
        >
          <Icon name="menu-fold-2" className="h-4 w-4" />
        </button>

        {/* Right: new session + search */}
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            className={headerButtonClass}
            onClick={handleNewSession}
            aria-label="New session"
          >
            <Icon name="add" className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={cn(headerButtonClass, isSearchOpen && 'bg-accent text-foreground')}
            onClick={onToggleSearch}
            aria-label="Search sessions"
          >
            <Icon name="search" className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search input with animation */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200 ease-in-out',
          isSearchOpen ? 'max-h-12 opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <div className="px-3 pb-2">
          <div className="relative">
            <Icon
              name="search"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
            />
            <input
              ref={inputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search sessions..."
              className="w-full h-8 rounded-md border border-border bg-background pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
