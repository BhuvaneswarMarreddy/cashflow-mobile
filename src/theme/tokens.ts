import { palette } from './palette';

export type ColorScheme = 'light' | 'dark';

/**
 * Semantic colour tokens. Components name the *role* ("textSecondary"), never
 * the value, so a palette change never requires touching a screen.
 *
 * The set is deliberately three meanings wide — gold, teal-in, red-out — and
 * `warning` maps to gold rather than introducing a fourth hue. See palette.ts.
 */
export interface ThemeColors {
  background: string;
  /** Raised surface: cards, sheets, headers. */
  surface: string;
  /** Second-level surface: inputs, list wells, pressed rows. */
  surfaceAlt: string;
  /** App chrome — header and tab bar. */
  chrome: string;
  /** Chrome tint laid over the tab bar's blur, so it reads as glass, not fog. */
  chromeGlass: string;
  /** Highlight pill behind the active tab — neutral, so it never fights the gold tint. */
  tabPill: string;
  border: string;
  borderStrong: string;

  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textOnAccent: string;
  textDisabled: string;

  accent: string;
  accentMuted: string;
  accentSurface: string;

  /** Money in. Teal — never green. */
  positive: string;
  positiveSurface: string;
  /** Money out. */
  negative: string;
  negativeSurface: string;
  /** Progress toward a target. Gold, same as the accent, on purpose. */
  progress: string;

  /** Warnings wear gold. Aliased so intent reads clearly at call sites. */
  warning: string;
  warningSurface: string;
  /** Hard failures only — the same red as money-out. */
  error: string;
  errorSurface: string;
  /** Informational. Teal, reusing money-in rather than adding a hue. */
  info: string;
  infoSurface: string;

  overlay: string;
  skeleton: string;
  skeletonHighlight: string;
}

const darkColors: ThemeColors = {
  background: palette.ink[900],
  surface: palette.ink[800],
  surfaceAlt: palette.ink[700],
  chrome: palette.ink[900],
  chromeGlass: 'rgba(16, 16, 20, 0.78)',
  tabPill: 'rgba(255, 255, 255, 0.12)',
  border: palette.ink.border,
  borderStrong: '#3A3A44',

  textPrimary: palette.text.onInk,
  textSecondary: palette.text.onInkSecondary,
  textTertiary: palette.text.onInkMuted,
  textOnAccent: palette.gold.onGold,
  textDisabled: '#6A665C',

  accent: palette.gold.primary,
  accentMuted: palette.gold.secondary,
  accentSurface: 'rgba(217, 165, 33, 0.14)',

  positive: palette.money.inDark,
  positiveSurface: 'rgba(31, 162, 168, 0.14)',
  negative: palette.money.outDark,
  negativeSurface: 'rgba(229, 72, 77, 0.14)',
  progress: palette.gold.primary,

  warning: palette.gold.primary,
  warningSurface: 'rgba(217, 165, 33, 0.14)',
  error: palette.money.outDark,
  errorSurface: 'rgba(229, 72, 77, 0.14)',
  info: palette.money.inDark,
  infoSurface: 'rgba(31, 162, 168, 0.14)',

  overlay: 'rgba(0, 0, 0, 0.6)',
  skeleton: palette.ink[700],
  skeletonHighlight: palette.ink.border,
};

const lightColors: ThemeColors = {
  background: palette.paper[50],
  surface: palette.paper[0],
  surfaceAlt: palette.paper[100],
  chrome: palette.paper[50],
  chromeGlass: 'rgba(250, 247, 239, 0.82)',
  tabPill: 'rgba(23, 21, 15, 0.08)',
  border: palette.paper.border,
  borderStrong: '#D8D0BC',

  textPrimary: palette.text.onPaper,
  textSecondary: palette.text.onPaperSecondary,
  textTertiary: palette.text.onPaperMuted,
  textOnAccent: '#FFFFFF',
  textDisabled: '#9A9382',

  accent: palette.gold.primaryLight,
  accentMuted: palette.gold.secondaryLight,
  accentSurface: 'rgba(138, 109, 11, 0.10)',

  positive: palette.money.inLight,
  positiveSurface: 'rgba(23, 120, 100, 0.10)',
  negative: palette.money.outLight,
  negativeSurface: 'rgba(192, 57, 63, 0.10)',
  progress: palette.gold.primaryLight,

  warning: palette.gold.primaryLight,
  warningSurface: 'rgba(138, 109, 11, 0.10)',
  error: palette.money.outLight,
  errorSurface: 'rgba(192, 57, 63, 0.10)',
  info: palette.money.inLight,
  infoSurface: 'rgba(23, 120, 100, 0.10)',

  overlay: 'rgba(23, 21, 15, 0.45)',
  skeleton: palette.paper[100],
  skeletonHighlight: palette.paper.border,
};

export const colorsFor = (scheme: ColorScheme): ThemeColors =>
  scheme === 'dark' ? darkColors : lightColors;

/**
 * Spacing — the 4px grid, with the redesign's named steps.
 *
 * The contract is the grid itself, not this list: any multiple of 4 is on
 * scale. The web app's auditor enforces `px % 4 === 0` because a hand-written
 * allow-list accepted 36px while flagging a legitimate 96px clearance.
 *
 * Named steps from the pitch: screen edges 16, card padding 16/20,
 * gaps 12/24, section rhythm 32.
 */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  /** Screen edge + card padding. */
  lg: 16,
  /** Roomier card padding. */
  xl: 20,
  /** Between sections. */
  xxl: 24,
  xxxl: 32,
  huge: 48,
} as const;

/**
 * Radii — exactly three, per the contract. `control` for anything you press,
 * `card` for surfaces, `pill` for chips and circles. Nothing else.
 */
export const radius = {
  none: 0,
  control: 10,
  card: 16,
  pill: 999,
} as const;

export const borderWidth = {
  hairline: 1,
  thick: 2,
} as const;

/** 44 is the Apple/WCAG floor; nothing pressable goes below it. */
export const touchTarget = {
  min: 44,
  comfortable: 48,
} as const;

export type DurationKey = 'instant' | 'fast' | 'base' | 'slow';

export const duration: Record<DurationKey, number> = {
  instant: 0,
  fast: 120,
  base: 200,
  slow: 320,
};

export const opacity = {
  disabled: 0.4,
  pressed: 0.72,
} as const;

export type Spacing = keyof typeof spacing;
export type Radius = keyof typeof radius;
