// waterChartGeometry: the water heater's last 24 hours as geometry: the scale rules, the hour ticks, the bars and the line, from literal five-minute means.
// The clock is the test house's (Saturday 2 pm, Toronto), so the window starts at 2 pm on Friday and the six-hour ticks fall at 6 pm, midnight, 6 am and noon.
import {describe, expect, test} from 'vitest';
import {HOUR_MS, MINUTE_MS} from '../../../../src/core/figures.ts';
import {waterChartGeometry} from '../../../../src/features/energy/water-chart.ts';
import type {Point} from '../../../../src/providers/power-history.ts';
import {depsOf, fullHouse, NOW, type Language} from '../media/support.ts';

const START = NOW - 24 * HOUR_MS;
const chart = (t: Point[], p: Point[], language: Language = 'en') =>
  waterChartGeometry({t, p}, NOW, depsOf(fullHouse, language));

describe('the window and what draws in it', () => {
  test('nothing to draw: no line (under two readings) and no bar', () => {
    expect(chart([], [])).toBeNull();
    expect(chart([[NOW - HOUR_MS, 50]], [])).toBeNull();
    expect(chart([[NOW - HOUR_MS, 50]], [[START - 1, 3]])).toBeNull();
  });

  test('a bar alone is a chart without a line or a dot; one reading is a dot without a line', () => {
    expect(chart([], [[START + 2 * HOUR_MS, 3]])).toMatchObject({line: null, dot: null});
    const single = chart([[NOW - HOUR_MS, 50]], [[START + 2 * HOUR_MS, 3]])!;
    expect(single.line).toBeNull();
    expect(single.dot).toEqual({cx: 275.7, cy: 55});
  });

  test('a reading that began five minutes before the window still starts the line; one older does not', () => {
    const geometry = chart(
      [
        [START - 6 * MINUTE_MS, 40],
        [START - 5 * MINUTE_MS, 46],
        [NOW - 5 * MINUTE_MS, 47],
      ],
      [],
    );
    expect(geometry!.line).toBe('M28,55L285.6,31.5');
    expect(geometry!.label).toContain('Water temperature 44 to 48');
  });
});

describe('the scales', () => {
  const geometry = chart(
    [
      [START - 5 * MINUTE_MS, 46.2],
      [START + 12 * HOUR_MS, 51.4],
      [NOW - 5 * MINUTE_MS, 49],
    ],
    [
      [START - 1, 2],
      [START + 2 * HOUR_MS, 3],
      [START + 4 * HOUR_MS, 0.05],
      [START + 6 * HOUR_MS, 0.5],
    ],
  )!;

  test('the temperature axis spans the readings plus half a degree, to whole degrees, with its middle', () => {
    expect(geometry.grid.map(g => [g.y, g.label.text, g.label.y])).toEqual([
      [102, '45°', 105],
      [55, '48.5°', 58],
      [8, '52°', 11],
    ]);
    expect(geometry.grid[0]).toMatchObject({x1: 28, x2: 286});
    expect(geometry.grid[0].label).toMatchObject({x: 24, anchor: 'end'});
    expect(geometry.label).toBe('Water temperature 45 to 52 degrees and heating power, last 24 hours');
  });

  test('the power axis reaches five kW at least, labelled at both ends', () => {
    expect(geometry.powerLabels).toEqual([
      {x: 290, y: 11, text: '5 kW', anchor: 'start'},
      {x: 290, y: 105, text: '0 kW', anchor: 'start'},
    ]);
  });

  test('a bar over 50 W for each mean in the window, as wide as the floor, titled with its time and power', () => {
    expect(geometry.bars).toEqual([
      {x: 49.5, y: 45.6, width: 1.4, height: 56.4, title: '4:00 pm: 3.0 kW'},
      {x: 92.5, y: 92.6, width: 1.4, height: 9.4, title: '8:00 pm: 0.5 kW'},
    ]);
  });

  test('the line runs through each reading at the middle of its five minutes, the dot at its end', () => {
    expect(geometry.line).toBe('M28,85.9L157.4,16.1L285.6,48.3');
    expect(geometry.dot).toEqual({cx: 285.6, cy: 48.3});
  });

  test('a tick and a label every six hours, at the hour’s own place under the plot', () => {
    expect(geometry.ticks.map(t => [t.x, t.label.text])).toEqual([
      [71, '6 pm'],
      [135.5, '12 am'],
      [200, '6 am'],
      [264.5, '12 pm'],
    ]);
    expect(geometry.ticks[0]).toMatchObject({y1: 102, y2: 105});
    expect(geometry.ticks[0].label).toEqual({x: 71, y: 116, text: '6 pm', anchor: 'middle'});
    expect(geometry).toMatchObject({width: 320, height: 120});
  });
});

describe('the rules for odd days', () => {
  test('no temperature reads: the axis is 45 to 55', () => {
    const geometry = chart([], [[START + 2 * HOUR_MS, 3]])!;
    expect(geometry.grid.map(g => g.label.text)).toEqual(['45°', '50°', '55°']);
  });

  test('a flat tank is given four degrees: 50 all day is 48 to 52', () => {
    const geometry = chart(
      [
        [START, 50],
        [NOW - HOUR_MS, 50],
      ],
      [],
    )!;
    expect(geometry.grid.map(g => g.label.text)).toEqual(['48°', '50°', '52°']);
  });

  test('a power over five kW reaches the next whole kW', () => {
    const geometry = chart([], [[START + 2 * HOUR_MS, 7.2]])!;
    expect(geometry.powerLabels[0].text).toBe('8 kW');
    expect(geometry.bars[0]).toMatchObject({y: 17.4, height: 84.6});
  });

  test('a reading after now sits at the right edge, not past it', () => {
    expect(chart([], [[NOW + 6 * HOUR_MS, 3]])!.bars[0].x).toBe(286);
  });
});

describe('in French', () => {
  test('the sentence, the decimal comma, the hours and the bar titles', () => {
    const geometry = chart(
      [
        [START, 46.2],
        [NOW - HOUR_MS, 51.4],
      ],
      [[START + 2 * HOUR_MS, 3]],
      'fr',
    )!;
    expect(geometry.label).toBe('Température de l’eau de 45 à 52 degrés et puissance de chauffe, 24 dernières heures');
    expect(geometry.grid[1].label.text).toBe('48,5°');
    expect(geometry.ticks.map(t => t.label.text)).toEqual(['18 h', '0 h', '6 h', '12 h']);
    expect(geometry.bars[0].title).toBe('16 h : 3,0 kW');
  });
});
