// ClimateCharts at the pure seam (ADR 0005): the options a request makes, and the objects it hands back again while nothing they are made of changed,
// which is what keeps the heatmap one chart instance across a setpoint change, a selection change and every store update.
import {describe, expect, test, vi} from 'vitest';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {panelLocale} from '../../../../src/core/i18n/locale.ts';
import {createMessages} from '../../../../src/core/i18n/messages.ts';
import {
  ClimateCharts,
  type ClimateChartsDeps,
  type ClimateChartsRequest,
} from '../../../../src/features/climate/charts.ts';
import type {ClimateHistoryData} from '../../../../src/features/climate/history.ts';
import {fakeHass} from '../../fake-hass.ts';

const AT = Date.UTC(2026, 10, 10, 17);
const HOUR = 36e5;
const history = (over: Partial<ClimateHistoryData> = {}): ClimateHistoryData => ({
  range: 'day',
  at: AT,
  start: AT - 864e5,
  rooms: {
    den: [
      [AT - 2 * HOUR, 20, 19, 21],
      [AT - HOUR, 21, 20, 22],
    ],
    loft: [
      [AT - 2 * HOUR, 18, 17, 19],
      [AT - HOUR, 19, 18, 20],
    ],
  },
  sp: {den: [[AT - HOUR, 21]], loft: []},
  kwh: {},
  heat: {},
  out: [
    [AT - 2 * HOUR, -3, -5, 1],
    [AT - HOUR, -2, -4, 2],
  ],
  hp: [[AT - HOUR, 19]],
  hpSp: [[AT - HOUR, 22]],
  hpFrom: AT - HOUR,
  hpHeat: [],
  ...over,
});

const locale = (language: 'en' | 'fr') =>
  panelLocale(fakeHass({locale: {language}}), {timeZone: 'America/Toronto', browserLocale: 'en'});

/** The deps of a page, with the tokens counted: a chart that is not built reads none. */
function deps(over: Partial<ClimateChartsDeps> = {}) {
  const tokens = vi.fn(() => ({room: '#room', heating: '#heat', outside: '#out', setpoint: '#sp', card: '#card'}));
  const page: ClimateChartsDeps = {
    fmt: createFormatters(locale('en')),
    t: createMessages(locale('en')).t,
    dark: false,
    language: 'en',
    compact: false,
    tokens,
    ...over,
  };
  return {page, tokens};
}

const ROOMS = [
  {key: 'loft', name: 'Loft'},
  {key: 'den', name: 'Den'},
];
const request = (over: Partial<ClimateChartsRequest> = {}): ClimateChartsRequest => ({
  history: history(),
  selection: 'den',
  name: 'Den',
  roomKeys: ['den', 'loft'],
  heatmapRooms: ROOMS,
  ...over,
});

const seriesOf = (options: Record<string, unknown>) => options.series as {name: string; data: unknown[]}[];

describe('ClimateCharts', () => {
  test('makes the room chart of the selection, and the heatmap of every room in the order given: no outside chart, the outside being the room chart’s line', () => {
    const {page} = deps();
    const made = new ClimateCharts().build(request(), page);
    expect(seriesOf(made.chart).map(series => series.name)).toEqual(['Den', 'Setpoint', 'Outside']);
    expect(seriesOf(made.heatmap!).map(series => series.name)).toEqual(['Loft', 'Den']);
    expect(seriesOf(made.heatmap!)[1].data).toHaveLength(2);
    expect(made).not.toHaveProperty('outside');
    expect(made.chart.colors).toEqual(['#room', '#sp', '#out']);
  });

  test('the house’s line is the mean of the rooms and the heat pump’s is its own, each named as the request says', () => {
    const {page} = deps();
    const charts = new ClimateCharts();
    const house = charts.build(request({selection: 'house', name: 'House average'}), page);
    expect(seriesOf(house.chart)[0]).toEqual({
      name: 'House average',
      data: [
        [AT - 2 * HOUR, 19],
        [AT - HOUR, 20],
      ],
    });
    expect(seriesOf(house.chart).map(series => series.name)).toEqual(['House average', 'Outside']);
    const pump = charts.build(request({selection: 'hp', name: 'Heat pump'}), page);
    expect(seriesOf(pump.chart).map(series => series.name)).toEqual(['Heat pump', 'Setpoint', 'Outside']);
    expect((pump.chart.stroke as {curve: string[]}).curve[0]).toBe('straight');
  });

  test('hands back the very objects while the history, the selection, the theme and the language are the same', () => {
    const {page, tokens} = deps();
    const charts = new ClimateCharts();
    const input = request();
    const first = charts.build(input, page);
    const again = charts.build({...input}, {...page});
    expect(again.chart).toBe(first.chart);
    expect(again.heatmap).toBe(first.heatmap);
    // the page's colours were read for the one build of the two charts, not for the second
    expect(tokens).toHaveBeenCalledTimes(2);
  });

  test('another selection makes the room chart again and leaves the heatmap as it was', () => {
    const {page} = deps();
    const charts = new ClimateCharts();
    const input = request();
    const first = charts.build(input, page);
    const second = charts.build({...input, selection: 'loft', name: 'Loft'}, page);
    expect(second.chart).not.toBe(first.chart);
    expect(second.heatmap).toBe(first.heatmap);
  });

  test('another load of the range, the theme or the language makes every chart again; a narrow screen only the heatmap', () => {
    const charts = new ClimateCharts();
    const first = charts.build(request(), deps().page);
    const reloaded = charts.build(request({history: history()}), deps().page);
    expect([reloaded.chart, reloaded.heatmap].map((options, i) => options === [first.chart, first.heatmap][i])).toEqual(
      [false, false],
    );
    const dark = charts.build(request({history: history()}), deps({dark: true}).page);
    expect(dark.heatmap).not.toBe(reloaded.heatmap);
    const input = request({history: history()});
    const wide = charts.build(input, deps().page);
    const narrow = charts.build(input, deps({compact: true}).page);
    expect(narrow.heatmap).not.toBe(wide.heatmap);
    expect(narrow.chart).toBe(wide.chart);
    const french = charts.build(
      input,
      deps({language: 'fr', fmt: createFormatters(locale('fr')), t: createMessages(locale('fr')).t}).page,
    );
    expect(seriesOf(french.chart).map(series => series.name)).toEqual(['Den', 'Consigne', 'Extérieur']);
    expect(french.chart).not.toBe(narrow.chart);
  });

  test('a room renamed makes the heatmap again, and nothing else', () => {
    const {page} = deps();
    const charts = new ClimateCharts();
    const input = request();
    const first = charts.build(input, page);
    const renamed = charts.build({...input, heatmapRooms: [{key: 'loft', name: 'Attic'}, ROOMS[1]]}, page);
    expect(renamed.heatmap).not.toBe(first.heatmap);
    expect(seriesOf(renamed.heatmap!)[0].name).toBe('Attic');
    expect(renamed.chart).toBe(first.chart);
    // a room swapped for another with the same name draws its own readings: the slot keys on the room, not only its word
    const swapped = charts.build({...input, heatmapRooms: [{key: 'den', name: 'Loft'}, ROOMS[1]]}, page);
    expect(swapped.heatmap).not.toBe(first.heatmap);
    expect(seriesOf(swapped.heatmap!)[0].data).toEqual(seriesOf(first.heatmap!)[1].data);
  });

  test('the phone asks for the room chart only, and a house with no thermostat has no heatmap', () => {
    const {page} = deps();
    const charts = new ClimateCharts();
    const phone = charts.build(request({heatmapRooms: null}), page);
    expect(phone.heatmap).toBeNull();
    expect(phone.chart).toBeTruthy();
    const none = charts.build(request({heatmapRooms: [], selection: 'hp', name: 'Heat pump'}), page);
    expect(none.heatmap).toBeNull();
  });

  test('draws the axis to the instant of the load, not to the one of the draw', () => {
    const {page} = deps();
    const {chart} = new ClimateCharts().build(request(), page);
    expect((chart.xaxis as {max: number}).max).toBe(AT);
  });
});
