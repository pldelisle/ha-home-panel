// readAir and airIds: the purifiers, the station and the AQHI of a house composed into one reading, and the ids the pane would
// subscribe to. The test house has a purifier, its station and the AQHI; literal houses give the rest; the recorded house is
// read when the owner has one (#170).
import {describe, expect, test} from 'vitest';
import {airIds} from '../../../../src/features/air/ids.ts';
import {readAir} from '../../../../src/features/air/inputs.ts';
import {resolveConfig} from '../../../../src/core/config.ts';
import {createStore} from '../../../../src/core/store.ts';
import {fakeHass} from '../../fake-hass.ts';
import {fullHouse, houseOf, readingOf, recorded, storeOf, type Player} from '../media/support.ts';

const HOUSE: Player[] = [
  ['fan.den', 'on', {}, {platform: 'mila', device_id: 'd1'}, {id: 'd1', name: 'Den'}],
  ['sensor.den_pm2_5', '5', {}, {platform: 'mila', device_id: 'd1'}],
  ['sensor.den_co2', '500', {}, {platform: 'mila', device_id: 'd1'}],
  ['sensor.account_aqi', '30', {}, {platform: 'mila', device_id: 'd0'}],
  ['sensor.account_pollen_status_trees', 'low', {}, {platform: 'mila', device_id: 'd0'}],
  ['sensor.ec_aqhi', '3', {}, {platform: 'environment_canada'}],
];

describe('the test house', () => {
  test('one purifier, its station and the AQHI from the config’s entity', () => {
    const {states, registries, names, store} = readingOf(fullHouse);
    const inputs = readAir(states, registries, names, store.config);
    expect(inputs.rooms.map(r => r.fanId)).toEqual(['fan.office_purifier']);
    expect(inputs.outside?.aqi).toBe('sensor.outdoor_aqi');
    expect(inputs.aqhi).toBe(2);
  });

  test('its ids: the fan, the thirteen sensors, the station’s seven and the AQHI sensor, once each', () => {
    const ids = airIds(storeOf(fullHouse));
    expect(ids).toHaveLength(1 + 13 + 3 + 4 + 1);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      expect.arrayContaining([
        'fan.office_purifier',
        'sensor.office_purifier_time_to_clean',
        'sensor.outdoor_aqi',
        'sensor.outdoor_pollen_status_mold',
        'sensor.springfield_aqhi',
      ]),
    );
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the composition is tested on literal houses', () => {});
    return;
  }

  test('the ids hold every fan, sensor and station entity the reading finds, once each, and nothing outside sensors and fans', () => {
    const hass = fakeHass.fromFixture('main');
    const store = storeOf(hass);
    const {states, registries, names} = readingOf(hass);
    const {rooms, outside} = readAir(states, registries, names, store.config);
    const ids = airIds(store);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining(rooms.map(r => r.fanId)));
    if (outside?.aqi) expect(ids).toContain(outside.aqi);
    expect(ids.filter(id => !/^(fan|sensor)\./.test(id))).toEqual([]);
  });
});

describe('what is read', () => {
  test('the rooms, the station and the AQHI the config names', () => {
    const hass = houseOf(HOUSE);
    const store = storeOf(hass, {entities: {aqhi: 'sensor.ec_aqhi'}});
    const {states, registries, names} = readingOf(hass);
    const inputs = readAir(states, registries, names, store.config);
    expect(inputs.rooms.map(r => [r.fanId, r.name])).toEqual([['fan.den', 'Den']]);
    expect(inputs.outside?.readings.pollen.trees).toBe('low');
    expect(inputs.aqhi).toBe(3);
  });

  test('the AQHI sensor’s id is kept while its state exists, even when it reads nothing; a state that is missing is null', () => {
    const unread = HOUSE.map((p): Player => (p[0] === 'sensor.ec_aqhi' ? [p[0], 'unavailable', {}, p[3]] : p));
    const read = (players: Player[], aqhi: string) => {
      const hass = houseOf(players);
      const {states, registries, names} = readingOf(hass);
      return readAir(states, registries, names, storeOf(hass, {entities: {aqhi}}).config);
    };
    expect(read(unread, 'sensor.ec_aqhi')).toMatchObject({aqhi: null, aqhiId: 'sensor.ec_aqhi'});
    expect(read(HOUSE, 'sensor.ec_aqhi')).toMatchObject({aqhi: 3, aqhiId: 'sensor.ec_aqhi'});
    expect(read(HOUSE, 'sensor.nowhere')).toMatchObject({aqhi: null, aqhiId: null});
  });

  test('no station and no AQHI entity: null, null', () => {
    const hass = houseOf(HOUSE.slice(0, 3));
    const {states, registries, names, store} = readingOf(hass);
    expect(readAir(states, registries, names, store.config)).toMatchObject({outside: null, aqhi: null});
  });
});

describe('what is listed', () => {
  test('the fan and each sensor of a room, the station’s found sensors and pollen, and the AQHI, once each', () => {
    const store = storeOf(houseOf(HOUSE), {entities: {aqhi: 'sensor.ec_aqhi'}});
    expect(airIds(store)).toEqual([
      'fan.den',
      'sensor.den_pm2_5',
      'sensor.den_co2',
      'sensor.account_aqi',
      'sensor.account_pollen_status_trees',
      'sensor.ec_aqhi',
    ]);
  });

  test('a house with no Mila device lists only the AQHI entity, when the config has one', () => {
    expect(airIds(storeOf(houseOf([])))).toEqual([]);
    expect(airIds(storeOf(houseOf([]), {entities: {aqhi: 'sensor.ec_aqhi'}}))).toEqual(['sensor.ec_aqhi']);
  });

  test('a store with no hass lists nothing', () => {
    const store = createStore({defaultTimeZone: 'America/Toronto', resolve: resolveConfig});
    expect(airIds(store)).toEqual([]);
  });
});
