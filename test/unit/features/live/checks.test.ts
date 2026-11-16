// The Status checks: each rule applies or not (an absent integration gives null), says an item or its phrase, and holds its
// threshold at the edge exactly as the legacy `attention()` compared it; `runChecks` keeps the chain's order. The inputs are the
// test house's, read by `readLive`, with the one reading a case is about replaced.
import {describe, expect, test} from 'vitest';
import {registriesOf} from '../../../../src/core/registry.ts';
import {
  BATTERY_LOW_PERCENT,
  carNotReporting,
  carUnlocked,
  CHECKS,
  criticalPeak,
  DOOR_OPEN_MS,
  doorOpenTenMinutes,
  doorsClosed,
  heatPumpOffline,
  hiloGatewayOffline,
  HYDRO_QUEBEC_STALE_MS,
  hydroQuebecStale,
  runChecks,
  sensorBatteryLow,
  sensorOffline,
  thermostatsNotReporting,
  tirePressureLow,
  wallboxOffline,
  weatherWarnings,
  type Check,
  type CheckDeps,
} from '../../../../src/features/live/checks.ts';
import {readLive, type LiveInputs} from '../../../../src/features/live/inputs.ts';
import type {HeatPumpInputs} from '../../../../src/providers/heat-pump.ts';
import type {HydroQuebecInputs} from '../../../../src/providers/hydro-quebec.ts';
import type {SensorInputs} from '../../../../src/providers/door-motion.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import {fullHouse, NOW, storeOf} from '../media/support.ts';

const store = storeOf(fullHouse, FULL_CFG);
const deps: CheckDeps = {t: store.t, fmt: store.fmt, names: store.names, language: store.language};
const french = storeOf({...fullHouse, locale: {...fullHouse.locale, language: 'fr'}}, FULL_CFG);
const frDeps: CheckDeps = {t: french.t, fmt: french.fmt, names: french.names, language: french.language};

/** The test house at its clock: a car, a Wallbox, four thermostats, a front door and a hall motion sensor; no Hilo, Hydro-Québec, heat pump or warnings sensor. */
const house: LiveInputs = readLive(fullHouse.states, registriesOf(fullHouse), store.config, store.names, NOW);
const car = house.car!;

const run = (check: Check, over: Partial<LiveInputs>, d = deps) => check.run({...house, ...over}, d);

const hq = (over: Partial<HydroQuebecInputs> = {}): HydroQuebecInputs => ({
  balance: 10,
  peakNow: false,
  peakUpcoming: false,
  balancePresent: true,
  balanceUpdated: NOW,
  peakReporting: true,
  ...over,
});
const sensor = (over: Partial<SensorInputs>): SensorInputs => ({
  id: 'binary_sensor.back_door',
  kind: 'door',
  deviceClass: 'door',
  areaId: null,
  area: '',
  name: 'Back door',
  on: false,
  available: true,
  since: NOW,
  battery: null,
  batteryId: null,
  illuminance: null,
  illuminanceId: null,
  ...over,
});

describe('the test house', () => {
  test('has nothing to check but says the car is locked and the doors closed; the checks of what it lacks say nothing', () => {
    expect(runChecks(house, deps)).toEqual({items: [], clear: ['Car locked', 'Doors closed']});
    for (const check of [hydroQuebecStale, heatPumpOffline, hiloGatewayOffline, criticalPeak, weatherWarnings])
      expect(check.run(house, deps), check.key).toBeNull();
  });
});

describe('Hydro-Québec not updating', () => {
  test('after 36 hours without an update, not at 36 hours; an unavailable balance is stale at once', () => {
    expect(run(hydroQuebecStale, {hydroQuebec: hq({balanceUpdated: NOW - HYDRO_QUEBEC_STALE_MS})})).toEqual({
      clear: 'Hydro-Québec updating',
    });
    expect(run(hydroQuebecStale, {hydroQuebec: hq({balanceUpdated: NOW - HYDRO_QUEBEC_STALE_MS - 1})})).toMatchObject({
      item: {level: 'warn', title: 'Hydro-Québec not updating'},
    });
    expect(run(hydroQuebecStale, {hydroQuebec: hq({balanceUpdated: null})})?.item?.title).toBe(
      'Hydro-Québec not updating',
    );
  });

  test('does not apply without the balance sensor, even when the peak sensors are there', () => {
    expect(run(hydroQuebecStale, {hydroQuebec: hq({balancePresent: false, balanceUpdated: null})})).toBeNull();
  });
});

describe('the heat pump', () => {
  const pump = (over: Partial<HeatPumpInputs>) => ({heatPump: {...({} as HeatPumpInputs), present: true, ...over}});

  test('offline is critical and names its maker, or "Heat pump" when its device names none', () => {
    expect(run(heatPumpOffline, pump({available: false, brand: 'Fujitsu'}))).toEqual({
      item: {
        level: 'crit',
        key: 'heatPumpOffline',
        title: 'Heat pump offline',
        line: 'The Fujitsu unit shows as unavailable in Home Assistant.',
      },
    });
    expect(run(heatPumpOffline, pump({available: false, brand: null}))?.item?.line).toBe(
      'The Heat pump unit shows as unavailable in Home Assistant.',
    );
  });

  test('online says so; a unit the config names but the states lack is no check', () => {
    expect(run(heatPumpOffline, pump({available: true}))).toEqual({clear: 'Heat pump online'});
    expect(run(heatPumpOffline, pump({present: false}))).toBeNull();
  });
});

describe('the Hilo gateway', () => {
  const gateway = (on: boolean, disconnected: boolean) => ({hilo: {...house.hilo, gateway: {on, disconnected}}});

  test('is critical when off or disconnected, and online only when on and connected', () => {
    expect(run(hiloGatewayOffline, gateway(false, false))?.item).toMatchObject({
      level: 'crit',
      title: 'Hilo gateway offline',
    });
    expect(run(hiloGatewayOffline, gateway(true, true))?.item?.title).toBe('Hilo gateway offline');
    expect(run(hiloGatewayOffline, gateway(true, false))).toEqual({clear: 'Hilo gateway online'});
  });
});

describe('thermostats not reporting', () => {
  const rooms = house.power.rooms;

  test('names the unavailable ones in the config’s order, one plural title', () => {
    const down = rooms.map((room, i) => (i < 2 ? {...room, available: false} : room));
    expect(run(thermostatsNotReporting, {power: {...house.power, rooms: down}})).toEqual({
      item: {
        level: 'warn',
        key: 'thermostatsNotReporting',
        title: '2 thermostats not reporting',
        line: 'Bedroom, Garage',
      },
    });
    const one = rooms.map((room, i) => (i === 3 ? {...room, available: false} : room));
    expect(run(thermostatsNotReporting, {power: {...house.power, rooms: one}}, frDeps)?.item?.title).toBe(
      '1 thermostat ne répond pas',
    );
  });

  test('a thermostat missing from the states is not one; with none there, the check does not apply', () => {
    const missing = rooms.map(room => ({...room, present: false, available: false}));
    expect(run(thermostatsNotReporting, {power: {...house.power, rooms: missing}})).toBeNull();
    expect(run(thermostatsNotReporting, {})).toEqual({});
  });
});

describe('the critical peak', () => {
  test('in progress is critical and wins over one coming, which warns', () => {
    expect(run(criticalPeak, {hydroQuebec: hq({peakNow: true, peakUpcoming: true})})?.item).toMatchObject({
      level: 'crit',
      title: 'Critical peak in progress',
    });
    expect(run(criticalPeak, {hydroQuebec: hq({peakUpcoming: true})})?.item).toMatchObject({
      level: 'warn',
      title: 'Critical peak coming',
    });
  });

  test('none says so only when the peak sensor has a value', () => {
    expect(run(criticalPeak, {hydroQuebec: hq()})).toEqual({clear: 'No critical peak'});
    expect(run(criticalPeak, {hydroQuebec: hq({peakReporting: false})})).toEqual({});
  });
});

describe('weather warnings', () => {
  test('a count warns in a plural line; zero says no alerts', () => {
    expect(run(weatherWarnings, {weatherWarnings: 2})?.item?.line).toBe(
      'Environment Canada has 2 warnings for your area.',
    );
    expect(run(weatherWarnings, {weatherWarnings: 1})?.item?.line).toBe(
      'Environment Canada has 1 warning for your area.',
    );
    expect(run(weatherWarnings, {weatherWarnings: 0})).toEqual({clear: 'No weather alerts'});
  });
});

describe('the car', () => {
  test('tire pressure is low when the sensor or any tire is not normal; a sensor with no value says nothing', () => {
    expect(run(tirePressureLow, {})).toEqual({});
    expect(run(tirePressureLow, {car: {...car, tireStatus: 'LOW'}})?.item?.title).toBe('Tire pressure low');
    const low = {...car.tires, rearLeft: {psi: 30, state: 'LOW'}};
    expect(run(tirePressureLow, {car: {...car, tires: low}})?.item?.title).toBe('Tire pressure low');
    expect(run(tirePressureLow, {car: {...car, tireStatus: null, tires: low}})).toEqual({});
  });

  test('unlocked warns; any other word of the lock is "Car locked"; a lock with no value says nothing', () => {
    expect(run(carUnlocked, {car: {...car, lockState: 'unlocked'}})?.item).toMatchObject({
      title: 'Car unlocked',
      line: 'Lock it from the car view.',
    });
    expect(run(carUnlocked, {car: {...car, lockState: 'jammed'}})).toEqual({clear: 'Car locked'});
    expect(run(carUnlocked, {car: {...car, lockState: null}})).toEqual({});
  });

  test('not reporting when the charge reads nothing', () => {
    expect(run(carNotReporting, {})).toEqual({});
    expect(run(carNotReporting, {car: {...car, soc: null}})?.item?.title).toBe('Car not reporting');
  });

  test('a house without a car has none of the three', () => {
    for (const check of [tirePressureLow, carUnlocked, carNotReporting]) expect(run(check, {car: null})).toBeNull();
  });
});

describe('the door and motion sensors', () => {
  test('a door open for more than ten minutes, one item each, with how long; at ten minutes, not yet', () => {
    const open = (since: number) => sensor({on: true, since});
    expect(run(doorOpenTenMinutes, {sensors: [open(NOW - DOOR_OPEN_MS)]})).toEqual({items: []});
    expect(run(doorOpenTenMinutes, {sensors: [open(NOW - DOOR_OPEN_MS - 1)], now: NOW})).toEqual({
      items: [{level: 'warn', key: 'door:binary_sensor.back_door', title: 'Back door open', line: 'Open for 10 min.'}],
    });
    expect(run(doorOpenTenMinutes, {sensors: [open(NOW - 2 * 3_600_000)]}, frDeps)?.items?.[0]?.line).toBe(
      'Ouverte depuis 2 h.',
    );
  });

  test('a motion sensor is never an open door, and without a door the open-door and doors-closed checks do not apply', () => {
    const motion = sensor({kind: 'motion', on: true, since: 0});
    expect(run(doorOpenTenMinutes, {sensors: [motion]})).toBeNull();
    expect(run(doorsClosed, {sensors: [motion]})).toBeNull();
  });

  test('doors closed only when no door is open', () => {
    expect(run(doorsClosed, {sensors: [sensor({})]})).toEqual({clear: 'Doors closed'});
    expect(run(doorsClosed, {sensors: [sensor({}), sensor({id: 'binary_sensor.side', on: true})]})).toEqual({});
  });

  test('an unavailable sensor of either kind is offline', () => {
    expect(run(sensorOffline, {sensors: [sensor({kind: 'motion', name: 'Hall motion', available: false})]})).toEqual({
      items: [
        {
          level: 'warn',
          key: 'offline:binary_sensor.back_door',
          title: 'Hall motion offline',
          line: 'The sensor is unavailable in Home Assistant.',
        },
      ],
    });
    expect(run(sensorOffline, {sensors: []})).toBeNull();
  });

  test('a battery under 15 percent is low, rounded; 15 is not', () => {
    const at = (battery: number | null) => run(sensorBatteryLow, {sensors: [sensor({battery})]});
    expect(at(BATTERY_LOW_PERCENT)).toEqual({items: []});
    expect(at(null)).toEqual({items: []});
    expect(at(14.6)).toEqual({
      items: [
        {level: 'warn', key: 'battery:binary_sensor.back_door', title: 'Back door battery low', line: '15% left.'},
      ],
    });
    expect(run(sensorBatteryLow, {sensors: []})).toBeNull();
  });
});

describe('the Wallbox', () => {
  test('offline when its status sensor is there with no value; a house without one has no check', () => {
    expect(run(wallboxOffline, {})).toEqual({});
    expect(run(wallboxOffline, {wallbox: {...house.wallbox, status: null}})?.item?.title).toBe('Wallbox offline');
    expect(run(wallboxOffline, {wallbox: {...house.wallbox, status: null, statusPresent: false}})).toBeNull();
  });
});

describe('the chain', () => {
  test('is the fourteen rules in the legacy order', () => {
    expect(CHECKS.map(check => check.key)).toEqual([
      'hydroQuebecStale',
      'heatPumpOffline',
      'hiloGatewayOffline',
      'thermostatsNotReporting',
      'criticalPeak',
      'weatherWarnings',
      'tirePressureLow',
      'carUnlocked',
      'carNotReporting',
      'doorOpenTenMinutes',
      'sensorOffline',
      'sensorBatteryLow',
      'doorsClosed',
      'wallboxOffline',
    ]);
  });

  test('keeps the chain’s order for items and phrases alike, and skips a rule that does not apply', () => {
    const inputs: LiveInputs = {
      ...house,
      hydroQuebec: hq({peakNow: true}),
      weatherWarnings: 0,
      car: {...car, soc: null},
      wallbox: {...house.wallbox, status: null},
    };
    const {items, clear} = runChecks(inputs, deps);
    expect(items.map(item => item.key)).toEqual(['criticalPeak', 'carNotReporting', 'wallboxOffline']);
    expect(clear).toEqual(['Hydro-Québec updating', 'No weather alerts', 'Car locked', 'Doors closed']);
  });
});
