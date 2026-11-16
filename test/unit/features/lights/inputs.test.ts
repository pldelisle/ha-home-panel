// readLights and lightIds: the tiles the Lights model takes, linked and ordered, and the entities the pane subscribes to, which must be exactly
// the ones the reader and the tiles' state read.
import {describe, expect, test} from 'vitest';
import {lightIds} from '../../../../src/features/lights/ids.ts';
import {readLights} from '../../../../src/features/lights/inputs.ts';
import {areaState} from '../../../../src/features/lights/state.ts';
import {alMode} from '../../../../src/providers/adaptive-lighting.ts';
import {FULL_CFG, LINK_CFG} from '../../../e2e/houses.ts';
import {fullHouse, houseOf, readingOf, storeOf} from '../media/support.ts';

const read = (config: unknown, systemData: unknown = null) => {
  const store = storeOf(fullHouse, config);
  const {states, registries, names} = readingOf(fullHouse);
  return readLights(states, registries, names, store.config, systemData);
};

describe('readLights', () => {
  test('the test house linked as the config says: the kitchen’s two groups side by side, the office beside the living room', () => {
    const {tiles, pairs} = read(LINK_CFG);
    expect(pairs).toEqual([
      ['light.kitchen_island', 'light.kitchen_sink'],
      ['office', 'living_room'],
    ]);
    expect(tiles.map(t => [t.key, t.al, t.link])).toEqual([
      ['light.kitchen_island', null, {other: 'light.kitchen_sink', first: true}],
      ['light.kitchen_sink', null, {other: 'light.kitchen_island', first: false}],
      ['office', 'switch.adaptive_lighting_office', {other: 'living_room', first: true}],
      ['living_room', null, {other: 'office', first: false}],
    ]);
  });

  test('the system data’s links and saved order win, a pair moving as one', () => {
    const {tiles} = read(FULL_CFG, {light_links: [['office', 'kitchen']], light_order: ['living_room', 'office']});
    expect(tiles.map(t => t.key)).toEqual(['living_room', 'office', 'kitchen']);
  });
});

describe('lightIds', () => {
  test('every light, the Adaptive Lighting switch and its sleep mode, and the config pair’s switch, each once', () => {
    const ids = lightIds(storeOf(fullHouse, LINK_CFG));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'light.office_1',
        'light.kitchen_island',
        'light.kitchen_sink_1',
        'switch.adaptive_lighting_office',
        'switch.adaptive_lighting_office_sleep_mode',
        'input_boolean.kitchen_lights_linked',
      ]),
    );
  });

  test('are every id the reader, the tiles’ state and their mode ask of the states', () => {
    const store = storeOf(fullHouse, LINK_CFG);
    const asked = new Set<string>();
    const states = new Proxy(fullHouse.states, {
      get(target, key, receiver) {
        if (typeof key === 'string') asked.add(key);
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    const {registries, names} = readingOf(fullHouse);
    const {tiles} = readLights(states, registries, names, store.config, null);
    for (const tile of tiles) {
      areaState(tile, states);
      alMode(tile, tile.al, states);
    }
    // the lights and the switches are found by walking the states' keys, which is no read of an entity
    expect([...asked].filter(id => !lightIds(store).includes(id))).toEqual([]);
  });

  test('none in a house with no light and no Adaptive Lighting; a store with no hass yet asks for nothing', () => {
    expect(lightIds(storeOf(houseOf([])))).toEqual([]);
    expect(lightIds({hass: null, config: storeOf(houseOf([])).config})).toEqual([]);
  });
});
