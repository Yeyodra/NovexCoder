import type { Theme } from '@/types/theme';
import fieldsOfTheShireDark from './fields-of-the-shire-dark.json';
import fieldsOfTheShireLight from './fields-of-the-shire-light.json';

export const presetThemes: Theme[] = [
  fieldsOfTheShireDark as unknown as Theme,
  fieldsOfTheShireLight as unknown as Theme,
];
