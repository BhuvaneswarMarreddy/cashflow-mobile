import { Platform, type TextStyle } from 'react-native';

/**
 * Type scale — the redesign's ruler: a serif hero at 28/40 stepping down to
 * 11px labels.
 *
 * **Serif carries hero numbers and screen titles**, sans carries everything
 * else. That split is the single strongest signal that this is the same
 * product as the web app; it is `--font-display` there
 * ("Iowan Old Style", Palatino, Georgia) and the same stack here.
 *
 * Money uses tabular figures so columns of digits do not shimmy as values
 * change.
 */

export type TypographyVariant =
  | 'display'
  | 'heroNumber'
  | 'heading'
  | 'sectionHeading'
  | 'body'
  | 'bodyStrong'
  | 'secondary'
  | 'caption'
  | 'amount'
  | 'amountSmall'
  | 'button'
  | 'mono';

/** Matches `--font-display` in the web app; all are system faces, no bundling. */
const serif = Platform.select({
  ios: 'Iowan Old Style',
  android: 'serif',
  default: 'Georgia',
});

const systemMono = Platform.select({
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
});

const tabular: TextStyle = { fontVariant: ['tabular-nums'] };

export const typography: Record<TypographyVariant, TextStyle> = {
  /** The one number a screen is about. */
  display: { fontFamily: serif, fontSize: 40, lineHeight: 46, letterSpacing: -0.5 },
  heroNumber: {
    fontFamily: serif,
    fontSize: 36,
    lineHeight: 42,
    letterSpacing: -0.4,
    ...tabular,
  },
  /** Screen titles. */
  heading: { fontFamily: serif, fontSize: 28, lineHeight: 34, letterSpacing: -0.2 },

  /** 11px labels — the bottom of the ruler. */
  sectionHeading: { fontSize: 11, lineHeight: 16, fontWeight: '700', letterSpacing: 0.8 },

  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  secondary: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500' },

  /** Secondary money — list rows, card figures. Sans, so the hero stays alone. */
  amount: { fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.3, ...tabular },
  amountSmall: { fontSize: 17, lineHeight: 22, fontWeight: '600', letterSpacing: -0.1, ...tabular },

  button: { fontSize: 16, lineHeight: 20, fontWeight: '600', letterSpacing: 0.1 },
  mono: { fontSize: 12, lineHeight: 17, fontFamily: systemMono },
};

/**
 * Per-variant ceiling on OS font scaling.
 *
 * Body text scales freely; the serif hero is capped, because a 40pt number at
 * 3.1x pushes the figure the screen exists to show off the edge. Capping the
 * largest styles keeps the layout intact without flattening accessibility.
 */
export const maxFontSizeMultiplier: Record<TypographyVariant, number> = {
  display: 1.3,
  heroNumber: 1.35,
  heading: 1.4,
  sectionHeading: 1.6,
  body: 2,
  bodyStrong: 2,
  secondary: 2,
  caption: 2,
  amount: 1.5,
  amountSmall: 1.6,
  button: 1.6,
  mono: 1.4,
};
