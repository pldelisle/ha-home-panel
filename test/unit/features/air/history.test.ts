// Air's history at the pure-function seam (ADR 0005): literal rows in, the series per room and for the outdoor air, the chart words
// and the options out; options are plain data, and their callbacks take `fmt` from the arguments.
import {describe, expect, test} from 'vitest';
import type {StatisticRow} from '../../../../src/core/ha.ts';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {panelLocale} from '../../../../src/core/i18n/locale.ts';
import {createMessages} from '../../../../src/core/i18n/messages.ts';
import {
  airChartOptions,
  chartText,
  CHART_METRICS,
  metricIds,
  metricSeries,
  outdoorChartOptions,
  outdoorSeries,
  rangeTabs,
  statisticsStart,
  type AirChartDeps,
  type AirTokens,
} from '../../../../src/features/air/history.ts';
import type {AirRoomInputs, OutsideAirInputs} from '../../../../src/providers/mila.ts';
import {fakeHass} from '../../fake-hass.ts';

const row = (start: number, mean: number | null | undefined): StatisticRow => ({start, end: start + 1, mean});

const room = (name: string, sensors: AirRoomInputs['sensors']) => ({name, sensors}) as AirRoomInputs;
const ROOMS = [
  room('Den', {pm2_5: 'sensor.den_pm', humidity: 'sensor.den_rh'}),
  room('Bed', {pm2_5: 'sensor.bed_pm'}),
  room('Hall', {}),
];
const OUTSIDE = {pm: 'sensor.out_pm', aqi: 'sensor.out_aqi'} as OutsideAirInputs;

const STATS = {
  'sensor.den_pm': [row(1_000_000, 12.34), row(1_300_000, null), row(1_600_000, 0), row(1_900_000, undefined)],
  'sensor.bed_pm': [row(1_000_000, 7.96)],
  'sensor.out_pm': [row(1_000_000, 9)],
  'sensor.den_rh': [row(1_000_000, 41.25)],
  'sensor.out_aqi': [row(1_000_000, 42.04)],
  'sensor.ec_aqhi': [row(1_000_000, 3)],
};

describe('metricSeries', () => {
  test('is the mean of each bucket moved to its middle and rounded to a decimal, a row with none dropped', () => {
    const series = metricSeries(STATS, {rooms: ROOMS, outside: OUTSIDE}, 'pm2_5', 'day');
    expect(series.rooms[0]).toEqual({
      name: 'Den',
      points: [
        [1_150_000, 12.3],
        [1_750_000, 0],
      ],
    });
    // a day's rows are five minutes wide: the middle is 150 000 ms on
    expect(series.rooms[1]).toEqual({name: 'Bed', points: [[1_150_000, 8]]});
  });

  test('the shift is half a bucket of the range: an hour’s for a week and a month', () => {
    expect(metricSeries(STATS, {rooms: ROOMS, outside: OUTSIDE}, 'pm2_5', 'week').rooms[1].points).toEqual([
      [2_800_000, 8],
    ]);
    expect(metricSeries(STATS, {rooms: ROOMS, outside: OUTSIDE}, 'pm2_5', 'month').rooms[1].points).toEqual([
      [2_800_000, 8],
    ]);
  });

  test('a room with no sensor for the metric, or no rows, has no points, and the line is still there', () => {
    const series = metricSeries(STATS, {rooms: ROOMS, outside: OUTSIDE}, 'pm2_5', 'day');
    expect(series.rooms[2]).toEqual({name: 'Hall', points: []});
    expect(metricSeries({}, {rooms: ROOMS, outside: OUTSIDE}, 'pm2_5', 'day').rooms[0].points).toEqual([]);
  });

  test('the station is the PM2.5 chart’s dashed line and no other metric’s', () => {
    expect(metricSeries(STATS, {rooms: ROOMS, outside: OUTSIDE}, 'pm2_5', 'day').outside).toEqual([[1_150_000, 9]]);
    expect(metricSeries(STATS, {rooms: ROOMS, outside: OUTSIDE}, 'humidity', 'day').outside).toBeNull();
    expect(metricSeries(STATS, {rooms: ROOMS, outside: null}, 'pm2_5', 'day').outside).toBeNull();
    expect(metricSeries(STATS, {rooms: ROOMS, outside: {...OUTSIDE, pm: null}}, 'pm2_5', 'day').outside).toBeNull();
    expect(metricSeries(STATS, {rooms: ROOMS, outside: OUTSIDE}, 'humidity', 'day').rooms[0].points).toEqual([
      [1_150_000, 41.3],
    ]);
  });
});

describe('metricIds', () => {
  test('the rooms’ sensors for the metric, and the station’s PM2.5 for that one only', () => {
    expect(metricIds({rooms: ROOMS, outside: OUTSIDE}, 'pm2_5')).toEqual([
      'sensor.den_pm',
      'sensor.bed_pm',
      'sensor.out_pm',
    ]);
    expect(metricIds({rooms: ROOMS, outside: OUTSIDE}, 'humidity')).toEqual(['sensor.den_rh']);
    expect(metricIds({rooms: ROOMS, outside: null}, 'pm2_5')).toEqual(['sensor.den_pm', 'sensor.bed_pm']);
  });
});

describe('rangeTabs', () => {
  test('are the day, the week and the month, worded in the profile’s language', () => {
    expect(rangeTabs(depsOf('en').t)).toEqual([
      {range: 'day', label: 'Day'},
      {range: 'week', label: 'Week'},
      {range: 'month', label: 'Month'},
    ]);
    expect(rangeTabs(depsOf('fr').t).map(tab => tab.label)).toEqual(['Jour', 'Semaine', 'Mois']);
  });
});

describe('statisticsStart', () => {
  const HOUR = 3_600_000;
  const NOON = Date.UTC(2026, 10, 15, 12, 0, 0);

  test('is the top of the hour, a range back, so a second request in the hour has the same arguments', () => {
    expect(statisticsStart(NOON + 41 * 60_000, 'day').getTime()).toBe(NOON - 24 * HOUR);
    expect(statisticsStart(NOON + 59 * 60_000, 'day').getTime()).toBe(NOON - 24 * HOUR);
    expect(statisticsStart(NOON + 41 * 60_000, 'week').getTime()).toBe(NOON - 7 * 24 * HOUR);
    expect(statisticsStart(NOON, 'month').getTime()).toBe(NOON - 30 * 24 * HOUR);
  });

  test('moves on with the next hour', () => {
    expect(statisticsStart(NOON + HOUR, 'day').getTime()).toBe(NOON - 23 * HOUR);
  });
});

describe('outdoorSeries', () => {
  test('the station’s index and the AQHI, each moved to the middle of its bucket; a missing id is an empty series', () => {
    expect(outdoorSeries(STATS, {aqi: 'sensor.out_aqi', aqhi: 'sensor.ec_aqhi'}, 'week')).toEqual({
      aqi: [[2_800_000, 42]],
      aqhi: [[2_800_000, 3]],
    });
    expect(outdoorSeries(STATS, {aqi: null, aqhi: 'sensor.ec_aqhi'}, 'day')).toEqual({aqi: [], aqhi: [[1_150_000, 3]]});
  });
});

// ---------- the words and the options ----------

const NOW = Date.parse('2026-11-09T12:00:00-05:00');
const TOKENS: AirTokens = {
  rooms: ['#r1', '#r2', '#r3', '#r4'],
  station: '#station',
  ok: '#ok',
  warn: '#warn',
  muted: '#muted',
  aqi: '#aqi',
  aqhi: '#aqhi',
};
const depsOf = (language: 'en' | 'fr'): AirChartDeps => {
  const locale = panelLocale(fakeHass({locale: {language}}), {timeZone: 'America/Toronto', browserLocale: 'en'});
  return {fmt: createFormatters(locale), t: createMessages(locale).t, tokens: TOKENS, now: NOW};
};

describe('chartText', () => {
  test.each([
    [
      'pm2_5',
      'PM2.5, last 24 hours',
      'Good is up to 12 µg/m³, moderate up to 35. The dashed line is the outdoor station.',
    ],
    ['co2', 'CO₂, last 24 hours', 'Good is up to 800 ppm, moderate up to 1,200.'],
    ['voc', 'VOC, last 24 hours', 'Good is up to 300 µg/m³, moderate up to 3,000.'],
    ['humidity', 'Humidity, last 24 hours', 'Comfortable indoor humidity is 30 to 60%.'],
  ] as const)('%s in English', (metric, title, caption) => {
    const {t, fmt} = depsOf('en');
    expect(chartText(metric, 'day', {t, fmt})).toEqual({title, caption});
  });

  test('in French, with the range’s own words and the number French writes', () => {
    const {t, fmt} = depsOf('fr');
    expect(chartText('co2', 'week', {t, fmt})).toEqual({
      title: 'CO₂, 7 derniers jours',
      caption: "Bon jusqu'à 800 ppm, moyen jusqu'à 1 200.",
    });
  });

  test('the chart offers four metrics', () => {
    expect(CHART_METRICS).toEqual(['pm2_5', 'co2', 'voc', 'humidity']);
  });
});

describe('airChartOptions', () => {
  const series = (outside: [number, number][] | null) => ({
    rooms: ['A', 'B', 'C', 'D', 'E'].map(name => ({name, points: [[1, 2]] as [number, number][]})),
    outside,
  });
  const options = (
    outside: [number, number][] | null,
    metric: 'pm2_5' | 'humidity' = 'pm2_5',
    language: 'en' | 'fr' = 'en',
  ) => airChartOptions(series(outside), metric, 'week', depsOf(language));

  test('a line per room in the four room colours, which come round, and the station last: thinner, dashed, in its own colour', () => {
    const o = options([[1, 9]]);
    expect(o.series.map(s => s.name)).toEqual(['A', 'B', 'C', 'D', 'E', 'Outside']);
    expect(o.colors).toEqual(['#r1', '#r2', '#r3', '#r4', '#r1', '#station']);
    expect(o.stroke).toEqual({width: [2.2, 2.2, 2.2, 2.2, 2.2, 1.6], dashArray: [0, 0, 0, 0, 0, 5], curve: 'smooth'});
  });

  test('without the station every line is solid', () => {
    const o = options(null);
    expect(o.series).toHaveLength(5);
    expect(o.stroke.dashArray).toEqual([0, 0, 0, 0, 0]);
  });

  test('the band: good air up to the first limit, the comfortable humidity from 30 to 60', () => {
    expect(options(null).annotations.yaxis[0]).toMatchObject({y: 0, y2: 12, fillColor: '#ok', label: {text: 'Good'}});
    expect(options(null, 'humidity').annotations.yaxis[0]).toMatchObject({y: 30, y2: 60, label: {text: 'Comfortable'}});
  });

  test('a week’s axis ends now, the tooltip is the range’s, and the numbers are the profile’s', () => {
    const en = options(null);
    expect(en.xaxis).toEqual({type: 'datetime', min: NOW - 7 * 864e5, max: NOW, labels: {datetimeUTC: false}});
    expect(en.tooltip.x.formatter(Date.parse('2026-11-09T21:07:00Z'))).toBe('Mon 4 pm');
    expect(en.yaxis.labels.formatter(1234)).toBe('1,234');
    expect(en.yaxis.labels.formatter(null)).toBe('');
    expect(en.tooltip.y.formatter(12.34)).toBe('12.3 µg/m³');
    expect(en.tooltip.y.formatter(null)).toBe('–');
    const fr = options(null, 'humidity', 'fr');
    expect(fr.yaxis.labels.formatter(1234)).toBe('1 234');
    expect(fr.tooltip.y.formatter(38.5)).toBe('38,5 %');
  });
});

describe('outdoorChartOptions', () => {
  const both = {aqi: [[1, 40]] as [number, number][], aqhi: [[1, 3]] as [number, number][]};

  test('the index on the left axis with its bands and the AQHI on a right axis from 0 to 10, each in its own colour', () => {
    const o = outdoorChartOptions(both, 'day', depsOf('en'));
    expect(o.series.map(s => s.name)).toEqual(['AQI (Mila station)', 'AQHI (Environment Canada)']);
    expect(o.colors).toEqual(['#aqi', '#aqhi']);
    expect(o.yaxis).toMatchObject([
      {seriesName: 'AQI (Mila station)', min: 0, forceNiceScale: true, title: {text: 'US AQI'}},
      {seriesName: 'AQHI (Environment Canada)', min: 0, opposite: true, max: 10, tickAmount: 5, title: {text: 'AQHI'}},
    ]);
    expect(o.annotations.yaxis).toMatchObject([
      {y: 0, y2: 50, fillColor: '#ok', opacity: 0.1, label: {text: 'Good'}},
      {y: 50, y2: 100, fillColor: '#warn', opacity: 0.08, label: {text: 'Moderate'}},
    ]);
    expect(o.xaxis).toMatchObject({min: NOW - 864e5, max: NOW});
    expect(o.tooltip.x.formatter(Date.parse('2026-11-09T21:07:00Z'))).toBe('Mon 4:07 pm');
  });

  test('a line with no points is left out, and the bands go with the index', () => {
    const aqhiOnly = outdoorChartOptions({aqi: [], aqhi: both.aqhi}, 'day', depsOf('en'));
    expect(aqhiOnly.series.map(s => s.name)).toEqual(['AQHI (Environment Canada)']);
    expect(aqhiOnly.annotations).toEqual({});
    expect(outdoorChartOptions({aqi: both.aqi, aqhi: []}, 'day', depsOf('en')).yaxis).toHaveLength(1);
  });

  test('the axes and the tooltip are whole numbers, French’s own with a thousand', () => {
    const en = outdoorChartOptions(both, 'day', depsOf('en'));
    const left = en.yaxis[0] as {labels: {formatter: (value: number) => string}};
    expect(left.labels.formatter(41.6)).toBe('42');
    expect(en.tooltip.y.formatter(41.6)).toBe('42');
    expect(en.tooltip.y.formatter(null)).toBe('–');
    expect(outdoorChartOptions(both, 'day', depsOf('fr')).tooltip.y.formatter(1234)).toBe('1 234');
  });
});
