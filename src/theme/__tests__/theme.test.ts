import { createTheme, resolveScheme } from '../theme';
import { colorsFor } from '../tokens';

/** WCAG 2.x relative luminance and contrast, shared by the elevation tests. */
const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const parseHex = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (rgb: number[]) =>
  0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2]);
const ratio = (a: number[], b: number[]) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const ratioOf = (a: string, b: string) => ratio(parseHex(a), parseHex(b));

describe('resolveScheme', () => {
  it('follows the OS when set to system', () => {
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', 'dark')).toBe('dark');
  });

  it('overrides the OS when the user picked a scheme', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('falls back to dark when the OS has no opinion', () => {
    expect(resolveScheme('system', null)).toBe('dark');
  });
});

describe('createTheme', () => {
  it('collapses every animation to zero under reduced motion', () => {
    const theme = createTheme('dark', true);
    expect(Object.values(theme.duration).every((value) => value === 0)).toBe(true);
    expect(theme.reduceMotion).toBe(true);
  });

  it('keeps normal durations otherwise', () => {
    expect(createTheme('dark', false).duration.base).toBe(200);
  });

  it('uses a border for depth on dark, where a shadow is invisible', () => {
    const dark = createTheme('dark').elevation(2);
    // Width is the rung (see "dark elevation" below), so this asserts the
    // MECHANISM — an edge, never a shadow — not a particular thickness.
    expect(dark.borderWidth).toBeGreaterThan(0);
    expect(dark.shadowOpacity).toBeUndefined();
  });

  it('returns no elevation styling at level zero', () => {
    expect(createTheme('light').elevation(0)).toEqual({});
  });
});

describe('colour tokens', () => {
  it('defines every semantic role in both schemes', () => {
    const dark = colorsFor('dark');
    const light = colorsFor('light');
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    expect(
      Object.values(light).every((value) => typeof value === 'string' && value.length > 0),
    ).toBe(true);
  });

  it('does not simply invert — light mode is warm paper, not white', () => {
    expect(colorsFor('light').background).toBe('#FAF7EF');
    expect(colorsFor('dark').background).not.toBe('#000000');
  });

  /**
   * These four values are the contract with the web app's `globals.css`
   * (UI-100). If they drift, the two clients stop looking like one product —
   * which is exactly the defect this port existed to fix.
   */
  it('matches the finalized web tokens exactly', () => {
    expect(colorsFor('dark').background).toBe('#101014');
    expect(colorsFor('dark').accent).toBe('#D9A521');
    expect(colorsFor('light').accent).toBe('#8A6D0B');
  });

  it('uses teal for money-in, never green', () => {
    // The retired red/green pair measured deutan ΔE 2.4 — indistinguishable.
    expect(colorsFor('dark').positive).toBe('#1FA2A8');
    expect(colorsFor('light').positive).toBe('#177864');
  });

  it('gives warnings gold rather than a fourth hue', () => {
    expect(colorsFor('dark').warning).toBe(colorsFor('dark').accent);
    expect(colorsFor('light').warning).toBe(colorsFor('light').accent);
  });
});

/**
 * Depth on ink is an edge, not a shadow. Before this, `shadowFor` returned the
 * same hairline for every level, so `elevation(2)` and `elevation(3)` were
 * pixel-identical and nothing in dark mode could look more raised than
 * anything else — the FAB's fan of actions read as flat against the scrim.
 */
describe('dark elevation', () => {
  const dark = createTheme('dark');

  it('actually scales with level', () => {
    const one = dark.elevation(1);
    const two = dark.elevation(2);

    expect(one).not.toEqual(two);
    expect(two.borderWidth).toBeGreaterThan(one.borderWidth as number);
    // Level 3 has no dark consumer — the FAB's gold toggle is its only caller
    // and opts out, its fill already being 8.46:1. Deliberately equal to 2
    // rather than an invented rung nobody renders.
    expect(dark.elevation(3)).toEqual(two);
  });

  /**
   * Level 1 is EVERY Card. It used `border`, which is 1.33:1 against the page
   * — the literal "everything blends into the background". An outline is what
   * WCAG 1.4.11 measures, so it has to clear 3:1 against the plane it sits on,
   * and cards sit on `background`, not on the scrim.
   */
  it('gives cards an outline that clears 3:1 against the page', () => {
    expect(dark.elevation(1).borderColor).toBe(colorsFor('dark').borderStrong);
    expect(ratioOf(colorsFor('dark').borderStrong, colorsFor('dark').background)).toBeGreaterThanOrEqual(3);
  });

  it('leaves level 0 flat', () => {
    expect(dark.elevation(0)).toEqual({});
  });

  /**
   * The scrim plane is COMPOSITED from `overlay` over `background`, not
   * hardcoded — otherwise raising the scrim's opacity would darken the backdrop
   * and quietly push this boundary back under the floor with the test still
   * green. `borderStrong` is the only thing giving the FAB's fan of actions an
   * edge there, so it has to clear WCAG 1.4.11's 3:1 for component boundaries.
   * The edge that actually shipped before this (`border`) scored 1.42:1 — the
   * measured cause of "the FAB blends into the background".
   */
  it('keeps borderStrong above the 3:1 boundary floor on the scrim plane', () => {
    const colors = colorsFor('dark');
    const [, r, g, b, alpha] = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(
      colors.overlay,
    ) as RegExpExecArray;
    const a = Number(alpha);
    const scrim = parseHex(colors.background).map((base, i) =>
      Math.round(a * Number([r, g, b][i]) + (1 - a) * base),
    );

    expect(ratio(parseHex(colors.borderStrong), scrim)).toBeGreaterThanOrEqual(3);
  });
});
