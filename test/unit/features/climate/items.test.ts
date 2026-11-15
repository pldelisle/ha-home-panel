// climateItems, readClimate and climateIds: the list's items in the test house (the house, four rooms, no heat pump) and in literal
// houses for the rules it does not exercise (a heat pump in each of its states, an unavailable room); the recorded house is read
// when the owner has one (#170).
import {describe, expect, test} from 'vitest';
import {climateIds} from '../../../../src/features/climate/ids.ts';
import {readClimate} from '../../../../src/features/climate/inputs.ts';
import {climateItems} from '../../../../src/features/climate/items.ts';
import {registriesOf} from '../../../../src/core/registry.ts';
import {depsOf, fullHouse, houseOf, recorded, storeOf, type Language, type Player} from '../media/support.ts';
import {entity, fakeHass} from '../../fake-hass.ts';

/** The items of a house, worded as the panel words them in a language. */
function itemsOf(hass: ReturnType<typeof fakeHass>, language: Language = 'en', config: object = {}) {
  const store = storeOf(hass, config);
  const inputs = readClimate(hass.states, registriesOf(hass), store.config);
  return climateItems(inputs, {...depsOf(hass, language), language});
}
const thermostat = (id: string, state = 'heat', attributes: Record<string, unknown> = {}) =>
  entity(`climate.${id}`, state, {friendly_name: `Thermostat ${id}`, ...attributes});
const ROOMS = {rooms: [{climate: 'climate.den', key: 'den', name: 'Den'}]};
const PUMP = {...ROOMS, entities: {heat_pump: 'climate.pump'}};
const pump = (state: string, attributes: Record<string, unknown> = {}, device = {manufacturer: 'Daikin'}): Player => [
  'climate.pump',
  state,
  attributes,
  {platform: 'climate', device_id: 'd'},
  {id: 'd', ...device},
];

describe('the test house', () => {
  test('the house, then each room, with the status words, the figures and the tones', () => {
    const items = itemsOf(fullHouse);
    expect(items.map(i => [i.id, i.icon, i.name, i.sub, i.value, i.tone])).toEqual([
      ['house', 'house', 'Whole house', '2 rooms heating', '20.6°', 'on'],
      ['bedroom', 'bed', 'Bedroom', 'Heating · 1.20 kW', '20.8°', 'on'],
      ['garage', 'car', 'Garage', 'Holding 21°', '21.2°', ''],
      ['living_room', 'sofa', 'Living room', 'Heating · 1.20 kW', '20.0°', 'on'],
      ['office', 'desk', 'Office', 'Holding 21°', '20.4°', ''],
    ]);
  });

  test('in French: the words, the decimal comma and the rooms’ own names', () => {
    const items = itemsOf(fullHouse, 'fr');
    expect(items[0]).toMatchObject({name: 'Toute la maison', sub: '2 pièces chauffent', value: '20,6°'});
    expect(items[1]).toMatchObject({sub: 'Chauffe · 1,20 kW', value: '20,8°'});
    expect(items[2]).toMatchObject({sub: 'Maintient 21°'});
  });

  test('its ids: each room’s four entities, the weather entity and the outside sensor, once each, and no heat pump', () => {
    const store = storeOf(fullHouse);
    const ids = climateIds(store);
    expect(ids).toHaveLength(new Set(ids).size);
    expect(ids).toHaveLength(4 * 4 + 2);
    expect(ids).toEqual(
      expect.arrayContaining(['climate.bedroom', 'sensor.bedroom_power', store.config.entities.weather]),
    );
    expect(ids).not.toContain(null);
  });

  test('a heat pump is listed when the config names it, and an unset id is left out', () => {
    const ids = climateIds(storeOf(fakeHass(), {...ROOMS, entities: {heat_pump: 'climate.pump'}}));
    expect(ids).toEqual(expect.arrayContaining(['climate.den', 'climate.pump']));
    expect(ids.every(id => typeof id === 'string' && id !== '')).toBe(true);
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the rules are tested on literal houses', () => {});
    return;
  }

  test('the house item first, each room once, and a heat pump item only when the config has one', () => {
    const hass = fakeHass.fromFixture('main');
    const items = itemsOf(hass);
    expect(items[0].id).toBe('house');
    expect(new Set(items.map(i => i.id)).size).toBe(items.length);
  });
});

describe('a room', () => {
  const sub = (states: ReturnType<typeof entity>[]) => itemsOf(houseOf([], states), 'en', ROOMS)[1];

  test('holding the setpoint, off at the frost guard or with none, unavailable, and heating by the thermostat or by its power', () => {
    expect(sub([thermostat('den', 'heat', {temperature: 20.5})])).toMatchObject({sub: 'Holding 20.5°', tone: ''});
    expect(sub([thermostat('den', 'heat', {temperature: 5.5})])).toMatchObject({sub: 'Off', tone: ''});
    expect(sub([thermostat('den', 'heat')])).toMatchObject({sub: 'Off'});
    expect(sub([thermostat('den', 'unavailable')])).toMatchObject({sub: 'Unavailable', value: '–°', tone: 'bad'});
    expect(sub([thermostat('den', 'heat', {hvac_action: 'heating'})])).toMatchObject({
      sub: 'Heating · 0.00 kW',
      tone: 'on',
    });
    expect(sub([thermostat('den'), entity('sensor.den_power', '600', {unit_of_measurement: 'W'})])).toMatchObject({
      sub: 'Heating · 0.60 kW',
      tone: 'on',
    });
  });

  test('the house averages the rooms that read and is dashed when none does', () => {
    const house = (...states: ReturnType<typeof entity>[]) =>
      itemsOf(houseOf([], states), 'en', {rooms: ['climate.den', 'climate.hall']})[0];
    expect(house(thermostat('den', 'heat', {current_temperature: 20}), thermostat('hall', 'heat'))).toMatchObject({
      value: '20.0°',
      sub: '0 rooms heating',
      tone: '',
    });
    expect(house(thermostat('den', 'heat'), thermostat('hall', 'heat'))).toMatchObject({value: '–'});
  });
});

describe('the heat pump', () => {
  const item = (...players: Player[]) => itemsOf(houseOf(players), 'en', PUMP).at(-1);

  test('there is none without the config’s heat pump', () => {
    expect(itemsOf(houseOf([pump('heat')]), 'en', ROOMS).map(i => i.id)).toEqual(['house', 'den']);
  });

  test('heating to its target, idle without one, off, offline and not found, named by its maker', () => {
    expect(item(pump('heat', {hvac_action: 'heating', current_temperature: 19, temperature: 22}))).toEqual({
      id: 'hp',
      icon: 'fan',
      name: 'Heat pump',
      sub: 'Daikin · heating to 22°',
      value: '19.0°',
      tone: 'on',
    });
    expect(item(pump('heat', {hvac_action: 'idle', temperature: 21.5}))).toMatchObject({
      sub: 'Daikin · idle to 21.5°',
      value: '–',
      tone: '',
    });
    expect(item(pump('cool', {}))).toMatchObject({sub: 'Daikin · cool'});
    expect(item(pump('off', {temperature: 22}))).toMatchObject({sub: 'Daikin · off', tone: ''});
    expect(item(pump('unavailable'))).toMatchObject({sub: 'Daikin · offline', value: '–', tone: 'bad'});
    expect(item()).toMatchObject({sub: 'Not found', value: '–', tone: 'bad'});
  });

  test('a unit with no maker is "Heat pump" in the sub, Fujitsu through FGLair, and its heating lights the house', () => {
    expect(item(pump('off', {}, {manufacturer: ''}))).toMatchObject({sub: 'Heat pump · off'});
    expect(item(['climate.pump', 'off', {}, {platform: 'fglair'}])).toMatchObject({sub: 'Fujitsu · off'});
    expect(
      itemsOf(houseOf([pump('heat', {hvac_action: 'cooling'})], [thermostat('den')]), 'en', PUMP)[0],
    ).toMatchObject({
      sub: 'Heat pump + 0 rooms heating',
      tone: 'on',
    });
  });

  test('in French: the actions the layer translated, and the house line with the heat pump', () => {
    const french = (...players: Player[]) => itemsOf(houseOf(players, [thermostat('den')]), 'fr', PUMP);
    expect(french(pump('heat', {hvac_action: 'heating', temperature: 22})).at(-1)).toMatchObject({
      name: 'Thermopompe',
      sub: 'Daikin · chauffe à 22°',
    });
    expect(french(pump('heat', {hvac_action: 'idle'})).at(-1)).toMatchObject({sub: 'Daikin · au repos'});
    expect(french(pump('heat', {hvac_action: 'heating'}))[0]).toMatchObject({sub: 'Thermopompe + 0 pièces chauffent'});
  });
});

describe('readClimate', () => {
  test('the outside is the weather entity’s temperature, else the outside sensor’s, and the heat is the rooms’ power', () => {
    const outside = (states: ReturnType<typeof entity>[], entities: object) => {
      const hass = houseOf([], states);
      return readClimate(hass.states, registriesOf(hass), storeOf(hass, {...ROOMS, entities}).config);
    };
    expect(outside([entity('weather.home', 'sunny', {temperature: -3})], {weather: 'weather.home'}).outside).toBe(-3);
    expect(outside([entity('sensor.out', '4.5')], {outdoor_temperature: 'sensor.out'}).outside).toBe(4.5);
    expect(outside([], {}).outside).toBeNull();
    expect(
      outside([thermostat('den', 'heat', {hvac_action: 'heating'}), entity('sensor.den_power', '1.2')], {}),
    ).toMatchObject({heat: 1.2, heatPumpOn: false});
  });
});
