// alStripLayout: the Adaptive Lighting strip as geometry, over a day whose sun rises at 6, peaks at noon and sets at 18 (house time), so every
// mark falls on a stop.
import {describe, expect, test} from 'vitest';
import {kelvinRGB} from '../../../../src/core/color.ts';
import {HOUR_MS} from '../../../../src/core/figures.ts';
import {alStripLayout} from '../../../../src/features/lights/al-strip-layout.ts';
import {depsOf, fullHouse} from '../media/support.ts';

const {fmt} = depsOf(fullHouse, 'en');
const midnight = Date.parse('2026-06-21T00:00:00-04:00'); // the test house's zone is Toronto's
const at = (hours: number) => midnight + hours * HOUR_MS;
const curve = {minK: 2000, maxK: 6000, sun: {rise: at(6), noon: at(12), set: at(18)}};
const night = (k: number) => `color-mix(in srgb,${kelvinRGB(k)} 35%,var(--card2))`;

describe('alStripLayout', () => {
  const layout = alStripLayout(curve, at(15), fmt);

  test('a stop every half-hour: the warmest at sunrise and sunset, the coolest at noon, the parabola between', () => {
    expect(layout.stops).toHaveLength(49);
    expect(layout.stops[12]).toBe(`${kelvinRGB(2000)} 25.0%`);
    expect(layout.stops[18]).toBe(`${kelvinRGB(5000)} 37.5%`);
    expect(layout.stops[24]).toBe(`${kelvinRGB(6000)} 50.0%`);
    expect(layout.stops[36]).toBe(`${kelvinRGB(2000)} 75.0%`);
  });

  test('the night’s stops are mixed into the card’s colour', () => {
    expect(layout.stops[0]).toBe(`${night(2000)} 0.0%`);
    expect(layout.stops[11]).toBe(`${night(2000)} 22.9%`);
    expect(layout.stops[37]).toBe(`${night(2000)} 77.1%`);
    expect(layout.stops[48]).toBe(`${night(2000)} 100.0%`);
  });

  test('now, the sun’s marks with their times, and the four hours', () => {
    expect(layout.now).toBe('62.50%');
    expect(layout.marks).toEqual([
      {kind: 'sunrise', at: '25.00%', time: fmt.time(at(6))},
      {kind: 'noon', at: '50.00%', time: fmt.time(at(12))},
      {kind: 'sunset', at: '75.00%', time: fmt.time(at(18))},
    ]);
    expect(layout.marks[0].time).toBe('6:00 am');
    expect(layout.hours).toEqual([
      {at: '0%', label: fmt.hour(at(0))},
      {at: '25%', label: fmt.hour(at(6))},
      {at: '50%', label: fmt.hour(at(12))},
      {at: '75%', label: fmt.hour(at(18))},
    ]);
  });

  test('a day the sun does not rise is night all day, with noon its one mark; a mark off the day is clamped to its edge', () => {
    const polar = alStripLayout({...curve, sun: {rise: null, noon: at(30), set: null}}, at(15), fmt);
    expect(polar.stops.every(s => s.startsWith('color-mix'))).toBe(true);
    expect(polar.marks).toEqual([{kind: 'noon', at: '100.00%', time: fmt.time(at(30))}]);
  });
});
