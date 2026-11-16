// liveIds: the entities the pill (#256) will subscribe to. They must be the ones `readLive` reads, so a change to a state a check
// reads reaches the pill and a change to anything else does not: the test records every id the reader asks of the states.
import {describe, expect, test} from 'vitest';
import {registriesOf} from '../../../../src/core/registry.ts';
import {liveIds} from '../../../../src/features/live/ids.ts';
import {readLive} from '../../../../src/features/live/inputs.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import {fullHouse, NOW, storeOf} from '../media/support.ts';

describe('liveIds', () => {
  test('are exactly the ids the reader asks of the states, each once', () => {
    const store = storeOf(fullHouse, FULL_CFG);
    const asked = new Set<string>();
    const states = new Proxy(fullHouse.states, {
      get(target, key, receiver) {
        if (typeof key === 'string') asked.add(key);
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    const inputs = readLive(states, registriesOf(fullHouse), store.config, store.names, NOW);
    const sensors = new Set(inputs.sensors.map(sensor => sensor.id));
    // the door and motion sensors are found by walking every binary sensor, and their light level is read for Security,
    // not for a check: neither is a read the pill must follow
    const read = [...asked].filter(
      id => !(id.startsWith('binary_sensor.') && !sensors.has(id)) && !inputs.sensors.some(s => s.illuminanceId === id),
    );
    const ids = liveIds(store);
    expect(new Set(ids).size).toBe(ids.length);
    // a room's temperature sensor is read only when its thermostat gives no reading, so it is followed without being asked here
    const temps = new Set(store.config.rooms.map(room => room.temp));
    const present = (list: string[]) => list.filter(id => id in fullHouse.states).sort();
    expect(present(ids.filter(id => !temps.has(id) || asked.has(id)))).toEqual(present(read));
    expect(ids).toEqual(
      expect.arrayContaining(['sensor.fordpass_test_soc', 'binary_sensor.front_door', 'climate.office']),
    );
  });

  test('are none before the first states', () => {
    const store = storeOf(fullHouse, FULL_CFG);
    expect(liveIds({...store, hass: null})).toEqual([]);
  });
});
