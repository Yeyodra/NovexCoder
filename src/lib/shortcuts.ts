export interface ShortcutDef {
  key: string;
  meta?: boolean;
  shift?: boolean;
  alt?: boolean;
}

export const SHORTCUTS = {
  COMMAND_PALETTE: { key: 'p', meta: true },
  TOGGLE_SIDEBAR: { key: 'b', meta: true },
  NEW_SESSION: { key: 'n', meta: true },
  TOGGLE_THEME: { key: 't', meta: true, shift: true },
  CLOSE_PANEL: { key: 'Escape' },
} as const satisfies Record<string, ShortcutDef>;

export type ShortcutId = keyof typeof SHORTCUTS;

/**
 * Check if a keyboard event matches a shortcut definition.
 * Handles both Cmd (Mac) and Ctrl (Windows/Linux) via metaKey || ctrlKey.
 */
export function eventMatchesShortcut(e: KeyboardEvent, shortcut: ShortcutDef): boolean {
  const modPressed = e.metaKey || e.ctrlKey;
  const modRequired = shortcut.meta ?? false;
  const shiftRequired = shortcut.shift ?? false;
  const altRequired = shortcut.alt ?? false;

  if (modRequired !== modPressed) return false;
  if (shiftRequired !== e.shiftKey) return false;
  if (altRequired !== e.altKey) return false;

  return e.key.toLowerCase() === shortcut.key.toLowerCase();
}
