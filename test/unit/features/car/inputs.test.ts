// readCarFeature: the FordPass car and the Wallbox of the house, composed from their providers; a house with no car reads no car, and still its charger.
import {describe, expect, test} from 'vitest';
import {readCarFeature} from '../../../../src/features/car/inputs.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import {entity} from '../../fake-hass.ts';
import {fullHouse, houseOf, storeOf} from '../media/support.ts';

describe('readCarFeature', () => {
  test('the test house: its car at 64 % and its charger at 7.1 kW', () => {
    const store = storeOf(fullHouse, FULL_CFG);
    const {ref, car, charger} = readCarFeature(fullHouse.states, store.config, store.names);
    expect(ref?.id('sensor', 'soc')).toBe('sensor.fordpass_test_soc');
    expect(car).toMatchObject({soc: 64, range: 280, charging: true, color: '#B03A2E'});
    expect(charger).toMatchObject({power: 7.1, status: 'Charging', present: true});
  });

  test('a house with no FordPass car has no car and no reference, and its charger still reads', () => {
    const hass = houseOf([], [entity('sensor.charger_power', '3', {unit_of_measurement: 'kW'})]);
    const store = storeOf(hass, FULL_CFG);
    const {ref, car, charger} = readCarFeature(hass.states, store.config, store.names);
    expect([ref, car]).toEqual([null, null]);
    expect(charger).toMatchObject({power: 3, present: true});
  });
});
