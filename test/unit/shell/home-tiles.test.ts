// The Home pane's tiles (#268): which of the six a house shows, in order, and that each tile listens to the ids its reader reads,
// so a thermostat reaches the Climate tile and a light the Lights tile.
import {describe, expect, test} from 'vitest';
import {GLANCE_SOURCES, glanceTiles, type GlanceDeps} from '../../../src/shell/home-tiles.ts';
import * as bare from '../../houses/bare.mjs';
import {FULL_CFG} from '../../e2e/houses.ts';
import {fakeHass} from '../fake-hass.ts';
import {fullHouse, NOW, storeOf} from '../features/media/support.ts';

const deps: GlanceDeps = {history: null, now: NOW};
const keys = (store: ReturnType<typeof storeOf>, compact = false) =>
  glanceTiles(store, deps, {compact}).map(view => view.key);

describe('the tiles a house shows', () => {
  test('the full house shows the six, in the legacy order', () => {
    expect(keys(storeOf(fullHouse.next({}), FULL_CFG))).toEqual(['lights', 'climate', 'car', 'energy', 'air', 'water']);
  });

  test('the bare house shows Lights, Energy and, on a tablet, the Water heater with a dash, as the legacy grid did', () => {
    expect(keys(storeOf(fakeHass.fromHouse(bare), {}))).toEqual(['lights', 'energy', 'water']);
    expect(keys(storeOf(fakeHass.fromHouse(bare), {}), true)).toEqual(['lights', 'energy']);
  });

  test('a store before the first states shows none', () => {
    const store = storeOf(fullHouse.next({}), FULL_CFG);
    expect(glanceTiles({...store, hass: undefined}, deps, {compact: false})).toEqual([]);
  });
});

describe('the ids each tile listens to', () => {
  const store = storeOf(fullHouse.next({}), FULL_CFG);
  const ids = (key: string) => GLANCE_SOURCES.find(source => source.key === key)!.ids(store);

  test('Climate listens to the thermostats, and Lights to the lights', () => {
    expect(ids('climate')).toContain('climate.living_room');
    expect(ids('lights')).toContain('light.living_room_1');
    expect(ids('lights')).not.toContain('climate.living_room');
  });

  test('Car listens to the car the house has, and to every change while it has none, so a car that reports late gets its tile', () => {
    expect(ids('car')).toContain('sensor.fordpass_test_soc');
    const car = GLANCE_SOURCES.find(source => source.key === 'car')!;
    expect(car.ids(storeOf(fakeHass.fromHouse(bare), {}))).toBe('*');
  });

  test('every key is unique', () => {
    expect(new Set(GLANCE_SOURCES.map(source => source.key)).size).toBe(GLANCE_SOURCES.length);
  });
});
