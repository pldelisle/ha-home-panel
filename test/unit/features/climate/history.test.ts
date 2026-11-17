// Climate's history at the pure-function seam (ADR 0005): literal statistics rows in, the series, the kWh, the heatmap's cells and colours and the three
// charts' options out; options are plain data, and their callbacks take `fmt` and `t` from the arguments. The colours are the legacy functions' own output, run once.
import {describe, expect, test} from 'vitest';
import type {ResolvedConfig} from '../../../../src/core/config.ts';
import type {StatisticRow} from '../../../../src/core/ha.ts';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {panelLocale} from '../../../../src/core/i18n/locale.ts';
import {createMessages} from '../../../../src/core/i18n/messages.ts';
import {
  bucket,
  climateWindow,
  deriveClimateHistory,
  heatColor,
  heatingKwh,
  heatmapOptions,
  heatLegend,
  heatRanges,
  heatScale,
  houseSeries,
  lateHeatPumpStart,
  rangeSeries,
  RANGE_WORDS,
  roomChartOptions,
  selectedKwh,
  selectedSeries,
  setpointSeries,
  type ClimateChartDeps,
  type HeatRow,
  type RoomLines,
  type SetpointPoint,
} from '../../../../src/features/climate/history.ts';
import type {Range} from '../../../../src/ui/ranges.ts';
import {fakeHass} from '../../fake-hass.ts';

const row = (
  start: number,
  mean: number | null | undefined,
  min?: number | null,
  max?: number | null,
): StatisticRow => ({
  start,
  end: start + 1,
  mean,
  min,
  max,
});

const deps = (language: 'en' | 'fr' = 'en') => {
  const locale = panelLocale(fakeHass({locale: {language}}), {timeZone: 'America/Toronto', browserLocale: 'en'});
  const fmt = createFormatters(locale);
  return {fmt, t: createMessages(locale).t};
};

/** A local instant in Toronto after the clocks went back (Sunday 1 November 2026): EST, five hours behind UTC. */
const local = (day: number, hour: number, minute = 0) => Date.UTC(2026, 10, day, hour + 5, minute);

const NOW = local(10, 12);
const TOKENS = {room: '#room', outside: '#out', setpoint: '#sp', card: '#card'};
const chartDeps = (language: 'en' | 'fr' = 'en', compact = false): ClimateChartDeps => ({
  ...deps(language),
  tokens: TOKENS,
  now: NOW,
  compact,
});

describe('climateWindow', () => {
  const config = {
    entities: {outT: 'sensor.out'},
    rooms: [
      {temp: 'sensor.a_t', target: 'sensor.a_sp', power: 'sensor.a_p'},
      {temp: 'sensor.b_t', target: 'sensor.b_sp', power: 'sensor.b_p'},
    ],
  } as unknown as Pick<ResolvedConfig, 'entities' | 'rooms'>;

  test('asks every room temperatures, setpoints and powers and the outside, mean low and high, over the range at the top of the hour', () => {
    const window = climateWindow('week', config, local(10, 12, 41));
    expect(window.ids).toEqual([
      'sensor.a_t',
      'sensor.b_t',
      'sensor.a_sp',
      'sensor.b_sp',
      'sensor.a_p',
      'sensor.b_p',
      'sensor.out',
    ]);
    expect(window.period).toBe('hour');
    expect(window.types).toEqual(['mean', 'min', 'max']);
    expect(window.start).toEqual(new Date(local(3, 12)));
  });

  test('the period follows the range: five minutes for a day, days for a year', () => {
    expect(climateWindow('day', config, NOW).period).toBe('5minute');
    expect(climateWindow('year', config, NOW).period).toBe('day');
  });
});

describe('rangeSeries', () => {
  const stats = {
    'sensor.t': [
      row(1_000_000, 20.126, 19.994, 20.456),
      row(1_300_000, 21, null, undefined),
      row(1_600_000, null),
      row(1_900_000, undefined),
    ],
  };

  test('is the mean, low and high moved to the middle of the bucket, two decimals, a row with no mean skipped', () => {
    expect(rangeSeries(stats, 'sensor.t', 'day')).toEqual([
      [1_150_000, 20.13, 19.99, 20.46],
      [1_450_000, 21, null, null],
    ]);
    // an hour's middle is 1 800 000 ms on, a day's 43 200 000
    expect(rangeSeries(stats, 'sensor.t', 'week')[0][0]).toBe(2_800_000);
    expect(rangeSeries(stats, 'sensor.t', 'year')[0][0]).toBe(44_200_000);
  });

  test('an id the house leaves unset or the recorder does not know has no points', () => {
    expect(rangeSeries(stats, null, 'day')).toEqual([]);
    expect(rangeSeries(stats, 'sensor.other', 'day')).toEqual([]);
  });
});

describe('setpointSeries', () => {
  test('off throughout is a gap, never off shows its mean, partly off shows its highest setpoint', () => {
    const stats = {
      'sensor.sp': [
        row(0, 5, 5, 5), // the frost guard all along: off
        row(300_000, 18, 5, 21.456), // off for a while: the highest
        row(600_000, 20.504, 20, 21), // held: the mean
        row(900_000, null, 20, 21), // held but no mean: the highest
        row(1_200_000, 20, 20, null), // no setpoint at all: skipped
      ],
    };
    expect(setpointSeries(stats, 'sensor.sp', 'day')).toEqual([
      [150_000, null],
      [450_000, 21.46],
      [750_000, 20.5],
      [1_050_000, 21],
    ]);
  });

  test('a setpoint just over the cut-off is on, one at it is off', () => {
    const stats = {'sensor.sp': [row(0, 5.6, 5.6, 5.6), row(300_000, 5.5, 5.5, 5.5)]};
    expect(setpointSeries(stats, 'sensor.sp', 'day')).toEqual([
      [150_000, 5.6],
      [450_000, null],
    ]);
  });

  test('an unset id has none', () => {
    expect(setpointSeries({}, undefined, 'day')).toEqual([]);
  });
});

describe('heatingKwh', () => {
  const HOUR = 36e5;

  test('is each hourly mean kW times an hour, the running hour counting only what has passed', () => {
    const stats = {
      'sensor.p': [
        row(NOW - 5 * HOUR, 2),
        row(NOW - HOUR / 2, 4), // the running hour: half of it so far
        row(NOW + HOUR, 9), // not begun
        row(NOW - 3 * HOUR, null),
      ],
    };
    expect(heatingKwh(stats, 'sensor.p', 'hour', NOW)).toBe(2 + 2);
  });

  test('the period sets the hours: twelve to the hour for five minutes, a day for days', () => {
    expect(heatingKwh({'sensor.p': [row(NOW - HOUR, 12)]}, 'sensor.p', '5minute', NOW)).toBe(1);
    expect(heatingKwh({'sensor.p': [row(NOW - 30 * HOUR, 1), row(NOW - 6 * HOUR, 1)]}, 'sensor.p', 'day', NOW)).toBe(
      24 + 6,
    );
  });

  test('an unset sensor heats nothing', () => {
    expect(heatingKwh({}, null, 'hour', NOW)).toBe(0);
  });
});

describe('houseSeries', () => {
  test('is the mean of the rooms at each instant, in time order, an instant missing a room dropped', () => {
    const a = [
      [3, 20.01],
      [1, 20],
      [2, 21],
    ] as const;
    const b = [
      [1, 22],
      [3, 21.5],
    ] as const;
    expect(houseSeries([a, b], 2)).toEqual([
      [1, 21],
      [3, 20.76],
    ]);
  });

  test('a room with no rows drops every instant, and a gap is not a reading', () => {
    expect(houseSeries([[[1, 20]], []], 2)).toEqual([]);
    expect(houseSeries([[[1, null]], [[1, 22]]], 2)).toEqual([]);
  });
});

describe('bucket', () => {
  // Sunday 8 November 23:00, then Monday the 9th at 01:00, 05:00 and 07:00, and Wednesday the 11th at 13:00; a gap in between
  const points = [
    [local(8, 23), 19],
    [local(9, 1), 20],
    [local(9, 5), 22],
    [local(9, 7), 24],
    [local(9, 8), null],
    [local(11, 13), 18.333],
  ] as const;

  test('a day is grouped by the hour: its key is the local day and hour, its label the weekday and the hour', () => {
    const cells = bucket(points, 'day', deps());
    expect(cells.map(({key, label, axis, value}) => [key, label, axis, value])).toEqual([
      ['2026-11-08 23', 'Sun, 11 pm', '11 pm', 19],
      ['2026-11-09 01', 'Mon, 1 am', '1 am', 20],
      ['2026-11-09 05', 'Mon, 5 am', '5 am', 22],
      ['2026-11-09 07', 'Mon, 7 am', '7 am', 24],
      ['2026-11-11 13', 'Wed, 1 pm', '1 pm', 18.33],
    ]);
  });

  test('a week is grouped by six hours: the first block of a day is the night and the axis writes the day there only, the words in the language', () => {
    const cells = bucket(points, 'week', deps());
    expect(cells.map(({key, label, axis, value}) => [key, label, axis, value])).toEqual([
      ['2026-11-08 18', 'Sun 8, evening', '', 19],
      ['2026-11-09 00', 'Mon 9, night', 'Mon 9', 21], // 01:00 and 05:00 share a block
      ['2026-11-09 06', 'Mon 9, morning', '', 24],
      ['2026-11-11 12', 'Wed 11, afternoon', '', 18.33],
    ]);
    expect(bucket(points, 'week', deps('fr')).map(cell => cell.label)).toEqual([
      'dim. 8, soir',
      'lun. 9, nuit',
      'lun. 9, matin',
      'mer. 11, après-midi',
    ]);
  });

  test('a month is grouped by the local day, labelled with its date in the language', () => {
    expect(bucket(points, 'month', deps()).map(({key, label, value}) => [key, label, value])).toEqual([
      ['2026-11-08', 'Nov 8', 19],
      ['2026-11-09', 'Nov 9', 22],
      ['2026-11-11', 'Nov 11', 18.33],
    ]);
    expect(bucket(points, 'month', deps('fr')).map(cell => cell.label)).toEqual(['8 nov.', '9 nov.', '11 nov.']);
  });

  test('a year is grouped by the week, which starts on Monday: a Sunday belongs to the week before', () => {
    const cells = bucket(points, 'year', deps());
    expect(cells.map(({key, label, value}) => [key, label, value])).toEqual([
      ['2026-11-02', 'Nov 2', 19],
      ['2026-11-09', 'Nov 9', 21.08],
    ]);
  });

  test('keys and labels are unique, whatever the range, and there is nothing to group without readings', () => {
    for (const range of ['day', 'week', 'month', 'year'] as const) {
      const cells = bucket(points, range, deps());
      expect(new Set(cells.map(cell => cell.key)).size).toBe(cells.length);
      expect(new Set(cells.map(cell => cell.label)).size).toBe(cells.length);
    }
    expect(bucket([[1, null]], 'day', deps())).toEqual([]);
  });
});

describe('heatColor', () => {
  const light = heatScale(false);
  const dark = heatScale(true);

  test('at each stop it is the stop, lower case, on both scales', () => {
    expect(light.map(([temperature]) => heatColor(temperature, light))).toEqual([
      '#24467f',
      '#3f7dbf',
      '#8dbad8',
      '#e6d9a2',
      '#ee9a52',
      '#cf592b',
      '#87210f',
    ]);
    expect(dark.map(([temperature]) => heatColor(temperature, dark))).toEqual([
      '#3561a8',
      '#4f8bcb',
      '#8fbad6',
      '#d9c98e',
      '#ee9a52',
      '#d4602f',
      '#9a2c17',
    ]);
  });

  test('between the stops it is the legacy blend, and past the scale the end colour', () => {
    expect(heatColor(17.5, light)).toBe('#2a538f');
    expect(heatColor(19.75, light)).toBe('#669ccc');
    expect(heatColor(21, light)).toBe('#bacac0');
    expect(heatColor(25.25, light)).toBe('#aa3d1d');
    expect(heatColor(22.25, dark)).toBe('#e5b271');
    expect(heatColor(16, light)).toBe('#24467f');
    expect(heatColor(30, dark)).toBe('#9a2c17');
  });
});

describe('heatRanges', () => {
  test('are ninety bands of a tenth of a degree, the first reaching down and the last up, in the legacy colours', () => {
    const light = heatRanges(heatScale(false));
    expect(light).toHaveLength(90);
    expect(light[0]).toEqual({from: -99, to: 17.0999, color: '#254781'});
    expect(light[1]).toEqual({from: 17.1, to: 17.1 + 0.0999, color: '#264a84'});
    expect(light[88]).toEqual({from: 25.8, to: 25.8 + 0.0999, color: '#8e2712'});
    expect(light[89]).toEqual({from: 25.9, to: 99, color: '#892310'});
    const dark = heatRanges(heatScale(true));
    expect([dark[0].color, dark[1].color, dark[88].color, dark[89].color]).toEqual([
      '#3662a9',
      '#3764ab',
      '#a03119',
      '#9c2e18',
    ]);
  });
});

describe('RANGE_WORDS', () => {
  test('every range has a heatmap title the English catalog says', () => {
    const {t} = deps();
    expect((['day', 'week', 'month', 'year'] as const).map(range => t(RANGE_WORDS[range].heatTitle))).toEqual([
      'Every room, hour by hour',
      'Every room, every 6 hours',
      'Every room, every day',
      'Every room, week by week',
    ]);
  });
});

/** The value at a dotted path of an options object, and the function there called. */
const at = (options: object, path: string): unknown =>
  path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown>)[key], options);
const call = (options: object, path: string, ...args: unknown[]): unknown =>
  (at(options, path) as (...args: unknown[]) => unknown)(...args);

describe('heatmapOptions', () => {
  const cells = (labels: string[], axes: string[] = []) =>
    labels.map((label, index) => ({key: `k${index}`, label, axis: axes[index] ?? '', value: 20 + index}));
  const rows: HeatRow[] = [
    {
      name: 'Den',
      cells: cells(['a', 'b', 'c', 'd', 'e', 'f', 'g'], ['1 am', '2 am', '3 am', '4 am', '5 am', '6 am', '7 am']),
    },
    {name: 'Bed', cells: cells(['a'])},
  ];
  const build = (range: Range, compact = false, of = rows) =>
    heatmapOptions(of, range, heatScale(false), chartDeps('en', compact));

  test('a row per room with its cells, the colour scale and the cell borders in the card colour', () => {
    const options = build('month');
    expect(at(options, 'chart')).toEqual({type: 'heatmap'});
    const series = at(options, 'series') as {name: string; data: unknown[]}[];
    expect(series.map(row => row.name)).toEqual(['Den', 'Bed']);
    expect(series[0].data[0]).toEqual({x: 'a', y: 20, k: 'k0'});
    expect(series[0].data[6]).toEqual({x: 'g', y: 26, k: 'k6'});
    expect(at(options, 'plotOptions.heatmap')).toEqual({
      radius: 4,
      enableShades: false,
      colorScale: {ranges: heatRanges(heatScale(false))},
    });
    expect(at(options, 'stroke')).toEqual({width: 2, colors: ['#card']});
    expect(at(options, 'xaxis.categories')).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g']);
    expect(call(options, 'tooltip.y.formatter', 20.25)).toBe('20.3 °C');
    expect(call(options, 'tooltip.y.formatter', null)).toBe('–');
  });

  test('a week and a year have rounder, thinner cells than a day and a month', () => {
    const look = (range: Range) => [at(build(range), 'plotOptions.heatmap.radius'), at(build(range), 'stroke.width')];
    expect([look('week'), look('year'), look('day'), look('month')]).toEqual([
      [2, 1],
      [2, 1],
      [4, 2],
      [4, 2],
    ]);
  });

  test('a day labels every third cell with its hour, every sixth on a narrow screen', () => {
    const label = (options: object, text: string) => call(options, 'xaxis.labels.formatter', text);
    const wide = build('day');
    expect(['a', 'b', 'c', 'd', 'g'].map(text => label(wide, text))).toEqual(['1 am', '', '', '4 am', '7 am']);
    const narrow = build('day', true);
    expect(['a', 'd', 'g'].map(text => label(narrow, text))).toEqual(['1 am', '', '7 am']);
  });

  test('a week labels the cells that have an axis text and no other', () => {
    const week = build('week', false, [{name: 'Den', cells: cells(['x', 'y'], ['Mon 9', ''])}]);
    expect(['x', 'y', 'z'].map(text => call(week, 'xaxis.labels.formatter', text))).toEqual(['Mon 9', '', '']);
  });

  test('a month thins its own labels to about ten on a wide screen and four on a narrow one', () => {
    const labels = Array.from({length: 30}, (_, index) => `d${index}`);
    const many = [{name: 'Den', cells: cells(labels)}];
    const shown = (compact: boolean) =>
      labels.filter(text => call(build('month', compact, many), 'xaxis.labels.formatter', text)).length;
    expect([shown(false), shown(true)]).toEqual([10, 4]);
  });

  test('a house without rooms has an empty chart', () => {
    const options = build('day', false, []);
    expect(at(options, 'series')).toEqual([]);
    expect(at(options, 'xaxis.categories')).toEqual([]);
  });
});

describe('roomChartOptions', () => {
  const points = [
    [1, 20, 19, 21],
    [2, null],
    [3, 21.2],
  ] as const;
  const outside = [
    [1, 3, 1, 5],
    [3, 4, 2, 6],
  ] as const;
  const setpoints: SetpointPoint[] = [
    [1, 21],
    [2, null],
  ];
  const build = (over: Partial<RoomLines> = {}, language: 'en' | 'fr' = 'en') =>
    roomChartOptions(
      {name: 'Den', points, setpoints: [], outside, heatPump: false, ...over},
      'week',
      chartDeps(language),
    );
  const names = (options: object) => (at(options, 'series') as {name: string}[]).map(line => line.name);

  test('without a setpoint it is two smooth lines, the room and the outside, two columns each', () => {
    const options = build();
    expect(at(options, 'chart')).toEqual({type: 'line'});
    expect(at(options, 'series')).toEqual([
      {
        name: 'Den',
        data: [
          [1, 20],
          [2, null],
          [3, 21.2],
        ],
      },
      {
        name: 'Outside',
        data: [
          [1, 3],
          [3, 4],
        ],
      },
    ]);
    expect(at(options, 'colors')).toEqual(['#room', '#out']);
    expect(at(options, 'stroke')).toEqual({width: 2.2, curve: 'smooth'});
  });

  test('with a setpoint it is a dashed stepped line between them, and the others use monotoneCubic', () => {
    const options = build({setpoints});
    expect(names(options)).toEqual(['Den', 'Setpoint', 'Outside']);
    expect((at(options, 'series') as {data: unknown}[])[1].data).toBe(setpoints);
    expect(at(options, 'colors')).toEqual(['#room', '#sp', '#out']);
    expect(at(options, 'stroke')).toEqual({
      width: [2.2, 2, 2.2],
      curve: ['monotoneCubic', 'stepline', 'monotoneCubic'],
      dashArray: [0, 5, 0],
    });
    expect(names(build({setpoints}, 'fr'))).toEqual(['Den', 'Consigne', 'Extérieur']);
  });

  test('a setpoint that is a gap throughout is no setpoint', () => {
    expect(names(build({setpoints: [[1, null]]}))).toEqual(['Den', 'Outside']);
  });

  test('the heat pump is a straight line, with a setpoint or without', () => {
    expect(at(build({heatPump: true}), 'stroke.curve')).toBe('straight');
    expect(at(build({heatPump: true, setpoints}), 'stroke.curve')).toEqual(['straight', 'stepline', 'straight']);
  });

  test('the axis is a time axis of the range ending now, whole degrees, and the tooltip reads tenths', () => {
    const options = build();
    expect(at(options, 'xaxis')).toEqual({
      type: 'datetime',
      min: NOW - 7 * 864e5,
      max: NOW,
      labels: {datetimeUTC: false},
    });
    expect(call(options, 'yaxis.labels.formatter', 20.4)).toBe('20°');
    expect(call(options, 'yaxis.labels.formatter', null)).toBe('');
    expect(call(options, 'tooltip.x.formatter', Date.parse('2026-11-09T21:07:00Z'))).toBe('Mon 4 pm');
    expect(at(options, 'tooltip.shared')).toBe(true);
    expect(call(options, 'tooltip.y.formatter', 20.25)).toBe('20.3 °C');
    expect(call(options, 'tooltip.y.formatter', null)).toBe('–');
  });
});

describe('deriveClimateHistory', () => {
  const config = {
    entities: {outT: 'sensor.out', hp: 'climate.pump'},
    rooms: [
      {k: 'den', temp: 'sensor.den_t', target: 'sensor.den_sp', power: 'sensor.den_p'},
      {k: 'loft', temp: 'sensor.loft_t', target: 'sensor.loft_sp', power: 'sensor.loft_p'},
    ],
  } as unknown as Pick<ResolvedConfig, 'entities' | 'rooms'>;
  const HOUR = 36e5;
  const start = local(10, 6);
  const statistics = {
    'sensor.den_t': [row(start, 20.126, 19, 21), row(start + HOUR, 21, 20, 22)],
    'sensor.den_sp': [row(start, 21, 21, 21), row(start + HOUR, 5, 5, 5)],
    'sensor.den_p': [row(start, 1.5), row(start + HOUR, 2)],
    'sensor.loft_t': [row(start, 19.5)],
    'sensor.out': [row(start, -3, -5, 1)],
  };
  const at = start + HOUR + 30 * 60_000;
  const point = (lastUpdated: number, state: string, attributes?: Record<string, unknown>) => ({
    state,
    lastUpdated,
    lastChanged: lastUpdated,
    attributes,
  });
  const history = {
    'climate.pump': [
      point(start + 1_000, 'heat', {current_temperature: 19, temperature: 22}),
      point(start + 2_000, 'off', {current_temperature: 20, temperature: 22}),
      point(start + 3_000, 'unavailable'),
    ],
  };
  const derived = deriveClimateHistory({statistics, history}, 'week', config, at, start);

  test('is every room’s series, setpoints and heating, the outside’s series and what the window and the load were', () => {
    expect([derived.range, derived.at, derived.start]).toEqual(['week', at, start]);
    expect(derived.rooms).toEqual({
      den: [
        [start + HOUR / 2, 20.13, 19, 21],
        [start + HOUR * 1.5, 21, 20, 22],
      ],
      loft: [[start + HOUR / 2, 19.5, null, null]],
    });
    // the second hour was off throughout: a gap; a room with no setpoint rows has none
    expect(derived.sp).toEqual({
      den: [
        [start + HOUR / 2, 21],
        [start + HOUR * 1.5, null],
      ],
      loft: [],
    });
    // the running hour counts the half hour that has passed
    expect(derived.kwh.den).toBeCloseTo(1.5 + 2 * 0.5);
    expect(derived.kwh.loft).toBe(0);
    expect(derived.out).toEqual([[start + HOUR / 2, -3, -5, 1]]);
  });

  test('the heat pump’s line breaks where it was unavailable, its target is a gap in the modes that have none, and it starts at its first reading', () => {
    expect(derived.hp).toEqual([
      [start + 1_000, 19],
      [start + 2_000 - 1, 19],
      [start + 2_000, 20],
      [start + 3_000, null],
    ]);
    expect(derived.hpSp).toEqual([
      [start + 1_000, 22],
      [start + 2_000, null],
      [start + 3_000, null],
    ]);
    expect(derived.hpFrom).toBe(start + 1_000);
  });

  test('a house without a heat pump, or whose history came back empty, has no line and no start', () => {
    const none = deriveClimateHistory({statistics, history: {}}, 'week', config, at, start);
    expect([none.hp, none.hpSp, none.hpFrom]).toEqual([[], [], null]);
    const unset = {...config, entities: {outT: null, hp: null}} as unknown as typeof config;
    const bare = deriveClimateHistory({statistics, history}, 'week', unset, at, start);
    expect([bare.hp, bare.out]).toEqual([[], []]);
  });

  test('an attribute that is no number is no reading', () => {
    const odd = {'climate.pump': [point(start, 'heat', {current_temperature: '19', temperature: null})]};
    const result = deriveClimateHistory({statistics, history: odd}, 'week', config, at, start);
    expect([result.hp, result.hpSp]).toEqual([[], []]);
  });

  test('selectedSeries: the heat pump’s lines, the mean of the rooms, or a room’s own with its setpoint; selectedKwh: the total, a room’s, or none', () => {
    const keys = ['den', 'loft'];
    expect(selectedSeries(derived, 'hp', keys)).toEqual({points: derived.hp, setpoints: derived.hpSp});
    expect(selectedSeries(derived, 'den', keys)).toEqual({points: derived.rooms.den, setpoints: derived.sp.den});
    // only the instant both rooms have a reading for, and the house has no setpoint
    expect(selectedSeries(derived, 'house', keys)).toEqual({points: [[start + HOUR / 2, 19.81]], setpoints: []});
    expect(selectedSeries(derived, 'nowhere', keys)).toEqual({points: [], setpoints: []});
    expect(selectedKwh(derived, 'hp')).toBeNull();
    expect(selectedKwh(derived, 'den')).toBe(derived.kwh.den);
    expect(selectedKwh(derived, 'house')).toBeCloseTo(derived.kwh.den);
    expect(selectedKwh(derived, 'nowhere')).toBeNull();
  });

  test('lateHeatPumpStart: the line’s first instant when it starts over a day after the window, else nothing', () => {
    const late = (hpFrom: number | null) => lateHeatPumpStart({...derived, hpFrom});
    expect(late(start + 864e5 + 1)).toBe(start + 864e5 + 1);
    expect(late(start + 864e5)).toBeNull();
    expect(late(null)).toBeNull();
  });
});

describe('heatLegend', () => {
  test('is a colour for every half degree of the scale and a tick every two degrees, at their places along the bar', () => {
    const legend = heatLegend(heatScale(false));
    expect(legend.colors).toHaveLength(19);
    expect([legend.colors[0], legend.colors[18]]).toEqual(['#24467f', '#87210f']);
    expect(legend.colors[2]).toBe(heatColor(18, heatScale(false)));
    expect(legend.ticks.map(tick => tick.degrees)).toEqual([17, 19, 21, 23, 25]);
    expect(legend.ticks.map(tick => tick.at)).toEqual([0, 2, 4, 6, 8].map(step => (step / 9) * 100));
    expect(heatLegend(heatScale(true)).colors[0]).toBe('#3561a8');
  });
});
