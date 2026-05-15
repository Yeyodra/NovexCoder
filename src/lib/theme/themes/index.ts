import type { Theme } from '@/types/theme';
import fieldsOfTheShireDark from './fields-of-the-shire-dark.json';
import fieldsOfTheShireLight from './fields-of-the-shire-light.json';

export const darkTheme = fieldsOfTheShireDark as unknown as Theme;
export const lightTheme = fieldsOfTheShireLight as unknown as Theme;

export const DEFAULT_DARK_THEME_ID = 'openchamber-dark' as const;
export const DEFAULT_LIGHT_THEME_ID = 'openchamber-light' as const;

export const themes: Theme[] = [
  darkTheme,
  lightTheme,
];

export function getThemeById(id: string): Theme | undefined {
  return themes.find(theme => theme.metadata.id === id);
}

export function getDefaultTheme(prefersDark: boolean): Theme {
  const defaultId = prefersDark ? DEFAULT_DARK_THEME_ID : DEFAULT_LIGHT_THEME_ID;
  const defaultTheme = getThemeById(defaultId);
  if (defaultTheme) {
    return defaultTheme;
  }
  return prefersDark ? darkTheme : lightTheme;
}
