// fordpass: how the car is found, and what it reads into: the charge and the plug, the range's fallback, the name, the tires in any unit, the doors,
// Ford's messages with a malformed date, the last plug-in and the departure schedule. The test house gives today's answer as literals; literal houses
// give the rules it does not exercise. `car-departure.spec.ts`'s malformed-data case is the twin of the two malformed-data tests below.
import {describe, expect, test} from 'vitest';
import {FULL_CFG} from '../../e2e/houses.ts';
import {entity} from '../fake-hass.ts';
import {fullHouse, houseOf, NOW, storeOf} from '../features/media/support.ts';
import {
  carEntityIds,
  departureSchedule,
  findCar,
  readCar,
  tirePsi,
  type CarRef,
} from '../../../src/providers/fordpass.ts';

type State = ReturnType<typeof entity>;

const NO_NAME = {car: {name: null, color: null, battery_kwh: null}};
const ref = findCar({'sensor.fordpass_test_soc': entity('sensor.fordpass_test_soc', '64')}) as CarRef;
const soc = entity('sensor.fordpass_test_soc', '64');

/** A car made of `soc` and these states, read with the real name resolver. */
const read = (states: State[] = [], config: Parameters<typeof readCar>[1] = NO_NAME) => {
  const hass = houseOf([], [soc, ...states]);
  return readCar(hass.states, config, storeOf(hass).names, ref);
};
const sensor = (key: string, state: string, attributes: Record<string, unknown> = {}) =>
  entity(`sensor.fordpass_test_${key}`, state, attributes);

describe('findCar', () => {
  test('is the first sensor.fordpass_<name>_soc, and its prefix names the other entities', () => {
    const states = Object.fromEntries(
      ['sensor.fordpass_one_soc', 'sensor.fordpass_two_soc'].map(id => [id, entity(id, '50')]),
    );
    const car = findCar(states);
    expect(car?.prefix).toBe('fordpass_one');
    expect(car?.id('lock', 'doorlock')).toBe('lock.fordpass_one_doorlock');
  });

  test('is null where nothing matches the whole pattern', () => {
    const ids = [
      'sensor.fordpass_test_soc_extra',
      'sensor.fordpass_Test_soc',
      'sensor.fordpass_soc',
      'sensor.other_soc',
      'binary_sensor.fordpass_test_soc',
    ];
    expect(findCar(Object.fromEntries(ids.map(id => [id, entity(id, '1')])))).toBeNull();
    expect(findCar({})).toBeNull();
  });

  test('is found in the test house', () => {
    expect(findCar(fullHouse.states)?.prefix).toBe('fordpass_test');
  });
});

describe('the test house', () => {
  test('its car: 64 % and 280 km, charging and plugged in, locked at home, limit 90 %, tires 240 kPa guessed from size', () => {
    const store = storeOf(fullHouse, FULL_CFG);
    const car = readCar(fullHouse.states, store.config, store.names, findCar(fullHouse.states) as CarRef);
    expect(car).toMatchObject({
      name: '',
      picture: null,
      color: '#B03A2E',
      soc: 64,
      range: 280,
      limit: 90,
      plugged: true,
      charging: true,
      chargeState: 'CHARGING',
      locked: true,
      home: true,
      tracker: 'home',
      odometer: 12000,
      lastRefresh: NOW - 600e3,
      messages: [],
      lastPlug: null,
      schedule: null,
      departureOn: null,
    });
    expect(Object.values(car.tires).map(tire => tire.psi?.toFixed(1))).toEqual(['34.8', '35.0', '34.5', '34.7']);
  });
});

describe('the charge and the plug', () => {
  test('plugged is any plug state but DISCONNECTED; an unreadable plug is not plugged', () => {
    const plugged = (state: string | null) => read(state === null ? [] : [sensor('elvehplug', state)]).plugged;
    expect([
      plugged('CONNECTED'),
      plugged('DISCONNECTED'),
      plugged('unavailable'),
      plugged('unknown'),
      plugged(null),
    ]).toEqual([true, false, false, false, false]);
  });

  test('charging is CHARGING and not NOT_CHARGING; the state and the power are kept as Ford words them', () => {
    const car = (state: string | null) =>
      read(state === null ? [] : [sensor('elvehcharging', state, {chargingkW: 7.2, globalAcTargetSoc: 80})]);
    expect(car('CHARGING')).toMatchObject({charging: true, chargeState: 'CHARGING', chargingKw: 7.2, limit: 80});
    expect(car('NOT_CHARGING')).toMatchObject({charging: false, chargeState: 'NOT_CHARGING'});
    expect(car('unavailable')).toMatchObject({charging: false, chargeState: null, chargingKw: 7.2});
    expect(car(null)).toMatchObject({charging: false, chargeState: null, chargingKw: null, limit: null});
  });

  test('the range is the charge sensor’s batteryRange, else the elveh sensor’s state, else none', () => {
    const soc = (attributes: Record<string, unknown>) => sensor('soc', '64', attributes);
    expect(read([soc({batteryRange: 280}), sensor('elveh', '250')]).range).toBe(280);
    expect(read([soc({}), sensor('elveh', '250')]).range).toBe(250);
    expect(read([soc({batteryRange: 'far'}), sensor('elveh', 'unavailable')]).range).toBeNull();
  });

  test('locked, at home and where: each is null until Home Assistant has a value', () => {
    expect(read()).toMatchObject({locked: null, home: null, tracker: null, lockAvailable: false});
    const car = (lock: string, tracker: string) =>
      read([entity('lock.fordpass_test_doorlock', lock), entity('device_tracker.fordpass_test_tracker', tracker)]);
    expect(car('locked', 'home')).toMatchObject({locked: true, home: true, tracker: 'home', lockAvailable: true});
    // the lock's own word, for the Status checks: a jammed lock is not "unlocked"
    expect(car('jammed', 'home')).toMatchObject({locked: false, lockState: 'jammed'});
    expect(car('unlocked', 'not_home')).toMatchObject({locked: false, home: false, tracker: 'not_home'});
    expect(car('unavailable', 'unknown')).toMatchObject({
      locked: null,
      home: null,
      tracker: null,
      lockAvailable: false,
    });
    expect(car('unlocked', 'Office')).toMatchObject({home: false, tracker: 'Office'});
  });

  test('the AC limit is the number entity, else the charging sensor’s attribute; the battery reads the elveh and charging attributes', () => {
    const charging = sensor('elvehcharging', 'CHARGING', {globalAcCurrentLimit: 32, batteryTemperature: 21.5});
    const elveh = sensor('elveh', '250', {
      batteryEnergyRemaining: 50.1,
      maximumBatteryCapacity: 80,
      maximumBatteryRange: 400,
    });
    expect(read([charging, elveh, entity('number.fordpass_test_globalaccurrentlimit', '16')]).acLimit).toBe(16);
    const car = read([charging, elveh]);
    expect(car.acLimit).toBe(32);
    expect(car.battery).toEqual({remainingKwh: 50.1, capacityKwh: 80, temperature: 21.5, fullRangeKm: 400});
    expect(read().acLimit).toBeNull();
    expect(read().battery).toEqual({remainingKwh: null, capacityKwh: null, temperature: null, fullRangeKm: null});
  });

  test('the cabin, the outside, the odometer and the 12 V battery are numbers or null', () => {
    const car = read([
      sensor('cabintemperature', '21.5'),
      sensor('outsidetemp', '-4'),
      sensor('odometer', '12345'),
      sensor('battery', '88', {batteryVoltage: 12.6}),
    ]);
    expect(car).toMatchObject({cabin: 21.5, outsideTemp: -4, odometer: 12345, battery12: {percent: 88, volts: 12.6}});
    expect(read()).toMatchObject({
      cabin: null,
      outsideTemp: null,
      odometer: null,
      battery12: {percent: null, volts: null},
    });
  });

  test('when the car last checked in is a time, or null when Ford sends something else', () => {
    expect(read([sensor('lastrefresh', '2026-11-07T14:00:00Z')]).lastRefresh).toBe(Date.parse('2026-11-07T14:00:00Z'));
    expect(read([sensor('lastrefresh', 'yesterday')]).lastRefresh).toBeNull();
    expect(read([sensor('lastrefresh', 'unavailable')]).lastRefresh).toBeNull();
    expect(read().lastRefresh).toBeNull();
  });
});

describe('the name and the picture', () => {
  const image = (name: string, picture?: string) =>
    entity('image.fordpass_test_vehicleimage', 'unknown', {friendly_name: name, entity_picture: picture});

  test('the config’s name wins; else the picture entity’s name without "Vehicle Picture"; else none', () => {
    const named = {car: {name: 'Bolt', color: null, battery_kwh: null}};
    expect(read([image('Test Mach-E Vehicle Picture')], named).name).toBe('Bolt');
    expect(read([image('Test Mach-E Vehicle Picture')]).name).toBe('Test Mach-E');
    expect(read([image('Mach-E vehicle picture')]).name).toBe('Mach-E');
    expect(read().name).toBe('');
  });

  test('the picture is the entity’s entity_picture, or null', () => {
    expect(read([image('Car', '/api/image_proxy/image.fordpass_test_vehicleimage?token=x')]).picture).toBe(
      '/api/image_proxy/image.fordpass_test_vehicleimage?token=x',
    );
    expect(read([image('Car', '')]).picture).toBeNull();
    expect(read([image('Car')]).picture).toBeNull();
  });
});

describe('tirePsi', () => {
  test.each([
    ['psi', '43.8 psi', 43.8],
    ['PSI in capitals', '43.8 PSI', 43.8],
    ['bar', '3.02 bar', 43.8],
    ['kPa', '302 kPa', 43.8],
    ['Pa', '302000 Pa', 43.8],
    ['a bare number above 1,000 is pascals', 302000, 43.8],
    ['a bare number from 101 to 1,000 is kilopascals', '302', 43.8],
    ['a bare number under 10 is bars', 3.02, 43.8],
    ['a bare number from 10 to 100 is psi', 44, 44],
  ])('%s', (_name, raw, psi) => {
    expect(tirePsi(raw)).toBeCloseTo(psi, 1);
  });

  test('the edges of the guess: 1,000 is kilopascals, 100 is psi, 10 is psi', () => {
    expect(tirePsi(1000)).toBeCloseTo(145.038, 3);
    expect(tirePsi(100)).toBe(100);
    expect(tirePsi(10)).toBe(10);
  });

  test('is null where there is no number: a word, nothing, or digits that do not make one', () => {
    expect([
      tirePsi('NORMAL'),
      tirePsi(undefined),
      tirePsi(null),
      tirePsi(''),
      tirePsi('.'),
      tirePsi('1.2.3 psi'),
    ]).toEqual([null, null, null, null, null, null]);
  });
});

describe('the tires, the doors and the chips', () => {
  test('each tire is its pressure in psi and Ford’s word for it', () => {
    const car = read([
      sensor('tirepressure', 'NORMAL_OPERATION', {
        frontLeft: '43.8 psi',
        frontLeft_state: 'NORMAL',
        frontRight: '3.0 bar',
        frontRight_state: 'LOW',
        rearLeft: 'n/a',
      }),
    ]);
    expect(car.tires.frontLeft).toEqual({psi: 43.8, state: 'NORMAL'});
    expect(car.tireStatus).toBe('NORMAL_OPERATION');
    expect(car.tires.frontRight.state).toBe('LOW');
    expect(car.tires.frontRight.psi).toBeCloseTo(43.5, 1);
    expect(car.tires.rearLeft).toEqual({psi: null, state: null});
    expect(car.tires.rearRight).toEqual({psi: null, state: null});
  });

  test('the doors are closed when each of the four is CLOSED or not reported; the open ones are named; the hood and the tailgate are their own', () => {
    expect(
      read([sensor('doorstatus', 'Closed', {driverFront: 'CLOSED', hood: 'CLOSED', tailgate: 'CLOSED'})]).doors,
    ).toEqual({
      closed: true,
      open: [],
      hoodTailgateClosed: true,
    });
    expect(
      read([sensor('doorstatus', 'Open', {rearLeft: 'OPEN', tailgate: 'AJAR', rearRight: 'CLOSED'})]).doors,
    ).toEqual({
      closed: false,
      open: ['rearLeft', 'tailgate'],
      hoodTailgateClosed: false,
    });
    expect(read([sensor('doorstatus', 'Open', {hood: 'OPEN'})]).doors).toMatchObject({
      closed: true,
      hoodTailgateClosed: false,
    });
    expect(read([sensor('doorstatus', 'unavailable', {rearLeft: 'OPEN'})]).doors).toEqual({
      closed: null,
      open: [],
      hoodTailgateClosed: null,
    });
    expect(read().doors).toEqual({closed: null, open: [], hoodTailgateClosed: null});
  });

  test('the windows, the alarm and the gear are null until Home Assistant has a value', () => {
    expect(read([sensor('windowposition', 'Closed')]).windowsClosed).toBe(true);
    expect(read([sensor('windowposition', 'Open')]).windowsClosed).toBe(false);
    expect(read().windowsClosed).toBeNull();
    const car = read([sensor('alarm', 'DISARMED'), sensor('gearleverposition', 'PARK')]);
    expect([car.alarm, car.gear]).toEqual(['DISARMED', 'PARK']);
    expect([read().alarm, read().gear]).toEqual([null, null]);
  });

  test('the firmware has a version and the day it was installed; the updates switch is on, off or null', () => {
    const firmware = (state: string, attributes: Record<string, unknown> = {}) =>
      read([sensor('lastfirmwareupdate', state, attributes)]).firmware;
    expect(firmware('2026-10-01T12:00:00Z', {firmwareVersion: '1.2.3'})).toEqual({
      version: '1.2.3',
      since: Date.parse('2026-10-01T12:00:00Z'),
    });
    expect(firmware('unavailable', {firmwareVersion: '1.2.3'})).toEqual({version: '1.2.3', since: null});
    expect(firmware('soon')).toEqual({version: null, since: null});
    expect(read().firmware).toBeNull();
    const updates = (state: string) => read([entity('switch.fordpass_test_autosoftwareupdates', state)]).autoUpdates;
    expect([updates('on'), updates('off'), updates('unavailable'), read().autoUpdates]).toEqual([
      true,
      false,
      null,
      null,
    ]);
  });
});

describe("Ford's malformed data", () => {
  const messages = (json_src: unknown) => read([sensor('messages', '2', {json_src})]).messages;

  test('a message with a date that is not one still reads, with no date', () => {
    expect(
      messages([
        {messageSubject: 'Service due', createdDate: 'not a date', messageBody: 'Book a visit'},
        {messageSubject: 'Tyre check', createdDate: '2026-11-06T22:00:00Z', messageBody: 'Look at the tyres'},
      ]),
    ).toEqual([
      {subject: 'Service due', body: 'Book a visit', created: null},
      {subject: 'Tyre check', body: 'Look at the tyres', created: Date.parse('2026-11-06T22:00:00Z')},
    ]);
  });

  test('a date as milliseconds reads; no date, a missing text and an item that is no object read as nothing', () => {
    expect(
      messages([
        {messageSubject: 'a', messageBody: 'b', createdDate: 1_762_500_000_000},
        {messageSubject: 'c', messageBody: 'd'},
        {messageSubject: 5, createdDate: {}},
      ]),
    ).toEqual([
      {subject: 'a', body: 'b', created: 1_762_500_000_000},
      {subject: 'c', body: 'd', created: null},
      {subject: '', body: '', created: null},
    ]);
    expect(messages([null])).toEqual([{subject: '', body: '', created: null}]);
  });

  test('only the first three are read, and a list that is none gives none', () => {
    expect(messages(Array.from({length: 5}, (_, i) => ({messageSubject: `m${i}`}))).map(m => m.subject)).toEqual([
      'm0',
      'm1',
      'm2',
    ]);
    expect(messages('none')).toEqual([]);
    expect(read().messages).toEqual([]);
  });

  test('a plug-in with no plug-out time still reads: the plug-out is null, the battery is not a pair', () => {
    const plug = (attributes: Record<string, unknown>) =>
      read([sensor('energytransferlogentry', 'done', attributes)]).lastPlug;
    expect(plug({plugDetails: {plugInTime: '2026-11-06T22:00:00Z'}, stateOfCharge: 80})).toEqual({
      plugIn: Date.parse('2026-11-06T22:00:00Z'),
      plugOut: null,
      firstSoc: null,
      lastSoc: null,
      rangeAddedKm: null,
      pluggedHours: null,
    });
  });

  test('a plug-in as Ford reports it in full: the times, the charge before and after, the range added and the hours plugged in', () => {
    const lastPlug = read([
      sensor('energytransferlogentry', 'done', {
        plugDetails: {
          plugInTime: '2026-11-06T22:00:00Z',
          plugOutTime: '2026-11-07T04:00:00Z',
          totalDistanceAdded: 120.4,
          totalPluggedInTime: 21600,
        },
        stateOfCharge: {firstSOC: 20, lastSOC: 90},
      }),
    ]).lastPlug;
    expect(lastPlug).toEqual({
      plugIn: Date.parse('2026-11-06T22:00:00Z'),
      plugOut: Date.parse('2026-11-07T04:00:00Z'),
      firstSoc: 20,
      lastSoc: 90,
      rangeAddedKm: 120.4,
      pluggedHours: 6,
    });
  });

  test('a plug-in time that is not a date, and no hours plugged in, read as nothing; no plug details is no plug-in', () => {
    const plug = (plugDetails: unknown) => read([sensor('energytransferlogentry', 'done', {plugDetails})]).lastPlug;
    expect(plug({plugInTime: 'later', plugOutTime: 5, totalPluggedInTime: 0})).toMatchObject({
      plugIn: null,
      plugOut: 5,
      pluggedHours: null,
    });
    expect(plug('none')).toBeNull();
    expect(plug(undefined)).toBeNull();
    expect(read().lastPlug).toBeNull();
  });
});

describe('departureSchedule', () => {
  const statesWith = (schedule: unknown) => ({
    'sensor.fordpass_test_departureschedules': entity('sensor.fordpass_test_departureschedules', 'ok', {schedule}),
  });

  test('is the days Ford saved, in its order, with the first day’s time of day', () => {
    expect(
      departureSchedule(
        statesWith({
          monday: {timeOfDay: {hours: 8, minutes: 30}},
          friday: {timeOfDay: {hours: 7, minutes: 0}},
        }),
        ref,
      ),
    ).toEqual({days: ['monday', 'friday'], hours: 8, minutes: 30});
  });

  test('a day with no time of day, or an hour that is no number, is midnight; a number as text is read', () => {
    expect(departureSchedule(statesWith({monday: {}}), ref)).toEqual({days: ['monday'], hours: 0, minutes: 0});
    expect(departureSchedule(statesWith({monday: 'soon'}), ref)).toEqual({days: ['monday'], hours: 0, minutes: 0});
    expect(departureSchedule(statesWith({monday: {timeOfDay: {hours: 'x', minutes: '45'}}}), ref)).toEqual({
      days: ['monday'],
      hours: 0,
      minutes: 45,
    });
  });

  test('is null when Ford saved no days: an empty schedule, none, or something that is not one', () => {
    expect(departureSchedule(statesWith({}), ref)).toBeNull();
    expect(departureSchedule(statesWith(undefined), ref)).toBeNull();
    expect(departureSchedule(statesWith(['monday']), ref)).toBeNull();
    expect(departureSchedule({}, ref)).toBeNull();
  });

  test('is on the car: the switch is on, off or unread, and the control needs it read', () => {
    const car = (state: string | null) =>
      read(state === null ? [] : [entity('switch.fordpass_test_departuretimes', state)]);
    expect(car('on')).toMatchObject({departureOn: true, departureAvailable: true});
    expect(car('off')).toMatchObject({departureOn: false, departureAvailable: true});
    expect(car('unavailable')).toMatchObject({departureOn: null, departureAvailable: false});
    expect(car(null)).toMatchObject({departureOn: null, departureAvailable: false});
  });
});

describe('the comfort controls', () => {
  test('each switch is on, off or unread; a lock reads as on when locked', () => {
    const car = read([
      entity('switch.fordpass_test_ignition', 'on'),
      entity('switch.fordpass_test_rccdefrostfront', 'off'),
      entity('switch.fordpass_test_rccdefrostrear', 'unavailable'),
    ]);
    expect(car.comfort).toEqual({
      ignition: {on: true, available: true},
      defrostFront: {on: false, available: true},
      defrostRear: {on: false, available: false},
      wheel: {on: false, available: false},
    });
  });

  test('the remote start’s cabin setting and the seat are Ford’s words, or null', () => {
    const car = read([
      entity('select.fordpass_test_rcctemperature', 'low'),
      entity('select.fordpass_test_rccseatfrontleft', 'heated2'),
    ]);
    expect([car.remoteCabin, car.seats]).toEqual(['low', 'heated2']);
    expect([read().remoteCabin, read().seats]).toEqual([null, null]);
  });

  test('the honk button is the first of the two the car has, one that reads unknown counting, one unavailable not', () => {
    const honk = (...states: State[]) => read(states).honkButton;
    const button = (key: string, state: string) => entity(`button.fordpass_test_${key}`, state);
    expect(honk(button('hafdefault', '2026-11-07T14:00:00Z'), button('hafshort', 'unknown'))).toBe(
      'button.fordpass_test_hafdefault',
    );
    expect(honk(button('hafdefault', 'unavailable'), button('hafshort', 'unknown'))).toBe(
      'button.fordpass_test_hafshort',
    );
    expect(honk(button('hafdefault', 'unavailable'))).toBeNull();
    expect(honk()).toBeNull();
  });
});

describe('carEntityIds', () => {
  test('is every entity of the car, once, under its prefix', () => {
    const ids = carEntityIds(ref);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('sensor.fordpass_test_soc');
    expect(ids).toContain('lock.fordpass_test_doorlock');
    expect(ids.every(id => /^[a-z_]+\.fordpass_test_[a-z0-9]+$/.test(id))).toBe(true);
  });
});
