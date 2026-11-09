// weatherModel's forecast half: the card's four days, the hour strip and its chart series, and the days as range bars,
// from Environment Canada's twice-daily forecast and from a generic entity's, at the afternoon instant (a Saturday, in Toronto).
import {describe, expect, test} from 'vitest';
import {readWeather} from '../../../../src/features/weather/inputs.ts';
import {resolveConfig} from '../../../../src/core/config.ts';
import type {ForecastEntry} from '../../../../src/providers/weather-source.ts';
import {REFERENCE_MS} from '../../../houses/clock.mjs';
import {entity} from '../../fake-hass.ts';
import {fullHouse, inEnglish, modelFromInputs, modelOf, NO_FORECAST} from './support.ts';

// the forecast Environment Canada sends on a Saturday afternoon: tonight first (a night entry, no day entry), then a day
// and a night entry for each day
const day = (iso: string, temperature: number, condition: string, pop?: number): ForecastEntry => ({
  datetime: `${iso}T06:00:00-05:00`,
  temperature,
  condition,
  is_daytime: true,
  precipitation_probability: pop,
});
const night = (iso: string, temperature: number, condition: string, pop?: number): ForecastEntry => ({
  datetime: `${iso}T18:00:00-05:00`,
  temperature,
  condition,
  is_daytime: false,
  precipitation_probability: pop,
});
const DAILY: ForecastEntry[] = [
  night('2026-11-07', 1, 'clear-night', 10),
  day('2026-11-08', 8, 'partlycloudy', 20),
  night('2026-11-08', 2, 'cloudy', 40),
  day('2026-11-09', 11, 'sunny', 0),
  night('2026-11-09', 4, 'clear-night'),
  day('2026-11-10', 9, 'rainy', 70),
  night('2026-11-10', 5, 'rainy', 60),
  day('2026-11-11', 6, 'snowy', 30),
];
// an hourly forecast from 13:00, an hour before now: the first entry is already past
const HOURLY: ForecastEntry[] = Array.from({length: 30}, (_, i) => ({
  datetime: REFERENCE_MS - 36e5 + i * 36e5,
  temperature: 4 + (i % 5),
  condition: i < 10 ? 'partlycloudy' : 'cloudy',
  precipitation_probability: i % 4 === 0 ? 0 : i * 3,
}));
const house = modelOf(fullHouse, 'en', {forecast: {daily: DAILY, hourly: HOURLY}});

describe('the days, from a twice-daily forecast', () => {
  test("the card's four days start with tonight, a low and no high, then the weekdays", () => {
    expect(house.card.days).toEqual([
      {
        dayKey: '2026-11-07',
        label: 'Tonight',
        icon: {condition: 'clear-night', day: false, label: 'Clear'},
        hi: '',
        lo: '1°',
        loLabel: 'low',
        isTonight: true,
      },
      {
        dayKey: '2026-11-08',
        label: 'Sun',
        icon: {condition: 'partlycloudy', day: true, label: 'Partly cloudy'},
        hi: '8°',
        lo: '2°',
        loLabel: '',
        isTonight: false,
      },
      {
        dayKey: '2026-11-09',
        label: 'Mon',
        icon: {condition: 'sunny', day: true, label: 'Sunny'},
        hi: '11°',
        lo: '4°',
        loLabel: '',
        isTonight: false,
      },
      {
        dayKey: '2026-11-10',
        label: 'Tue',
        icon: {condition: 'rainy', day: true, label: 'Rain'},
        hi: '9°',
        lo: '5°',
        loLabel: '',
        isTonight: false,
      },
    ]);
  });

  test('the days as range bars: tonight runs from now down to its low, today has the dot, and a day with no low is a stub', () => {
    expect(
      house.days.map(({dayKey, label, condition, pop, lo, hi, barLeft, barWidth, dot}) => ({
        dayKey,
        label,
        condition,
        pop,
        lo,
        hi,
        barLeft,
        barWidth,
        dot,
      })),
    ).toEqual([
      {
        dayKey: '2026-11-07',
        label: 'Tonight',
        condition: 'Clear',
        pop: '',
        lo: '1°',
        hi: '',
        barLeft: 0,
        barWidth: 32,
        dot: 32,
      },
      {
        dayKey: '2026-11-08',
        label: 'Tomorrow',
        condition: 'Partly cloudy',
        pop: '40%',
        lo: '2°',
        hi: '8°',
        barLeft: 10,
        barWidth: 60,
        dot: null,
      },
      {
        dayKey: '2026-11-09',
        label: 'Monday',
        condition: 'Sunny',
        pop: '',
        lo: '4°',
        hi: '11°',
        barLeft: 30,
        barWidth: 70,
        dot: null,
      },
      {
        dayKey: '2026-11-10',
        label: 'Tuesday',
        condition: 'Rain',
        pop: '70%',
        lo: '5°',
        hi: '9°',
        barLeft: 40,
        barWidth: 40,
        dot: null,
      },
      {
        dayKey: '2026-11-11',
        label: 'Wednesday',
        condition: 'Snow',
        pop: '30%',
        lo: '',
        hi: '6°',
        barLeft: 50,
        barWidth: 4,
        dot: null,
      },
    ]);
    expect(house.days[0].icon).toEqual({condition: 'clear-night', day: false, label: 'Clear'});
  });

  test('a chance of precipitation under 20 percent is left out, 20 and over is said', () => {
    expect(house.days.map(d => d.pop)).toEqual(['', '40%', '', '70%', '30%']);
    const twenty = inEnglish({}, {forecast: {daily: [day('2026-11-08', 8, 'cloudy', 20)], hourly: []}});
    expect(twenty.days[0].pop).toBe('20%');
  });

  test('the forecast keeps seven days, and the card four', () => {
    const many = Array.from({length: 10}, (_, i) => day(`2026-11-${String(8 + i).padStart(2, '0')}`, 5 + i, 'cloudy'));
    const model = inEnglish({}, {forecast: {daily: many, hourly: []}});
    expect(model.days).toHaveLength(7);
    expect(model.card.days).toHaveLength(4);
  });

  test('no forecast is no days, and a temperature that is not known leaves the dot off', () => {
    expect(inEnglish({}, {forecast: NO_FORECAST}).days).toEqual([]);
    const noReading = modelFromInputs(
      {...readWeather(fullHouse.states, resolveConfig({}, fullHouse.states)), temperature: null},
      'en',
      {forecast: {daily: DAILY, hourly: []}},
    );
    expect(noReading.days[0]).toMatchObject({barLeft: 0, dot: null});
  });

  test('a day with no temperature at all has no bar, and a night entry with none has no low', () => {
    const model = modelFromInputs(readWeather(fullHouse.states, resolveConfig({}, fullHouse.states)), 'en', {
      forecast: {
        daily: [
          {datetime: '2026-11-08T06:00:00-05:00', condition: 'fog'},
          night('2026-11-09', 2, 'fog'),
          {datetime: '2026-11-10T18:00:00-05:00', is_daytime: false},
        ],
        hourly: [],
      },
    });
    expect(model.days[0]).toMatchObject({lo: '', hi: '', barLeft: 0, barWidth: 0});
    expect(model.card.days[0]).toMatchObject({hi: '', lo: '', isTonight: false});
  });

  test('a night-only day that is not today is not tonight', () => {
    const model = modelOf(fullHouse, 'en', {forecast: {daily: [night('2026-11-09', 2, 'fog')], hourly: []}});
    expect(model.days[0].label).toBe('Monday');
    expect(model.card.days[0]).toMatchObject({isTonight: false, hi: '', lo: '2°'});
  });

  test('tonight with no low says a dash', () => {
    const forecast = {daily: [{datetime: '2026-11-07T18:00:00-05:00', is_daytime: false}], hourly: []};
    expect(modelOf(fullHouse, 'en', {forecast}).card.days[0]).toMatchObject({isTonight: true, lo: '–', loLabel: 'low'});
  });
});

describe('the days, from a generic weather entity', () => {
  // an entity-only house: no Environment Canada sensors, so the default fold, one row per entry
  const states = {
    'sun.sun': fullHouse.states['sun.sun'],
    'weather.home': entity('weather.home', 'cloudy', {temperature: 6}),
  };
  const inputs = readWeather(states, resolveConfig({}, states));
  const forecast = {
    daily: [
      {
        datetime: '2026-11-07T12:00:00-05:00',
        temperature: 8,
        templow: 1,
        condition: 'rainy',
        precipitation_probability: 50,
      },
      {datetime: '2026-11-08T12:00:00-05:00', temperature: 10, templow: 3, condition: 'sunny'},
    ],
    hourly: [],
  };

  test('are one row per entry, today named Today and tomorrow Tomorrow', () => {
    const model = modelFromInputs(inputs, 'en', {forecast});
    expect(model.days.map(d => [d.label, d.lo, d.hi, d.pop])).toEqual([
      ['Today', '1°', '8°', '50%'],
      ['Tomorrow', '3°', '10°', ''],
    ]);
    expect(model.card.days.map(d => [d.label, d.hi, d.lo])).toEqual([
      ['Today', '8°', '1°'],
      ['Sun', '10°', '3°'],
    ]);
  });

  test('today has the dot at the temperature now', () => {
    const model = modelFromInputs(inputs, 'en', {forecast});
    expect(model.days[0].dot).toBeCloseTo(((6 - 1) / (10 - 1)) * 100);
  });
});

describe('the next hours', () => {
  test('every third hour of the next day, from the first hour that is not past', () => {
    expect(house.hours).toEqual([
      {
        key: 1794078000000,
        label: '2 pm',
        icon: {condition: 'partlycloudy', day: true, label: 'Partly cloudy'},
        temperature: '5°',
        pop: '3%',
      },
      {
        key: 1794088800000,
        label: '5 pm',
        icon: {condition: 'partlycloudy', day: true, label: 'Partly cloudy'},
        temperature: '8°',
        pop: '',
      },
      {
        key: 1794099600000,
        label: '8 pm',
        icon: {condition: 'partlycloudy', day: false, label: 'Partly cloudy'},
        temperature: '6°',
        pop: '21%',
      },
      {
        key: 1794110400000,
        label: '11 pm',
        icon: {condition: 'cloudy', day: false, label: 'Cloudy'},
        temperature: '4°',
        pop: '30%',
      },
      {
        key: 1794121200000,
        label: '2 am',
        icon: {condition: 'cloudy', day: false, label: 'Cloudy'},
        temperature: '7°',
        pop: '39%',
      },
      {
        key: 1794132000000,
        label: '5 am',
        icon: {condition: 'cloudy', day: false, label: 'Cloudy'},
        temperature: '5°',
        pop: '',
      },
      {
        key: 1794142800000,
        label: '8 am',
        icon: {condition: 'cloudy', day: true, label: 'Cloudy'},
        temperature: '8°',
        pop: '57%',
      },
      {
        key: 1794153600000,
        label: '11 am',
        icon: {condition: 'cloudy', day: true, label: 'Cloudy'},
        temperature: '6°',
        pop: '66%',
      },
    ]);
  });

  test('the chart series hold all 24 hours', () => {
    expect(house.hourSeries.temperature).toHaveLength(24);
    expect(house.hourSeries.pop).toHaveLength(24);
    expect(house.hourSeries.temperature.slice(0, 3)).toEqual([
      [1794078000000, 5],
      [1794081600000, 6],
      [1794085200000, 7],
    ]);
    expect(house.hourSeries.pop.slice(0, 5)).toEqual([
      [1794078000000, 3],
      [1794081600000, 6],
      [1794085200000, 9],
      [1794088800000, 0],
      [1794092400000, 15],
    ]);
  });

  test('a missing temperature is a dash in the strip and a gap in the chart, a missing chance is zero in the chart', () => {
    const model = inEnglish({}, {forecast: {daily: [], hourly: [{datetime: REFERENCE_MS + 36e5}]}});
    expect(model.hours[0]).toMatchObject({temperature: '–', pop: '', icon: {condition: null, day: true, label: ''}});
    expect(model.hourSeries).toEqual({temperature: [[REFERENCE_MS + 36e5, null]], pop: [[REFERENCE_MS + 36e5, 0]]});
  });

  test('an hour that began within the last hour is kept, an earlier one is not', () => {
    const model = inEnglish(
      {},
      {
        forecast: {
          daily: [],
          hourly: [
            {datetime: REFERENCE_MS - 36e5, temperature: 1},
            {datetime: REFERENCE_MS - 36e5 + 1, temperature: 2},
          ],
        },
      },
    );
    expect(model.hourSeries.temperature).toEqual([[REFERENCE_MS - 36e5 + 1, 2]]);
  });
});

describe('in French', () => {
  const french = modelOf(fullHouse, 'fr', {forecast: {daily: DAILY, hourly: HOURLY}});

  test('the days are named in French, with a capital', () => {
    expect(french.card.days.map(d => d.label)).toEqual(['Ce soir', 'Dim.', 'Lun.', 'Mar.']);
    expect(french.card.days[0].loLabel).toBe('min');
    expect(french.days.map(d => d.label)).toEqual(['Ce soir', 'Demain', 'Lundi', 'Mardi', 'Mercredi']);
    expect(french.days.map(d => d.condition)).toEqual([
      'Transparent',
      'Partiellement nuageux',
      'Ensoleillé',
      'Pluie',
      'Neige',
    ]);
    expect(french.days[1].pop).toBe('40 %');
  });

  test('the hours are written the French way', () => {
    expect(french.hours.map(h => h.label)).toEqual(['14 h', '17 h', '20 h', '23 h', '2 h', '5 h', '8 h', '11 h']);
    expect(french.hours[0].pop).toBe('3 %');
  });
});
