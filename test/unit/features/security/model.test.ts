// securityModel: the Security texts from the test house in English and in French (the lines of the legacy panel, pinned as
// literals), from literal cameras and sensors for the rules the test house does not exercise, and from the recorded house
// when the owner has one (#170).
import {describe, expect, test} from 'vitest';
import {readSecurity, type SecurityInputs} from '../../../../src/features/security/inputs.ts';
import {SNAPSHOT_MS, securityModel} from '../../../../src/features/security/model.ts';
import type {CameraInputs} from '../../../../src/providers/camera-source.ts';
import type {SensorInputs} from '../../../../src/providers/door-motion.ts';
import {fakeHass} from '../../fake-hass.ts';
import {NOW, depsOf, fullHouse, readingOf, recorded, type Language} from '../media/support.ts';

const MIN = 6e4;
const HOUR = 36e5;

const modelOf = (inputs: SecurityInputs, language: Language = 'en', now = NOW) => {
  const {t, fmt} = depsOf(fullHouse, language);
  return securityModel(inputs, {now, t, fmt});
};

const inputsOf = (house: typeof fullHouse) => {
  const {states, registries, names} = readingOf(house);
  return readSecurity(states, registries, names);
};

const camera = (over: Partial<CameraInputs> = {}): CameraInputs => ({
  id: 'camera.porch_high',
  deviceId: 'c1',
  name: 'Porch',
  available: true,
  picture: '/api/camera_proxy/camera.porch_high?token=abc',
  motion: {on: false, since: NOW - 5 * MIN},
  motionId: 'binary_sensor.porch_motion',
  state: 'idle',
  ...over,
});

const sensor = (over: Partial<SensorInputs> = {}): SensorInputs => ({
  id: 'binary_sensor.front_door',
  kind: 'door',
  deviceClass: 'door',
  areaId: null,
  area: '',
  name: 'Front door',
  on: false,
  available: true,
  since: NOW - 12 * MIN,
  battery: null,
  batteryId: null,
  illuminance: null,
  illuminanceId: null,
  ...over,
});

describe('the test house (no camera, a closed door and a hall that moves), as the legacy panel said it', () => {
  const inputs = inputsOf(fullHouse);

  test('in English', () => {
    const vm = modelOf(inputs);
    expect(vm.summary).toBe('No cameras · all doors closed · motion now');
    expect(vm.cameras).toMatchObject({count: 'Not connected', empty: true, title: 'Cameras', tiles: []});
    expect(vm.cameras.emptyText).toEqual({
      title: 'No cameras yet',
      hint: 'Add UniFi Protect in Settings → Devices & services, with a local Protect user. Your cameras show up here on their own.',
      link: 'Add UniFi Protect',
    });
    expect(vm.sensors).toMatchObject({
      hidden: false,
      title: 'Doors & motion',
      line: {text: 'Door closed', warn: false},
    });
    expect(vm.sensors.rows.map(({id, tone, main, sub}) => [id, tone, main, sub])).toEqual([
      ['binary_sensor.front_door', '', 'Closed', '1 h ago'],
      ['binary_sensor.hall_motion', 'act', 'Motion now', ''],
    ]);
    expect(vm.sensors.rows[0].label).toBe('Front door history');
    expect(vm.home).toMatchObject({line: 'all doors closed · motion now', cameras: [], hint: null});
    expect(vm.home.rows).toEqual(vm.sensors.rows);
  });

  test('in French, the words of the rewrite layer', () => {
    const vm = modelOf(inputs, 'fr');
    expect(vm.summary).toBe('Aucune caméra · toutes les portes fermées · mouvement en cours');
    expect(vm.cameras).toMatchObject({count: 'Non connecté', title: 'Caméras'});
    expect(vm.sensors.line).toEqual({text: 'Porte fermée', warn: false});
    expect(vm.sensors.rows.map(({main, sub}) => [main, sub])).toEqual([
      ['Fermée', 'il y a 1 h'],
      ['Mouvement en cours', ''],
    ]);
    expect(vm.home.line).toBe('toutes les portes fermées · mouvement en cours');
  });

  test('no sensor: the card is hidden, the Home card says so, and the pane line has no doors', () => {
    const vm = modelOf({cameras: [], sensors: []});
    expect(vm.sensors).toMatchObject({hidden: true, line: null, rows: []});
    expect(vm.home).toMatchObject({line: 'no motion', hint: 'No door or motion sensors yet.'});
    expect(vm.summary).toBe('No cameras');
  });
});

describe('the camera tiles', () => {
  test('a still camera: its state, the snapshot stamped to the ten seconds, and a name for a screen reader', () => {
    const vm = modelOf({cameras: [camera()], sensors: []});
    expect(vm.cameras).toMatchObject({count: '1 camera', empty: false});
    expect(vm.cameras.tiles[0]).toEqual({
      id: 'camera.porch_high',
      name: 'Porch',
      picture: `/api/camera_proxy/camera.porch_high?token=abc&t=${Math.floor(NOW / SNAPSHOT_MS)}`,
      when: 'Motion 5 min ago',
      moving: false,
      offline: false,
      label: 'Open Porch live',
      tag: '',
      detail: 'Idle · last motion 5 min ago',
    });
  });

  test('the stamp changes every ten seconds and not before; a picture with no query gets a ?', () => {
    const at = (now: number) =>
      modelOf({cameras: [camera({picture: '/snap'})], sensors: []}, 'en', now).cameras.tiles[0].picture;
    const base = Math.floor(NOW / SNAPSHOT_MS) * SNAPSHOT_MS;
    expect(at(base + SNAPSHOT_MS - 1)).toBe(at(base));
    expect(at(base + SNAPSHOT_MS)).not.toBe(at(base));
    expect(at(base)).toBe(`/snap?t=${base / SNAPSHOT_MS}`);
  });

  test('a camera that moves says so, and tags the Home card', () => {
    const [tile] = modelOf({cameras: [camera({motion: {on: true, since: NOW}})], sensors: []}).cameras.tiles;
    expect(tile).toMatchObject({when: 'Motion now', moving: true, tag: '· motion', detail: 'Idle · motion now'});
  });

  test('a camera with no motion sensor says its state, capitalised, even one the catalog does not know', () => {
    const state = (value: string) =>
      modelOf({cameras: [camera({motion: null, state: value})], sensors: []}).cameras.tiles[0];
    expect(state('recording')).toMatchObject({when: 'Recording', detail: 'Recording'});
    expect(state('paused').when).toBe('Paused');
  });

  test('an offline camera has no picture, says Offline and keeps its last motion', () => {
    const [tile] = modelOf({cameras: [camera({available: false, state: 'unavailable'})], sensors: []}).cameras.tiles;
    expect(tile).toMatchObject({
      picture: null,
      offline: true,
      when: 'Motion 5 min ago',
      detail: 'Offline · last motion 5 min ago',
    });
    const [bare] = modelOf({cameras: [camera({available: false, motion: null})], sensors: []}).cameras.tiles;
    expect(bare).toMatchObject({when: 'Offline', detail: 'Offline'});
    expect(modelOf({cameras: [], sensors: []}).cameras.offlineNote).toBe('The camera is offline.');
  });

  test('a camera with no picture draws none', () => {
    expect(modelOf({cameras: [camera({picture: null})], sensors: []}).cameras.tiles[0].picture).toBeNull();
  });

  test('in French', () => {
    const [tile] = modelOf({cameras: [camera()], sensors: []}, 'fr').cameras.tiles;
    expect(tile).toMatchObject({
      when: 'Mouvement il y a 5 min',
      detail: 'Au repos · dernier mouvement il y a 5 min',
      label: 'Ouvrir Porch en direct',
    });
  });

  test('the Home card shows the first four, the pane every one', () => {
    const many = ['a', 'b', 'c', 'd', 'e'].map(id => camera({id: `camera.${id}`}));
    const vm = modelOf({cameras: many, sensors: []});
    expect(vm.cameras.tiles).toHaveLength(5);
    expect(vm.home.cameras.map(c => c.id)).toEqual(['camera.a', 'camera.b', 'camera.c', 'camera.d']);
    expect(vm.home.line).toBe('5 cameras · no motion');
  });
});

describe('the sensor rows', () => {
  const row = (over: Partial<SensorInputs>, language: Language = 'en') =>
    modelOf({cameras: [], sensors: [sensor(over)]}, language).sensors.rows[0];

  test('an open door: amber, for how long without the word ago, and a low battery', () => {
    expect(row({on: true, since: NOW - 12 * MIN, battery: 8.6})).toMatchObject({
      tone: 'warn',
      main: 'Open',
      sub: 'for 12 min · battery 9%',
    });
    expect(row({on: true, since: NOW - 3 * HOUR}).sub).toBe('for 3 h');
    expect(row({on: true, since: NOW - 10_000}).sub).toBe('for just now');
  });

  test('a closed door says since when, and a battery that is not low says nothing', () => {
    expect(row({battery: 20})).toMatchObject({tone: '', main: 'Closed', sub: '12 min ago'});
    expect(row({battery: 19.4}).sub).toBe('12 min ago · battery 19%');
    expect(row({since: NOW - 3 * 24 * HOUR}).sub).toBe('Nov 4');
  });

  test('a motion sensor: now, or since when, with the light and the battery in that order', () => {
    expect(row({kind: 'motion', on: true, illuminance: 120.4, battery: 5})).toMatchObject({
      tone: 'act',
      main: 'Motion now',
      sub: '120 lx · battery 5%',
    });
    expect(row({kind: 'motion', illuminance: 1234.6, battery: 5})).toMatchObject({
      tone: '',
      main: 'No motion',
      sub: '12 min ago · 1235 lx · battery 5%',
    });
    expect(row({kind: 'motion', on: true}).sub).toBe('');
  });

  test('an unavailable sensor is offline whatever else it says', () => {
    expect(row({available: false, on: true, battery: 3})).toMatchObject({tone: 'off', main: 'Offline', sub: ''});
  });

  test('in French', () => {
    expect(row({on: true, since: NOW - 12 * MIN, battery: 8.6}, 'fr')).toMatchObject({
      main: 'Ouverte',
      sub: 'depuis 12 min · pile à 9 %',
    });
    expect(row({on: true, since: NOW - 10_000}, 'fr').sub).toBe('depuis un instant');
  });
});

describe('the summary lines', () => {
  const doors = (open: number, total: number) =>
    Array.from({length: total}, (_, i) => sensor({id: `binary_sensor.door_${i}`, on: i < open}));

  test('open doors are counted, one or many, in amber on the card', () => {
    const one = modelOf({cameras: [camera()], sensors: doors(1, 3)});
    expect(one.summary).toBe('1 camera · 1 door open');
    expect(one.sensors.line).toEqual({text: '1 door open', warn: true});
    expect(modelOf({cameras: [], sensors: doors(2, 3)}).sensors.line).toEqual({text: '2 doors open', warn: true});
    expect(modelOf({cameras: [], sensors: doors(2, 3)}).summary).toBe('No cameras · 2 doors open');
  });

  test('closed doors: "All doors closed", or "Door closed" for the only one', () => {
    expect(modelOf({cameras: [], sensors: doors(0, 2)}).sensors.line).toEqual({text: 'All doors closed', warn: false});
    expect(modelOf({cameras: [], sensors: doors(0, 1)}).sensors.line).toEqual({text: 'Door closed', warn: false});
  });

  test('motion sensors alone: no door line, and the lines say motion or none', () => {
    const vm = modelOf({cameras: [camera(), camera({id: 'camera.b'})], sensors: [sensor({kind: 'motion', on: true})]});
    expect(vm.sensors.line).toBeNull();
    expect(vm.summary).toBe('2 cameras · motion now');
    expect(vm.home.line).toBe('2 cameras · motion now');
    expect(modelOf({cameras: [], sensors: [sensor({kind: 'motion'})]}).home.line).toBe('no motion');
  });

  test('a door that is offline is not open, and a motion sensor that is offline is not moving', () => {
    const vm = modelOf({
      cameras: [],
      sensors: [
        sensor({available: false, on: false}),
        sensor({id: 'binary_sensor.m', kind: 'motion', available: false, on: false}),
      ],
    });
    expect(vm.summary).toBe('No cameras · all doors closed');
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the model is tested on the test house', () => {});
    return;
  }

  test('gives a model that agrees with what the house holds, computed from the house itself', () => {
    const inputs = inputsOf(fakeHass.fromFixture('main'));
    const vm = modelOf(inputs);
    expect(vm.cameras.tiles.map(t => t.id)).toEqual(inputs.cameras.map(c => c.id));
    expect(vm.sensors.rows.map(r => r.id)).toEqual(inputs.sensors.map(s => s.id));
    expect(vm.cameras.empty).toBe(inputs.cameras.length === 0);
    expect(vm.sensors.hidden).toBe(inputs.sensors.length === 0);
    expect(vm.home.cameras).toHaveLength(Math.min(4, inputs.cameras.length));
    expect(modelOf(inputs, 'fr').summary).not.toBe('');
  });
});
