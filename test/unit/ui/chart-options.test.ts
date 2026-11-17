// The pure half of <hp-chart> (src/ui/chart-options.ts): the base look, the merge a chart's options go through, and the time axis and tooltip dates in the house's formats.
import {describe, expect, test} from 'vitest';
import {createFormatters} from '../../../src/core/i18n/format.ts';
import {panelLocale} from '../../../src/core/i18n/locale.ts';
import {
  baseOptions,
  celsius,
  houseAxis,
  hourRowsAxis,
  hourTicks,
  midnightAtOrAfter,
  midnightBefore,
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
    (options.xaxis as {labels: {formatter: (text: string, at: number, opts?: unknown) => string}}).labels.formatter;

  test('writes the hours and the days of the English house: 4 pm, 4:30 pm, Nov 11', () => {
    const label = labelOf(houseAxis(input(), houseFmt('en')));
    expect([FOUR_PM, HALF_PAST_FOUR, MIDNIGHT].map(at => label('ignored', at))).toEqual(['4 pm', '4:30 pm', 'Nov 11']);
  });

  test('writes the hours and the days of the French house: 16 h, 16 h 30, 11 nov.', () => {
    const label = labelOf(houseAxis(input(), houseFmt('fr')));
    expect([FOUR_PM, HALF_PAST_FOUR, MIDNIGHT].map(at => label('ignored', at))).toEqual(['16 h', '16 h 30', '11 nov.']);
  });

  // what the library hands a formatter as its third argument: the axis' real range
  const within = (hours: number) => ({w: {globals: {minX: MIDNIGHT, maxX: MIDNIGHT + hours * 36e5}}});

  test('a chart within one day writes midnight as the hour, "12 am" and "0 h", never a date', () => {
    const en = labelOf(houseAxis(input(), houseFmt('en')));
    const fr = labelOf(houseAxis(input(), houseFmt('fr')));
    expect(en('ignored', MIDNIGHT, within(14))).toBe('12 am');
    expect(fr('ignored', MIDNIGHT, within(14))).toBe('0 h');
    expect(en('ignored', MIDNIGHT, within(24))).toBe('12 am');
  });

  test('a chart of several days still writes the date at midnight', () => {
    const label = labelOf(houseAxis(input(), houseFmt('en')));
    expect(label('ignored', MIDNIGHT, within(7 * 24))).toBe('Nov 11');
  });

  test('on a chart of several days a tick an hour either side of midnight is that midnight, as the clocks changing puts the ticks', () => {
    const label = labelOf(houseAxis(input(), houseFmt('en')));
    const elevenPm = MIDNIGHT - 36e5;
    const onePm = MIDNIGHT + 36e5;
    expect(label('ignored', elevenPm, within(7 * 24))).toBe('Nov 11');
    expect(label('ignored', onePm, within(7 * 24))).toBe('Nov 11');
    expect(label('ignored', MIDNIGHT + 3 * 36e5, within(7 * 24))).toBe('3 am');
    expect(label('ignored', elevenPm, within(14))).toBe('11 pm'); // within a day it is the hour it is
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
  const fmt = houseFmt('en');
  // 2:48 pm in Toronto
  const now = Date.parse('2026-11-11T19:48:00Z');

  test('a day ends on the hour after now, so every tick lands on a whole hour: eight steps of three hours', () => {
    expect(timeAxis(1, now, fmt)).toEqual({
      type: 'datetime',
      min: Date.parse('2026-11-10T20:00:00Z'), // 3 pm
      max: Date.parse('2026-11-11T20:00:00Z'),
      tickAmount: 8,
      labels: {datetimeUTC: false},
    });
  });

  test('a week ends on the midnight after now, in the house clock, so its seven ticks are midnights', () => {
    expect(timeAxis(7, now, fmt)).toEqual({
      type: 'datetime',
      min: Date.parse('2026-11-05T05:00:00Z'), // midnight in Toronto, after the clocks went back
      max: Date.parse('2026-11-12T05:00:00Z'),
      tickAmount: 7,
      labels: {datetimeUTC: false},
    });
  });

  test('a month and a year step by whole days: six steps of five days, five of seventy-three', () => {
    expect(timeAxis(30, now, fmt).tickAmount).toBe(6);
    expect(timeAxis(365, now, fmt).tickAmount).toBe(5);
  });

  test('at midnight exactly the week ends there', () => {
    const midnight = Date.parse('2026-11-12T05:00:00Z');
    expect(timeAxis(7, midnight, fmt).max).toBe(midnight);
  });
});

describe('hourRowsAxis', () => {
  const fmt = houseFmt('en');
  test('within a day it begins at the first row and takes steps of whole hours: fifteen rows, steps of two hours', () => {
    const first = Date.parse('2026-11-11T05:00:00Z'); // midnight
    expect(hourRowsAxis(first, first + 14 * 36e5, fmt)).toEqual({min: first, max: first + 14 * 36e5, tickAmount: 7});
  });

  test('over several days it begins at the first midnight and takes steps of whole days', () => {
    const first = Date.parse('2026-11-05T18:00:00Z'); // 1 pm, Nov 5
    const last = Date.parse('2026-11-12T19:00:00Z'); // 2 pm, Nov 12
    const midnight = Date.parse('2026-11-06T05:00:00Z'); // the 6th, which leaves six days and fourteen hours: seven steps
    expect(hourRowsAxis(first, last, fmt)).toEqual({min: midnight, max: midnight + 7 * 864e5, tickAmount: 7});
  });

  test('has no axis to propose for a single row', () => {
    expect(hourRowsAxis(5 * 36e5, 5 * 36e5, fmt)).toBeUndefined();
  });
});

describe('midnightAtOrAfter and midnightBefore', () => {
  const fmt = houseFmt('en');
  test('find the house midnights, not the UTC ones', () => {
    const afternoon = Date.parse('2026-11-11T19:48:00Z');
    expect(midnightBefore(afternoon, fmt)).toBe(Date.parse('2026-11-11T05:00:00Z'));
    expect(midnightAtOrAfter(afternoon, fmt)).toBe(Date.parse('2026-11-12T05:00:00Z'));
    expect(midnightAtOrAfter(Date.parse('2026-11-11T05:00:00Z'), fmt)).toBe(Date.parse('2026-11-11T05:00:00Z'));
  });
});

describe('hourTicks', () => {
  const HOUR = 36e5;
  test('splits a span of whole hours into steps that are whole hours, as few steps as the room allows', () => {
    expect(hourTicks(14 * HOUR)).toEqual({intervals: 7, span: 14 * HOUR}); // every two hours
    expect(hourTicks(24 * HOUR)).toEqual({intervals: 8, span: 24 * HOUR}); // every three
    expect(hourTicks(7 * 24 * HOUR)).toEqual({intervals: 7, span: 7 * 24 * HOUR}); // every day
  });

  test('stretches a span that no step divides to the next that one does, losing the fewest hours', () => {
    // 158 h: days of 24 h give seven steps, 168 h
    expect(hourTicks(158 * HOUR)).toEqual({intervals: 7, span: 168 * HOUR});
    // 13 h: steps of two hours give seven, 14 h
    expect(hourTicks(13 * HOUR)).toEqual({intervals: 7, span: 14 * HOUR});
    // 15 h is divided as it is: five steps of three hours
    expect(hourTicks(15 * HOUR)).toEqual({intervals: 5, span: 15 * HOUR});
  });

  test('has nothing to say of a span with no hours in it', () => {
    expect(hourTicks(0)).toBeUndefined();
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
