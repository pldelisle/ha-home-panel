// powerNow and roomPower: the grid, the loads and each room in kW, what `rest` leaves, when a room is heating and the inputs of its name
// (`roomName` words it, test/unit/i18n/room-name.test.ts). The test house gives today's answer as literals; literal houses give the rules it does not exercise; the recorded
// house is read when the owner has one (#170).
import {describe, expect, test} from 'vitest';
import {entity, fakeHass} from '../fake-hass.ts';
import {fullHouse, houseOf, recorded, storeOf} from '../features/media/support.ts';
import {FULL_CFG} from '../../e2e/houses.ts';
import {powerNow, roomPower, waterHeaterNow} from '../../../src/providers/power.ts';

type State = ReturnType<typeof entity>;

/** The flow read the way the panel reads it: the store's resolved config. */
const flowOf = (hass: ReturnType<typeof fakeHass>, config: unknown = {}) =>
  powerNow(hass.states, storeOf(hass, config).config);
const watts = (id: string, state: string | number) => entity(id, String(state), {unit_of_measurement: 'W'});
const thermostat = (id: string, state = 'heat', attributes: Record<string, unknown> = {}) =>
  entity(`climate.${id}`, state, {friendly_name: `Thermostat ${id}`, ...attributes});
const NO_ENTITIES = {grid_power: 'sensor.grid', water_heater_power: 'sensor.wh', ev_charger_power: 'sensor.ev'};
const house = (...states: State[]) => houseOf([], states);

describe('the test house', () => {
  test('its meter, its charger and its four thermostats, with the rest clamped at zero', () => {
    const flow = flowOf(fullHouse, FULL_CFG);
    expect(flow).toMatchObject({grid: 3.24, waterHeater: 0, ev: 7.1, heat: 2.4, rest: 0, heatPump: null});
    expect(
      flow.rooms.map(r => [r.key, r.thermostatName, r.power, r.temperature, r.setpoint, r.heating, r.available]),
    ).toEqual([
      ['bedroom', 'Bedroom', 1.2, 20.8, 21, true, true],
      ['garage', 'Garage', 0, 21.2, 21, false, true],
      ['living_room', 'Living room', 1.2, 20, 21, true, true],
      ['office', 'Office', 0, 20.4, 21, false, true],
    ]);
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

  test('a thermostat in the states is present whatever it says; one missing is neither present nor available', () => {
    const flow = flowOf(house(thermostat('den', 'unavailable')), cfg);
    expect(flow.rooms.map(r => [r.present, r.available])).toEqual([
      [true, false],
      [false, false],
    ]);
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

  test('a live grid named in the config is the flow’s grid, the meter only while it is unset', () => {
    const live = {entities: {...NO_ENTITIES, grid_power_live: 'sensor.grid_avg'}};
    // the meter sampled between the baseboards' pulses (1.5 kW) against its five-minute mean (2.6 kW)
    const states = house(watts('sensor.grid', 1518), watts('sensor.grid_avg', 2623), watts('sensor.ev', 0));
    expect(flowOf(states, live)).toMatchObject({grid: 2.623, rest: 2.623});
    expect(flowOf(states, cfg).grid).toBe(1.518);
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
  const read = (states: State[], config: object = {}) => {
    const hass = house(...states);
    return roomPower(hass.states, storeOf(hass, {rooms: [{climate: 'climate.den', ...config}]}).config.rooms[0]);
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

  test('the range its dial goes over is the thermostat’s min_temp and max_temp, else 5 to 30, and the defaults while it is unavailable', () => {
    expect(read([thermostat('den', 'heat', {min_temp: 7, max_temp: 28.5})])).toMatchObject({minTemp: 7, maxTemp: 28.5});
    expect(read([thermostat('den', 'heat', {min_temp: 'cold'})])).toMatchObject({minTemp: 5, maxTemp: 30});
    expect(read([thermostat('den', 'unavailable', {min_temp: 7, max_temp: 28})])).toMatchObject({
      minTemp: 5,
      maxTemp: 30,
    });
    expect(read([])).toMatchObject({minTemp: 5, maxTemp: 30});
  });

  test('its name is left to roomName: the key, the config’s name and the thermostat’s own name (empty when it has none)', () => {
    expect(read([thermostat('den')], {name: 'Entry'})).toMatchObject({
      key: 'den',
      configuredName: 'Entry',
      thermostatName: 'Thermostat den',
    });
    expect(read([entity('climate.den', 'heat')])).toMatchObject({configuredName: null, thermostatName: ''});
    expect(read([])).toMatchObject({key: 'den', thermostatName: ''});
  });
});

describe('waterHeaterNow', () => {
  test('its power in kW, its temperature, and when its power last changed; nothing while the power is unavailable', () => {
    const cfg = {entities: {water_heater_power: 'sensor.wh', water_heater_temperature: 'sensor.wh_t'}};
    const read = (...states: State[]) => {
      const hass = house(...states);
      return waterHeaterNow(hass.states, storeOf(hass, cfg).config);
    };
    const power = {...watts('sensor.wh', 4500), last_changed: '2026-11-07T18:40:00Z'};
    expect(read(power, entity('sensor.wh_t', '48'))).toEqual({
      power: 4.5,
      temperature: 48,
      powerChangedAt: Date.parse('2026-11-07T18:40:00Z'),
    });
    expect(read(entity('sensor.wh', 'unavailable'))).toEqual({power: null, temperature: null, powerChangedAt: null});
    expect(waterHeaterNow({}, {entities: {whP: null, whT: null}} as never)).toEqual({
      power: null,
      temperature: null,
      powerChangedAt: null,
    });
  });
});
