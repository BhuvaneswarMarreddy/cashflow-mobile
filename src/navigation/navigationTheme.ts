import { DarkTheme, DefaultTheme, type Theme as NavigationTheme } from '@react-navigation/native';

import type { Theme } from '@/theme';

/**
 * Bridges the app theme into React Navigation.
 *
 * Without this the navigator paints its own default background during
 * transitions, which shows up as a white flash between screens in dark mode.
 */
export const toNavigationTheme = (theme: Theme): NavigationTheme => {
  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: theme.scheme === 'dark',
    colors: {
      ...base.colors,
      primary: theme.colors.accent,
      background: theme.colors.background,
      card: theme.colors.chrome,
      text: theme.colors.textPrimary,
      border: theme.colors.border,
      notification: theme.colors.accent,
    },
  };
};
