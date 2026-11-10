// The appearance rules (src/shell/appearance-rules.ts), over the values the legacy class's apply methods were given.
import {describe, expect, test} from 'vitest';
import {glassDensity, glassWallpaper, isDark, isLargeText, textScale} from '../../../src/shell/appearance-rules.ts';

describe('isDark', () => {
  test('dark is dark and light is light, whatever the device says', () => {
    expect(isDark('dark', false)).toBe(true);
    expect(isDark('dark', true)).toBe(true);
    expect(isDark('light', false)).toBe(false);
    expect(isDark('light', true)).toBe(false);
  });

  test('auto is exactly the device: dark when it is dark, light when it is light', () => {
    expect(isDark('auto', true)).toBe(true);
    expect(isDark('auto', false)).toBe(false);
  });

  test('a theme setting nobody wrote is light', () => {
    expect(isDark('purple', true)).toBe(false);
  });
});

describe('glassWallpaper', () => {
  test('none, and anything the popup does not offer, is glass off', () => {
    const never = () => {
      throw new Error('the sky was asked');
    };
    expect(glassWallpaper('none', never)).toBeNull();
    expect(glassWallpaper('night', never)).toBeNull();
  });

  test('a named wallpaper is shown as it is, without asking the sky', () => {
    const never = () => {
      throw new Error('the sky was asked');
    };
    for (const name of ['dawn', 'lake', 'meadow', 'ember', 'aurora', 'sand'])
      expect(glassWallpaper(name, never)).toBe(name);
  });

  test('sky shows the sky’s pick', () => {
    expect(glassWallpaper('sky', () => 'ember')).toBe('ember');
  });
});

describe('glassDensity', () => {
  test('0 is 1.8 times denser, 50 is the tuned default, 100 is 0.2 times', () => {
    expect(glassDensity(0)).toBeCloseTo(1.8, 10);
    expect(glassDensity(50)).toBeCloseTo(1, 10);
    expect(glassDensity(100)).toBeCloseTo(0.2, 10);
  });

  test('written to three decimals, as the property was', () => {
    expect(glassDensity(50).toFixed(3)).toBe('1.000');
    expect(glassDensity(33).toFixed(3)).toBe('1.272');
  });
});

describe('textScale', () => {
  test('the three fixed sizes ignore the probe', () => {
    expect(textScale('smaller', 30)).toBe(0.9);
    expect(textScale('large', 10)).toBe(1.15);
    expect(textScale('larger', 17)).toBe(1.3);
  });

  test('auto is the probe over 17 px, never below 1 and never above 1.6', () => {
    expect(textScale('auto', 17)).toBe(1);
    expect(textScale('auto', 14)).toBe(1);
    expect(textScale('auto', 21.25)).toBeCloseTo(1.25, 10);
    expect(textScale('auto', 40)).toBe(1.6);
  });

  test('a probe that reads nothing counts as the default size', () => {
    expect(textScale('auto', Number.NaN)).toBe(1);
    expect(textScale('auto', 0)).toBe(1);
  });

  test('a setting nobody wrote is 1', () => {
    expect(textScale('huge', 30)).toBe(1);
  });

  test('large text starts at 1.25', () => {
    expect(isLargeText(1.25)).toBe(true);
    expect(isLargeText(1.24)).toBe(false);
    expect(isLargeText(textScale('larger', 17))).toBe(true);
    expect(isLargeText(textScale('large', 17))).toBe(false);
  });
});
