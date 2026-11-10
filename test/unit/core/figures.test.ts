// figures.ts and the whole-number formats beside fmt.integer: the dash, the capital, the hour and the day, and the -0 that must not show.
import {describe, expect, test} from 'vitest';
import {capitalise, DASH, DAY_MS, HOUR_MS} from '../../../src/core/figures.ts';
import {createFormatters, degrees, whole} from '../../../src/core/i18n/format.ts';
import {englishLocale} from '../../../src/core/i18n/locale.ts';

const fmt = createFormatters(englishLocale('America/Toronto'));

describe('figures', () => {
  test('the dash, the hour and the day', () => {
    expect([DASH, HOUR_MS, DAY_MS]).toEqual(['–', 3_600_000, 86_400_000]);
  });

  test('capitalise raises the first letter only, and leaves an empty text empty', () => {
    expect(capitalise('mainly sunny')).toBe('Mainly sunny');
    expect(capitalise('LIGHT')).toBe('LIGHT');
    expect(capitalise('')).toBe('');
  });

  test('whole rounds, and a small negative is 0 and not -0; degrees adds the sign', () => {
    expect(whole(fmt, 4.6)).toBe('5');
    expect(whole(fmt, -0.4)).toBe('0');
    expect(degrees(fmt, -0.4)).toBe('0°');
    expect(degrees(fmt, -12.5)).toBe('-12°');
  });
});
