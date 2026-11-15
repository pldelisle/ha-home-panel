// dialGeometry, dialValueFromPointer and gaugeGeometry: the numbers the dial and the gauge are drawn from. The path data and the
// coordinates are literals computed once from the legacy `dial()` formula (src/home-panel.js, deleted in #248) in a scratch
// script, rounded to one decimal as its SVG string was; the tests do not import the legacy source.
import {describe, expect, test} from 'vitest';
import {dialGeometry, dialValueFromPointer} from '../../../../src/features/climate/dial-geometry.ts';
import {gaugeGeometry} from '../../../../src/features/climate/gauge-geometry.ts';

describe('dialGeometry', () => {
  const TRACK = 'M55.0 205.0A106 106 0 1 1 205.0 205.0';

  test('a room at 20.5 degrees set to 21, on the room scale 5 to 30', () => {
    const dial = dialGeometry(20.5, 21, 5, 30);
    expect(dial.track).toBe(TRACK);
    expect(dial.active).toBe('M55.0 205.0A106 106 0 0 1 195.0 46.2');
    expect(dial.now).toEqual({cx: 186.8, cy: 40.5});
    expect(dial.knob).toEqual({cx: 195, cy: 46.2});
    expect(dial).toMatchObject({shown: 21, off: false});
  });

  test('the knob and the dot sit at the angles of lo, the midpoint and hi', () => {
    // 135 degrees at lo, 270 at the midpoint (straight up), 405 at hi
    expect(dialGeometry(16, 16, 16, 30)).toMatchObject({now: {cx: 55, cy: 205}, knob: {cx: 55, cy: 205}});
    expect(dialGeometry(23, 23, 16, 30)).toMatchObject({now: {cx: 130, cy: 24}, knob: {cx: 130, cy: 24}});
    expect(dialGeometry(30, 30, 16, 30)).toMatchObject({now: {cx: 205, cy: 205}, knob: {cx: 205, cy: 205}});
  });

  test('a setpoint past the scale is held at its end, and the arc to hi is the long way round', () => {
    const dial = dialGeometry(30, 99, 16, 30);
    expect(dial.knob).toEqual({cx: 205, cy: 205});
    expect(dial.active).toBe('M55.0 205.0A106 106 0 1 1 205.0 205.0');
    expect(dial.shown).toBe(30);
  });

  test('a setpoint at lo has no arc to draw, and no reading has no dot', () => {
    expect(dialGeometry(null, 16, 16, 30)).toMatchObject({active: null, now: null, knob: {cx: 55, cy: 205}});
    expect(dialGeometry(null, 22, 16, 30)).toMatchObject({
      active: 'M55.0 205.0A106 106 0 0 1 95.0 29.9',
      knob: {cx: 95, cy: 29.9},
    });
  });

  test('off: a setpoint at the frost guard, or none, draws the knob at the start (shown as lo) and no arc, and the model words it', () => {
    for (const sp of [5, 5.5, null]) {
      expect(dialGeometry(20.5, sp, 5, 30)).toMatchObject({active: null, knob: {cx: 55, cy: 205}, shown: 5, off: true});
    }
  });

  test('not loaded is not off: the setpoint is undefined, there is no knob, and the centre shows the temperature (the model words it, so `shown` is null)', () => {
    expect(dialGeometry(20.5, undefined, 5, 30)).toMatchObject({active: null, knob: null, shown: null, off: false});
    expect(dialGeometry(null, undefined, 5, 30)).toMatchObject({knob: null, now: null, shown: null, off: false});
  });

  test('55 ticks, every sixth one long, from the start to the end of the track', () => {
    const {ticks} = dialGeometry(20.5, 21, 5, 30);
    expect(ticks).toHaveLength(55);
    expect(ticks.flatMap((tick, i) => (tick.major ? [i] : []))).toEqual([0, 6, 12, 18, 24, 30, 36, 42, 48, 54]);
    expect(ticks[0]).toEqual({x1: 67.1, y1: 192.9, x2: 61.4, y2: 198.6, major: true});
    expect(ticks[1]).toEqual({x1: 61.8, y1: 187.2, x2: 58, y2: 190.4, major: false});
    expect(ticks[27]).toEqual({x1: 130, y1: 41, x2: 130, y2: 36, major: false});
    expect(ticks[54]).toEqual({x1: 192.9, y1: 192.9, x2: 198.6, y2: 198.6, major: true});
  });

  test('a smaller drawing keeps the radius and moves the centre', () => {
    const dial = dialGeometry(20.5, 21, 5, 30, 200);
    expect(dial.track).toBe('M25.0 175.0A106 106 0 1 1 175.0 175.0');
    expect(dial.knob).toEqual({cx: 165, cy: 16.2});
  });
});

describe('dialValueFromPointer', () => {
  const rect = {left: 0, top: 0, width: 260, height: 260};
  /** The pointer `degrees` round the circle from the dial's start, 100 px from the centre. */
  const at = (degrees: number): [number, number] => [
    130 + 100 * Math.cos(((135 + degrees) * Math.PI) / 180),
    130 + 100 * Math.sin(((135 + degrees) * Math.PI) / 180),
  ];

  test('the angle round from the start gives the value between lo and hi', () => {
    expect(dialValueFromPointer(rect, 130, 0, 16, 30)).toBe(23); // straight up: the midpoint
    expect(dialValueFromPointer(rect, ...at(270), 16, 30)).toBe(30);
    expect(dialValueFromPointer(rect, ...at(0), 16, 30)).toBe(16);
  });

  test('snapped to half degrees', () => {
    expect(dialValueFromPointer(rect, ...at(10), 16, 30)).toBe(16.5); // 16.52
    expect(dialValueFromPointer(rect, ...at(30), 16, 30)).toBe(17.5); // 17.56
    expect(dialValueFromPointer(rect, ...at(100), 16, 30)).toBe(21); // 21.19
  });

  test('a value at or below the frost guard is off, whatever the scale reads lower', () => {
    expect(dialValueFromPointer(rect, ...at(0), 5, 30)).toBe('off');
    expect(dialValueFromPointer(rect, ...at(8), 5, 30)).toBe('off'); // 5.74 snaps to 5.5
    expect(dialValueFromPointer(rect, ...at(9), 5, 30)).toBe(6); // 5.83 snaps to 6
  });

  test('the quarter turn below the dial reads as the end it is nearer to', () => {
    expect(dialValueFromPointer(rect, 150, 250, 16, 30)).toBe(30); // lower right
    expect(dialValueFromPointer(rect, 110, 250, 16, 30)).toBe(16); // lower left
  });

  test('the centre of a dial that is not at the page origin', () => {
    expect(dialValueFromPointer({left: 500, top: 100, width: 260, height: 260}, 630, 100, 16, 30)).toBe(23);
  });
});

describe('gaugeGeometry', () => {
  test('positions on the 14 to 30 scale, held to the bar', () => {
    expect(gaugeGeometry(14, 30)).toEqual({now: 0, setpoint: 100, caption: 'setpoint'});
    expect(gaugeGeometry(22, 22)).toEqual({now: 50, setpoint: 50, caption: 'setpoint'});
    expect(gaugeGeometry(10, 40)).toMatchObject({now: 0, setpoint: 100});
    expect(gaugeGeometry(20.5, 21)).toEqual({now: 40.625, setpoint: 43.75, caption: 'setpoint'});
  });

  test('the caption: the setpoint, the frost guard when it is below the scale, nothing without one', () => {
    expect(gaugeGeometry(20, 5)).toEqual({now: 37.5, setpoint: null, caption: 'off'});
    expect(gaugeGeometry(20, 13.9)).toMatchObject({setpoint: null, caption: 'off'});
    expect(gaugeGeometry(20, null)).toEqual({now: 37.5, setpoint: null, caption: null});
    expect(gaugeGeometry(20, undefined)).toMatchObject({caption: null});
  });

  test('no reading, no gauge', () => {
    expect(gaugeGeometry(null, 21)).toBeNull();
  });
});
