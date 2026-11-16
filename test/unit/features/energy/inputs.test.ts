// readEnergy and energyIds: the flow, Hilo, Hydro-Québec, the Wallbox and the water heater of a house composed into one reading, and the ids the pane would
// subscribe to. The test house has a grid, a water heater without a name, a charger and four thermostats; literal houses give Hilo, the water heater's name
// and the rest; the recorded house is read when the owner has one (#170).
import {describe, expect, test} from 'vitest';
import {resolveConfig} from '../../../../src/core/config.ts';
import {energyIds} from '../../../../src/features/energy/ids.ts';
import {readEnergy, type EnergyInputs} from '../../../../src/features/energy/inputs.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import {entity, fakeHass} from '../../fake-hass.ts';
import {fullHouse, houseOf, readingOf, recorded, storeOf} from '../media/support.ts';

type State = ReturnType<typeof entity>;

const WATER = {water_heater_temperature: 'sensor.tank_temperature', water_heater_power: 'sensor.tank_power'};

/** What a house of these states reads as, under a config. */
const read = (states: State[], config: object = {}): EnergyInputs => {
  const hass = houseOf([], states);
  const store = storeOf(hass, config);
  return readEnergy(hass.states, store.config, store.names);
};

describe('the test house', () => {
  test('its grid, its charger and its water heater, with no Hilo and no Hydro-Québec', () => {
    const {states, names} = readingOf(fullHouse);
    const inputs = readEnergy(states, storeOf(fullHouse, FULL_CFG).config, names);
    expect(inputs.power).toMatchObject({grid: 3.24, waterHeater: 0, ev: 7.1});
    expect(inputs.power.rooms).toHaveLength(4);
    expect(inputs.water).toEqual({temperature: 50, power: 0, name: '', present: true});
    expect(inputs.wallbox).toMatchObject({power: 7.1, status: 'Charging', present: true});
    expect(inputs).toMatchObject({hiloPresent: false, challenge: null, rewards: null, hydroQuebec: null});
    expect(inputs.hilo.tier).toBe('unknown');
  });

  test('its ids: the grid, the meter, the water heater’s two, the charger’s two, Hilo’s seven and each room’s two, once each', () => {
    const ids = energyIds(storeOf(fullHouse, FULL_CFG));
    expect(ids).toHaveLength(1 + 1 + 2 + 2 + 7 + 4 * 2);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'sensor.house_power',
        'sensor.hilo_energy_total',
        'sensor.water_heater_power',
        'sensor.charger_status',
        'sensor.hilo_gateway',
        'climate.office',
        'sensor.office_power',
      ]),
    );
  });
});

describe('Hilo', () => {
  const entities = {
    hilo_rate: 'sensor.rate',
    hilo_rate_low: 'sensor.low',
    hilo_rate_medium: 'sensor.medium',
    hilo_rate_reward: 'sensor.reward',
    hilo_challenge: 'sensor.challenge',
    hilo_rewards: 'sensor.rewards',
  };

  test('the tier, the challenge and the rewards of a house that has them', () => {
    const inputs = read(
      [
        entity('sensor.rate', '0.0759'),
        entity('sensor.low', '0.0759'),
        entity('sensor.medium', '0.1'),
        entity('sensor.reward', '1.0'),
        entity('sensor.challenge', 'pre_heat'),
        entity('sensor.rewards', '85'),
      ],
      {entities},
    );
    expect(inputs.hilo).toMatchObject({current: 0.0759, tier: 'low'});
    expect(inputs).toMatchObject({hiloPresent: true, challenge: {state: 'pre_heat', active: true}, rewards: 85});
  });

  test('a rate sensor that is unavailable is still the house’s Hilo: present, with no tier', () => {
    const inputs = read([entity('sensor.rate', 'unavailable')], {entities});
    expect(inputs).toMatchObject({hiloPresent: true, hilo: {current: null, tier: 'unknown'}});
  });
});

describe('Hydro-Québec', () => {
  test('the balance and the peak flags when one of the three sensors is there', () => {
    const inputs = read([entity('sensor.balance', '41.2'), entity('binary_sensor.peak', 'on')], {
      entities: {hydro_quebec_balance: 'sensor.balance', hydro_quebec_peak: 'binary_sensor.peak'},
    });
    expect(inputs.hydroQuebec).toMatchObject({balance: 41.2, peakNow: true, peakUpcoming: false});
  });
});

describe('the water heater', () => {
  const heater = (temperatureName: string, extra: State[] = []) =>
    read(
      [
        entity('sensor.tank_temperature', '49.5', {friendly_name: temperatureName}),
        entity('sensor.tank_power', '1200', {unit_of_measurement: 'W'}),
        ...extra,
      ],
      {entities: WATER},
    ).water;

  test('its temperature, its power in kW, and its name without the measurement', () => {
    expect(heater('Tank Temperature')).toEqual({temperature: 49.5, power: 1.2, name: 'Tank', present: true});
  });

  test('"water heater" and the French measurement words come off the name too, in any case', () => {
    expect(heater('Cumulus Water Heater Temperature').name).toBe('Cumulus');
    expect(heater('Ballon Température').name).toBe('Ballon');
    expect(heater('Ballon PUISSANCE').name).toBe('Ballon');
  });

  test('the name comes from the first of the two sensors that has one, resolved through the names block', () => {
    const second = read(
      [entity('sensor.tank_temperature', '49'), entity('sensor.tank_power', '0', {friendly_name: 'Tank Power'})],
      {entities: WATER},
    );
    expect(second.water.name).toBe('Tank');
    const renamed = read([entity('sensor.tank_temperature', '49', {friendly_name: 'Tank Temperature'})], {
      entities: WATER,
      names: {'Tank Temperature': {en: 'Cellar Heater'}},
    });
    expect(renamed.water.name).toBe('Cellar Heater');
  });

  test('a sensor with an empty name is no name; no sensor reads nothing and is not there', () => {
    expect(heater('').name).toBe('');
    expect(read([], {entities: WATER}).water).toEqual({temperature: null, power: null, name: '', present: false});
  });

  test('a heater whose sensors are unavailable is still the house’s: present, with no readings', () => {
    const inputs = read([entity('sensor.tank_power', 'unavailable')], {entities: WATER});
    expect(inputs.water).toMatchObject({power: null, present: true});
  });
});

describe('the ids of a config', () => {
  test('every id the config names, Hydro-Québec’s and each room’s included, once each; an unset one is left out', () => {
    const config = resolveConfig({
      entities: {
        ...WATER,
        grid_power: 'sensor.grid',
        hydro_quebec_balance: 'sensor.balance',
        energy_total: 'sensor.grid',
      },
      rooms: [{climate: 'climate.den'}],
    });
    const ids = energyIds({config});
    expect(ids).toEqual(expect.arrayContaining(['sensor.balance', 'climate.den', 'sensor.den_power']));
    expect(ids.filter(id => id === 'sensor.grid')).toHaveLength(1);
    expect(ids.every(id => typeof id === 'string' && id !== '')).toBe(true);
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the composition is tested on literal houses', () => {});
    return;
  }

  test('its ids hold no id twice, and its reading has a grid figure or none', () => {
    const hass = fakeHass.fromFixture('main');
    const store = storeOf(hass);
    const ids = energyIds(store);
    expect(new Set(ids).size).toBe(ids.length);
    const {grid} = readEnergy(hass.states, store.config, store.names).power;
    expect(grid === null || Number.isFinite(grid)).toBe(true);
  });
});
