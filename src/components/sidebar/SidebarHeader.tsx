import { useRef, useEffect, useCallback } from 'react';
import { Icon } from '@/components/icon/Icon';
import { useUIStore } from '@/stores/useUIStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { cn } from '@/lib/utils';
import { Project } from '@/types';

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
  const addProject = useProjectStore((s) => s.addProject);
  const setActiveProjectId = useProjectStore((s) => s.setActiveProjectId);

  useEffect(() => {
    if (isSearchOpen) {
      inputRef.current?.focus();
    }
  }, [isSearchOpen]);

  const handleOpenDirectory = useCallback(async () => {
    try {
      const selected = await open({ directory: true, multiple: false });
      if (!selected || typeof selected !== 'string') return;

      const folderName = selected.split(/[/\\]/).filter(Boolean).pop() ?? selected;
      const project = await invoke<Project>('create_project', { name: folderName, path: selected });
      addProject(project);
      setActiveProjectId(project.id);
    } catch (err) {
      console.error('Failed to open directory:', err);
    }
  }, [addProject, setActiveProjectId]);

  return (
    <div className="flex flex-col select-none flex-shrink-0">
      {/* Top row */}
      <div className="flex items-center justify-between px-2.5 py-1 min-h-8">
        {/* Left: sidebar toggle + add project */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={headerButtonClass}
            onClick={toggleLeftSidebar}
            title="Toggle sidebar"
            aria-label="Toggle sidebar"
          >
            <Icon name="layout-left" className="h-[18px] w-[18px]" />
          </button>
          <button
            type="button"
            className={headerButtonClass}
            onClick={handleOpenDirectory}
            title="Add project"
            aria-label="Add project"
          >
            <Icon name="folder-add" className="h-4 w-4" />
          </button>
        </div>

        {/* Right: search */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={cn(headerButtonClass, isSearchOpen && 'bg-accent text-foreground')}
            onClick={onToggleSearch}
            title="Search sessions"
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
