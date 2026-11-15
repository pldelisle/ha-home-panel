// hydroQuebec: the balance and the two critical-peak flags, and null for a house without the integration. The test house has
// none; literal houses give the rules; the recorded house is read when the owner has one (#170).
import {describe, expect, test} from 'vitest';
import {entity, fakeHass} from '../fake-hass.ts';
import {fullHouse, houseOf, recorded, storeOf} from '../features/media/support.ts';
import {hydroQuebec} from '../../../src/providers/hydro-quebec.ts';

const CFG = {
  entities: {
    hydro_quebec_balance: 'sensor.balance',
    hydro_quebec_peak: 'binary_sensor.peak',
    hydro_quebec_upcoming_peak: 'binary_sensor.upcoming',
  },
};
const read = (...states: ReturnType<typeof entity>[]) => {
  const hass = houseOf([], states);
  return hydroQuebec(hass.states, storeOf(hass, CFG).config);
};

describe('the test house', () => {
  test('has no Hydro-Québec integration, so there is nothing to read', () => {
    expect(hydroQuebec(fullHouse.states, storeOf(fullHouse, CFG).config)).toBeNull();
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the rules are tested on literal houses', () => {});
    return;
  }

  test('is null or reads the three sensors, never half an answer', () => {
    const hass = fakeHass.fromFixture('main');
    const reading = hydroQuebec(hass.states, storeOf(hass).config);
    if (reading) expect(Object.keys(reading)).toEqual(['balance', 'peakNow', 'peakUpcoming']);
  });
});

describe('the reading', () => {
  test('the balance is a number and a flag is on when its sensor says on', () => {
    expect(
      read(
        entity('sensor.balance', '-31.5'),
        entity('binary_sensor.peak', 'on'),
        entity('binary_sensor.upcoming', 'off'),
      ),
    ).toEqual({balance: -31.5, peakNow: true, peakUpcoming: false});
    expect(read(entity('binary_sensor.upcoming', 'on'))).toEqual({balance: null, peakNow: false, peakUpcoming: true});
  });

  test('is there when any one of the three is in the states, and an unavailable one reads as nothing', () => {
    expect(read(entity('sensor.balance', 'unavailable'))).toEqual({balance: null, peakNow: false, peakUpcoming: false});
    expect(read(entity('binary_sensor.peak', 'unavailable'))).toEqual({
      balance: null,
      peakNow: false,
      peakUpcoming: false,
    });
  });

  test('is null when none of the three is in the states', () => {
    expect(read(entity('sensor.other', '1'))).toBeNull();
  });
});
