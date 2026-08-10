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
