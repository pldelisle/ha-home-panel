// readSecurity and securityIds: the cameras and the sensors of a house composed into one reading, and the ids the pane would
// subscribe to. The test house has sensors and no camera; literal cameras give the rest; the recorded house is read when the
// owner has one (#170).
import {describe, expect, test} from 'vitest';
import {readSecurity, securityAreas, securityInArea} from '../../../../src/features/security/inputs.ts';
import {securityIds} from '../../../../src/features/security/ids.ts';
import {createStore} from '../../../../src/core/store.ts';
import {resolveConfig} from '../../../../src/core/config.ts';
import type {CameraInputs} from '../../../../src/providers/camera-source.ts';
import {fakeHass} from '../../fake-hass.ts';
import {fullHouse, houseOf, readingOf, recorded, storeOf, type Player} from '../media/support.ts';

const PROTECT = {platform: 'unifiprotect'};
const HOUSE: Player[] = [
  [
    'camera.porch_high',
    'idle',
    {friendly_name: 'Porch High'},
    {...PROTECT, device_id: 'c1'},
    {id: 'c1', name: 'Porch'},
  ],
  ['camera.porch_low', 'idle', {friendly_name: 'Porch Low'}, {...PROTECT, device_id: 'c1'}],
  ['binary_sensor.porch_motion', 'off', {}, {...PROTECT, device_id: 'c1'}],
  ['binary_sensor.porch_person_detection', 'off', {}, {...PROTECT, device_id: 'c1'}],
  ['binary_sensor.door', 'off', {device_class: 'door'}, {platform: 'zha', device_id: 'd1'}, {id: 'd1', name: 'Door'}],
  ['sensor.door_battery', '80', {}, {platform: 'zha', device_id: 'd1'}],
  ['sensor.door_illuminance', '12', {}, {platform: 'zha', device_id: 'd1'}],
  ['binary_sensor.hall', 'on', {device_class: 'motion'}, {platform: 'zha', device_id: 'd2'}, {id: 'd2', name: 'Hall'}],
  ['sensor.hall_temperature', '20', {}, {platform: 'zha', device_id: 'd2'}],
];

describe('the test house', () => {
  test('two sensors and no camera: the list is the provider’s, the cameras are empty', () => {
    const {states, registries, names} = readingOf(fullHouse);
    const inputs = readSecurity(states, registries, names);
    expect(inputs.cameras).toEqual([]);
    expect(inputs.sensors.map(s => s.id)).toEqual(['binary_sensor.front_door', 'binary_sensor.hall_motion']);
  });

  test('its ids are the two sensors and nothing else', () => {
    expect(securityIds(storeOf(fullHouse))).toEqual(['binary_sensor.front_door', 'binary_sensor.hall_motion']);
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the composition is tested on literal houses', () => {});
    return;
  }

  test('the ids hold every camera and sensor the reading finds, once each, and no other domain but their siblings’', () => {
    const hass = fakeHass.fromFixture('main');
    const {states, registries, names} = readingOf(hass);
    const {cameras, sensors} = readSecurity(states, registries, names);
    const ids = securityIds(storeOf(hass));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(expect.arrayContaining([...cameras.map(c => c.id), ...sensors.map(s => s.id)]));
    expect(ids.filter(id => !/^(camera|binary_sensor|sensor)\./.test(id))).toEqual([]);
  });
});

describe('what is read', () => {
  test('the cameras by the sources in list order, and the sensors beside them', () => {
    const {states, registries, names} = readingOf(houseOf(HOUSE));
    const inputs = readSecurity(states, registries, names);
    expect(inputs.cameras.map(c => [c.id, c.name, c.motionId])).toEqual([
      ['camera.porch_high', 'Porch', 'binary_sensor.porch_motion'],
    ]);
    expect(inputs.sensors.map(s => s.id)).toEqual(['binary_sensor.door', 'binary_sensor.hall']);
  });

  test('every source is asked, in order, and their cameras are joined', () => {
    const {states, registries, names} = readingOf(houseOf(HOUSE));
    const made = (id: string): CameraInputs => ({
      id,
      deviceId: null,
      name: id,
      available: true,
      picture: null,
      motion: null,
      motionId: null,
      state: 'idle',
    });
    const inputs = readSecurity(states, registries, names, [
      () => [made('camera.b')],
      () => [made('camera.a')],
      () => [],
    ]);
    expect(inputs.cameras.map(c => c.id)).toEqual(['camera.b', 'camera.a']);
  });
});

describe('what is listed', () => {
  test('the camera, its motion sensor, each sensor, its battery and its light, once each; a detection sensor is outside', () => {
    expect(securityIds(storeOf(houseOf(HOUSE)))).toEqual([
      'camera.porch_high',
      'binary_sensor.porch_motion',
      'binary_sensor.door',
      'sensor.door_battery',
      'sensor.door_illuminance',
      'binary_sensor.hall',
    ]);
  });

  test('a store with no hass lists nothing', () => {
    const store = createStore({defaultTimeZone: 'America/Toronto', resolve: resolveConfig});
    expect(securityIds(store)).toEqual([]);
  });
});

describe('a room view’s cut', () => {
  // the porch camera is in the hall by its device, the door in the hall by itself, the motion sensor in the garden by its device
  const ROOMS: Player[] = [
    [
      'camera.porch_high',
      'idle',
      {friendly_name: 'Porch High'},
      {...PROTECT, device_id: 'c1'},
      {id: 'c1', name: 'Porch', area_id: 'hall'},
    ],
    ['camera.yard', 'idle', {attribution: 'UniFi Protect'}, {platform: 'unifiprotect', area_id: 'garden'}],
    ['camera.attic', 'idle', {friendly_name: 'Attic'}, PROTECT],
    ['binary_sensor.door', 'off', {device_class: 'door'}, {platform: 'zha', area_id: 'hall'}],
    [
      'binary_sensor.hall',
      'on',
      {device_class: 'motion'},
      {platform: 'zha', device_id: 'd2'},
      {id: 'd2', name: 'Hall', area_id: 'garden'},
    ],
    ['binary_sensor.loose', 'off', {device_class: 'door'}, {platform: 'zha'}],
  ];
  const reading = () => {
    const {states, registries, names} = readingOf(houseOf(ROOMS, [], {hall: 'Hall', garden: 'Garden'}));
    return {inputs: readSecurity(states, registries, names), registries};
  };

  test('the areas are those of the cameras and of the sensors, once each; a camera or sensor with no area is in none', () => {
    const {inputs, registries} = reading();
    expect(securityAreas(inputs, registries).sort()).toEqual(['garden', 'hall']);
  });

  test('a room has the cameras and the sensors in its area, in the house’s order', () => {
    const {inputs, registries} = reading();
    const hall = securityInArea(inputs, registries, 'hall');
    expect(hall.cameras.map(c => c.id)).toEqual(['camera.porch_high']);
    expect(hall.sensors.map(s => s.id)).toEqual(['binary_sensor.door']);
    const garden = securityInArea(inputs, registries, 'garden');
    expect(garden.cameras.map(c => c.id)).toEqual(['camera.yard']);
    expect(garden.sensors.map(s => s.id)).toEqual(['binary_sensor.hall']);
    expect(securityInArea(inputs, registries, 'cellar')).toEqual({cameras: [], sensors: []});
  });
});
