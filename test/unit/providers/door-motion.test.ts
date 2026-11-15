// doorMotionSensors: which binary sensors are the house's doors and motion sensors, where each sits, what it is called and
// which battery and light sensors belong to its device. The test house gives today's answer as literals; literal sensors give
// the rules it does not exercise; the recorded house is read when the owner has one (#170).
import {describe, expect, test} from 'vitest';
import {entity, fakeHass} from '../fake-hass.ts';
import {fullHouse, houseOf, readingOf, recorded, type Player} from '../features/media/support.ts';
import {DOOR_CLASSES, MOTION_CLASSES, doorMotionSensors, sensorKind} from '../../../src/providers/door-motion.ts';

type House = ReturnType<typeof houseOf>;
const sensorsOf = (house: House) => {
  const {states, registries, names} = readingOf(house);
  return doorMotionSensors(states, registries, names);
};
const idsOf = (house: House) => sensorsOf(house).map(s => s.id);

/** A binary sensor with a device class, its registry row and its device. */
const sensor = (
  id: string,
  deviceClass: string | undefined,
  row: Player[3] = {},
  device?: Player[4],
  state = 'off',
): Player => [
  id,
  state,
  {device_class: deviceClass, friendly_name: id.split('.')[1]},
  {platform: 'zha', ...row},
  device,
];

describe('the test house', () => {
  test('its front door and its hall motion sensor, the door first, each in the area of its device', () => {
    expect(sensorsOf(fullHouse)).toEqual([
      {
        id: 'binary_sensor.front_door',
        kind: 'door',
        deviceClass: 'door',
        areaId: 'living_room',
        area: 'Living room',
        name: 'Front door',
        on: false,
        available: true,
        since: expect.any(Number) as number,
        battery: null,
        batteryId: null,
        illuminance: null,
        illuminanceId: null,
      },
      expect.objectContaining({id: 'binary_sensor.hall_motion', kind: 'motion', areaId: 'office', on: true}),
    ]);
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the rules are tested on the test house', () => {});
    return;
  }

  test('every sensor has a door or motion class, is not Protect’s and is listed once, the doors first', () => {
    const {states, registries, names} = readingOf(fakeHass.fromFixture('main'));
    const list = doorMotionSensors(states, registries, names);
    expect(new Set(list.map(s => s.id)).size).toBe(list.length);
    for (const s of list) {
      expect(registries.entities?.[s.id]?.platform).not.toBe('unifiprotect');
      expect(sensorKind(s.deviceClass)).toBe(s.kind);
    }
    const kinds = list.map(s => s.kind);
    expect(kinds).toEqual([...kinds].sort((a, b) => (a === b ? 0 : a === 'door' ? -1 : 1)));
  });
});

describe('which sensors count', () => {
  test('each door class is a door and each motion class is motion; any other class is neither', () => {
    expect(DOOR_CLASSES.map(sensorKind)).toEqual(['door', 'door', 'door', 'door']);
    expect(MOTION_CLASSES.map(sensorKind)).toEqual(['motion', 'motion', 'motion']);
    expect(sensorKind('smoke')).toBeNull();
    expect(sensorKind(undefined)).toBeNull();
  });

  test('only a binary sensor of a door or motion class: a smoke sensor, a plain switch and a sensor with no class are left out', () => {
    const house = houseOf([
      sensor('binary_sensor.a_window', 'window'),
      sensor('binary_sensor.a_smoke', 'smoke'),
      sensor('binary_sensor.no_class', undefined),
      ['switch.a_door', 'off', {device_class: 'door'}, {platform: 'zha'}],
    ]);
    expect(idsOf(house)).toEqual(['binary_sensor.a_window']);
  });

  test('Protect’s sensors are left out, hidden ones and diagnostic ones too; one the registry does not know stays in', () => {
    const house = houseOf([
      sensor('binary_sensor.protect', 'motion', {platform: 'unifiprotect'}),
      sensor('binary_sensor.hidden', 'door', {hidden: true}),
      sensor('binary_sensor.diagnostic', 'door', {entity_category: 'diagnostic'}),
      sensor('binary_sensor.kept', 'door'),
    ]);
    house.states['binary_sensor.unregistered'] = entity('binary_sensor.unregistered', 'off', {device_class: 'motion'});
    expect(idsOf(house)).toEqual(['binary_sensor.kept', 'binary_sensor.unregistered']);
  });

  test('doors come first, then each kind by name, whatever order the house lists them in', () => {
    const house = houseOf([
      sensor('binary_sensor.m_b', 'presence'),
      sensor('binary_sensor.d_z', 'garage_door'),
      sensor('binary_sensor.m_a', 'occupancy'),
      sensor('binary_sensor.d_y', 'opening'),
    ]);
    expect(idsOf(house)).toEqual(['binary_sensor.d_y', 'binary_sensor.d_z', 'binary_sensor.m_a', 'binary_sensor.m_b']);
  });
});

describe('where a sensor sits and what it is called', () => {
  const AREAS = {hall: 'Hall', den: 'Den'};

  test('its own area wins over its device’s; with neither the area is empty', () => {
    const house = houseOf(
      [
        sensor(
          'binary_sensor.own',
          'door',
          {area_id: 'den', device_id: 'd1'},
          {id: 'd1', area_id: 'hall', name: 'Own'},
        ),
        sensor('binary_sensor.via_device', 'door', {device_id: 'd2'}, {id: 'd2', area_id: 'hall', name: 'Via'}),
        sensor('binary_sensor.nowhere', 'door'),
      ],
      [],
      AREAS,
    );
    expect(sensorsOf(house).map(({id, areaId, area}) => ({id, areaId, area}))).toEqual([
      {id: 'binary_sensor.nowhere', areaId: null, area: ''},
      {id: 'binary_sensor.own', areaId: 'den', area: 'Den'},
      {id: 'binary_sensor.via_device', areaId: 'hall', area: 'Hall'},
    ]);
  });

  test('the device’s name through the resolver, else the entity’s; “Détecteur de mouvement ” is stripped, with or without “de”', () => {
    const house = houseOf([
      sensor('binary_sensor.a', 'door', {device_id: 'd1'}, {id: 'd1', name: 'Back door'}),
      sensor('binary_sensor.b', 'door'),
      sensor('binary_sensor.c', 'motion', {device_id: 'd3'}, {id: 'd3', name: 'Détecteur de mouvement Hall'}),
      sensor('binary_sensor.d', 'motion', {device_id: 'd4'}, {id: 'd4', name: 'détecteur mouvement Cave'}),
    ]);
    expect(sensorsOf(house).map(s => s.name)).toEqual(['b', 'Back door', 'Cave', 'Hall']);
  });
});

describe('what a sensor says now', () => {
  test('on, available and since when; an unavailable sensor is off and not available', () => {
    const house = houseOf([
      sensor('binary_sensor.open', 'door', {}, undefined, 'on'),
      sensor('binary_sensor.gone', 'door', {}, undefined, 'unavailable'),
    ]);
    const [gone, open] = sensorsOf(house);
    expect(open).toMatchObject({
      id: 'binary_sensor.open',
      on: true,
      available: true,
      since: Date.parse('2026-01-01T00:00:00+00:00'),
    });
    expect(gone).toMatchObject({id: 'binary_sensor.gone', on: false, available: false});
  });
});

describe('the siblings', () => {
  test('the battery and the illuminance of the same device, by id, with their values; another device’s are not borrowed', () => {
    const house = houseOf([
      sensor('binary_sensor.door', 'door', {device_id: 'd1'}, {id: 'd1', name: 'Door'}),
      ['sensor.door_battery', '14.6', {}, {platform: 'zha', device_id: 'd1'}],
      ['sensor.door_illuminance', '31.4', {}, {platform: 'zha', device_id: 'd1'}],
      ['sensor.door_temperature', '20', {}, {platform: 'zha', device_id: 'd1'}],
      sensor('binary_sensor.other', 'door', {device_id: 'd2'}, {id: 'd2', name: 'Other'}),
      ['sensor.stray_battery', '90', {}, {platform: 'zha', device_id: 'd3'}],
      sensor('binary_sensor.alone', 'motion'),
    ]);
    const bySensor = Object.fromEntries(sensorsOf(house).map(s => [s.id, s]));
    expect(bySensor['binary_sensor.door']).toMatchObject({
      batteryId: 'sensor.door_battery',
      battery: 14.6,
      illuminanceId: 'sensor.door_illuminance',
      illuminance: 31.4,
    });
    expect(bySensor['binary_sensor.other']).toMatchObject({
      batteryId: null,
      battery: null,
      illuminanceId: null,
      illuminance: null,
    });
    expect(bySensor['binary_sensor.alone']).toMatchObject({batteryId: null, illuminanceId: null});
  });

  test('a sibling that reports no number gives its id and a null value', () => {
    const house = houseOf([
      sensor('binary_sensor.door', 'door', {device_id: 'd1'}, {id: 'd1', name: 'Door'}),
      ['sensor.door_battery', 'unavailable', {}, {platform: 'zha', device_id: 'd1'}],
    ]);
    expect(sensorsOf(house)[0]).toMatchObject({batteryId: 'sensor.door_battery', battery: null});
  });
});
