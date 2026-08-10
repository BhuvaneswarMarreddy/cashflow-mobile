import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, useColorScheme } from 'react-native';

import { usePreferences } from '@/store/preferencesStore';

import { createTheme, resolveScheme, type Theme } from './theme';
import type { ColorScheme } from './tokens';

const ThemeContext = createContext<Theme | null>(null);

/** Reads the OS "Reduce Motion" setting and keeps it current. */
const useSystemReduceMotion = (): boolean => {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotion;
};

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const mode = usePreferences((state) => state.themeMode);
  const systemScheme = useColorScheme();
  const reduceMotion = useSystemReduceMotion();

  // `useColorScheme` can also return 'unspecified'; anything that is not an
  // explicit light/dark answer is treated as "no opinion".
  const normalized: ColorScheme | null =
    systemScheme === 'dark' || systemScheme === 'light' ? systemScheme : null;

  const theme = useMemo(
    () => createTheme(resolveScheme(mode, normalized), reduceMotion),
    [mode, normalized, reduceMotion],
  );

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
};

export const useTheme = (): Theme => {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme must be used inside <ThemeProvider>');
  return theme;
};

/**
 * Builds a StyleSheet from the active theme.
 *
 * Define the factory at module scope so the memo actually holds:
 *
 *   const styles = useThemedStyles(makeStyles);
 */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [factory, theme]);
}
