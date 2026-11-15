// wallbox: the charger's power in kW and its status, and whether the house has one (either sensor). The test house gives
// today's answer as literals; literal houses give the rules it does not exercise; the recorded house is read when the owner
// has one (#170).
import {describe, expect, test} from 'vitest';
import {FULL_CFG} from '../../e2e/houses.ts';
import {entity, fakeHass} from '../fake-hass.ts';
import {fullHouse, houseOf, recorded, storeOf} from '../features/media/support.ts';
import {wallbox} from '../../../src/providers/wallbox.ts';

const CFG = {entities: {ev_charger_power: 'sensor.power', ev_charger_status: 'sensor.status'}};
const read = (...states: ReturnType<typeof entity>[]) => {
  const hass = houseOf([], states);
  return wallbox(hass.states, storeOf(hass, CFG).config);
};

describe('the test house', () => {
  test('its charger: 7.1 kW and Charging', () => {
    expect(wallbox(fullHouse.states, storeOf(fullHouse, FULL_CFG).config)).toEqual({
      power: 7.1,
      status: 'Charging',
      present: true,
    });
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the rules are tested on the test house', () => {});
    return;
  }

  test('is present exactly when one of its two sensors is in the states', () => {
    const hass = fakeHass.fromFixture('main');
    const {config} = storeOf(hass);
    const {evP, wbStatus} = config.entities;
    const reading = wallbox(hass.states, config);
    expect(reading.present).toBe([evP, wbStatus].some(id => id !== null && hass.states[id] !== undefined));
  });
});

describe('the reading', () => {
  test('a charger in watts reads in kW', () => {
    expect(
      read(entity('sensor.power', '7200', {unit_of_measurement: 'W'}), entity('sensor.status', 'Charging')),
    ).toEqual({
      power: 7.2,
      status: 'Charging',
      present: true,
    });
  });

  test('is present by either sensor alone, even one that reads nothing', () => {
    expect(read(entity('sensor.power', '0', {unit_of_measurement: 'kW'}))).toEqual({
      power: 0,
      status: null,
      present: true,
    });
    expect(read(entity('sensor.status', 'Disconnected'))).toEqual({power: null, status: 'Disconnected', present: true});
    expect(read(entity('sensor.status', 'unavailable'))).toEqual({power: null, status: null, present: true});
  });

  test('is absent when neither sensor is in the states', () => {
    expect(read(entity('sensor.other', '1'))).toEqual({power: null, status: null, present: false});
  });
});
