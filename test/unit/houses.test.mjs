// The two test houses (test/houses/): they load, the full house has what the e2e specs name, the bare house lacks
// what the optional sections need, and the reader resolves times the same way wherever the test runs.
// Pattern: example-based tests over the house data (Meszaros, xUnit Test Patterns).
// Must not: hold a state literal; a house is data in test/houses/.
import {describe, expect, test} from 'vitest';
import {fakeHass} from './fake-hass';
import * as full from '../houses/full.mjs';
import * as bare from '../houses/bare.mjs';
import {REFERENCE_MS, dayStart, fromNow, nextAt, resolveTimes, sunState} from '../houses/clock.mjs';
import {FRENCH_AREA_NAMES, readHouse} from '../houses/read.mjs';
import {AFTERNOON, FULL_CFG, LINK_CFG} from '../e2e/houses';

const ids = h => Object.keys(h.states);
const TOWN_ZONE = 'America/Toronto';

describe('the houses load', () => {
  test.each([
    ['full', full],
    ['bare', bare],
  ])('%s: plain data, with the four maps and the house object', (_, h) => {
    expect(h.house).toEqual({
      states: h.states,
      entities: h.entities,
      devices: h.devices,
      areas: h.areas,
      automations: h.automations,
      config: h.config,
      user: h.user,
      services: h.services,
    });
    expect(ids(h).length).toBeGreaterThan(0);
    expect(Object.keys(h.areas)).toEqual(['living_room', 'office', 'bedroom', 'garage', 'kitchen']);
    // plain data: it survives a JSON round trip unchanged, so the browser and Node read the same thing
    expect(JSON.parse(JSON.stringify(h.house))).toEqual(h.house);
    for (const [id, s] of Object.entries(h.states)) expect(s.entity_id).toBe(id);
  });

  test('the full house is the bare house and more, and does not change it', () => {
    for (const id of ids(bare)) expect(full.states[id], id).toEqual(bare.states[id]);
    expect(ids(full).slice(0, ids(bare).length)).toEqual(ids(bare));
    expect(ids(bare)).toEqual([
      'sun.sun',
      'sensor.sun_next_setting',
      'sensor.sun_next_rising',
      'sensor.sun_next_dawn',
      'weather.springfield_forecast',
      'light.living_room_1',
    ]);
    expect(full.automations.map(a => a.entity_id)).toEqual([
      'automation.lights_off_at_sunrise',
      'automation.heating_evening',
      'automation.front_door_light',
    ]);
    expect(bare.automations).toEqual([]);
  });
});

describe('fakeHass.fromHouse(full)', () => {
  const hass = fakeHass.fromHouse(full);

  test('has the entity ids the e2e fixtures name', () => {
    const named = [
      ...Object.values(FULL_CFG.entities),
      ...FULL_CFG.scenes,
      ...FULL_CFG.modes,
      ...LINK_CFG.light_links.flatMap(l => (Array.isArray(l) ? [] : [...l.lights, l.switch])),
      ...['living_room', 'office', 'bedroom', 'garage'].map(k => `climate.${k}`),
      'light.living_room_1',
      'light.office_1',
      'sensor.fordpass_test_soc',
      'binary_sensor.front_door',
      'person.alex',
      'person.sam',
      'media_player.living_room_speaker',
    ];
    for (const id of named) expect(hass.states[id], id).toBeDefined();
    // the rooms the link config names exist as areas
    for (const area of [...LINK_CFG.split_light_areas, ...LINK_CFG.light_links.filter(Array.isArray).flat()])
      expect(hass.areas[area], area).toBeDefined();
  });

  test('has the zone, the registries and the states of a Home Assistant hass', () => {
    expect(hass.config).toMatchObject({time_zone: TOWN_ZONE, latitude: 43.65, longitude: -79.38});
    expect(hass.entities['light.living_room_1']).toEqual({
      entity_id: 'light.living_room_1',
      area_id: 'living_room',
      platform: 'hue',
      device_id: 'l1',
    });
    expect(hass.devices.l1.name).toBe('Living room lamp');
    expect(hass.states['climate.office'].attributes.friendly_name).toBe('Office');
    expect(hass.states['climate.office'].context).toBeDefined();
  });

  test('reads the clock at the reference instant: nothing is left as a marker, and the sun is where it should be', () => {
    expect(JSON.stringify(hass.states)).not.toMatch(/\$time|\$sun/);
    expect(REFERENCE_MS).toBe(Date.parse(AFTERNOON));
    // 14:00 in Toronto: the sun is up (it sets at 16:45, today), whichever zone the machine is in
    expect(hass.states['sun.sun'].state).toBe('above_horizon');
    expect(hass.states['sensor.sun_next_setting'].state).toBe('2026-11-07T21:45:00.000Z');
    expect(hass.states['sensor.sun_next_rising'].state).toBe('2026-11-08T12:00:00.000Z');
    expect(hass.states['sensor.sun_next_dawn'].state).toBe('2026-11-08T11:30:00.000Z');
    expect(hass.states['sensor.house_power'].last_changed).toBe(new Date(REFERENCE_MS - 3600e3).toISOString());
    expect(hass.states['sensor.springfield_observation_time'].state).toBe(
      new Date(REFERENCE_MS - 1800e3).toISOString(),
    );
  });

  test('is the same house on every build, and a new instant moves its clock', () => {
    expect(fakeHass.fromHouse(full).states).toEqual(hass.states);
    const night = fakeHass.fromHouse(full, {now: Date.parse('2026-11-07T23:30:00-05:00')});
    expect(night.states['sun.sun'].state).toBe('below_horizon');
    expect(night.states['sensor.sun_next_setting'].state).toBe('2026-11-08T21:45:00.000Z');
  });

  test('answers the registry and recorder calls the harness answers', async () => {
    const runs = await hass.callWS({type: 'trace/list'});
    expect(runs.map(r => r.item_id)).toEqual(['lights_off_at_sunrise', 'heating_evening', 'front_door_light']);
    // one run each, today, hours apart from midnight in the house's zone
    const midnight = Date.parse('2026-11-07T00:00:00-05:00');
    expect(runs.map(r => Date.parse(r.timestamp.start) - midnight)).toEqual([7, 12, 17].map(h => h * 3600e3));
    expect(hass.states['automation.heating_evening'].attributes.last_triggered).toBe(runs[1].timestamp.start);
    const run = await hass.callWS({type: 'trace/get', item_id: 'heating_evening', run_id: 'r1'});
    expect(Object.keys(run.trace)).toEqual(['trigger/0', 'condition/0', 'action/0']);
    expect((await hass.callWS({type: 'automation/config', entity_id: 'automation.heating_evening'})).config.id).toBe(
      'heating_evening',
    );
    const stats = await hass.callWS({
      type: 'recorder/statistics_during_period',
      statistic_ids: ['sensor.office_temperature', 'sensor.not_in_the_house'],
      period: 'hour',
    });
    expect(Object.keys(stats)).toEqual(['sensor.office_temperature']);
    expect(stats['sensor.office_temperature']).toHaveLength(171);
    expect(stats['sensor.office_temperature'].at(-1).end).toBe(REFERENCE_MS + 36e5);
    expect(await hass.callWS({type: 'lovelace/resources'})).toEqual([]);
    expect(await hass.callWS({type: 'something/else'})).toEqual({});
  });

  test('keeps the fake hass behaviour: a test may still override a reply, and next() hands over a new hass', async () => {
    const h = fakeHass.fromHouse(full);
    h.replies.set('trace/list', () => []);
    expect(await h.callWS({type: 'trace/list'})).toEqual([]);
    const next = h.next({'light.living_room_1': {state: 'off'}});
    expect(next.states['light.living_room_1'].state).toBe('off');
    expect(h.states['light.living_room_1'].state).toBe('on');
    expect(next.areas).toBe(h.areas);
  });

  test('takes other automations, French area names and a profile override', async () => {
    const one = [
      {entity_id: 'automation.only_one', config: {id: 'only_one', alias: 'Only one', mode: 'single', actions: []}},
    ];
    const h = fakeHass.fromHouse(full, {
      automations: one,
      frenchAreas: true,
      user: {name: 'Sam Example', is_admin: false},
    });
    expect(Object.keys(h.states).filter(id => id.startsWith('automation.'))).toEqual(['automation.only_one']);
    expect(h.areas.living_room.name).toBe('Salon');
    expect(h.states['climate.living_room'].attributes.friendly_name).toBe('Salon');
    expect(h.states['climate.garage'].attributes.friendly_name).toBe('Garage');
    expect(h.user.is_admin).toBe(false);
    expect(Object.values(FRENCH_AREA_NAMES)).toContain(h.areas.kitchen.name);
  });

  test('has an automation with no run stored when the house says so', async () => {
    const h = fakeHass.fromHouse(full, {
      automations: [{noRun: true, entity_id: 'automation.idle', config: {id: 'idle', alias: 'Idle', mode: 'single'}}],
    });
    expect(h.states['automation.idle'].attributes.last_triggered).toBeNull();
    expect(await h.callWS({type: 'trace/list'})).toEqual([]);
  });
});

describe('fakeHass.fromHouse(bare)', () => {
  const hass = fakeHass.fromHouse(bare);

  test('lacks the climate and car entities, so every optional section stays hidden', () => {
    for (const id of Object.keys(hass.states)) {
      expect(id, 'a bare house has no thermostat').not.toMatch(/^climate\./);
      expect(id, 'a bare house has no car').not.toMatch(/fordpass/);
    }
    expect(Object.keys(hass.states).filter(id => id.startsWith('light.'))).toEqual(['light.living_room_1']);
    expect(Object.keys(hass.states).filter(id => id.startsWith('weather.'))).toEqual(['weather.springfield_forecast']);
    expect(hass.states['sun.sun']).toBeDefined();
    expect(Object.keys(hass.entities)).toEqual(['light.living_room_1']);
  });
});

describe('the clock markers', () => {
  const at = iso => Date.parse(iso);

  test('resolve against the instant they are given, not the machine', () => {
    const now = REFERENCE_MS;
    expect(resolveTimes(fromNow(-60e3), now)).toBe('2026-11-07T18:59:00.000Z');
    expect(resolveTimes({a: [fromNow(1000)], b: 'plain', c: null, d: 4}, now)).toEqual({
      a: ['2026-11-07T19:00:01.000Z'],
      b: 'plain',
      c: null,
      d: 4,
    });
    // the same instant is another wall-clock time in another zone, so the next 07:00 is another instant
    expect(resolveTimes(nextAt(7, 0), now, TOWN_ZONE)).toBe('2026-11-08T12:00:00.000Z');
    expect(resolveTimes(nextAt(7, 0), now, 'Asia/Tokyo')).toBe('2026-11-07T22:00:00.000Z');
    expect(resolveTimes(nextAt(7, 0, -1800e3), now, TOWN_ZONE)).toBe('2026-11-08T11:30:00.000Z');
  });

  test('"next" is today when it is still ahead or exactly now, tomorrow when it has passed', () => {
    const sevenSharp = at('2026-11-07T07:00:00-05:00');
    expect(resolveTimes(nextAt(7, 0), sevenSharp, TOWN_ZONE)).toBe('2026-11-07T12:00:00.000Z');
    expect(resolveTimes(nextAt(7, 0), sevenSharp + 1, TOWN_ZONE)).toBe('2026-11-08T12:00:00.000Z');
  });

  test('the sun is up between sunrise and sunset', () => {
    const sun = sunState([7, 0], [16, 45]);
    const state = iso => resolveTimes(sun, at(iso), TOWN_ZONE);
    expect(state('2026-11-07T06:59:00-05:00')).toBe('below_horizon');
    expect(state('2026-11-07T07:01:00-05:00')).toBe('above_horizon');
    expect(state('2026-11-07T16:44:00-05:00')).toBe('above_horizon');
    expect(state('2026-11-07T16:46:00-05:00')).toBe('below_horizon');
  });

  test('a day starts at local midnight, also on the day the clocks go back', () => {
    expect(new Date(dayStart(REFERENCE_MS, TOWN_ZONE)).toISOString()).toBe('2026-11-07T05:00:00.000Z');
    // 1 November 2026: daylight saving time ends at 02:00; midnight is still on summer time, and the day has 25 hours
    expect(new Date(dayStart(at('2026-11-01T12:00:00-05:00'), TOWN_ZONE)).toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
    expect(new Date(dayStart(at('2026-11-02T00:30:00-05:00'), TOWN_ZONE)).toISOString()).toBe(
      '2026-11-02T05:00:00.000Z',
    );
    // and the next 07:00 after that night is 07:00 on the winter clock
    expect(resolveTimes(nextAt(7, 0), at('2026-11-01T12:00:00-05:00'), TOWN_ZONE)).toBe('2026-11-02T12:00:00.000Z');
    expect(resolveTimes(nextAt(7, 0), at('2026-11-01T00:30:00-04:00'), TOWN_ZONE)).toBe('2026-11-01T12:00:00.000Z');
  });
});

describe('readHouse', () => {
  test('does not change the house it reads', () => {
    const before = structuredClone(full.house);
    readHouse(full.house, {now: REFERENCE_MS, timeZone: TOWN_ZONE, frenchAreas: true});
    expect(full.house).toEqual(before);
  });
});
