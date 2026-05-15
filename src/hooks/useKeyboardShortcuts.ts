import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { SHORTCUTS, eventMatchesShortcut } from '@/lib/shortcuts';
import { useUIStore } from '@/stores/useUIStore';
import { useProjectStore } from '@/stores/useProjectStore';

/**
 * Global keyboard shortcut handler.
 * Call once in AppShell to register all app-wide shortcuts.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't capture shortcuts when typing in inputs/textareas
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      // Escape should always work, even in inputs
      if (eventMatchesShortcut(e, SHORTCUTS.CLOSE_PANEL)) {
        const state = useUIStore.getState();
        if (state.isCommandPaletteOpen) {
          e.preventDefault();
          state.setCommandPaletteOpen(false);
        }
        return;
      }

      // Skip other shortcuts if user is typing in an input
      if (isInput) return;

      if (eventMatchesShortcut(e, SHORTCUTS.COMMAND_PALETTE)) {
        e.preventDefault();
        useUIStore.getState().toggleCommandPalette();
        return;
      }

      if (eventMatchesShortcut(e, SHORTCUTS.TOGGLE_SIDEBAR)) {
        e.preventDefault();
        useUIStore.getState().toggleLeftSidebar();
        return;
      }

      if (eventMatchesShortcut(e, SHORTCUTS.NEW_SESSION)) {
        e.preventDefault();
        const projectId = useProjectStore.getState().activeProjectId;
        if (projectId) {
          invoke('create_session', { projectId }).catch(console.error);
        }
        return;
      }

      if (eventMatchesShortcut(e, SHORTCUTS.TOGGLE_THEME)) {
        e.preventDefault();
        useUIStore.getState().toggleTheme();
        return;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}
