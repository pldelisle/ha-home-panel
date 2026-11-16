// wallbox: the charger's power in kW and its status, whether the house has one (either sensor), the controls' inputs (current limit, charging
// switch, lock, price), the charging sessions its hourly rows make and the pause command as data. The test house gives today's answer as
// literals; literal houses give the rules it does not exercise; the recorded house is read when the owner has one (#170).
import {describe, expect, test} from 'vitest';
import type {StatisticRow} from '../../../src/core/ha.ts';
import {overlayKey} from '../../../src/core/overlay-key.ts';
import {FULL_CFG} from '../../e2e/houses.ts';
import {entity, fakeHass} from '../fake-hass.ts';
import {fullHouse, houseOf, recorded, storeOf} from '../features/media/support.ts';
import {chargingSessions, pauseHold, wallbox, wallboxCommands} from '../../../src/providers/wallbox.ts';

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
      amps: {id: 'number.charger_max_current', value: 32, min: 6, max: 40, available: true},
      pause: {id: 'switch.charger_pause', on: true, available: true},
      lock: {id: 'lock.charger_lock', on: false, available: true},
      price: null,
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
    ).toMatchObject({
      power: 7.2,
      status: 'Charging',
      present: true,
    });
  });

  test('is present by either sensor alone, even one that reads nothing', () => {
    expect(read(entity('sensor.power', '0', {unit_of_measurement: 'kW'}))).toMatchObject({
      power: 0,
      status: null,
      present: true,
    });
    expect(read(entity('sensor.status', 'Disconnected'))).toMatchObject({
      power: null,
      status: 'Disconnected',
      present: true,
    });
    expect(read(entity('sensor.status', 'unavailable'))).toMatchObject({power: null, status: null, present: true});
  });

  test('is absent when neither sensor is in the states', () => {
    expect(read(entity('sensor.other', '1'))).toMatchObject({power: null, status: null, present: false});
  });
});

describe('the controls', () => {
  const CONTROLS = {
    entities: {
      ev_charger_current: 'number.amps',
      ev_charger_pause: 'switch.pause',
      ev_charger_lock: 'lock.lock',
      ev_charger_price: 'sensor.price',
    },
  };
  const controls = (...states: ReturnType<typeof entity>[]) => {
    const hass = houseOf([], states);
    return wallbox(hass.states, storeOf(hass, CONTROLS).config);
  };

  test('the current limit is its value and its own range', () => {
    expect(controls(entity('number.amps', '24', {min: 8, max: 32})).amps).toEqual({
      id: 'number.amps',
      value: 24,
      min: 8,
      max: 32,
      available: true,
    });
  });

  test('a charger that gives no range, or a range of zero, is offered 6 to 48 amps; one that reads nothing is unavailable', () => {
    expect(controls(entity('number.amps', '16')).amps).toMatchObject({value: 16, min: 6, max: 48, available: true});
    expect(controls(entity('number.amps', '16', {min: 0, max: 0})).amps).toMatchObject({min: 6, max: 48});
    expect(controls(entity('number.amps', 'unavailable', {min: 8, max: 32})).amps).toEqual({
      id: 'number.amps',
      value: null,
      min: 8,
      max: 32,
      available: false,
    });
    expect(controls().amps).toEqual({id: 'number.amps', value: null, min: 6, max: 48, available: false});
  });

  test('the charging switch and the lock are on, off or unavailable; a lock is on when locked', () => {
    expect(controls(entity('switch.pause', 'on'), entity('lock.lock', 'locked'))).toMatchObject({
      pause: {id: 'switch.pause', on: true, available: true},
      lock: {id: 'lock.lock', on: true, available: true},
    });
    expect(controls(entity('switch.pause', 'off'), entity('lock.lock', 'unlocked'))).toMatchObject({
      pause: {on: false, available: true},
      lock: {on: false, available: true},
    });
    expect(controls(entity('switch.pause', 'unavailable'))).toMatchObject({
      pause: {on: false, available: false},
      lock: {id: 'lock.lock', on: false, available: false},
    });
  });

  test('a house that names none of them has no id and nothing available; the price is its number, else null', () => {
    expect(read()).toMatchObject({
      amps: {id: null, available: false},
      pause: {id: null, on: false, available: false},
      lock: {id: null, available: false},
      price: null,
    });
    expect(controls(entity('sensor.price', '0.09')).price).toBe(0.09);
    expect(controls(entity('sensor.price', 'unavailable')).price).toBeNull();
  });
});

describe('chargingSessions', () => {
  const HOUR = 36e5;
  const T0 = Date.parse('2026-11-01T00:00:00Z');
  /** Hourly rows from hour `at` of the day: `[hour, mean kW, max kW]`. */
  const rows = (...hours: [number, number | null, number?][]): StatisticRow[] =>
    hours.map(([hour, mean, max]) => ({start: T0 + hour * HOUR, end: T0 + (hour + 1) * HOUR, mean, max}));

  test('a run of hours above 0.3 kW is one session: its energy is the means summed, its peak the highest max, its end an hour after its last hour', () => {
    expect(chargingSessions(rows([1, 0.1], [2, 7, 7.2], [3, 7.1, 7.4], [4, 3.5, 7], [5, 0.2]))).toEqual([
      {start: T0 + 2 * HOUR, end: T0 + 5 * HOUR, kwh: 17.6, peak: 7.4},
    ]);
  });

  test('hours exactly at 0.3 kW are not charging', () => {
    expect(chargingSessions(rows([1, 0.3], [2, 0.3]))).toEqual([]);
  });

  test('a gap of up to three hours joins two runs; the energy is only the hours above 0.3 kW', () => {
    expect(chargingSessions(rows([0, 5, 5], [3, 5, 6]))).toEqual([{start: T0, end: T0 + 4 * HOUR, kwh: 10, peak: 6}]);
  });

  test('a gap of over three hours splits them', () => {
    expect(chargingSessions(rows([0, 5, 5], [4, 5, 6]))).toEqual([
      {start: T0, end: T0 + HOUR, kwh: 5, peak: 5},
      {start: T0 + 4 * HOUR, end: T0 + 5 * HOUR, kwh: 5, peak: 6},
    ]);
  });

  test('a session under 1 kWh is dropped, one of exactly 1 kWh is kept', () => {
    expect(chargingSessions(rows([0, 0.9, 1], [10, 1, 1.1]))).toEqual([
      {start: T0 + 10 * HOUR, end: T0 + 11 * HOUR, kwh: 1, peak: 1.1},
    ]);
  });

  test('a row with no mean or no max counts as zero: it is no hour of charging, or a peak of zero', () => {
    expect(chargingSessions(rows([0, null], [1, 2, undefined], [2, 2]))).toEqual([
      {start: T0 + HOUR, end: T0 + 3 * HOUR, kwh: 4, peak: 0},
    ]);
    expect(chargingSessions([])).toEqual([]);
  });
});

describe('wallboxCommands.pause', () => {
  test('resumes as data: switch.turn_on on the charging switch, the toast "Charging on", the switch held under its overlay key', () => {
    expect(wallboxCommands.pause({id: 'switch.charger_pause'}, true)).toEqual({
      domain: 'switch',
      service: 'turn_on',
      data: {entity_id: 'switch.charger_pause'},
      done: {key: 'car.chargingOn'},
      holds: ['switch.charger_pause:pause'],
    });
  });

  test('pauses as data: switch.turn_off and "Charging off"', () => {
    expect(wallboxCommands.pause({id: 'switch.charger_pause'}, false)).toMatchObject({
      service: 'turn_off',
      done: {key: 'car.chargingOff'},
    });
  });

  test('holds the switch under the key overlayKey makes for `pause`, which the Car reads it by', () => {
    expect(wallboxCommands.pause({id: 'switch.charger_pause'}, true).holds).toEqual([
      overlayKey('pause')('switch.charger_pause'),
    ]);
    expect(pauseHold('switch.charger_pause')).toBe('switch.charger_pause:pause');
  });
});
