// The Car commands as data: the expected objects are literals, so a renamed service, entity, key or toast is a failing test; the save's words in both languages.
import {describe, expect, test} from 'vitest';
import {
  HEATER_SWITCHES,
  honk,
  lockCar,
  remoteStart,
  saveSchedule,
  setAmps,
  toggleChargerLock,
  toggleDeparture,
  toggleHeater,
  togglePause,
  unlockCar,
} from '../../../../src/features/car/commands.ts';
import {K} from '../../../../src/features/car/keys.ts';
import type {ScheduleDraft} from '../../../../src/features/car/schedule.ts';
import {wallboxCommands} from '../../../../src/providers/wallbox.ts';
import {depsOf, fullHouse} from '../media/support.ts';

const car = {prefix: 'fordpass_t', id: (domain: string, key: string) => `${domain}.fordpass_t_${key}`};
const en = depsOf(fullHouse, 'en');
const fr = depsOf(fullHouse, 'fr');
const draft = (over: Partial<ScheduleDraft> = {}): ScheduleDraft => ({
  days: ['monday', 'wednesday'],
  time: '08:30',
  temp: 'medium',
  ...over,
});

describe('the charger', () => {
  test('setAmps sets the Wallbox’s current and holds it under the number’s key', () => {
    expect(setAmps({id: 'number.charger_max_current'}, 32)).toEqual({
      domain: 'number',
      service: 'set_value',
      data: {entity_id: 'number.charger_max_current', value: 32},
      holds: ['number.charger_max_current:amps'],
      done: {key: 'car.ampsSet', values: {n: 32}},
    });
  });

  test('togglePause is the provider’s, which the live pill runs too: one definition', () => {
    expect(togglePause).toBe(wallboxCommands.pause);
    expect(togglePause({id: 'switch.charger_pause'}, false)).toEqual({
      domain: 'switch',
      service: 'turn_off',
      data: {entity_id: 'switch.charger_pause'},
      done: {key: 'car.chargingOff'},
      holds: ['switch.charger_pause:pause'],
    });
  });

  test.each([
    [true, 'lock', 'car.chargerLocked'],
    [false, 'unlock', 'car.chargerUnlocked'],
  ] as const)('toggleChargerLock(%s) is lock.%s, held under the charger’s key', (on, service, key) => {
    expect(toggleChargerLock({id: 'lock.charger_lock'}, on)).toEqual({
      domain: 'lock',
      service,
      data: {entity_id: 'lock.charger_lock'},
      holds: ['lock.charger_lock:charger-lock'],
      done: {key},
    });
  });
});

describe('the car', () => {
  test.each([
    [true, 'turn_on', 'car.remoteStartSent'],
    [false, 'turn_off', 'car.remoteStartStopped'],
  ] as const)('remoteStart(%s) is switch.%s on the ignition', (on, service, key) => {
    expect(remoteStart(car, on)).toEqual({
      domain: 'switch',
      service,
      data: {entity_id: 'switch.fordpass_t_ignition'},
      holds: ['switch.fordpass_t_ignition:ignition'],
      done: {key},
    });
  });

  test.each([
    ['windshield', 'switch.fordpass_t_rccdefrostfront', 'Heated windshield'],
    ['rear', 'switch.fordpass_t_rccdefrostrear', 'Rear defrost'],
    ['wheel', 'switch.fordpass_t_rccsteeringwheel', 'Heated wheel'],
  ] as const)('toggleHeater(%s) turns its own switch and says its name', (heater, id, name) => {
    expect(toggleHeater(car, heater, true, name)).toEqual({
      domain: 'switch',
      service: 'turn_on',
      data: {entity_id: id},
      holds: [`${id}:heater`],
      done: {key: 'car.heaterOn', values: {name}},
    });
    expect(toggleHeater(car, heater, false, name)).toMatchObject({service: 'turn_off', done: {key: 'car.heaterOff'}});
    expect(HEATER_SWITCHES[heater]).toBe(id.replace('switch.fordpass_t_', ''));
  });

  test('honk presses the button it is given, and holds nothing: a button has no state', () => {
    expect(honk({id: 'button.fordpass_t_hafdefault'})).toEqual({
      domain: 'button',
      service: 'press',
      data: {entity_id: 'button.fordpass_t_hafdefault'},
      done: {key: 'car.honkSent'},
    });
  });

  test('lockCar and unlockCar are lock.lock and lock.unlock on the door lock, held under its key', () => {
    expect(lockCar(car)).toEqual({
      domain: 'lock',
      service: 'lock',
      data: {entity_id: 'lock.fordpass_t_doorlock'},
      holds: ['lock.fordpass_t_doorlock:door-lock'],
      done: {key: 'car.lockSent'},
    });
    expect(unlockCar(car)).toEqual({
      domain: 'lock',
      service: 'unlock',
      data: {entity_id: 'lock.fordpass_t_doorlock'},
      holds: ['lock.fordpass_t_doorlock:door-lock'],
      done: {key: 'car.unlockSent'},
    });
  });

  test.each([
    [true, 'turn_on', 'car.departureSwitchedOn'],
    [false, 'turn_off', 'car.departureSwitchedOff'],
  ] as const)('toggleDeparture(%s) is switch.%s on the departure times', (on, service, key) => {
    expect(toggleDeparture(car, on)).toEqual({
      domain: 'switch',
      service,
      data: {entity_id: 'switch.fordpass_t_departuretimes'},
      holds: ['switch.fordpass_t_departuretimes:dep'],
      done: {key},
    });
  });

  test('every command holds under the key the model reads it by', () => {
    expect(toggleDeparture(car, true).holds).toEqual([K.dep('switch.fordpass_t_departuretimes')]);
    expect(lockCar(car).holds).toEqual([K.doorLock('lock.fordpass_t_doorlock')]);
    expect(remoteStart(car, true).holds).toEqual([K.ignition('switch.fordpass_t_ignition')]);
    expect(setAmps({id: 'number.a'}, 16).holds).toEqual([K.amps('number.a')]);
  });
});

describe('saveSchedule', () => {
  test('is the Ford service with the days, the time in five-minute steps and the cabin setting, and says what was sent', () => {
    expect(saveSchedule(draft({time: '08:33'}), en)).toEqual({
      domain: 'fordpass',
      service: 'update_departure_schedule',
      data: {hour: 8, minute: 35, schedule_days: ['monday', 'wednesday'], precondition_temperature: 'medium'},
      done: {key: 'car.scheduleSaved', values: {when: 'Mon, Wed at 8:35 am'}},
    });
  });

  test('rounds past midnight, sends the days as a copy, and says the time as French writes it', () => {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    const command = saveSchedule(draft({days, time: '23:58'}), fr);
    expect(command.data).toEqual({hour: 0, minute: 0, schedule_days: days, precondition_temperature: 'medium'});
    expect(command.data?.schedule_days).not.toBe(days);
    expect(command.done?.values).toEqual({when: 'en semaine à 0 h'});
  });

  test('throws for a draft with no time: validate refuses it before, and `NaN` is never sent', () => {
    expect(() => saveSchedule(draft({time: ''}), en)).toThrow('validate refuses it');
  });
});
