import { useContext } from 'react';
import { ThemeSystemContext } from './theme-system-context';
import type { ThemeContextValue } from './theme-system-context';

export function useThemeSystem(): ThemeContextValue {
  const context = useContext(ThemeSystemContext);
  if (!context) {
    throw new Error('useThemeSystem must be used within a ThemeSystemProvider');
  }
  return context;
}
