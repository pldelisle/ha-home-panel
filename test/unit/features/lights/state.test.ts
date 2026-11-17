// areaState and tintOf: what a tile's lights are doing, from their states alone. The test house's kitchen is the reference; literal states give
// the rules it does not exercise (the 50 K steps, ranges that do not overlap, a colour picked by hand).
import {describe, expect, test} from 'vitest';
import {areaState, tintOf} from '../../../../src/features/lights/state.ts';
import {entity} from '../../fake-hass.ts';
import {fullHouse} from '../media/support.ts';

const statesOf = (...lights: [string, string, Record<string, unknown>?][]) =>
  Object.fromEntries(lights.map(([id, state, attributes]) => [id, entity(id, state, attributes)]));
const tunable = (k: number | null, min = 2200, max = 6500, extra: object = {}) => ({
  supported_color_modes: ['color_temp'],
  color_mode: 'color_temp',
  color_temp_kelvin: k,
  min_color_temp_kelvin: min,
  max_color_temp_kelvin: max,
  ...extra,
});

describe('areaState', () => {
  test('the test house’s kitchen: two of three on at 150, the lit bulbs’ kelvin, a warm white tint', () => {
    const s = areaState(
      {ids: ['light.kitchen_island_1', 'light.kitchen_island_2', 'light.kitchen_sink_1']},
      fullHouse.states,
    );
    expect(s).toEqual({
      on: ['light.kitchen_island_1', 'light.kitchen_island_2'],
      any: true,
      avail: true,
      br: 59,
      ct: {min: 2200, max: 6500, k: 3000, known: true},
      k: 3000,
      tint: 'rgb(255,177,110)',
      tunable: ['light.kitchen_island_1', 'light.kitchen_island_2', 'light.kitchen_sink_1'],
    });
  });

  test('the mean brightness is at least 1 percent while a light is on, and 0 when none is', () => {
    const states = statesOf(['light.a', 'on', {brightness: 1}], ['light.b', 'on'], ['light.c', 'off']);
    expect(areaState({ids: ['light.a', 'light.b']}, states)).toMatchObject({br: 1, ct: null, k: null, tint: ''});
    expect(areaState({ids: ['light.c']}, states)).toMatchObject({any: false, br: 0, avail: true, tint: ''});
  });

  test('the range is the overlap of the tunable bulbs, in 50 K steps; nothing lit gives its middle, not known', () => {
    const states = statesOf(
      ['light.a', 'off', tunable(null, 2210, 6490)],
      ['light.b', 'off', tunable(null, 2000, 6000)],
    );
    expect(areaState({ids: ['light.a', 'light.b']}, states).ct).toEqual({min: 2250, max: 6000, k: 4150, known: false});
  });

  test('a lit bulb’s kelvin rounds to 50 K and is clamped to the range; bulbs that give no range read 2000 to 6500 K', () => {
    const states = statesOf(['light.a', 'on', tunable(3020, 0, 0)], ['light.b', 'on', tunable(9000, 0, 0)]);
    expect(areaState({ids: ['light.a']}, states).ct).toEqual({min: 2000, max: 6500, k: 3000, known: true});
    expect(areaState({ids: ['light.b']}, states).ct).toMatchObject({k: 6500});
  });

  test('ranges that do not overlap give no colour control', () => {
    const states = statesOf(['light.a', 'on', tunable(3000, 2000, 3000)], ['light.b', 'on', tunable(4000, 4000, 6500)]);
    expect(areaState({ids: ['light.a', 'light.b']}, states)).toMatchObject({ct: null, k: null});
  });

  test('unavailable when none of its lights has a state that means something', () => {
    const states = statesOf(['light.a', 'unavailable'], ['light.b', 'unknown']);
    expect(areaState({ids: ['light.a', 'light.b', 'light.gone']}, states)).toMatchObject({avail: false, any: false});
  });
});

describe('tintOf', () => {
  test('a colour picked by hand is the bulb’s rgb_color; a white mode’s rgb_color is not, its kelvin is', () => {
    const states = statesOf(
      ['light.hs', 'on', {color_mode: 'hs', rgb_color: [255, 0, 128, 9]}],
      ['light.white', 'on', {color_mode: 'color_temp', rgb_color: [1, 2, 3], color_temp_kelvin: 6500}],
      ['light.plain', 'on', {color_mode: 'brightness'}],
    );
    expect(tintOf(['light.hs', 'light.white'], states)).toBe('rgb(255,0,128)');
    expect(tintOf(['light.plain', 'light.white'], states)).toBe('rgb(255,254,250)');
    expect(tintOf(['light.plain', 'light.gone'], states)).toBe('');
  });
});
