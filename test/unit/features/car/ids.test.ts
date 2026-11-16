// carIds: the entities the Car pane subscribes to. They must be exactly the ones `readCarFeature` reads, so a change to a state the pane shows
// reaches it and a change to anything else does not: the test records every id the reader asks of the states and compares the two lists.
import {describe, expect, test} from 'vitest';
import {carIds} from '../../../../src/features/car/ids.ts';
import {readCarFeature} from '../../../../src/features/car/inputs.ts';
import {findCar} from '../../../../src/providers/fordpass.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import {fullHouse, houseOf, storeOf} from '../media/support.ts';

describe('carIds', () => {
  test('are the car’s entities and the Wallbox’s the house names, each once', () => {
    const store = storeOf(fullHouse, FULL_CFG);
    const ids = carIds(store, findCar(fullHouse.states));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'sensor.fordpass_test_soc',
        'sensor.fordpass_test_elvehcharging',
        'sensor.charger_power',
        'sensor.charger_status',
        'number.charger_max_current',
        'switch.charger_pause',
        'lock.charger_lock',
      ]),
    );
  });

  test('are exactly the ids the reader asks of the states', () => {
    const store = storeOf(fullHouse, FULL_CFG);
    const asked = new Set<string>();
    const states = new Proxy(fullHouse.states, {
      get(target, key, receiver) {
        if (typeof key === 'string') asked.add(key);
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    const ref = findCar(fullHouse.states);
    asked.clear();
    readCarFeature(states, store.config, store.names);
    // the car is found by walking the states' keys, which is no read of an entity
    expect([...asked].sort()).toEqual(carIds(store, ref).sort());
  });

  test('are the Wallbox’s alone where the house has no car, and an id the house leaves unset is left out', () => {
    expect(carIds(storeOf(houseOf([]), FULL_CFG), null).sort()).toEqual([
      'lock.charger_lock',
      'number.charger_max_current',
      'sensor.charger_power',
      'sensor.charger_status',
      'switch.charger_pause',
    ]);
    expect(carIds(storeOf(houseOf([])), null)).toEqual([]);
  });
});
