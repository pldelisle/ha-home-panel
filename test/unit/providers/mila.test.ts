// milaRooms and milaOutside: which devices are rooms, which is the station, how a room's sensors are found by suffix, what a
// room is called and in what order. The test house gives today's answer as literals; literal houses give the rules it does
// not exercise; the recorded house is read when the owner has one (#170).
import {describe, expect, test} from 'vitest';
import {fakeHass} from '../fake-hass.ts';
import {fullHouse, houseOf, readingOf, recorded, type Player} from '../features/media/support.ts';
import {AIR_SUFFIXES, milaOutside, milaRooms} from '../../../src/providers/mila.ts';

type House = ReturnType<typeof houseOf>;
const roomsOf = (house: House) => {
  const {states, registries, names} = readingOf(house);
  return milaRooms(states, registries, names);
};
const outsideOf = (house: House) => {
  const {states, registries} = readingOf(house);
  return milaOutside(states, registries);
};

const mila = (device_id: string, extra: object = {}) => ({platform: 'mila', device_id, ...extra});
/** A purifier: its fan (with the device that names it) and the sensors given by suffix and state. */
const purifier = (
  id: string,
  device: {id: string; name?: string; area_id?: string},
  sensors: Record<string, string> = {},
  fan: {state?: string; attributes?: Record<string, unknown>; row?: object} = {},
): Player[] => [
  [`fan.${id}`, fan.state ?? 'on', fan.attributes ?? {}, mila(device.id, fan.row), device],
  ...Object.entries(sensors).map(([suffix, state]): Player => [`sensor.${id}_${suffix}`, state, {}, mila(device.id)]),
];

describe('the test house', () => {
  test('its office purifier: the fan, the thirteen sensors by suffix, the readings and the area’s name', () => {
    const [room, ...others] = roomsOf(fullHouse);
    expect(others).toEqual([]);
    expect(room).toEqual({
      deviceId: 'air1',
      fanId: 'fan.office_purifier',
      areaId: 'office',
      name: 'Office',
      sensors: Object.fromEntries(AIR_SUFFIXES.map(k => [k, `sensor.office_purifier_${k}`])),
      readings: {
        pm1: 6,
        pm2_5: 20,
        pm10: 24,
        co: 1,
        co2: 640,
        voc: 180,
        humidity: 38,
        temperature: 21.4,
        airQuality: 68,
        airChanges: 2.4,
      },
      fan: {on: true, available: true, percentage: 40, preset: 'Automagic'},
    });
  });

  test('its outdoor station: the three sensors, the four pollen reports and their readings', () => {
    expect(outsideOf(fullHouse)).toEqual({
      aqi: 'sensor.outdoor_aqi',
      pm: 'sensor.outdoor_station_pm2_5',
      distance: 'sensor.outdoor_station_distance',
      pollen: [
        {kind: 'trees', id: 'sensor.outdoor_pollen_status_trees'},
        {kind: 'grass', id: 'sensor.outdoor_pollen_status_grass'},
        {kind: 'weeds', id: 'sensor.outdoor_pollen_status_weeds'},
        {kind: 'mold', id: 'sensor.outdoor_pollen_status_mold'},
      ],
      readings: {aqi: 42, pm: 9, distance: 6, pollen: {trees: 'low', grass: 'none', weeds: 'none', mold: 'none'}},
    });
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the rules are tested on the test house', () => {});
    return;
  }

  test('every room has a fan and a name, and is listed once; the station, when there is one, is no room', () => {
    const hass = fakeHass.fromFixture('main');
    const {states, registries, names} = readingOf(hass);
    const rooms = milaRooms(states, registries, names);
    expect(new Set(rooms.map(r => r.deviceId)).size).toBe(rooms.length);
    for (const room of rooms) {
      expect(room.fanId).toMatch(/^fan\./);
      expect(room.name).not.toBe('');
      expect(registries.entities?.[room.fanId]?.platform).toBe('mila');
    }
    const station = milaOutside(states, registries);
    expect(station === null || !rooms.some(r => Object.values(r.sensors).includes(station.aqi as string))).toBe(true);
  });
});

describe('the rooms', () => {
  test('a device with a fan is a room, a device without one is not, and an entity of another platform is ignored', () => {
    const house = houseOf([
      ...purifier('den', {id: 'd1', name: 'Den'}, {pm2_5: '5'}),
      ['sensor.account_aqi', '30', {}, mila('d0')],
      ['sensor.other_pm2_5', '9', {}, {platform: 'zha', device_id: 'd9'}],
      ['fan.ceiling', 'on', {}, {platform: 'zha', device_id: 'd9'}],
      ['fan.loose', 'on', {}, mila('')],
    ]);
    expect(roomsOf(house).map(r => [r.fanId, r.sensors])).toEqual([['fan.den', {pm2_5: 'sensor.den_pm2_5'}]]);
  });

  test('a sensor is found by the end of its id: pm1 is not pm10, co is not co2, and a sensor the device lacks is absent', () => {
    const house = houseOf(purifier('den', {id: 'd1', name: 'Den'}, {pm10: '11', co2: '500', co: '3', pm1: '4'}));
    const [room] = roomsOf(house);
    expect(room.sensors).toEqual({
      pm1: 'sensor.den_pm1',
      pm10: 'sensor.den_pm10',
      co: 'sensor.den_co',
      co2: 'sensor.den_co2',
    });
    expect([room.readings.pm1, room.readings.pm10, room.readings.co, room.readings.co2, room.readings.voc]).toEqual([
      4,
      11,
      3,
      500,
      null,
    ]);
  });

  test('a sensor that is unavailable, unknown or not a number reads null', () => {
    const house = houseOf(
      purifier('den', {id: 'd1', name: 'Den'}, {pm2_5: 'unavailable', co2: 'unknown', voc: 'high', humidity: '40'}),
    );
    const {readings} = roomsOf(house)[0];
    expect([readings.pm2_5, readings.co2, readings.voc, readings.humidity]).toEqual([null, null, null, 40]);
  });

  test('the name is the area’s, else the device’s, else the fan’s', () => {
    const house = houseOf(
      [
        ...purifier('a', {id: 'da', name: 'Device A', area_id: 'kitchen'}),
        ...purifier('b', {id: 'db', name: 'Device B'}),
        ...purifier('c', {id: 'dc'}, {}, {attributes: {friendly_name: 'Fan C'}}),
      ],
      [],
      {kitchen: 'Kitchen'},
    );
    expect(roomsOf(house).map(r => [r.fanId, r.areaId, r.name])).toEqual([
      ['fan.b', null, 'Device B'],
      ['fan.c', null, 'Fan C'],
      ['fan.a', 'kitchen', 'Kitchen'],
    ]);
  });

  test('the area is the device’s alone, as the legacy panel read it: the fan’s own area is not the room’s', () => {
    const house = houseOf(
      purifier('a', {id: 'da', name: 'Device A', area_id: 'kitchen'}, {}, {row: {area_id: 'den'}}),
      [],
      {
        kitchen: 'Kitchen',
        den: 'Den',
      },
    );
    expect(roomsOf(house)[0]).toMatchObject({areaId: 'kitchen', name: 'Kitchen'});
  });

  test('an area the registry does not name leaves the room to its device, else its fan', () => {
    const house = houseOf([
      ...purifier('a', {id: 'da', name: 'Device A', area_id: 'gone'}),
      ...purifier('b', {id: 'db', area_id: 'gone'}, {}, {attributes: {friendly_name: 'Fan B'}}),
    ]);
    expect(roomsOf(house).map(r => [r.areaId, r.name])).toEqual([
      ['gone', 'Device A'],
      ['gone', 'Fan B'],
    ]);
  });

  test('the rooms are sorted by name, not by the registry’s order', () => {
    const house = houseOf([
      ...purifier('z', {id: 'dz', name: 'Zed'}),
      ...purifier('a', {id: 'da', name: 'Alpha'}),
      ...purifier('m', {id: 'dm', name: 'Middle'}),
    ]);
    expect(roomsOf(house).map(r => r.name)).toEqual(['Alpha', 'Middle', 'Zed']);
  });

  test('the fan: off is not offline, unavailable and missing are offline, and a missing percentage or mode is 0 and null', () => {
    const house = houseOf([
      ...purifier('a', {id: 'da', name: 'A'}, {}, {state: 'off', attributes: {percentage: 30, preset_mode: 'Manual'}}),
      ...purifier('b', {id: 'db', name: 'B'}, {}, {state: 'unavailable'}),
      ['fan.c', 'on', {}, mila('dc'), {id: 'dc', name: 'C'}],
    ]);
    const fans = roomsOf(house).map(r => r.fan);
    expect(fans).toEqual([
      {on: false, available: true, percentage: 30, preset: 'Manual'},
      {on: false, available: false, percentage: 0, preset: null},
      {on: true, available: true, percentage: 0, preset: null},
    ]);
  });

  test('a fan the states do not carry is offline', () => {
    const house = houseOf(purifier('a', {id: 'da', name: 'A'}));
    const {registries, names} = readingOf(house);
    expect(milaRooms({}, registries, names)[0].fan).toEqual({on: false, available: false, percentage: 0, preset: null});
  });
});

describe('the station', () => {
  test('a house with no Mila device has none, and neither has one whose devices are all rooms', () => {
    expect(outsideOf(houseOf([]))).toBeNull();
    expect(outsideOf(houseOf(purifier('den', {id: 'd1', name: 'Den'}, {pm2_5: '5'})))).toBeNull();
  });

  test('a device without a fan or an index is not the station', () => {
    expect(outsideOf(houseOf([['sensor.account_station_pm2_5', '4', {}, mila('d0')]]))).toBeNull();
  });

  test('a station with only its index: the other sensors are null, the pollen unreported', () => {
    const house = houseOf([['sensor.account_aqi', 'unavailable', {}, mila('d0')]]);
    expect(outsideOf(house)).toEqual({
      aqi: 'sensor.account_aqi',
      pm: null,
      distance: null,
      pollen: ['trees', 'grass', 'weeds', 'mold'].map(kind => ({kind, id: null})),
      readings: {aqi: null, pm: null, distance: null, pollen: {trees: null, grass: null, weeds: null, mold: null}},
    });
  });

  test('a pollen report that is unavailable reads null, the others by their text', () => {
    const house = houseOf([
      ['sensor.account_aqi', '10', {}, mila('d0')],
      ['sensor.account_pollen_status_trees', 'unavailable', {}, mila('d0')],
      ['sensor.account_pollen_status_mold', 'high', {}, mila('d0')],
    ]);
    expect(outsideOf(house)?.readings.pollen).toEqual({trees: null, grass: null, weeds: null, mold: 'high'});
  });
});
