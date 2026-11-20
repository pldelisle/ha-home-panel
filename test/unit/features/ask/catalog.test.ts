// askCatalog: the sensors the model may name, as short handles with a display name, a kind and a unit; the map from a handle to an
// entity id stays on the panel's side. Built from the full and the bare test houses, then from literal rooms for the corners.
import {describe, expect, test} from 'vitest';
import type {ResolvedConfig} from '../../../../src/core/config.ts';
import type {RoomNameDeps} from '../../../../src/core/i18n/room-name.ts';
import {askCatalog, ASK_CATALOG_CAP, type AskReads} from '../../../../src/features/ask/catalog.ts';
import {registriesOf} from '../../../../src/core/registry.ts';
import {powerNow} from '../../../../src/providers/power.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import * as bare from '../../../houses/bare.mjs';
import {fakeHass, type FakeHass} from '../../fake-hass.ts';
import {fullHouse, storeOf} from '../media/support.ts';

const house = (hass: FakeHass, panelConfig: unknown = {}, language = 'en') => {
  const french = {...hass, locale: {language}};
  const store = storeOf(french, panelConfig);
  const naming: RoomNameDeps = {names: store.names, t: store.t, language};
  const reads: AskReads = {
    power: powerNow(hass.states, store.config),
    states: hass.states,
    registries: registriesOf(hass),
  };
  return {
    store,
    naming,
    reads,
    catalog: (config: Pick<ResolvedConfig, 'ask' | 'entities' | 'rooms'> = store.config) =>
      askCatalog(reads, naming, config),
  };
};

describe('the full test house', () => {
  const {catalog} = house(fullHouse, FULL_CFG);

  test('lists the four rooms, then the grid, the water heater and the EV, each with a kind and a unit', () => {
    expect(catalog().entries).toEqual([
      {key: 'temp.bedroom', name: 'Bedroom', kind: 'measure', unit: '°'},
      {key: 'temp.garage', name: 'Garage', kind: 'measure', unit: '°'},
      {key: 'temp.living_room', name: 'Living room', kind: 'measure', unit: '°'},
      {key: 'temp.office', name: 'Office', kind: 'measure', unit: '°'},
      {key: 'power.grid', name: 'Grid', kind: 'measure', unit: 'W'},
      {key: 'power.water_heater', name: 'Water heater', kind: 'measure', unit: 'W'},
      {key: 'power.ev', name: 'EV charging', kind: 'measure', unit: 'kW'},
    ]);
  });

  test('keeps the entity behind each handle on the panel, where the history is read', () => {
    expect([...catalog().entityOf]).toEqual([
      ['temp.bedroom', 'sensor.bedroom_temperature'],
      ['temp.garage', 'sensor.garage_temperature'],
      ['temp.living_room', 'sensor.living_room_temperature'],
      ['temp.office', 'sensor.office_temperature'],
      ['power.grid', 'sensor.house_power'],
      ['power.water_heater', 'sensor.water_heater_power'],
      ['power.ev', 'sensor.charger_power'],
    ]);
    expect(JSON.stringify(catalog().entries)).not.toContain('sensor.');
  });

  test('names the sensors in the panel language', () => {
    const french = house(fullHouse, FULL_CFG, 'fr').catalog().entries;
    expect(french.slice(4).map(entry => entry.name)).toEqual(['Réseau', 'Chauffe-eau', 'Recharge de la voiture']);
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
    ]);
    expect(excluding.catalog().entityOf.has('power.grid')).toBe(false);
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
    expect(entityOf.get('temp.den')).toBe(`sensor.${SECRET}_temperature`);
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
    expect(catalog().entityOf.get('temp.den-2')).toBe('sensor.den_two_temperature');
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

  test('without an ask block nothing is excluded', () => {
    const {store, catalog} = house(fullHouse, FULL_CFG);
    expect(store.config.ask).toBeNull();
    expect(catalog().entries).toHaveLength(7);
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
    expect(full.omitted).toBe(70 + 3 - 60);
  });
});
