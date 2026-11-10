// The pure half of <hp-chart> (src/ui/chart-options.ts): the base look, the merge a chart's options go through, and French's date axis.
// French is compared with the rewrite layer's own output (`apex` of src/i18n/fr.js), which is what the legacy charts showed; the oracle
// and this comparison are deleted with the layer in phase 4.
import {describe, expect, test} from 'vitest';
import {createFormatters} from '../../../src/core/i18n/format.ts';
import {panelLocale} from '../../../src/core/i18n/locale.ts';
import {createFrench} from '../../../src/i18n/fr.js';
import {baseOptions, frenchAxis, mergeOptions, type ChartOptions} from '../../../src/ui/chart-options.ts';
import {fakeHass} from '../fake-hass.ts';

const french = () => {
  const hass = fakeHass({locale: {language: 'fr'}});
  const fmt = createFormatters(panelLocale(hass, {timeZone: 'America/Toronto', browserLocale: 'fr'}));
  return {fmt, layer: createFrench({hass, isFrench: true, names: {name: (key: string) => key}})};
};

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
    tokens: {font: 'Montserrat', text: '#555', line: '#ddd'},
    dark: false,
    reducedMotion: false,
    noData: 'No history yet',
  };

  test("takes the panel's face and colours from the tokens, and says what an empty chart says", () => {
    const options = baseOptions(250, deps) as {chart: ChartOptions; grid: ChartOptions; noData: ChartOptions};
    expect(options.chart).toMatchObject({
      height: 250,
      fontFamily: 'Montserrat',
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

describe("French's date axis", () => {
  const input = (): ChartOptions => ({
    chart: {type: 'line'},
    xaxis: {type: 'datetime', min: 1, labels: {datetimeUTC: false}},
  });

  test("is the rewrite layer's own: the month and day names, the day-first formats on a time axis", () => {
    const {fmt, layer} = french();
    expect(frenchAxis(input(), fmt)).toEqual((layer as {apex(o: ChartOptions): ChartOptions}).apex(input()));
  });

  test('gives a chart with no time axis the names and no label formats, and keeps the options it had', () => {
    const {fmt} = french();
    const options = frenchAxis({chart: {type: 'donut'}, labels: ['a']}, fmt) as {
      chart: ChartOptions;
      labels: string[];
      xaxis?: unknown;
    };
    expect(options.chart).toMatchObject({type: 'donut', defaultLocale: 'fr'});
    expect(options.labels).toEqual(['a']);
    expect(options.xaxis).toBeUndefined();
  });
});
