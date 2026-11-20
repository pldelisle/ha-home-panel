// askCatalog: the sensors the model may name, as short handles with a display name, a kind and a unit; the map from a handle to an
// entity id stays on the panel's side. Built from the full and the bare test houses, then from literal rooms for the corners.
import {describe, expect, test} from 'vitest';
import type {ResolvedConfig} from '../../../../src/core/config.ts';
import type {RoomNameDeps} from '../../../../src/core/i18n/room-name.ts';
import {askCatalog, ASK_CATALOG_CAP, type AskReads} from '../../../../src/features/ask/catalog.ts';
import {powerNow} from '../../../../src/providers/power.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import * as bare from '../../../houses/bare.mjs';
import {fakeHass, type FakeHass} from '../../fake-hass.ts';
import {fullHouse, storeOf} from '../media/support.ts';

const house = (hass: FakeHass, panelConfig: unknown = {}, language = 'en') => {
  const french = {...hass, locale: {language}};
  const store = storeOf(french, panelConfig);
  const naming: RoomNameDeps = {names: store.names, t: store.t, language};
  const reads: AskReads = {power: powerNow(hass.states, store.config), states: hass.states};
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
  test('a room that reports nothing and has no thermostat is not offered, and a room with only a sensor is', () => {
    const states = {
      ...fullHouse.states,
      'sensor.den_temperature': {...fullHouse.states['sensor.office_temperature'], entity_id: 'sensor.den_temperature'},
    };
    const hass = {...fullHouse, states};
    const {store} = house(hass, {...FULL_CFG, rooms: ['climate.ghost', {climate: 'climate.den', key: 'den'}]});
    const reads: AskReads = {power: powerNow(states, store.config), states};
    const naming = {names: store.names, t: store.t, language: 'en'};
    expect(askCatalog(reads, naming, store.config).entries.slice(0, 1)).toEqual([
      {key: 'temp.den', name: 'den', kind: 'measure', unit: '°'},
    ]);
  });

  test('two rooms with the same key keep the first, and a key is a slug', () => {
    const {store, naming, reads} = house(fullHouse, {
      ...FULL_CFG,
      rooms: [
        {climate: 'climate.office', key: 'Back Office!'},
        {climate: 'climate.garage', key: 'back_office'},
      ],
    });
    const {entries, entityOf} = askCatalog(reads, naming, store.config);
    expect(entries.filter(entry => entry.key.startsWith('temp.')).map(entry => entry.key)).toEqual([
      'temp.back_office',
    ]);
    expect(entityOf.get('temp.back_office')).toBe('sensor.office_temperature');
  });

  test('a power sensor says its own unit, and one that says none is taken to be in kW', () => {
    const states = {
      ...fullHouse.states,
      'sensor.house_power': {...fullHouse.states['sensor.house_power'], attributes: {}},
    };
    const {store, naming} = house({...fullHouse, states}, FULL_CFG);
    const reads: AskReads = {power: powerNow(states, store.config), states};
    expect(askCatalog(reads, naming, store.config).entries.find(entry => entry.key === 'power.grid')?.unit).toBe('kW');
  });

  test('without an ask block nothing is excluded', () => {
    const {store, naming, reads} = house(fullHouse, FULL_CFG);
    expect(store.config.ask).toBeNull();
    expect(askCatalog(reads, naming, store.config).entries).toHaveLength(7);
  });

  test('keeps the first 60 in order and says how many it left out', () => {
    const {store, naming, reads} = house(fullHouse, FULL_CFG);
    const [room] = store.config.rooms;
    const [roomRead] = reads.power.rooms;
    const many = Array.from({length: 70}, (_, i) => i);
    const config = {
      ...store.config,
      rooms: many.map(i => ({...room, k: `r${i}`, climate: `climate.r${i}`, temp: `sensor.r${i}_temperature`})),
    };
    const crowded: AskReads = {
      ...reads,
      power: {...reads.power, rooms: many.map(i => ({...roomRead, key: `r${i}`, climate: `climate.r${i}`}))},
    };
    const full = askCatalog(crowded, naming, config);
    expect(ASK_CATALOG_CAP).toBe(60);
    expect(full.entries).toHaveLength(60);
    expect(full.entries[59].key).toBe('temp.r59');
    expect(full.entityOf.size).toBe(60);
    expect(full.omitted).toBe(70 + 3 - 60);
  });
});
