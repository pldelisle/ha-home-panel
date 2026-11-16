// barsGeometry: the 30-day bars as numbers, the legacy `bars()`'s rule: a 300 by 56 box, two pixels between bars, the tallest bar 52 pixels high,
// a bar with something in it at least two pixels and an empty one a pixel, everything to a tenth.
import {describe, expect, test} from 'vitest';
import {barsGeometry} from '../../../../src/features/car/bars-geometry.ts';

describe('barsGeometry', () => {
  test('three bars: the tallest fills 52 of the 56 pixels, the others in proportion, each 98.7 wide with two between', () => {
    const {width, height, highest, bars} = barsGeometry([0, 5, 10], ['a', 'b', 'c']);
    expect([width, height, highest]).toEqual([300, 56, 10]);
    expect(bars).toEqual([
      {x: 0, y: 55, width: 98.7, height: 1, filled: false, label: 'a', value: 0},
      {x: 100.7, y: 30, width: 98.7, height: 26, filled: true, label: 'b', value: 5},
      {x: 201.3, y: 4, width: 98.7, height: 52, filled: true, label: 'c', value: 10},
    ]);
  });

  test('a small value is still two pixels, an empty one one pixel', () => {
    const {bars} = barsGeometry([0.01, 0, 100], ['a', 'b', 'c']);
    expect(bars.map(bar => bar.height)).toEqual([2, 1, 52]);
    expect(bars.map(bar => bar.filled)).toEqual([true, false, true]);
  });

  test('a series with nothing above zero is scaled to 1, so every bar is empty and none divides by zero', () => {
    const {highest, bars} = barsGeometry([0, 0], ['a', 'b']);
    expect(highest).toBe(1);
    expect(bars.map(bar => [bar.height, bar.filled])).toEqual([
      [1, false],
      [1, false],
    ]);
  });

  test('thirty days fit the box: each bar is 8.1 wide and the last ends at 300', () => {
    const values = Array.from({length: 30}, (_, i) => i);
    const {bars} = barsGeometry(
      values,
      values.map(i => `d${i}`),
    );
    expect(bars).toHaveLength(30);
    expect(bars[0].width).toBe(8.1);
    expect(bars[29].x + bars[29].width).toBeCloseTo(300, 0);
  });

  test('no values is no bars', () => {
    expect(barsGeometry([], [])).toEqual({width: 300, height: 56, highest: 1, bars: []});
  });
});
