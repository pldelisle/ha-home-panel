// powerNow and roomPower: the grid, the loads and each room in kW, what `rest` leaves, when a room is heating and what it is
// called. The test house gives today's answer as literals; literal houses give the rules it does not exercise; the recorded
// house is read when the owner has one (#170).
import {describe, expect, test} from 'vitest';
import {entity, fakeHass} from '../fake-hass.ts';
import {fullHouse, houseOf, recorded, storeOf, type Language} from '../features/media/support.ts';
import {FULL_CFG} from '../../e2e/houses.ts';
import {powerNow, roomPower} from '../../../src/providers/power.ts';

type State = ReturnType<typeof entity>;

/** The flow read the way the panel reads it: the store's resolved config and names, in a language. */
function flowOf(hass: ReturnType<typeof fakeHass>, config: unknown = {}, language: Language = 'en') {
  const store = storeOf({...hass, locale: {language}}, config);
  return powerNow(hass.states, store.config, store.names, store.isFrench);
}
const watts = (id: string, state: string | number) => entity(id, String(state), {unit_of_measurement: 'W'});
const thermostat = (id: string, state = 'heat', attributes: Record<string, unknown> = {}) =>
  entity(`climate.${id}`, state, {friendly_name: `Thermostat ${id}`, ...attributes});
const NO_ENTITIES = {grid_power: 'sensor.grid', water_heater_power: 'sensor.wh', ev_charger_power: 'sensor.ev'};
const house = (...states: State[]) => houseOf([], states);

describe('the test house', () => {
  test('its meter, its charger and its four thermostats, with the rest clamped at zero', () => {
    const flow = flowOf(fullHouse, FULL_CFG);
    expect(flow).toMatchObject({grid: 3.24, waterHeater: 0, ev: 7.1, heat: 2.4, rest: 0, heatPump: null});
    expect(flow.rooms.map(r => [r.key, r.name, r.power, r.temperature, r.setpoint, r.heating, r.available])).toEqual([
      ['bedroom', 'Bedroom', 1.2, 20.8, 21, true, true],
      ['garage', 'Garage', 0, 21.2, 21, false, true],
      ['living_room', 'Living room', 1.2, 20, 21, true, true],
      ['office', 'Office', 0, 20.4, 21, false, true],
    ]);
  });

  test('read in French, the rooms are called by the dictionary', () => {
    expect(flowOf(fullHouse, FULL_CFG, 'fr').rooms.map(r => r.name)).toEqual(['Chambre', 'Garage', 'Salon', 'Bureau']);
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the rules are tested on the test house', () => {});
    return;
  }

  test('the rest is never negative, the heat is the rooms’ power, and every room has a key and a name', () => {
    const flow = flowOf(fakeHass.fromFixture('main'));
    expect(flow.rest === null || flow.rest >= 0).toBe(true);
    expect(flow.heat).toBeCloseTo(flow.rooms.reduce((total, r) => total + (r.power ?? 0), 0));
    for (const room of flow.rooms) expect([room.key, room.name].every(text => text !== '')).toBe(true);
  });
});

describe('the flow', () => {
  const cfg = {entities: NO_ENTITIES, rooms: ['climate.den', 'climate.hall']};

  test('the rest is the grid less the water heater, the EV and the heating, in kW, whatever unit each sensor reads', () => {
    const flow = flowOf(
      house(
        watts('sensor.grid', 5000),
        entity('sensor.wh', '1.5', {unit_of_measurement: 'kW'}),
        watts('sensor.ev', 500),
        thermostat('den'),
        watts('sensor.den_power', 600),
        thermostat('hall'),
        watts('sensor.hall_power', 400),
      ),
      cfg,
    );
    expect(flow).toMatchObject({grid: 5, waterHeater: 1.5, ev: 0.5, heat: 1, rest: 2});
  });

  test('the heat is the sum of the rooms’ power, and a room without a power sensor adds nothing', () => {
    const flow = flowOf(
      house(watts('sensor.grid', 9000), thermostat('den'), watts('sensor.den_power', 1200), thermostat('hall')),
      cfg,
    );
    expect(flow.heat).toBe(1.2);
    expect(flow.rooms.map(r => r.power)).toEqual([1.2, null]);
    expect(flow.rest).toBe(7.8);
  });

  test('a load that reads nothing counts as zero in the rest and stays null in the reading', () => {
    const flow = flowOf(house(watts('sensor.grid', 2000), entity('sensor.wh', 'unavailable')), cfg);
    expect([flow.waterHeater, flow.ev, flow.rest]).toEqual([null, null, 2]);
  });

  test('without a grid reading there is no rest, and a surplus of loads leaves none either', () => {
    expect(flowOf(house(watts('sensor.ev', 7000)), cfg)).toMatchObject({grid: null, ev: 7, rest: null});
    expect(flowOf(house(watts('sensor.grid', 1000), watts('sensor.ev', 7000)), cfg).rest).toBe(0);
  });

  test('a heat pump is there when its entity is, on while it heats or cools, and unavailable reads as off', () => {
    const withPump = (state: string, attributes: Record<string, unknown> = {}) =>
      flowOf(house(entity('climate.pump', state, attributes)), {entities: {heat_pump: 'climate.pump'}}).heatPump;
    expect(withPump('heat', {hvac_action: 'heating'})).toEqual({available: true, on: true});
    expect(withPump('cool', {hvac_action: 'cooling'})).toEqual({available: true, on: true});
    expect(withPump('heat', {hvac_action: 'idle'})).toEqual({available: true, on: false});
    expect(withPump('unavailable', {hvac_action: 'heating'})).toEqual({available: false, on: false});
    expect(flowOf(house(), {entities: {heat_pump: 'climate.pump'}}).heatPump).toBeNull();
  });
});

describe('a room', () => {
  const read = (states: State[], config: object = {}, language: Language = 'en') => {
    const hass = house(...states);
    const store = storeOf({...hass, locale: {language}}, {rooms: [{climate: 'climate.den', ...config}]});
    return roomPower(hass.states, store.config.rooms[0], store.names, store.isFrench);
  };

  test('heating is the thermostat’s action or a power over 50 W, and 50 W exactly is not', () => {
    const heating = (action: string, w: number) =>
      read([thermostat('den', 'heat', {hvac_action: action}), watts('sensor.den_power', w)]).heating;
    expect([heating('heating', 0), heating('idle', 60), heating('idle', 50), heating('idle', 0)]).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(read([thermostat('den', 'unavailable', {hvac_action: 'heating'})]).heating).toBe(false);
  });

  test('the temperature is the thermostat’s, else the sensor’s; the setpoint is the thermostat’s while it reads', () => {
    expect(read([thermostat('den', 'heat', {current_temperature: 19.5, temperature: 21.5})])).toMatchObject({
      temperature: 19.5,
      setpoint: 21.5,
      available: true,
    });
    expect(
      read([thermostat('den', 'heat', {temperature: 21}), entity('sensor.den_temperature', '18.2')]),
    ).toMatchObject({
      temperature: 18.2,
    });
    expect(
      read([
        thermostat('den', 'unavailable', {current_temperature: 19, temperature: 21}),
        entity('sensor.den_temperature', '18.2'),
      ]),
    ).toMatchObject({temperature: 18.2, setpoint: null, available: false});
    expect(read([])).toMatchObject({temperature: null, setpoint: null, power: null, available: false});
  });

  test('its name is the config’s, "Name’s bedroom" for a Chambre de, the thermostat’s without "Thermostat ", else the key', () => {
    const named = (friendly: string | null, config: object = {}) =>
      read([entity('climate.den', 'heat', friendly === null ? {} : {friendly_name: friendly})], config).name;
    expect(named('Thermostat Hall', {name: 'Entry'})).toBe('Entry');
    expect(named('Thermostat Chambre de Zoé')).toBe("Zoé's bedroom");
    expect(named('Thermostat Hall')).toBe('Hall');
    expect(named(null)).toBe('den');
  });

  test('in French it is the thermostat’s own name, whatever the config calls the room, else the English rule', () => {
    const named = (friendly: string | null, config: object = {}) =>
      read([entity('climate.den', 'heat', friendly === null ? {} : {friendly_name: friendly})], config, 'fr').name;
    expect(named('Thermostat Salle de Séjour', {name: 'Entry'})).toBe('Salle de Séjour');
    expect(named('Chambre de Zoé')).toBe('Chambre de Zoé');
    expect(named(null, {name: 'Entry'})).toBe('Entry');
  });
});
