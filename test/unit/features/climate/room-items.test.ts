// climateRoomAreas, climateItemsIn and climateChip: the Climate tab's thermostats cut to a room (ADR 0039), in the test house and in literal houses
// for the rules it does not exercise (two thermostats in one area, one in its device's area, none in an area, one that reads nothing).
import {describe, expect, test} from 'vitest';
import {readClimate} from '../../../../src/features/climate/inputs.ts';
import {climateChip, climateItemsIn, climateRoomAreas} from '../../../../src/features/climate/room-items.ts';
import {registriesOf} from '../../../../src/core/registry.ts';
import {depsOf, fullHouse, houseOf, storeOf, type Language, type Player} from '../media/support.ts';
import type {FakeHass} from '../../fake-hass.ts';

/** What a room view asks of a house: the areas, the items of an area and its chip, worded in a language. */
function roomOf(hass: FakeHass, config: object = {}, language: Language = 'en') {
  const store = storeOf(hass, config);
  const registries = registriesOf(hass);
  const inputs = readClimate(hass.states, registries, store.config);
  const deps = {...depsOf(hass, language), language};
  return {
    areas: climateRoomAreas(store.config, registries),
    items: (areaId: string) => climateItemsIn(inputs, areaId, registries, deps),
    chip: (areaId: string) => climateChip(inputs, areaId, registries, deps.fmt),
  };
}
const thermostat = (id: string, reading: number | null, row: Player[3] = {}): Player => [
  `climate.${id}`,
  reading === null ? 'unavailable' : 'heat',
  {friendly_name: `Thermostat ${id}`, ...(reading === null ? {} : {current_temperature: reading, temperature: 21})},
  row,
];
const rooms = (...ids: string[]) => ({rooms: ids.map(id => ({climate: `climate.${id}`, key: id, name: id}))});
const AREAS = {den: 'Den', loft: 'Loft'};

describe('the test house', () => {
  test('the areas of its four thermostats', () => {
    expect([...roomOf(fullHouse).areas].sort()).toEqual(['bedroom', 'garage', 'living_room', 'office']);
  });

  test('a room’s items are its thermostat’s tile as the tab words it, with no house and no heat pump', () => {
    const items = roomOf(fullHouse).items('office');
    expect(items.map(i => [i.id, i.icon, i.name, i.sub, i.value, i.tone])).toEqual([
      ['office', 'desk', 'Office', 'Holding 21°', '20.4°', ''],
    ]);
  });

  test('a heating room says so in its tone', () => {
    expect(roomOf(fullHouse).items('living_room')[0]).toMatchObject({sub: 'Heating · 1.2 kW', tone: 'on'});
  });

  test('the chip is the room’s temperature, with the decimal comma in French', () => {
    expect(roomOf(fullHouse).chip('office')).toBe('20.4°');
    expect(roomOf(fullHouse, {}, 'fr').chip('office')).toBe('20,4°');
  });

  test('an area with no thermostat has no items and no chip', () => {
    const room = roomOf(fullHouse);
    expect(room.items('attic')).toEqual([]);
    expect(room.chip('attic')).toBeNull();
  });
});

describe('literal houses', () => {
  test('two thermostats in one area are two tiles, and the chip is their mean', () => {
    const hass = houseOf(
      [
        thermostat('den', 20, {area_id: 'den'}),
        thermostat('desk', 22, {area_id: 'den'}),
        thermostat('loft', 18, {area_id: 'loft'}),
      ],
      [],
      AREAS,
    );
    const room = roomOf(hass, rooms('den', 'desk', 'loft'));
    expect(room.areas).toEqual(['den', 'loft']);
    expect(room.items('den').map(i => i.id)).toEqual(['den', 'desk']);
    expect(room.chip('den')).toBe('21.0°');
    expect(room.chip('loft')).toBe('18.0°');
  });

  test('a thermostat sits in its device’s area when it has none of its own', () => {
    const hass = houseOf(
      [[...thermostat('den', 20, {device_id: 'd'}).slice(0, 4), {id: 'd', area_id: 'den'}] as Player],
      [],
      AREAS,
    );
    expect(roomOf(hass, rooms('den')).areas).toEqual(['den']);
  });

  test('a thermostat in no area is in no room', () => {
    const hass = houseOf([thermostat('den', 20), thermostat('loft', 18, {area_id: 'loft'})], [], AREAS);
    expect(roomOf(hass, rooms('den', 'loft')).areas).toEqual(['loft']);
  });

  test('a thermostat that reads nothing still has its tile, and the chip is null', () => {
    const hass = houseOf([thermostat('den', null, {area_id: 'den'})], [], AREAS);
    const room = roomOf(hass, rooms('den'));
    expect(room.items('den')).toMatchObject([{id: 'den', tone: 'bad'}]);
    expect(room.chip('den')).toBeNull();
  });
});
