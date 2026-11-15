// protectCameras and the camera sources: which camera entities are one camera each, what each is called and which of its
// siblings says it sees motion. The test house has no camera, so literal cameras give every rule; the recorded house is
// read when the owner has one (#170).
import {describe, expect, test} from 'vitest';
import {fakeHass} from '../fake-hass.ts';
import {houseOf, readingOf, recorded, type Player} from '../features/media/support.ts';
import {CAMERA_SOURCES} from '../../../src/providers/cameras.ts';
import {protectCameras} from '../../../src/providers/unifi-protect.ts';

type House = ReturnType<typeof houseOf>;
const camerasOf = (house: House) => {
  const {states, registries, names} = readingOf(house);
  return protectCameras(states, registries, names);
};
const idsOf = (house: House) => camerasOf(house).map(c => c.id);

const PROTECT = {platform: 'unifiprotect'};
/** A camera entity; `row` is its registry row, `device` the device it belongs to. */
const camera = (id: string, row: Player[3] = {device_id: 'd1'}, device?: Player[4], attributes = {}): Player => [
  id,
  'idle',
  {friendly_name: id.split('.')[1], ...attributes},
  {...PROTECT, ...row},
  device,
];
const motion = (id: string, state = 'off', device_id = 'd1'): Player => [id, state, {}, {...PROTECT, device_id}];

describe('the sources', () => {
  test('Protect is the one source, and it is the function this module exports', () => {
    expect(CAMERA_SOURCES).toEqual([protectCameras]);
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the rules are tested on literal cameras', () => {});
    return;
  }

  test('one camera per device, none a radar or an insecure stream, each with a name and no channel suffix', () => {
    const {states, registries, names} = readingOf(fakeHass.fromFixture('main'));
    const cameras = protectCameras(states, registries, names);
    const devices = cameras.map(c => c.deviceId ?? c.id);
    expect(new Set(devices).size).toBe(devices.length);
    for (const c of cameras) {
      expect(c.id).not.toMatch(/_radar$|insecure/);
      expect(c.name).not.toMatch(/\s(High|Medium|Low)( Resolution Channel)?$/i);
    }
  });
});

describe('which entities are cameras', () => {
  test('a camera of the Protect platform; another platform’s is left out', () => {
    const house = houseOf([
      camera('camera.porch'),
      camera('camera.other', {platform: 'generic', device_id: 'd2'}),
      ['light.porch', 'on', {}, {...PROTECT, device_id: 'd1'}],
    ]);
    expect(idsOf(house)).toEqual(['camera.porch']);
  });

  test('with no platform in the registry, the attribution decides: Unifi or Protect, in any case', () => {
    const noPlatform = {platform: undefined, device_id: 'd1'};
    expect(
      idsOf(houseOf([camera('camera.a', noPlatform, undefined, {attribution: 'Powered by UniFi Protect'})])),
    ).toEqual(['camera.a']);
    expect(idsOf(houseOf([camera('camera.a', noPlatform, undefined, {attribution: 'protect'})]))).toEqual(['camera.a']);
    expect(idsOf(houseOf([camera('camera.a', noPlatform, undefined, {attribution: 'Acme cameras'})]))).toEqual([]);
    expect(idsOf(houseOf([camera('camera.a', noPlatform)]))).toEqual([]);
  });

  test('a hidden camera, a radar and an insecure stream are left out', () => {
    const house = houseOf([
      camera('camera.hidden', {hidden: true, device_id: 'd1'}),
      camera('camera.porch_radar', {device_id: 'd2'}),
      camera('camera.porch_insecure', {device_id: 'd3'}),
      camera('camera.kept', {device_id: 'd4'}),
    ]);
    expect(idsOf(house)).toEqual(['camera.kept']);
  });
});

describe('one tile per camera', () => {
  test('the high channel over the low one, whatever order the house lists them in', () => {
    const lowFirst = houseOf([camera('camera.porch_low'), camera('camera.porch_high')]);
    expect(idsOf(lowFirst)).toEqual(['camera.porch_high']);
    const highFirst = houseOf([camera('camera.porch_high'), camera('camera.porch_low')]);
    expect(idsOf(highFirst)).toEqual(['camera.porch_high']);
  });

  test('"High resolution" counts as high; a device with only a medium channel keeps it', () => {
    expect(idsOf(houseOf([camera('camera.porch_medium'), camera('camera.porch_high_resolution_channel')]))).toEqual([
      'camera.porch_high_resolution_channel',
    ]);
    expect(idsOf(houseOf([camera('camera.porch_medium')]))).toEqual(['camera.porch_medium']);
  });

  test('the rank is high, medium, then an unranked channel, then low', () => {
    expect(idsOf(houseOf([camera('camera.p_low'), camera('camera.p_package'), camera('camera.p_medium')]))).toEqual([
      'camera.p_medium',
    ]);
    expect(idsOf(houseOf([camera('camera.p_low'), camera('camera.p_package')]))).toEqual(['camera.p_package']);
  });

  test('the first of two channels of one rank is kept', () => {
    expect(idsOf(houseOf([camera('camera.p_package'), camera('camera.p_other')]))).toEqual(['camera.p_package']);
  });

  test('two devices are two cameras, and a camera with no device is a camera of its own', () => {
    const house = houseOf([
      camera('camera.a_high', {device_id: 'd1'}),
      camera('camera.a_low', {device_id: 'd1'}),
      camera('camera.b_low', {device_id: 'd2'}),
      camera('camera.c', {device_id: undefined}),
      camera('camera.c_low', {device_id: undefined}),
    ]);
    expect(idsOf(house)).toEqual(['camera.a_high', 'camera.b_low', 'camera.c', 'camera.c_low']);
  });
});

describe('what a camera is called', () => {
  test('the device’s name through the resolver without its channel suffix, else the entity’s; sorted by name', () => {
    const house = houseOf([
      camera('camera.z', {device_id: 'd1'}, {id: 'd1', name: 'Porch High Resolution Channel'}),
      camera('camera.y', {device_id: 'd2'}, {id: 'd2', name: 'Garage medium'}),
      camera('camera.x', {device_id: 'd3'}, {id: 'd3', name_by_user: 'Attic Low Resolution Channel'}),
      camera('camera.w', {device_id: undefined}, undefined, {friendly_name: 'Basement Low'}),
      camera('camera.v', {device_id: 'd4'}, {id: 'd4'}, {friendly_name: 'Yard'}),
    ]);
    expect(camerasOf(house).map(c => c.name)).toEqual(['Attic', 'Basement', 'Garage', 'Porch', 'Yard']);
  });

  test('a suffix inside the name stays; only the last words are dropped', () => {
    const house = houseOf([camera('camera.a', {device_id: 'd1'}, {id: 'd1', name: 'High Street Medium'})]);
    expect(camerasOf(house)[0].name).toBe('High Street');
  });
});

describe('what a camera says now', () => {
  test('its entity, device, state, availability and the picture as Home Assistant gives it', () => {
    const house = houseOf([
      camera(
        'camera.porch',
        {device_id: 'd1'},
        {id: 'd1', name: 'Porch'},
        {entity_picture: '/api/camera_proxy/camera.porch?token=t'},
      ),
      camera('camera.gone', {device_id: 'd2'}, {id: 'd2', name: 'Gone'}),
    ]);
    house.states['camera.gone'] = {...house.states['camera.gone'], state: 'unavailable'};
    expect(camerasOf(house)).toEqual([
      {
        id: 'camera.gone',
        deviceId: 'd2',
        name: 'Gone',
        available: false,
        picture: null,
        motion: null,
        motionId: null,
        state: 'unavailable',
      },
      {
        id: 'camera.porch',
        deviceId: 'd1',
        name: 'Porch',
        available: true,
        picture: '/api/camera_proxy/camera.porch?token=t',
        motion: null,
        motionId: null,
        state: 'idle',
      },
    ]);
  });
});

describe('the motion sensor of a camera', () => {
  test('a motion binary sensor of the same device: on or off, and since when', () => {
    const house = houseOf([
      camera('camera.porch'),
      motion('binary_sensor.porch_motion', 'on'),
      motion('binary_sensor.other', 'on', 'd2'),
    ]);
    expect(camerasOf(house)[0]).toMatchObject({
      motionId: 'binary_sensor.porch_motion',
      motion: {on: true, since: Date.parse('2026-01-01T00:00:00+00:00')},
    });
  });

  test('the one that ends in _motion wins over another; a detection sensor is never one', () => {
    const house = houseOf([
      camera('camera.porch'),
      motion('binary_sensor.porch_motion_zone'),
      motion('binary_sensor.porch_person_detection'),
      motion('binary_sensor.porch_motion', 'on'),
    ]);
    expect(camerasOf(house)[0].motionId).toBe('binary_sensor.porch_motion');
    const noExact = houseOf([
      camera('camera.porch'),
      motion('binary_sensor.porch_motion_detection'),
      motion('binary_sensor.porch_motion_zone'),
    ]);
    expect(camerasOf(noExact)[0].motionId).toBe('binary_sensor.porch_motion_zone');
    expect(
      camerasOf(houseOf([camera('camera.porch'), motion('binary_sensor.porch_detection')]))[0].motionId,
    ).toBeNull();
  });

  test('a camera’s motion sensor must be a binary sensor', () => {
    const house = houseOf([camera('camera.porch'), ['sensor.porch_motion', 'on', {}, {...PROTECT, device_id: 'd1'}]]);
    expect(camerasOf(house)[0].motionId).toBeNull();
  });

  test('a sensor that is unavailable says nothing: no motion, and the id stays so a change reaches the reader', () => {
    const house = houseOf([camera('camera.porch'), motion('binary_sensor.porch_motion', 'unavailable')]);
    expect(camerasOf(house)[0]).toMatchObject({motion: null, motionId: 'binary_sensor.porch_motion'});
  });

  test('a registered sensor with no state says nothing either', () => {
    const house = houseOf([camera('camera.porch'), motion('binary_sensor.porch_motion')]);
    delete house.states['binary_sensor.porch_motion'];
    expect(camerasOf(house)[0]).toMatchObject({motion: null, motionId: 'binary_sensor.porch_motion'});
  });
});
