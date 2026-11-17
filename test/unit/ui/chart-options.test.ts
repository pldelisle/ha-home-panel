// The pure half of <hp-chart> (src/ui/chart-options.ts): the base look, the merge a chart's options go through, and the time axis and tooltip dates in the house's formats.
import {describe, expect, test} from 'vitest';
import {createFormatters} from '../../../src/core/i18n/format.ts';
import {panelLocale} from '../../../src/core/i18n/locale.ts';
import {
  baseOptions,
  celsius,
  houseAxis,
  mergeOptions,
  timeAxis,
  tooltipDate,
  type ChartOptions,
} from '../../../src/ui/chart-options.ts';
import {RANGES} from '../../../src/ui/ranges.ts';
import {fakeHass} from '../fake-hass.ts';

describe('mergeOptions', () => {
  test('merges objects key by key, replaces anything else, and changes neither argument', () => {
    const base = Object.freeze({
      chart: Object.freeze({height: 200, toolbar: Object.freeze({show: false})}),
      colors: ['#a'],
    });
    const options = Object.freeze({chart: Object.freeze({type: 'line', height: 250}), colors: ['#b', '#c']});
    expect(mergeOptions(base, options)).toEqual({
      chart: {height: 250, toolbar: {show: false}, type: 'line'},
      colors: ['#b', '#c'],
    });
    expect(base.chart.height).toBe(200);
  });
});

describe('baseOptions', () => {
  const deps = {
    tokens: {font: 'Manrope', text: '#555', line: '#ddd'},
    dark: false,
    reducedMotion: false,
    noData: 'No history yet',
  };

  test("takes the panel's face and colours from the tokens, and says what an empty chart says", () => {
    const options = baseOptions(250, deps) as {chart: ChartOptions; grid: ChartOptions; noData: ChartOptions};
    expect(options.chart).toMatchObject({
      height: 250,
      fontFamily: 'Manrope',
      foreColor: '#555',
      background: 'transparent',
    });
    expect(options.grid.borderColor).toBe('#ddd');
    expect(options.noData).toEqual({text: 'No history yet'});
  });

  test('has the tooltip follow the theme and the animations follow reduced motion', () => {
    const dark = baseOptions(200, {...deps, dark: true, reducedMotion: true}) as {
      chart: {animations: unknown};
      tooltip: unknown;
    };
    expect(dark.tooltip).toEqual({theme: 'dark'});
    expect(dark.chart.animations).toEqual({enabled: false});
    const light = baseOptions(200, deps) as {chart: {animations: unknown}; tooltip: unknown};
    expect(light.tooltip).toEqual({theme: 'light'});
    expect(light.chart.animations).toEqual({enabled: true});
  });
});

const houseFmt = (language: 'en' | 'fr') =>
  createFormatters(panelLocale(fakeHass({locale: {language}}), {timeZone: 'America/Toronto', browserLocale: 'en'}));
// Toronto is five hours behind UTC after 1 November 2026
const FOUR_PM = Date.parse('2026-11-11T21:00:00Z');
const HALF_PAST_FOUR = Date.parse('2026-11-11T21:30:00Z');
const MIDNIGHT = Date.parse('2026-11-11T05:00:00Z');

describe("the time axis in the house's formats", () => {
  const input = (): ChartOptions => ({
    chart: {type: 'line'},
    xaxis: {type: 'datetime', min: 1, labels: {datetimeUTC: false}},
  });
  const labelOf = (options: ChartOptions) =>
    (options.xaxis as {labels: {formatter: (text: string, at: number) => string}}).labels.formatter;

  test('writes the hours and the days of the English house: 4 pm, 4:30 pm, Nov 11', () => {
    const label = labelOf(houseAxis(input(), houseFmt('en')));
    expect([FOUR_PM, HALF_PAST_FOUR, MIDNIGHT].map(at => label('ignored', at))).toEqual(['4 pm', '4:30 pm', 'Nov 11']);
  });

  test('writes the hours and the days of the French house: 16 h, 16 h 30, 11 nov.', () => {
    const label = labelOf(houseAxis(input(), houseFmt('fr')));
    expect([FOUR_PM, HALF_PAST_FOUR, MIDNIGHT].map(at => label('ignored', at))).toEqual(['16 h', '16 h 30', '11 nov.']);
  });

  test('keeps the options it had, and a formatter the chart wrote itself', () => {
    const own = () => 'mine';
    const options = houseAxis(
      {...input(), xaxis: {type: 'datetime', labels: {datetimeUTC: false, formatter: own}}},
      houseFmt('en'),
    );
    expect(options.xaxis).toEqual({type: 'datetime', labels: {datetimeUTC: false, formatter: own}});
    expect(houseAxis(input(), houseFmt('en')).chart).toEqual({type: 'line'});
  });

  test('leaves a chart with no time axis as it came', () => {
    const donut = {chart: {type: 'donut'}, labels: ['a']};
    expect(houseAxis(donut, houseFmt('fr'))).toBe(donut);
  });
});

describe('tooltipDate', () => {
  test('names the day and the clock a range asks for, in each language', () => {
    const heading = (language: 'en' | 'fr') =>
      Object.values(RANGES).map(range => tooltipDate(range.tooltip, houseFmt(language))(HALF_PAST_FOUR));
    expect(heading('en')).toEqual(['Wed 4:30 pm', 'Wed 4 pm', 'Wed, Nov 11 4 pm', 'Wed, Nov 11']);
    expect(heading('fr')).toEqual(['mer. 16 h 30', 'mer. 16 h', 'mer. 11 nov. 16 h', 'mer. 11 nov.']);
  });

  test('can name the clock alone, or the date and the time', () => {
    expect(tooltipDate({day: null, clock: 'time'}, houseFmt('en'))(HALF_PAST_FOUR)).toBe('4:30 pm');
    expect(tooltipDate({day: 'date', clock: 'time'}, houseFmt('fr'))(HALF_PAST_FOUR)).toBe('mer. 11 nov. 16 h 30');
  });
});

describe('timeAxis', () => {
  test('is a time axis of the days before now, ending now, on the house clock', () => {
    expect(timeAxis(7, 10 * 864e5)).toEqual({
      type: 'datetime',
      min: 3 * 864e5,
      max: 10 * 864e5,
      labels: {datetimeUTC: false},
    });
  });
});

describe('celsius', () => {
  test('is a tenth of a degree and the unit in the language, or the dash with no reading', () => {
    const french = createFormatters(
      panelLocale(fakeHass({locale: {language: 'fr'}}), {timeZone: 'America/Toronto', browserLocale: 'en'}),
    );
    const english = createFormatters(
      panelLocale(fakeHass({locale: {language: 'en'}}), {timeZone: 'America/Toronto', browserLocale: 'en'}),
    );
    expect([celsius(english, 20.25), celsius(french, 20.25), celsius(english, null)]).toEqual([
      '20.3 °C',
      '20,3 °C',
      '–',
    ]);
  });
});
