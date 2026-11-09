// `fakeHass.fromFixture`: a recorded house read into the shape `fromHouse` builds, proven on the checked-in sample (a slice of
// the full test house, written by the recorder) so the loader works before the owner's own fixture exists.
// Pattern: example-based tests at the hass seam (ADR 0005, Meszaros, xUnit Test Patterns).
// Must not: name the owner's fixture (it may not exist) or hold a state literal; a fixture is data in test/unit/fixtures/houses/.
import {describe, expect, test} from 'vitest';
import {fakeHass, readFixture} from './fake-hass';
import * as full from '../houses/full.mjs';

type Rows = Record<string, {mean?: number}[]>;

describe('fakeHass.fromFixture', () => {
  const hass = fakeHass.fromFixture('sample');

  test('builds the states and the three registries, keyed as hass keys them', () => {
    expect(Object.keys(hass.states)).toContain('weather.springfield_forecast');
    expect(hass.states['sensor.springfield_temperature'].entity_id).toBe('sensor.springfield_temperature');
    expect(hass.entities?.['light.living_room_1']).toMatchObject({platform: 'hue', device_id: 'device_001'});
    expect(hass.devices?.device_001).toMatchObject({id: 'device_001', area_id: 'living_room'});
    expect(hass.areas?.living_room).toEqual({area_id: 'living_room', name: 'Living room'});
  });

  test('every state has the context a state has, which the recorder drops with the ids', () => {
    for (const state of Object.values(hass.states))
      expect(state.context).toEqual({id: 'ctx', parent_id: null, user_id: null});
  });

  test('has the shape fromHouse builds: the same keys, with the defaults for what a fixture does not hold', () => {
    const house = fakeHass.fromHouse(full);
    // the services a house offers are not recorded (spec 14 lists the states and the three registries)
    expect(Object.keys(hass).sort()).toEqual(
      Object.keys(house)
        .filter(k => k !== 'services')
        .sort(),
    );
    expect(hass.locale).toEqual({language: 'en'});
    expect(typeof hass.connection?.subscribeMessage).toBe('function');
  });

  test('next patches a state as it does for any fake hass', () => {
    const later = hass.next({'light.living_room_1': {state: 'off'}});
    expect(later.states['light.living_room_1'].state).toBe('off');
    expect(later.states['sun.sun']).toBe(hass.states['sun.sun']);
  });

  test('init overrides what a fixture does not hold', () => {
    const french = fakeHass.fromFixture('sample', {
      locale: {language: 'fr'},
      config: {time_zone: 'UTC', latitude: 0, longitude: 0},
    });
    expect(french.locale).toEqual({language: 'fr'});
    expect(french.config.time_zone).toBe('UTC');
    expect(french.states).toEqual(hass.states);
  });

  test('a fixture the folder does not hold is an error, not an empty house', () => {
    expect(() => fakeHass.fromFixture('no-such-house')).toThrow(/no-such-house\.json/);
  });
});

describe('the recorded statistics', () => {
  const fixture = readFixture('sample');
  const ask = (period: string, ids: string[]) =>
    fakeHass.fromFixture('sample').callWS<Rows>({
      type: 'recorder/statistics_during_period',
      period,
      statistic_ids: ids,
      start_time: '2020-01-01T00:00:00.000Z', // the model's own `now` decides this; the recorded rows are those of recordedAt
    });

  test('are answered by period, for the ids asked, as recorded', async () => {
    const hour = await ask('hour', ['sensor.springfield_temperature']);
    expect(Object.keys(hour)).toEqual(['sensor.springfield_temperature']);
    const recorded = Object.entries(fixture.statistics ?? {}).find(([key]) => key.startsWith('hour@'))?.[1] as Rows;
    expect(hour['sensor.springfield_temperature']).toEqual(recorded['sensor.springfield_temperature']);
    const day = await ask('day', ['sensor.springfield_temperature']);
    expect(day['sensor.springfield_temperature'].length).toBeLessThan(hour['sensor.springfield_temperature'].length);
  });

  test('leave out an id that was not recorded, and answer nothing for a period that was not', async () => {
    expect(await ask('hour', ['sensor.not_recorded'])).toEqual({});
    expect(await ask('week', ['sensor.springfield_temperature'])).toEqual({});
    expect(
      await fakeHass.fromFixture('sample').callWS({type: 'recorder/statistics_during_period', period: 'hour'}),
    ).toEqual({});
  });

  test('carry the instant of the recording, which a model test passes as its own `now`', () => {
    expect(Date.parse(fixture.recordedAt)).not.toBeNaN();
    expect(fixture.source).toMatch(/^home-assistant /);
  });
});
