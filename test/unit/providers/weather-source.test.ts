// The weather port's own functions: the instant of a forecast entry, the generic fold, and the inputs of a house with no source.
import {describe, expect, test} from 'vitest';
import {createFormatters} from '../../../src/core/i18n/format.ts';
import {englishLocale} from '../../../src/core/i18n/locale.ts';
import {defaultFold, EMPTY_INPUTS, forecastTime} from '../../../src/providers/weather-source.ts';

const formats = createFormatters(englishLocale('America/Toronto'));
const isoDay = (ms: number) => formats.isoDay(ms);

describe('forecastTime', () => {
  test('is the instant of a date text or of a number of milliseconds', () => {
    expect(forecastTime({datetime: '2026-11-07T14:00:00-05:00'})).toBe(Date.parse('2026-11-07T19:00:00Z'));
    expect(forecastTime({datetime: 1794078000000})).toBe(1794078000000);
  });
});

describe('defaultFold', () => {
  test('is one row per entry, as a generic weather entity sends them', () => {
    const rows = defaultFold(
      [
        {
          datetime: '2026-11-07T12:00:00Z',
          temperature: 8,
          templow: 1,
          condition: 'rainy',
          precipitation_probability: 70,
        },
        {datetime: '2026-11-08T12:00:00Z', temperature: 5},
      ],
      isoDay,
    );
    expect(rows).toEqual([
      {
        dayKey: '2026-11-07',
        at: Date.parse('2026-11-07T12:00:00Z'),
        hi: 8,
        lo: 1,
        condition: 'rainy',
        pop: 70,
        isTonight: false,
      },
      {
        dayKey: '2026-11-08',
        at: Date.parse('2026-11-08T12:00:00Z'),
        hi: 5,
        lo: null,
        condition: null,
        pop: null,
        isTonight: false,
      },
    ]);
  });

  test('does not merge two entries of one local day: that fold is the integration own', () => {
    const rows = defaultFold(
      [
        {datetime: '2026-11-07T15:00:00Z', temperature: 8, is_daytime: true},
        {datetime: '2026-11-08T02:00:00Z', temperature: 1, is_daytime: false},
      ],
      isoDay,
    );
    expect(rows.map(r => r.dayKey)).toEqual(['2026-11-07', '2026-11-07']);
  });

  test('an empty forecast is no rows', () => {
    expect(defaultFold([], isoDay)).toEqual([]);
  });
});

describe('EMPTY_INPUTS', () => {
  test('knows nothing, lists no alerts and takes the sun to be up', () => {
    expect(EMPTY_INPUTS.temperature).toBeNull();
    expect(EMPTY_INPUTS.alerts).toEqual([]);
    expect(EMPTY_INPUTS.isDay).toBe(true);
    expect(EMPTY_INPUTS.foldForecast).toBeUndefined();
  });
});
