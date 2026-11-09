// Weather's history at the pure-function seam (ADR 0005): literal rows in, the series, the months, the records, a tile's lines and
// its chart options out; the strings in English and in French through the store's own `t` and formats. The last block pins the
// copied rules to the legacy panel's source, which holds them until the history move deletes them.
import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';
import type {HistoryPoint, StatisticRow} from '../../../../src/core/ha.ts';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {panelLocale} from '../../../../src/core/i18n/locale.ts';
import {createMessages} from '../../../../src/core/i18n/messages.ts';
import {
  FROST_BELOW,
  hasStatistics,
  historyChartOptions,
  idsWithoutStatistics,
  HOT_FROM,
  records,
  seasonMonths,
  seasonTicks,
  seasonView,
  sevenDaySeries,
  tileHistory,
  tileStats,
  type ChartTokens,
  type SevenDayIds,
  type TileSeriesData,
} from '../../../../src/features/weather/history.ts';
import {tileDefinition} from '../../../../src/features/weather/tiles.ts';
import {fakeHass} from '../../fake-hass.ts';

// ---------- literal rows ----------

/** Midnight of a local day in Toronto: EST (-5) before 2026-03-08 and after 2026-11-01, EDT (-4) between. */
const midnight = (iso: string, offset = -5) => Date.parse(`${iso}T00:00:00-0${Math.abs(offset)}:00`);

const day = (iso: string, mean: number | null, min: number | null, max: number | null, offset = -5): StatisticRow => ({
  start: midnight(iso, offset),
  end: midnight(iso, offset) + 864e5,
  mean,
  min,
  max,
});

/** The daily statistics of the outdoor temperature: a partial first month, a day with no mean, a 25° day and a tie for the warmest. */
const DAYS: StatisticRow[] = [
  day('2026-03-04', -2, -6, 3),
  day('2026-03-05', 1, -1, 6),
  day('2026-03-06', null, 0, 1), // no mean: not a day
  day('2026-04-01', 8, 2, 14, -4),
  day('2026-04-02', 12, 5, HOT_FROM, -4),
  day('2026-07-10', 24, 18, 31, -4),
  day('2026-07-11', 22, 17, 31, -4),
  day('2026-11-02', 4, 1, 9),
  day('2026-11-03', 2, -3, 6),
  day('2026-11-04', 5, -3, 8),
];

/** The strongest gust of each day; one day has none, and the 72 is reached twice. */
const GUSTS: StatisticRow[] = [
  day('2026-03-05', 40, 20, 55),
  day('2026-03-06', null, null, null),
  day('2026-07-10', 50, 30, 72, -4),
  day('2026-07-11', 49, 30, 72, -4),
];

const NOW = Date.parse('2026-11-09T12:00:00-05:00');

const deps = (language: 'en' | 'fr', now = NOW) => {
  const locale = panelLocale(fakeHass({locale: {language}}), {timeZone: 'America/Toronto', browserLocale: 'en'});
  return {fmt: createFormatters(locale), t: createMessages(locale).t, now};
};

// ---------- the seven days ----------

describe('sevenDaySeries', () => {
  const IDS: SevenDayIds = {
    temperature: 'sensor.t',
    dewPoint: 'sensor.dew',
    humidity: 'sensor.hum',
    pressure: 'sensor.pres',
    wind: 'sensor.wind',
    gusts: 'sensor.gust',
  };
  const hour = (start: number, values: Partial<StatisticRow>): StatisticRow => ({start, end: start + 36e5, ...values});

  test('is [ms, value] a row, the mean of each hour, rounded to two digits, in the order of the rows', () => {
    const rows = {
      'sensor.t': [hour(1000, {mean: 12.3456}), hour(2000, {mean: -0.5}), hour(3000, {mean: 0})],
      'sensor.dew': [hour(1000, {mean: 3})],
      'sensor.hum': [hour(1000, {mean: 71.125})],
      'sensor.pres': [hour(1000, {mean: 101.9})],
      'sensor.wind': [hour(1000, {mean: 14})],
      'sensor.gust': [hour(1000, {mean: 5, max: 31.499})],
    };
    expect(sevenDaySeries(rows, IDS)).toEqual({
      temperature: [
        [1000, 12.35],
        [2000, -0.5],
        [3000, 0],
      ],
      dewPoint: [[1000, 3]],
      humidity: [[1000, 71.13]],
      pressure: [[1000, 101.9]],
      wind: [[1000, 14]],
      gusts: [[1000, 31.5]],
    });
  });

  test('skips the hours with no value: a null mean, and for the gusts a null maximum', () => {
    const rows = {
      'sensor.t': [hour(1000, {mean: null}), hour(2000, {mean: 4}), hour(3000, {})],
      'sensor.gust': [hour(1000, {mean: 9, max: null}), hour(2000, {mean: null, max: 20})],
    };
    const series = sevenDaySeries(rows, IDS);
    expect(series.temperature).toEqual([[2000, 4]]);
    expect(series.gusts).toEqual([[2000, 20]]);
  });

  test('is empty for a sensor the house does not have, and for one the recorder sent no rows for', () => {
    const series = sevenDaySeries({'sensor.t': [hour(1000, {mean: 4})]}, {...IDS, dewPoint: null, wind: null});
    expect(series.temperature).toEqual([[1000, 4]]);
    expect(series.dewPoint).toEqual([]);
    expect(series.wind).toEqual([]);
    expect(series.pressure).toEqual([]);
  });
});

// ---------- the season ----------

describe('seasonMonths', () => {
  const months = seasonMonths(DAYS, ms => deps('en').fmt.isoDay(ms));

  test('groups the days with a mean, a low and a high by month in the house zone, oldest first', () => {
    expect(months.map(month => month.key)).toEqual(['2026-03', '2026-04', '2026-07', '2026-11']);
  });

  test('counts the days, the frost nights and the hot days, with the mean of the means and the extremes', () => {
    expect(months).toEqual([
      expect.objectContaining({key: '2026-03', count: 2, mean: -0.5, low: -6, high: 6, frostNights: 2, hotDays: 0}),
      expect.objectContaining({key: '2026-04', count: 2, mean: 10, low: 2, high: HOT_FROM, frostNights: 0, hotDays: 1}),
      expect.objectContaining({key: '2026-07', count: 2, mean: 23, low: 17, high: 31, frostNights: 0, hotDays: 2}),
      expect.objectContaining({key: '2026-11', count: 3, low: -3, high: 9, frostNights: 2, hotDays: 0}),
    ]);
    expect(months[3].mean).toBeCloseTo(11 / 3);
  });

  test('a month is a frost night below the limit and a hot day from it, exactly', () => {
    const edge = seasonMonths(
      [day('2026-02-01', 0, FROST_BELOW, HOT_FROM - 0.1), day('2026-02-02', 0, FROST_BELOW - 0.1, HOT_FROM)],
      ms => deps('en').fmt.isoDay(ms),
    );
    expect(edge[0]).toMatchObject({count: 2, frostNights: 1, hotDays: 1});
  });

  test('says which day it begins on, at noon: a partial first month begins on the 4th, the others on the 1st', () => {
    expect(months.map(month => month.firstDay)).toEqual([4, 1, 10, 2]);
    expect(months[0].at).toBe(midnight('2026-03-04') + 12 * 36e5);
  });

  test('a day with a mean and no low or no high reads the missing figure as 0°, as the legacy panel did', () => {
    const odd = seasonMonths([day('2026-03-07', 3, null, 8), day('2026-03-08', 4, 1, null)], () => '2026-03-07');
    expect(odd).toEqual([expect.objectContaining({count: 2, low: 0, high: 8, mean: 3.5, frostNights: 0, hotDays: 0})]);
    expect(records([day('2026-03-07', -3, null, -1)], [])).toMatchObject({warmest: {value: -1}, coldest: {value: 0}});
    expect(records([day('2026-03-07', 3, 1, null)], [])).toMatchObject({warmest: {value: 0}, coldest: {value: 1}});
  });

  test('takes the day names from the function it is given, not from a zone of its own', () => {
    const moved = seasonMonths(DAYS.slice(0, 2), () => '2030-01-09');
    expect(moved).toEqual([expect.objectContaining({key: '2030-01', firstDay: 9, count: 2})]);
  });

  test('sorts the months even when the rows come in another order', () => {
    const backwards = seasonMonths([DAYS[3], DAYS[0]], ms => deps('en').fmt.isoDay(ms));
    expect(backwards.map(month => month.key)).toEqual(['2026-03', '2026-04']);
  });

  test('is empty for no rows and for rows with nothing to count', () => {
    expect(seasonMonths([], ms => String(ms))).toEqual([]);
    expect(seasonMonths([DAYS[2]], ms => String(ms))).toEqual([]);
  });
});

describe('records', () => {
  test('are the warmest high, the coldest low and the strongest gust with their days at noon', () => {
    expect(records(DAYS, GUSTS)).toEqual({
      warmest: {at: midnight('2026-07-10', -4) + 12 * 36e5, value: 31},
      coldest: {at: midnight('2026-03-04') + 12 * 36e5, value: -6},
      gust: {at: midnight('2026-07-10', -4) + 12 * 36e5, value: 72},
    });
  });

  test('the first of equals wins, as the legacy reduce did', () => {
    const tied = records(
      [day('2026-05-01', 5, -2, 20), day('2026-05-02', 5, -2, 20)],
      [day('2026-05-01', 1, 1, 9), day('2026-05-02', 1, 1, 9)],
    );
    expect(tied).toEqual({
      warmest: {at: midnight('2026-05-01') + 12 * 36e5, value: 20},
      coldest: {at: midnight('2026-05-01') + 12 * 36e5, value: -2},
      gust: {at: midnight('2026-05-01') + 12 * 36e5, value: 9},
    });
  });

  test('has no gust when the recorder kept none, and nothing at all with no days', () => {
    expect(records(DAYS, [])?.gust).toBeNull();
    expect(records(DAYS, [GUSTS[1]])?.gust).toBeNull();
    expect(records([], GUSTS)).toBeNull();
    expect(records([DAYS[2]], GUSTS)).toBeNull();
  });
});

describe('seasonView', () => {
  test('says the sentence, the four tiles and a row a month, in English', () => {
    const view = seasonView(DAYS, GUSTS, deps('en'))!;
    expect(view.since).toBe(
      'Every month since Mar 4, from the coldest low to the warmest high. The dot is the monthly average.',
    );
    expect(view.tiles).toEqual([
      {label: 'Warmest', value: '31.0°', unit: '', sub: 'Jul 10'},
      {label: 'Coldest', value: '-6.0°', unit: '', sub: 'Mar 4'},
      {label: 'November', value: '3.7°', unit: '', sub: 'average, 2 frosty nights'},
      {label: 'Strongest gust', value: '72', unit: 'km/h', sub: 'Jul 10'},
    ]);
    expect(view.rows.map(row => [row.name, row.from, row.low, row.high, row.note, row.title])).toEqual([
      ["Mar '26", 'from 4', '-6°', '6°', '2 frosts', 'Average -0.5°'],
      ["Apr '26", null, '2°', '25°', '1 over 25°', 'Average 10.0°'],
      ["Jul '26", 'from 10', '17°', '31°', '2 over 25°', 'Average 23.0°'],
      ["Nov '26", 'from 2', '-3°', '9°', '2 frosts', 'Average 3.7°'],
    ]);
  });

  test('says the same in French, with the comma, the day first and the months as the rewrite layer wrote them', () => {
    const view = seasonView(DAYS, GUSTS, deps('fr'))!;
    expect(view.since).toBe(
      'Chaque mois depuis le 4 mars, du minimum le plus froid au maximum le plus chaud. Le point est la moyenne du mois.',
    );
    expect(view.tiles).toEqual([
      {label: 'Le plus chaud', value: '31,0°', unit: '', sub: '10 juill.'},
      {label: 'Le plus froid', value: '-6,0°', unit: '', sub: '4 mars'},
      {label: 'Novembre', value: '3,7°', unit: '', sub: 'moyenne, 2 nuits de gel'},
      {label: 'Plus forte rafale', value: '72', unit: 'km/h', sub: '10 juill.'},
    ]);
    expect(view.rows.map(row => [row.name, row.from, row.note])).toEqual([
      ['Mars 2026', 'à partir du 4', '2 gels'],
      ['Avr. 2026', null, '1 j au-dessus de 25°'],
      ['Juill. 2026', 'à partir du 10', '2 j au-dessus de 25°'],
      ['Nov. 2026', 'à partir du 2', '2 gels'],
    ]);
  });

  test('puts every bar on one scale from the coldest low to the warmest high, in percent', () => {
    const view = seasonView(DAYS, GUSTS, deps('en'))!;
    expect([view.low, view.span]).toEqual([-6, 37]);
    expect(view.rows[0]).toMatchObject({barLeft: 0});
    expect(view.rows[0].barWidth).toBeCloseTo((12 / 37) * 100);
    expect(view.rows[0].averageAt).toBeCloseTo((5.5 / 37) * 100);
    expect(view.rows[2].barLeft).toBeCloseTo((23 / 37) * 100);
    expect(view.rows[2].barWidth).toBeCloseTo((14 / 37) * 100);
    expect(view.freezingAt).toBeCloseTo((6 / 37) * 100);
  });

  test('marks 0 on the scale only when it falls inside it', () => {
    expect(seasonView([day('2026-07-10', 20, 15, 28)], [], deps('en'))!.freezingAt).toBeNull();
    expect(seasonView([day('2026-01-10', -10, -15, -4)], [], deps('en'))!.freezingAt).toBeNull();
    expect(seasonView([day('2026-01-10', -10, -15, 0)], [], deps('en'))!.freezingAt).toBeNull();
  });

  test('a month with a single temperature is a bar of 2 percent on a scale of 1 degree', () => {
    const view = seasonView([day('2026-07-10', 20, 20, 20)], [], deps('en'))!;
    expect(view.span).toBe(1);
    expect(view.rows[0]).toMatchObject({barLeft: 0, barWidth: 2});
  });

  test('has dashes where the current month or the gusts are missing, and says nothing without days', () => {
    const view = seasonView(DAYS.slice(0, 2), [], deps('en'))!;
    expect(view.tiles[2]).toEqual({label: 'November', value: '–', unit: '', sub: ''});
    expect(view.tiles[3]).toEqual({label: 'Strongest gust', value: '–', unit: 'km/h', sub: ''});
    expect(seasonView([], GUSTS, deps('en'))).toBeNull();
  });

  test('a month with neither frost nor heat has no note, and a mild current month says 0 frosty nights', () => {
    const view = seasonView([day('2026-11-02', 4, 1, 9), day('2026-10-02', 8, 4, 16)], [], deps('en'))!;
    expect(view.rows.map(row => row.note)).toEqual(['', '']);
    expect(view.tiles[2].sub).toBe('average, 0 frosty nights');
    expect(seasonView([day('2026-11-02', 4, 1, 9)], [], deps('fr'))!.tiles[2].sub).toBe('moyenne, 0 nuits de gel');
  });

  test('says one frost night and one frost, not the plural', () => {
    const view = seasonView([day('2026-11-02', 4, -1, 9), day('2026-10-02', 8, 4, 16)], [], deps('en'))!;
    expect(view.tiles[2].sub).toBe('average, 1 frosty night');
    expect(view.rows[1].note).toBe('1 frost');
  });

  test('rounds the degrees of a month as the legacy did: -0.4 is 0°, never -0°', () => {
    const view = seasonView([day('2026-11-02', 0, -0.4, 0.4)], [], deps('en'))!;
    expect([view.rows[0].low, view.rows[0].high]).toEqual(['0°', '0°']);
  });
});

describe('seasonTicks', () => {
  test('are the multiples of the step inside the scale, each at its place in percent', () => {
    expect(seasonTicks({low: -6, span: 37}, 10)).toEqual([
      {value: 0, at: (6 / 37) * 100},
      {value: 10, at: (16 / 37) * 100},
      {value: 20, at: (26 / 37) * 100},
      {value: 30, at: (36 / 37) * 100},
    ]);
    expect(seasonTicks({low: -6, span: 37}, 20).map(tick => tick.value)).toEqual([0, 20]);
  });
});

// ---------- one tile's history ----------

const stat = (start: number, values: Partial<StatisticRow>): StatisticRow => ({start, end: start + 36e5, ...values});
const state = (lastUpdated: number, value: string): HistoryPoint => ({
  state: value,
  lastUpdated,
  lastChanged: lastUpdated,
});

const HOUR = 36e5;
const WIND = tileDefinition('wind');
const WIND_IDS = {wind: 'sensor.wind', gust: 'sensor.gust'};

describe('tileHistory', () => {
  test('draws the statistics at the middle of their bucket, the mean, and the maximum for the series that asks for it', () => {
    const lines = tileHistory(
      WIND,
      WIND_IDS,
      {
        'sensor.wind': [stat(0, {mean: 10.126, max: 30}), stat(HOUR, {mean: 12, max: 35})],
        'sensor.gust': [stat(0, {mean: 14, max: 40.556}), stat(HOUR, {mean: 15, max: null})],
      },
      {},
      'week',
    );
    expect(lines).toEqual([
      {
        entity: 'wind',
        nameKey: 'weather.tile.wind.label',
        unit: 'km/h',
        dash: false,
        points: [
          [HOUR / 2, 10.13],
          [HOUR * 1.5, 12],
        ],
      },
      {entity: 'gust', nameKey: 'weather.series.gusts', unit: 'km/h', dash: true, points: [[HOUR / 2, 40.56]]},
    ]);
  });

  test('the middle of a bucket follows the range: 2.5 minutes, 30 minutes, 12 hours', () => {
    const rows = {'sensor.wind': [stat(0, {mean: 1})], 'sensor.gust': []};
    expect(tileHistory(WIND, WIND_IDS, rows, {}, 'day')[0].points).toEqual([[15e4, 1]]);
    expect(tileHistory(WIND, WIND_IDS, rows, {}, 'month')[0].points).toEqual([[18e5, 1]]);
    expect(tileHistory(WIND, WIND_IDS, rows, {}, 'year')[0].points).toEqual([[432e5, 1]]);
  });

  test('takes the plain history of a sensor that has no statistics, one point a bucket, the first state of it', () => {
    const history = {
      'sensor.wind': [
        state(10, '4'),
        state(HOUR - 1, '9'), // same hour as the first: dropped
        state(HOUR, 'unavailable'), // not a number: skipped, and the hour is still open
        state(HOUR + 5, '6.5'),
        state(3 * HOUR + 1, '7'), // an hour with no state between: no point for it
      ],
    };
    const [line] = tileHistory(WIND, {wind: 'sensor.wind'}, {}, history, 'week');
    expect(line.points).toEqual([
      [HOUR / 2, 4],
      [HOUR * 1.5, 6.5],
      [HOUR * 3.5, 7],
    ]);
  });

  test('thins to the range: a day by 5 minutes, a year by days', () => {
    const history = {'sensor.wind': [state(1000, '1'), state(2000, '2'), state(4e5, '3'), state(9e5, '4')]};
    expect(tileHistory(WIND, {wind: 'sensor.wind'}, {}, history, 'day')[0].points).toEqual([
      [15e4, 1],
      [45e4, 3],
      [105e4, 4],
    ]);
    expect(tileHistory(WIND, {wind: 'sensor.wind'}, {}, history, 'year')[0].points).toEqual([[432e5, 1]]);
  });

  test('mixes: a series with statistics from them, a series without from its history', () => {
    const lines = tileHistory(
      WIND,
      WIND_IDS,
      {'sensor.wind': [stat(0, {mean: 3})]},
      {'sensor.gust': [state(5, '20')]},
      'week',
    );
    expect(lines.map(line => line.points)).toEqual([[[HOUR / 2, 3]], [[HOUR / 2, 20]]]);
  });

  test('statistics with no value in them are no points, and the history is not asked then, as before', () => {
    const [line] = tileHistory(
      WIND,
      {wind: 'sensor.wind'},
      {'sensor.wind': [stat(0, {mean: null})]},
      {'sensor.wind': [state(5, '20')]},
      'week',
    );
    expect(line.points).toEqual([]);
  });

  test('leaves out a series whose sensor the house does not have, and has no points for one the recorder knows nothing of', () => {
    const feels = tileDefinition('feels');
    const lines = tileHistory(feels, {outT: 'sensor.t', chill: null, humidex: undefined}, {}, {}, 'week');
    expect(lines.map(line => [line.entity, line.points])).toEqual([['outT', []]]);
  });
});

describe('hasStatistics and idsWithoutStatistics', () => {
  const rows = {'sensor.a': [stat(0, {mean: null})], 'sensor.b': []};

  test('a sensor has statistics when the recorder sent rows, whatever they hold; none, an empty list or no key is none', () => {
    expect(['sensor.a', 'sensor.b', 'sensor.c'].map(id => hasStatistics(rows, id))).toEqual([true, false, false]);
  });

  test('the ids without are the ones to ask the plain history for, in the order given', () => {
    expect(idsWithoutStatistics(rows, ['sensor.c', 'sensor.a', 'sensor.b'])).toEqual(['sensor.c', 'sensor.b']);
  });
});

describe('tileStats', () => {
  const line = (points: [number, number][]): TileSeriesData => ({
    entity: 'wind',
    nameKey: 'weather.tile.wind.label',
    unit: 'km/h',
    dash: false,
    points,
  });

  test('is the low, the mean and the high of each line that has points', () => {
    const stats = tileStats([
      line([
        [1, 4],
        [2, 10],
        [3, 7],
      ]),
      line([]),
      {...line([[1, -2]]), entity: 'gust', nameKey: 'weather.series.gusts'},
    ]);
    expect(stats).toEqual([
      {entity: 'wind', nameKey: 'weather.tile.wind.label', unit: 'km/h', low: 4, mean: 7, high: 10},
      {entity: 'gust', nameKey: 'weather.series.gusts', unit: 'km/h', low: -2, mean: -2, high: -2},
    ]);
  });

  test('is empty when no line has a point', () => {
    expect(tileStats([line([])])).toEqual([]);
  });
});

describe('historyChartOptions', () => {
  const tokens: ChartTokens = {
    series: ['#c1', '#c2', '#c3', '#c4'],
    tones: {ok: '#ok', warn: '#warn', crit: '#crit', blue: '#blue'},
    muted: '#muted',
  };
  const line = (entity: TileSeriesData['entity'], unit: string, dash = false): TileSeriesData => ({
    entity,
    nameKey: 'weather.series.air',
    unit,
    dash,
    points: [[1, 2]],
  });
  const options = (
    key: Parameters<typeof tileDefinition>[0],
    series: TileSeriesData[],
    language: 'en' | 'fr' = 'en',
    range = 'week' as const,
  ) => historyChartOptions(tileDefinition(key), series, range, {...deps(language), tokens});
  // the options carry functions the chart calls; what the tests need of them is their result
  type Axis = {
    min?: number;
    max?: number;
    forceNiceScale: boolean;
    seriesName?: string;
    opposite?: boolean;
    show?: boolean;
    labels: {formatter: (value: number) => string};
    title: {text: string; style: {color: string; fontWeight: number}};
  };

  test('is a line chart, a line a series with its name, its points and the next colour of the tokens', () => {
    const chart = options('feels', [line('outT', '°'), line('chill', '°', true), line('humidex', '°', true)]);
    expect(chart.chart).toEqual({type: 'line'});
    expect(chart.series).toEqual([
      {name: 'Air', data: [[1, 2]]},
      {name: 'Air', data: [[1, 2]]},
      {name: 'Air', data: [[1, 2]]},
    ]);
    expect(chart.colors).toEqual(['#c1', '#c2', '#c3']);
    expect(chart.markers).toEqual({size: 0});
  });

  test('names the series in the language', () => {
    const gust = {...line('gust', 'km/h'), nameKey: 'weather.series.gusts' as const};
    expect((options('wind', [gust], 'fr').series as {name: string}[])[0].name).toBe('Rafales');
  });

  test('the colours come round after the last token', () => {
    const five = ['outT', 'chill', 'humidex', 'hi', 'lo'] as const;
    expect(
      options(
        'feels',
        five.map(entity => line(entity, '°')),
      ).colors,
    ).toEqual(['#c1', '#c2', '#c3', '#c4', '#c1']);
  });

  test('draws what is measured thicker than what is for comparison, which is dashed', () => {
    const chart = options('feels', [line('outT', '°'), line('chill', '°', true)]);
    expect(chart.stroke).toEqual({width: [2.2, 1.6], dashArray: [0, 5], curve: 'smooth'});
  });

  test('steps between values for what is announced once, not measured', () => {
    expect(options('uv', [line('uv', '')]).stroke).toMatchObject({curve: 'stepline'});
    expect(options('pres', [line('pres', 'kPa')]).stroke).toMatchObject({curve: 'smooth'});
  });

  test('one unit is one axis, with the tile scale; a tile with no maximum lets Apex pick a nice one', () => {
    const axis = options('wind', [line('wind', 'km/h'), line('gust', 'km/h', true)]).yaxis as Axis;
    expect(axis).toMatchObject({
      min: 0,
      forceNiceScale: true,
      title: {text: 'km/h', style: {color: '#muted', fontWeight: 500}},
    });
    expect(axis.max).toBeUndefined();
    expect(options('aqhi', [line('aqhi', '')]).yaxis as Axis).toMatchObject({min: 0, max: 10, forceNiceScale: false});
  });

  test('two units are two axes: the second on the right, each shown once and named after its first series', () => {
    const axes = options('hum', [line('hum', '%'), line('dew', '°', true)]).yaxis as Axis[];
    expect(axes).toHaveLength(2);
    expect(axes.map(axis => [axis.seriesName, axis.opposite, axis.show])).toEqual([
      ['Air', false, true],
      ['Air', true, true],
    ]);
    expect(axes.map(axis => axis.title.text)).toEqual(['%', '']);
  });

  test('a unit shared by two series is shown once, on the axis of the first of them', () => {
    const axes = options('normal', [line('hi', '°'), line('nhi', '°', true), line('lo', 'kPa')]).yaxis as Axis[];
    expect(axes.map(axis => [axis.opposite, axis.show])).toEqual([
      [false, true],
      [false, false],
      [true, true],
    ]);
  });

  test('labels the axis with the tile digits, and a degree sign for degrees; a gap is blank', () => {
    const humidity = options('hum', [line('hum', '%'), line('dew', '°', true)]).yaxis as Axis[];
    expect(humidity[0].labels.formatter(71.04)).toBe('71'); // dec 1 on the tile: 71.0 is 71
    expect(humidity[1].labels.formatter(-3.5)).toBe('-3.5°');
    expect(humidity[0].labels.formatter(null as unknown as number)).toBe('');
    const wind = options('wind', [line('wind', 'km/h')]).yaxis as Axis;
    expect(wind.labels.formatter(14.6)).toBe('15'); // no dec: whole numbers
    const french = options('hum', [line('hum', '%'), line('dew', '°', true)], 'fr').yaxis as Axis[];
    expect(french[1].labels.formatter(-3.5)).toBe('-3,5°');
  });

  test('the time axis ends now and reaches back as far as the range', () => {
    expect(options('wind', [line('wind', 'km/h')], 'en', 'week').xaxis).toEqual({
      type: 'datetime',
      min: NOW - 7 * 864e5,
      max: NOW,
      labels: {datetimeUTC: false},
    });
    expect(options('wind', [line('wind', 'km/h')], 'en', 'day').xaxis).toMatchObject({min: NOW - 864e5});
    expect(options('wind', [line('wind', 'km/h')], 'en', 'year').xaxis).toMatchObject({min: NOW - 365 * 864e5});
  });

  test('shades the bands of the scale in the colour of their tone, with their word', () => {
    const {annotations} = options('uv', [line('uv', '')]);
    expect(annotations?.yaxis).toHaveLength(3);
    expect(annotations?.yaxis?.map(band => [band.y, band.y2, band.fillColor, band.opacity, band.label?.text])).toEqual([
      [0, 2, '#ok', 0.09, 'Low'],
      [3, 5, '#warn', 0.09, 'Moderate'],
      [6, 7, '#crit', 0.09, 'High'],
    ]);
    expect(annotations?.yaxis?.[0].label).toMatchObject({
      position: 'left',
      textAnchor: 'start',
      offsetX: 8,
      style: {color: '#muted', fontSize: '11px'},
    });
    expect(options('uv', [line('uv', '')], 'fr').annotations?.yaxis?.[0].label?.text).toBe('Bas');
    expect(options('wind', [line('wind', 'km/h')]).annotations?.yaxis).toEqual([]);
  });

  test('the tooltip shows the date in the range format, and each value with its own unit and the tile digits', () => {
    const chart = options('hum', [line('hum', '%'), line('dew', '°', true)], 'en', 'day');
    expect(chart.tooltip).toMatchObject({shared: true, x: {format: 'ddd h:mm tt'}});
    const format = (chart.tooltip as {y: {formatter: (value: number, opts: {seriesIndex: number}) => string}}).y
      .formatter;
    expect(format(71.25, {seriesIndex: 0})).toBe('71.3 %');
    expect(format(-3.5, {seriesIndex: 1})).toBe('-3.5 °');
    expect(format(null as unknown as number, {seriesIndex: 0})).toBe('–');
    expect(format(2, {seriesIndex: 9})).toBe('2 ');
    const french = options('hum', [line('hum', '%')], 'fr').tooltip as {
      y: {formatter: (value: number, opts: {seriesIndex: number}) => string};
    };
    expect(french.y.formatter(71.25, {seriesIndex: 0})).toBe('71,3 %');
  });

  test('every range has its tooltip format', () => {
    const formats = (['day', 'week', 'month', 'year'] as const).map(
      range => (options('wind', [line('wind', 'km/h')], 'en', range).tooltip as {x: {format: string}}).x.format,
    );
    expect(formats).toEqual(['ddd h:mm tt', 'ddd h tt', 'ddd MMM d, h tt', 'ddd MMM d, yyyy']);
  });
});

// ---------- against the legacy panel ----------
// The rules above are copies; until the history move deletes the methods they copy, a change to the source of one fails here, and
// whoever made it decides whether the copy follows. Deleted with loadWxHistory, renderSeason, loadWx and wxSheet.
describe('the copied rules against the legacy panel', () => {
  const panel = readFileSync(new URL('../../../../src/home-panel.js', import.meta.url), 'utf8');

  test.each([
    ['a frost night is a low below 0°', 'if (d.min < 0) m.frost++;'],
    ['a hot day is a high of 25° or more', 'if (d.max >= 25) m.hot++;'],
    ['a month bar is at least 2 percent wide', 'Math.max(2, w)'],
    ['a month bar runs from its low to its high on the shared scale', 'w = ((m.hi - m.lo) / span) * 100'],
    ['the scale of the months is the extremes, or 1', 'span = hi - lo || 1'],
    ['a day is dated at noon of its local day', 'k: this.fmtEn.isoDay(ms(x.start) + 12 * 36e5)'],
    ['a season day is one with a mean', '.filter(x => x.mean != null)'],
    ['the tick marks are the multiples of ten between -40 and 40', '[-40, -30, -20, -10, 0, 10, 20, 30, 40]'],
    [
      'a tick mark is a multiple of the step inside the scale',
      '.filter(v => v % step === 0 && v >= lo && v <= lo + span)',
    ],
    ['a statistic is kept to two digits', '+(+x[f]).toFixed(2)'],
    ['the middle of a bucket is added to a statistic', 'ms(y.start) + R.mid'],
    [
      'plain history is thinned to the range step',
      "const step = R.period === '5minute' ? 3e5 : R.period === 'hour' ? 36e5 : 864e5",
    ],
    ['a dashed line is thinner and a plain one 2.2', 'x.dash ? 1.6 : 2.2'],
    ['a dashed line is 5 long', 'x.dash ? 5 : 0'],
    ['a band is shaded at 9 percent', 'opacity: 0.09'],
    ['the second unit is on the right', 'opposite: units.indexOf(x.unit) > 0'],
    ['the band label sits on the left', "position: 'left'"],
    ['the axis keeps the tile digits', 'D.dec ?? 0'],
    ['the tooltip keeps the tile digits', 'D.dec ?? 1'],
  ])('%s', (_what, snippet) => {
    expect(panel, `the legacy panel no longer says ${snippet}`).toContain(snippet);
  });

  test('the frost and hot-day limits are the legacy ones', () => {
    expect([FROST_BELOW, HOT_FROM]).toEqual([0, 25]);
  });
});
