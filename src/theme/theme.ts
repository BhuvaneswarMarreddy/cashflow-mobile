import { Platform, type ViewStyle } from 'react-native';

import {
  borderWidth,
  colorsFor,
  duration,
  opacity,
  radius,
  spacing,
  touchTarget,
  type ColorScheme,
  type ThemeColors,
} from './tokens';
import { maxFontSizeMultiplier, typography } from './typography';

export type ThemeMode = 'system' | 'light' | 'dark';

export type ElevationLevel = 0 | 1 | 2 | 3;

export interface Theme {
  scheme: ColorScheme;
  colors: ThemeColors;
  spacing: typeof spacing;
  radius: typeof radius;
  borderWidth: typeof borderWidth;
  touchTarget: typeof touchTarget;
  opacity: typeof opacity;
  typography: typeof typography;
  maxFontSizeMultiplier: typeof maxFontSizeMultiplier;
  /** Animation durations — all zero when the OS asks for reduced motion. */
  duration: typeof duration;
  reduceMotion: boolean;
  /**
   * Depth. On paper it is a soft shadow; on ink a shadow is invisible, so depth
   * is carried by a lighter surface plus a hairline instead.
   */
  elevation: (level: ElevationLevel) => ViewStyle;
}

const shadowFor = (scheme: ColorScheme, level: ElevationLevel, colors: ThemeColors): ViewStyle => {
  if (level === 0) return {};
  if (scheme === 'dark') {
    // Depth on ink is a lighter edge rather than a shadow, so the edge has to
    // scale with `level` the way the shadow does on paper. Returning one
    // hairline for every level made elevation(2) and elevation(3) pixel
    // identical — nothing in dark mode could look more raised than anything
    // else, which is why the FAB's fan of actions read as flat against the
    // scrim while its gold toggle appeared to "pop" purely from its fill.
    if (level === 1) return { borderWidth: borderWidth.hairline, borderColor: colors.border };
    if (level === 2) return { borderWidth: borderWidth.hairline, borderColor: colors.borderStrong };
    return { borderWidth: borderWidth.thick, borderColor: colors.borderStrong };
  }
  const depth = { 1: 2, 2: 6, 3: 14 }[level];
  return Platform.select<ViewStyle>({
    android: { elevation: level * 2 },
    default: {
      shadowColor: '#000000',
      shadowOpacity: 0.04 + level * 0.02,
      shadowRadius: depth,
      shadowOffset: { width: 0, height: Math.ceil(depth / 3) },
    },
  }) as ViewStyle;
};

const zeroDurations: typeof duration = { instant: 0, fast: 0, base: 0, slow: 0 };

export const createTheme = (scheme: ColorScheme, reduceMotion = false): Theme => {
  const colors = colorsFor(scheme);
  return {
    scheme,
    colors,
    spacing,
    radius,
    borderWidth,
    touchTarget,
    opacity,
    typography,
    maxFontSizeMultiplier,
    duration: reduceMotion ? zeroDurations : duration,
    reduceMotion,
    elevation: (level) => shadowFor(scheme, level, colors),
  };
};

/** Resolves the user's preference against the OS setting. */
export const resolveScheme = (mode: ThemeMode, systemScheme: ColorScheme | null): ColorScheme => {
  if (mode === 'system') return systemScheme ?? 'dark';
  return mode;
};
