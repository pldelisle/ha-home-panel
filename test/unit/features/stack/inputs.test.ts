// readStack and stackIds: what the rules are given and what the stack listens to. The test house gives today's reading; literal
// players, calendars and an Away switch give the corners it does not exercise.
import {describe, expect, test} from 'vitest';
import {registriesOf} from '../../../../src/core/registry.ts';
import {readStack, type StackReading} from '../../../../src/features/stack/inputs.ts';
import {stackIds} from '../../../../src/features/stack/ids.ts';
import {entity, type FakeHass} from '../../fake-hass.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import {fullHouse, houseOf, NOW, storeOf} from '../media/support.ts';

const read = (hass: FakeHass, config: unknown = {}, over: Partial<StackReading> = {}) => {
  const store = storeOf(hass, config);
  return readStack(hass.states, registriesOf(hass), store.config, store.names, {
    now: NOW,
    fmt: store.fmt,
    location: {},
    forecast: [],
    history: null,
    ...over,
  });
};

describe('readStack', () => {
  test('the test house: its front door, three light tiles, its car, two people, the speaker playing, no Away', () => {
    const inputs = read(fullHouse, FULL_CFG, {location: fullHouse.config});
    expect(inputs.doors.map(d => d.id)).toEqual(['binary_sensor.front_door']);
    expect(inputs.lights.map(l => [l.name, l.on, l.unavailable])).toEqual([
      ['Kitchen', true, []],
      ['Living room', true, []],
      ['Office', true, []],
    ]);
    expect(inputs.people.map(p => p.name)).toEqual(['Alex', 'Sam']);
    expect(inputs.playing).toEqual({place: 'Living room', picture: null, title: 'Test tone', artist: 'Nobody'});
    expect(inputs.away).toBeNull();
    expect(inputs.sun.tomorrow.rise! - inputs.sun.today.rise!).toBeGreaterThan(23 * 36e5);
  });

  test('a light tile lists its unavailable lights with when they stopped', () => {
    const hass = houseOf([['light.lamp', 'unavailable', {}, {area_id: 'den'}]], [], {den: 'Den'});
    expect(read(hass).lights).toEqual([
      {
        name: 'Den',
        unavailable: [{id: 'light.lamp', since: Date.parse(hass.states['light.lamp'].last_changed)}],
        on: false,
      },
    ]);
  });

  test('the television is never the speaker; a Samsung set is preferred; a player in an unnamed area goes by its own name', () => {
    const hass = houseOf(
      [
        ['media_player.tv_a', 'playing', {device_class: 'tv'}, {platform: 'cast', area_id: 'den'}],
        ['media_player.tv_b', 'playing', {device_class: 'tv'}, {platform: 'samsungtv', area_id: 'den'}],
        ['media_player.pod', 'playing', {friendly_name: 'Pod', app_name: 'Radio'}, {platform: 'cast', area_id: 'loft'}],
      ],
      [],
      {den: 'Den'},
    );
    // tv_a is not Samsung, so it is a speaker for the rule, as the legacy `tv()` left it
    expect(read(hass).playing).toMatchObject({place: 'Den'});
    const quiet = houseOf(
      [
        ['media_player.tv', 'playing', {device_class: 'tv'}, {area_id: 'den'}],
        ['media_player.pod', 'playing', {friendly_name: 'Pod', app_name: 'Radio'}, {platform: 'cast', area_id: 'loft'}],
      ],
      [],
      {den: 'Den'},
    );
    expect(read(quiet).playing).toEqual({place: 'Pod', picture: null, title: null, artist: 'Radio'});
  });

  test('events are titled by their message or their calendar; Away reads its switch; tonight is the night entry of today', () => {
    const at = (h: number) => new Date(NOW + h * 36e5);
    // Home Assistant's calendar times have no zone and are read in the browser's: written here in the process's own zone
    const pad = (n: number) => String(n).padStart(2, '0');
    const local = (d: Date) =>
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
    const hass = houseOf(
      [],
      [
        entity('calendar.family', 'on', {friendly_name: 'Family', start_time: local(at(1)), end_time: local(at(2))}),
        entity('input_boolean.away', 'on'),
      ],
    );
    const forecast = [
      {datetime: NOW, temperature: 5, condition: 'sunny'},
      {datetime: NOW + 6 * 36e5, is_daytime: false, temperature: -2, condition: 'clear-night'},
    ];
    const inputs = read(hass, {entities: {away: 'input_boolean.away'}}, {forecast});
    expect(inputs.events).toEqual([{title: 'Family', start: at(1).getTime(), allDay: false}]);
    expect(inputs.away).toEqual({on: true, since: Date.parse(hass.states['input_boolean.away'].last_changed)});
    expect(inputs.tonight).toBe('clear-night');
    expect(inputs.forecast[0]).toMatchObject({hi: 5, lo: -2});
    expect(read(hass, {entities: {away: 'input_boolean.missing'}}).away).toBeNull();
  });
});

describe('stackIds', () => {
  test('lists what the rules read, once each, and nothing before Home Assistant answers', () => {
    const ids = stackIds(storeOf(fullHouse, FULL_CFG));
    for (const id of [
      'binary_sensor.front_door',
      'light.office_1',
      'media_player.living_room_speaker',
      'person.alex',
      'sensor.house_power',
    ])
      expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
    const tracked = houseOf(
      [],
      [entity('person.alex', 'home', {friendly_name: 'Alex', source: 'device_tracker.alex_phone'})],
    );
    expect(stackIds(storeOf(tracked, {people: ['Alex']}))).toContain('device_tracker.alex_phone');
    expect(stackIds({...storeOf(fullHouse), hass: null})).toEqual([]);
  });
});
