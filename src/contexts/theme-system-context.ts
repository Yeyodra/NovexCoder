import { createContext } from 'react';
import type { Theme, ThemeMetadata, ThemeMode } from '@/types/theme';

export interface ThemeContextValue {
  currentTheme: Theme;
  availableThemes: ThemeMetadata[];
  setTheme: (themeId: string) => void;
  isDark: boolean;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
}

export const ThemeSystemContext = createContext<ThemeContextValue | undefined>(undefined);
