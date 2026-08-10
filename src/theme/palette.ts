/**
 * Raw colour values — the ONLY file in the app allowed to contain hex literals.
 *
 * These are not "inspired by" the web app; they are copied verbatim from
 * `cashflow-forecast/src/app/globals.css` (UI-100, Midnight Ledger / Paper &
 * Gold), which is the finalized redesign and is pinned there by
 * `design-tokens.test.ts`. Two clients drifting apart on colour is how one
 * product starts looking like two.
 *
 * Two rules travel with these values:
 *
 *  1. **Money-in is TEAL, never green.** The old red/green pair measured
 *     deutan ΔE 2.4 — indistinguishable to a red-green colourblind viewer.
 *  2. **Warnings wear gold, not a fourth hue.** The palette is deliberately
 *     three meanings wide: gold = brand/progress, teal = in, red = out.
 */

const ink = {
  /** --background */
  900: '#101014',
  /** --background-secondary */
  800: '#1A1A20',
  /** --background-tertiary */
  700: '#22222A',
  /** --border-color */
  border: '#2A2A32',
} as const;

const paper = {
  /** --background */
  50: '#FAF7EF',
  /** --background-secondary */
  0: '#FFFFFF',
  /** --background-tertiary */
  100: '#F0EBDD',
  /** --border-color */
  border: '#E7E1D2',
} as const;

const gold = {
  /** --accent-primary (dark) */
  primary: '#D9A521',
  /** --accent-secondary (dark) */
  secondary: '#B98D18',
  /** --accent-tertiary */
  tertiary: '#E7C55C',
  /** --accent-primary (light) — deepened for contrast on paper */
  primaryLight: '#8A6D0B',
  /** --accent-secondary (light) */
  secondaryLight: '#745B09',
  /** Text drawn on a filled gold surface. */
  onGold: '#101014',
} as const;

const money = {
  /** --money-in (dark) */
  inDark: '#1FA2A8',
  /** --money-in (light) */
  inLight: '#177864',
  /** --money-out (dark) */
  outDark: '#E5484D',
  /** --money-out (light) */
  outLight: '#C0393F',
} as const;

const text = {
  /** --foreground (dark) */
  onInk: '#F2EFE6',
  /** --foreground-secondary (dark) */
  onInkSecondary: '#B9B4A5',
  /** --foreground-muted (dark) — ~5:1 on the ink background, WCAG 1.4.3 */
  onInkMuted: '#948F82',
  /** --foreground (light) */
  onPaper: '#17150F',
  /** --foreground-secondary (light) */
  onPaperSecondary: '#5C574A',
  /** --foreground-muted (light) */
  onPaperMuted: '#6E695C',
} as const;

export const palette = { ink, paper, gold, money, text } as const;
