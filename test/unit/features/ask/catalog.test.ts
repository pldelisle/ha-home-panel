// askCatalog: the sensors the model may name, as short handles with a display name, a kind and a unit; the map from a handle to an
// entity id stays on the panel's side. Built from the full and the bare test houses, then from literal rooms for the corners.
import {describe, expect, test} from 'vitest';
import type {ResolvedConfig} from '../../../../src/core/config.ts';
import type {RoomNameDeps} from '../../../../src/core/i18n/room-name.ts';
import {askCatalog, ASK_CATALOG_CAP, type AskReads} from '../../../../src/features/ask/catalog.ts';
import {registriesOf} from '../../../../src/core/registry.ts';
import {doorMotionSensors, type SensorInputs} from '../../../../src/providers/door-motion.ts';
import {personEntities} from '../../../../src/providers/people.ts';
import {powerNow} from '../../../../src/providers/power.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import * as bare from '../../../houses/bare.mjs';
import {entity, fakeHass, type FakeHass} from '../../fake-hass.ts';
import {fullHouse, storeOf} from '../media/support.ts';

const house = (hass: FakeHass, panelConfig: unknown = {}, language = 'en') => {
  const french = {...hass, locale: {language}};
  const store = storeOf(french, panelConfig);
  const naming: RoomNameDeps = {names: store.names, t: store.t, language};
  const registries = registriesOf(hass);
  const reads: AskReads = {
    power: powerNow(hass.states, store.config),
    states: hass.states,
    registries,
    sensors: doorMotionSensors(hass.states, registries, store.names),
    people: personEntities(hass.states, store.config.people),
  };
  return {
    store,
    naming,
    reads,
    catalog: (config: Pick<ResolvedConfig, 'ask' | 'entities' | 'rooms'> = store.config) =>
      askCatalog(reads, naming, config),
  };
};

// the words of a binary sensor's two states are message keys, which the understood line words in the panel's language
const DOOR_WORDS = {on: 'ask.words.open', off: 'ask.words.closed'} as const;
const MOTION_WORDS = {on: 'ask.words.motion', off: 'ask.words.clear'} as const;
const HOME_WORDS = {on: 'ask.words.home', off: 'ask.words.away'} as const;

describe('the full test house', () => {
  const {catalog} = house(fullHouse, FULL_CFG);

  test('lists the four rooms, then the grid, the water heater and the EV, the car and the heating as meters, then the door, the motion sensor and the two people, each with a kind and a unit', () => {
    expect(catalog().entries).toEqual([
      {key: 'temp.bedroom', name: 'Bedroom', kind: 'measure', unit: '°'},
      {key: 'temp.garage', name: 'Garage', kind: 'measure', unit: '°'},
      {key: 'temp.living_room', name: 'Living room', kind: 'measure', unit: '°'},
      {key: 'temp.office', name: 'Office', kind: 'measure', unit: '°'},
      {key: 'power.grid', name: 'Grid', kind: 'measure', unit: 'W'},
      {key: 'power.water_heater', name: 'Water heater', kind: 'measure', unit: 'W'},
      {key: 'power.ev', name: 'EV charging', kind: 'measure', unit: 'kW'},
      {key: 'energy.car', name: 'Car charging energy', kind: 'meter', unit: 'kWh'},
      {key: 'energy.heating', name: 'Heating energy', kind: 'meter', unit: 'kWh'},
      {key: 'door.living_room', name: 'Front door', kind: 'binary', unit: '', words: DOOR_WORDS},
      {key: 'motion.office', name: 'Hall motion', kind: 'binary', unit: '', words: MOTION_WORDS},
      {key: 'home.alex', name: 'Alex', kind: 'binary', unit: '', words: HOME_WORDS},
      {key: 'home.sam', name: 'Sam', kind: 'binary', unit: '', words: HOME_WORDS},
    ]);
  });

  test('keeps the entity behind each handle on the panel, where the history is read', () => {
    const rooms = house(fullHouse, FULL_CFG).store.config.rooms.map(room => room.power);
    expect([...catalog().entityOf]).toEqual([
      ['temp.bedroom', ['sensor.bedroom_temperature']],
      ['temp.garage', ['sensor.garage_temperature']],
      ['temp.living_room', ['sensor.living_room_temperature']],
      ['temp.office', ['sensor.office_temperature']],
      ['power.grid', ['sensor.house_power']],
      ['power.water_heater', ['sensor.water_heater_power']],
      ['power.ev', ['sensor.charger_power']],
      // the car is its charger's power, and the heating is the rooms' power sensors added up: one handle, the list behind it
      ['energy.car', ['sensor.charger_power']],
      ['energy.heating', rooms],
      ['door.living_room', ['binary_sensor.front_door']],
      ['motion.office', ['binary_sensor.hall_motion']],
      ['home.alex', ['person.alex']],
      ['home.sam', ['person.sam']],
    ]);
    expect(rooms).toHaveLength(4);
    expect(JSON.stringify(catalog().entries)).not.toContain('sensor.');
  });

  test('names the sensors in the panel language', () => {
    const french = house(fullHouse, FULL_CFG, 'fr').catalog().entries;
    expect(french.slice(4, 7).map(entry => entry.name)).toEqual(['Réseau', 'Chauffe-eau', 'Recharge de la voiture']);
    expect(french.slice(0, 2).map(entry => entry.key)).toEqual(['temp.bedroom', 'temp.garage']);
  });

  test('a handle does not follow a display name', () => {
    const renamed = house(fullHouse, {...FULL_CFG, rooms: [{climate: 'climate.office', name: 'Study'}]});
    expect(renamed.catalog().entries[0]).toMatchObject({key: 'temp.office', name: 'Study'});
  });

  test('leaves out what the house excludes, by entity id', () => {
    const excluding = house(fullHouse, {
      ...FULL_CFG,
      ask: {entity: 'ai_task.model', exclude: ['sensor.office_temperature', 'sensor.house_power']},
    });
    expect(excluding.catalog().entries.map(entry => entry.key)).toEqual([
      'temp.bedroom',
      'temp.garage',
      'temp.living_room',
      'power.water_heater',
      'power.ev',
      'energy.car',
      'energy.heating',
      'door.living_room',
      'motion.office',
      'home.alex',
      'home.sam',
    ]);
    expect(excluding.catalog().entityOf.has('power.grid')).toBe(false);
  });

  test('leaves out a door, a motion sensor or a person the house excludes, by entity id', () => {
    const excluding = house(fullHouse, {
      ...FULL_CFG,
      ask: {entity: 'ai_task.model', exclude: ['binary_sensor.front_door', 'person.sam']},
    });
    const keys = excluding.catalog().entries.map(entry => entry.key);
    expect(keys.slice(9)).toEqual(['motion.office', 'home.alex']);
  });
});

describe('the meters', () => {
  // the house's energy total and the water heater's, named in the config, the way the Energy card reads them; the heater's own entity id is made up
  const METERS = {
    ...FULL_CFG,
    entities: {...FULL_CFG.entities, energy_total: 'sensor.mains_energy', water_heater_energy: 'sensor.tank_energy'},
  };
  const withMeters = (...ids: string[]): FakeHass => ({
    ...fullHouse,
    states: {
      ...fullHouse.states,
      ...Object.fromEntries(ids.map(id => [id, entity(id, '1234.5', {unit_of_measurement: 'Wh'})])),
    },
  });

  test('the house, the water heater, the car and the heating are meters in kWh, after the live power and before the doors, and the map keeps their entities', () => {
    const {entries, entityOf} = house(withMeters('sensor.mains_energy', 'sensor.tank_energy'), METERS).catalog();
    expect(entries.filter(entry => entry.kind === 'meter')).toEqual([
      {key: 'energy.house', name: 'House energy', kind: 'meter', unit: 'kWh'},
      {key: 'energy.water_heater', name: 'Water heater energy', kind: 'meter', unit: 'kWh'},
      {key: 'energy.car', name: 'Car charging energy', kind: 'meter', unit: 'kWh'},
      {key: 'energy.heating', name: 'Heating energy', kind: 'meter', unit: 'kWh'},
    ]);
    expect(entries.findIndex(entry => entry.key === 'energy.house')).toBe(
      entries.findIndex(entry => entry.key === 'power.ev') + 1,
    );
    expect(entityOf.get('energy.house')).toEqual(['sensor.mains_energy']);
    expect(entityOf.get('energy.water_heater')).toEqual(['sensor.tank_energy']);
    expect(JSON.stringify(entries)).not.toContain('sensor.');
  });

  test('the car and the heating are power sensors, whose means the panel turns into energy; the totals are read as they are', () => {
    const {entityOf, fromPower} = house(withMeters('sensor.mains_energy'), METERS).catalog();
    expect([...(fromPower ?? [])]).toEqual(['energy.car', 'energy.heating']);
    expect(entityOf.get('energy.car')).toEqual(['sensor.charger_power']);
    expect(entityOf.get('energy.heating')).toHaveLength(4);
  });

  test('the heating is the rooms that have a power sensor in the house, once each, and none is no heating', () => {
    const config = {
      ...FULL_CFG,
      rooms: [{climate: 'climate.office'}, {climate: 'climate.bedroom', power: 'sensor.office_power'}],
    };
    expect(house(fullHouse, config).catalog().entityOf.get('energy.heating')).toEqual(['sensor.office_power']);
    const none = house(fullHouse, {...FULL_CFG, rooms: [{climate: 'climate.office', power: 'sensor.nowhere_power'}]});
    expect(none.catalog().entityOf.has('energy.heating')).toBe(false);
  });

  test('a power sensor the house excludes is left out of the heating, and the heating goes when none is left', () => {
    const rooms = house(fullHouse, FULL_CFG).store.config.rooms.map(room => room.power);
    const exclude = (ids: string[]) =>
      house(fullHouse, {...FULL_CFG, ask: {entity: 'ai_task.model', exclude: ids}}).catalog();
    expect(exclude([rooms[0]]).entityOf.get('energy.heating')).toEqual(rooms.slice(1));
    expect(exclude(rooms).entityOf.has('energy.heating')).toBe(false);
    expect(exclude(['sensor.charger_power']).entityOf.has('energy.car')).toBe(false);
  });

  test('a meter the config names but the house does not have, and one the config leaves unset, is not offered', () => {
    expect(
      house(withMeters('sensor.mains_energy'), METERS)
        .catalog()
        .entries.map(entry => entry.key),
    ).toContain('energy.house');
    const only = house(withMeters('sensor.mains_energy'), METERS).catalog().entries;
    expect(only.some(entry => entry.key === 'energy.water_heater')).toBe(false);
    // the full test house has neither the default energy total nor a heater energy: its meters are the car's and the heating's
    expect(
      house(fullHouse, FULL_CFG)
        .catalog()
        .entries.filter(entry => entry.kind === 'meter')
        .map(entry => entry.key),
    ).toEqual(['energy.car', 'energy.heating']);
  });

  test('is named in the panel language, and the house can exclude one by entity id', () => {
    const french = house(withMeters('sensor.mains_energy', 'sensor.tank_energy'), METERS, 'fr').catalog().entries;
    expect(french.filter(entry => entry.kind === 'meter').map(entry => entry.name)).toEqual([
      'Énergie de la maison',
      'Énergie du chauffe-eau',
      'Énergie de recharge de la voiture',
      'Énergie du chauffage',
    ]);
    const excluding = house(withMeters('sensor.mains_energy', 'sensor.tank_energy'), {
      ...METERS,
      ask: {entity: 'ai_task.model', exclude: ['sensor.mains_energy']},
    }).catalog();
    expect(excluding.entries.filter(entry => entry.kind === 'meter').map(entry => entry.key)).toEqual([
      'energy.water_heater',
      'energy.car',
      'energy.heating',
    ]);
  });
});

describe('the bare test house', () => {
  test('has no room and no meter, so its catalog is empty', () => {
    const empty = house(fakeHass.fromHouse(bare)).catalog();
    expect(empty.entries).toEqual([]);
    expect(empty.omitted).toBe(0);
  });
});

describe('the corners', () => {
  // a thermostat whose entity id carries a fragment the model must never see
  const SECRET = 'zx9secret';
  const secretHouse = (areaId: string | null, rooms: unknown[]) => {
    const states = {
      ...fullHouse.states,
      [`climate.${SECRET}`]: {
        ...fullHouse.states['climate.office'],
        entity_id: `climate.${SECRET}`,
        attributes: {friendly_name: 'Back Room'},
      },
      [`sensor.${SECRET}_temperature`]: {
        ...fullHouse.states['sensor.office_temperature'],
        entity_id: `sensor.${SECRET}_temperature`,
      },
    };
    const entities = {
      ...fullHouse.entities,
      [`climate.${SECRET}`]: {entity_id: `climate.${SECRET}`, area_id: areaId, platform: 'demo'},
    };
    return house({...fullHouse, states, entities}, {...FULL_CFG, rooms});
  };
  const temps = (entries: {key: string}[]) => entries.map(entry => entry.key).filter(key => key.startsWith('temp.'));

  test('a handle comes from the area of the room, and nothing of the entity id reaches a handle or a name', () => {
    const {catalog} = secretHouse('den', [`climate.${SECRET}`]);
    const {entries, entityOf} = catalog();
    expect(temps(entries)).toEqual(['temp.den']);
    expect(entityOf.get('temp.den')).toEqual([`sensor.${SECRET}_temperature`]);
    expect(JSON.stringify(entries)).not.toContain(SECRET);
  });

  test('without an area the key the config gives the room names it, and the display name is the last resort', () => {
    const keyed = secretHouse(null, [{climate: `climate.${SECRET}`, key: 'Study Room'}]).catalog();
    expect(temps(keyed.entries)).toEqual(['temp.study_room']);
    const named = secretHouse(null, [`climate.${SECRET}`]).catalog();
    expect(temps(named.entries)).toEqual(['temp.back_room']);
    expect(JSON.stringify([keyed.entries, named.entries])).not.toContain(SECRET);
  });

  test('a name with no letter or digit in it still gets a handle', () => {
    const {catalog} = secretHouse(null, [{climate: `climate.${SECRET}`, name: '!!!'}]);
    expect(temps(catalog().entries)).toEqual(['temp.room']);
  });

  test('a power handle is built from its role alone', () => {
    const {entries} = secretHouse('den', []).catalog();
    expect(entries.filter(entry => entry.key.startsWith('power.')).map(entry => entry.key)).toEqual([
      'power.grid',
      'power.water_heater',
      'power.ev',
    ]);
  });

  test('two rooms that would share a handle keep it stable: the second gets a -2, the third a -3', () => {
    const states = {
      ...fullHouse.states,
      'climate.den_two': {...fullHouse.states['climate.office'], entity_id: 'climate.den_two'},
      'climate.den_three': {...fullHouse.states['climate.office'], entity_id: 'climate.den_three'},
    };
    const entities = {
      ...fullHouse.entities,
      'climate.den_two': {entity_id: 'climate.den_two', area_id: 'den', platform: 'demo'},
      'climate.den_three': {entity_id: 'climate.den_three', area_id: 'den', platform: 'demo'},
      'climate.office': {...fullHouse.entities?.['climate.office'], area_id: 'den'},
    };
    const {catalog} = house({...fullHouse, states, entities} as FakeHass, {
      ...FULL_CFG,
      rooms: ['climate.office', 'climate.den_two', 'climate.den_three'],
    });
    expect(temps(catalog().entries)).toEqual(['temp.den', 'temp.den-2', 'temp.den-3']);
    expect(catalog().entityOf.get('temp.den-2')).toEqual(['sensor.den_two_temperature']);
  });

  test('a room that reports nothing and has no thermostat is not offered, and a room with only a sensor is', () => {
    const states = {
      ...fullHouse.states,
      'sensor.den_temperature': {...fullHouse.states['sensor.office_temperature'], entity_id: 'sensor.den_temperature'},
    };
    const {catalog} = house(
      {...fullHouse, states},
      {...FULL_CFG, rooms: ['climate.ghost', {climate: 'climate.den', key: 'den'}]},
    );
    expect(catalog().entries.slice(0, 1)).toEqual([{key: 'temp.den', name: 'den', kind: 'measure', unit: '°'}]);
  });

  test('a power sensor says its own unit, and one that says none is taken to be in kW', () => {
    const states = {
      ...fullHouse.states,
      'sensor.house_power': {...fullHouse.states['sensor.house_power'], attributes: {}},
    };
    const {catalog} = house({...fullHouse, states}, FULL_CFG);
    expect(catalog().entries.find(entry => entry.key === 'power.grid')?.unit).toBe('kW');
  });

  test('a door, a motion sensor or a person is handled by area, else display name, else the configured name, and never by its entity id', () => {
    const {reads, naming, store} = house(fullHouse, FULL_CFG);
    const door = (id: string, kind: 'door' | 'motion', areaId: string | null, name: string): SensorInputs => ({
      ...reads.sensors[0],
      id,
      kind,
      areaId,
      name,
    });
    const crowded: AskReads = {
      ...reads,
      sensors: [
        door('binary_sensor.zx9secret_a', 'door', 'patio', 'Patio door'),
        door('binary_sensor.zx9secret_b', 'door', 'patio', 'Sliding door'),
        door('binary_sensor.zx9secret_c', 'door', null, 'Back Gate'),
        door('binary_sensor.zx9secret_d', 'motion', null, '!!!'),
      ],
      people: [
        {name: 'Émile Doe', id: 'person.zx9secret_f'},
        {name: '!!!', id: 'person.zx9secret_g'},
      ],
    };
    const {entries, entityOf} = askCatalog(crowded, naming, store.config);
    const binary = entries.filter(entry => entry.kind === 'binary');
    expect(binary.map(entry => entry.key)).toEqual([
      'door.patio',
      'door.patio-2',
      'door.back_gate',
      'motion.sensor',
      'home.emile_doe',
      'home.person',
    ]);
    expect(entityOf.get('door.patio-2')).toEqual(['binary_sensor.zx9secret_b']);
    expect(JSON.stringify(entries)).not.toContain('zx9secret');
  });

  test('without an ask block nothing is excluded', () => {
    const {store, catalog} = house(fullHouse, FULL_CFG);
    expect(store.config.ask).toBeNull();
    expect(catalog().entries).toHaveLength(13);
  });

  test('keeps the first 60 in order and says how many it left out', () => {
    const {store, naming, reads} = house(fullHouse, FULL_CFG);
    const [room] = store.config.rooms;
    const [roomRead] = reads.power.rooms;
    const many = Array.from({length: 70}, (_, i) => i);
    const config = {
      ...store.config,
      rooms: many.map(i => ({
        ...room,
        k: `r${i}`,
        explicitKey: `r${i}`,
        climate: `climate.r${i}`,
        temp: `sensor.r${i}_temperature`,
      })),
    };
    const crowded: AskReads = {
      ...reads,
      sensors: [],
      people: [],
      power: {
        ...reads.power,
        rooms: many.map(i => ({...roomRead, key: `r${i}`, thermostatName: '', climate: `climate.r${i}`})),
      },
    };
    const full = askCatalog(crowded, naming, config);
    expect(ASK_CATALOG_CAP).toBe(60);
    expect(full.entries).toHaveLength(60);
    expect(full.entries[59].key).toBe('temp.r59');
    expect(full.entityOf.size).toBe(60);
    // the rooms' temperatures, the three live powers, and the car and the heating
    expect(full.omitted).toBe(70 + 3 + 2 - 60);
  });
});
