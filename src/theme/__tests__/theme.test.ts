import { createTheme, resolveScheme } from '../theme';
import { colorsFor } from '../tokens';

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

  it('uses a hairline border for depth on dark, where a shadow is invisible', () => {
    const dark = createTheme('dark').elevation(2);
    expect(dark.borderWidth).toBe(1);
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
    const three = dark.elevation(3);

    expect(one).not.toEqual(two);
    expect(two).not.toEqual(three);
    expect(three.borderWidth).toBeGreaterThan(two.borderWidth as number);
  });

  it('leaves level 0 flat', () => {
    expect(dark.elevation(0)).toEqual({});
  });

  /**
   * A 60% black scrim composites `background` down to ~#060608. `borderStrong`
   * is the only thing giving the FAB's actions a boundary there, so it has to
   * clear the 3:1 WCAG 1.4.11 floor against that composite — 1.42:1 was the
   * measured cause of "the FAB blends into the background".
   */
  it('keeps borderStrong above the 3:1 boundary floor on the scrim plane', () => {
    const channel = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };

    // background #101014 under rgba(0,0,0,0.6)
    const scrim = '#060608';
    expect(ratio(colorsFor('dark').borderStrong, scrim)).toBeGreaterThanOrEqual(3);
  });
});
