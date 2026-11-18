// carModel: the phone's line and the detail's read-only blocks (the summary, the status, the history row and its bars, the sessions, the last plug-in, Ford's messages) from the test house, from literal houses for each shape the test house does not show (a car with all its
// sensors, one plugged in, one unplugged, one with none), and from the recorded house when the owner has one; in English and in French, where the words and the numbers are French's own.
import {describe, expect, test} from 'vitest';
import type {CarHistoryData} from '../../../../src/features/car/history.ts';
import {readCarFeature} from '../../../../src/features/car/inputs.ts';
import {carModel, isHistoryWindow, type CarModelDeps} from '../../../../src/features/car/model.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import {entity, fakeHass, type FakeHass} from '../../fake-hass.ts';
import {depsOf, fullHouse, houseOf, recorded, storeOf, type Language} from '../media/support.ts';

const HOUR = 36e5;
const at = (iso: string) => Date.parse(iso);

/** The model of a house, as the panel gives it: the store's catalog, formats and names, in a language, the table on its latest ten. */
function modelOf(
  hass: FakeHass,
  history: CarHistoryData | null = null,
  extra: Partial<CarModelDeps> & {language?: Language; config?: object} = {},
) {
  const {language = 'en', config = FULL_CFG, ...rest} = extra;
  const store = storeOf(hass, config);
  const {t, fmt} = depsOf(hass, language);
  const inputs = readCarFeature(hass.states, store.config, store.names);
  return carModel(inputs, history, {t, fmt, allSessions: false, historyWindow: 'year', historyError: null, ...rest});
}

const PREFIX = 'fordpass_t';
const car = (domain: string, key: string, state: string | number, attributes: Record<string, unknown> = {}) =>
  entity(`${domain}.${PREFIX}_${key}`, String(state), attributes);

/** A house with a FordPass car that has every sensor the model reads; `over` replaces a sensor by `domain.key`. */
function carHouse(over: Record<string, ReturnType<typeof entity> | null> = {}, picture = '/api/image_proxy/image.t') {
  const states = [
    car('sensor', 'soc', 64, {batteryRange: 280}),
    car('sensor', 'elveh', 280, {batteryEnergyRemaining: 55, maximumBatteryCapacity: 88, maximumBatteryRange: 400}),
    car('sensor', 'elvehcharging', 'CHARGING', {
      globalAcTargetSoc: 90,
      chargingkW: 7.2,
      batteryTemperature: 20,
      globalAcCurrentLimit: 32,
    }),
    car('sensor', 'elvehplug', 'CONNECTED'),
    car('sensor', 'doorstatus', 'CLOSED', {
      driverFront: 'CLOSED',
      passengerFront: 'CLOSED',
      hood: 'CLOSED',
      tailgate: 'CLOSED',
    }),
    car('sensor', 'windowposition', 'Closed'),
    car('sensor', 'alarm', 'DISARMED'),
    car('sensor', 'gearleverposition', 'PARK'),
    car('sensor', 'tirepressure', 'NORMAL_OPERATION', {
      frontLeft: '3.02 bar',
      frontRight: '302 kPa',
      rearLeft: '43.8 psi',
      rearRight: '3.1',
      frontLeft_state: 'NORMAL',
      rearRight_state: 'LOW',
    }),
    car('sensor', 'battery', 87, {batteryVoltage: 12.4}),
    car('sensor', 'lastfirmwareupdate', '2026-11-01T12:00:00Z', {firmwareVersion: '3.4.1'}),
    car('sensor', 'lastrefresh', '2026-11-09T21:05:00Z'),
    car('sensor', 'cabintemperature', 21.5),
    car('sensor', 'outsidetemp', 5),
    car('sensor', 'odometer', 12345),
    car('sensor', 'messages', 'ok', {
      json_src: [
        {
          messageSubject: 'Tire Pressure Monitor System Warning',
          createdDate: '2026-11-06T22:00:00Z',
          messageBody:
            'The Tire Pressure Monitoring System has detected one or more tires are significantly under-inflated.',
        },
        {messageSubject: 'Service due', createdDate: 'not a date', messageBody: 'Book a visit'},
      ],
    }),
    car('sensor', 'energytransferlogentry', 'ok', {
      plugDetails: {
        plugInTime: '2026-11-06T22:00:00Z',
        plugOutTime: '2026-11-07T00:00:00Z',
        totalDistanceAdded: 150.4,
        totalPluggedInTime: 7200,
      },
      stateOfCharge: {firstSOC: 20, lastSOC: 90},
    }),
    car('sensor', 'departureschedules', 'ok', {
      schedule: Object.fromEntries(
        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].map(day => [
          day,
          {timeOfDay: {hours: 8, minutes: 30}},
        ]),
      ),
    }),
    car('number', 'globalaccurrentlimit', 32),
    car('lock', 'doorlock', 'locked'),
    car('device_tracker', 'tracker', 'home'),
    car('switch', 'autosoftwareupdates', 'on'),
    car('switch', 'departuretimes', 'on'),
    entity(`image.${PREFIX}_vehicleimage`, 'unknown', {entity_picture: picture, friendly_name: 'Test Vehicle Picture'}),
  ];
  // keyed as the overrides are: `sensor.soc` for `sensor.fordpass_t_soc`
  const byKey = new Map(states.map(state => [state.entity_id.replace(`${PREFIX}_`, ''), state]));
  for (const [key, replacement] of Object.entries(over)) {
    if (replacement) byKey.set(key, replacement);
    else byKey.delete(key);
  }
  return houseOf([], [...byKey.values(), entity('sensor.charger_status', 'Charging')]);
}

/** The `over` key of an entity of the car: `sensor.soc`. */
const without = (...keys: string[]) => Object.fromEntries(keys.map(key => [key, null]));

const session = (iso: string, hours: number, kwh: number, peak = 7.2) => ({
  start: at(iso),
  end: at(iso) + hours * HOUR,
  kwh,
  peak,
});

/** A year of history: three sessions in two months, and thirty days of charging. */
const history = (over: Partial<CarHistoryData> = {}): CarHistoryData => ({
  at: at('2026-11-09T12:00:00-05:00'),
  sessions: [
    session('2026-10-20T20:00:00-04:00', 3, 18),
    session('2026-11-06T17:00:00-05:00', 2, 14.46, 7.4),
    session('2026-11-08T09:00:00-05:00', 1, 6.04, 3.5),
  ],
  // 11 October to 9 November; the 8th charged 12.34 kWh and today 4.5
  daily: Array.from({length: 30}, (_, index) => ({
    day: new Date(Date.UTC(2026, 9, 11 + index)).toISOString().slice(0, 10),
    ev: index === 29 ? 4.5 : index === 28 ? 12.34 : 0,
  })),
  ...over,
});

describe('the test house, in English', () => {
  const vm = modelOf(fullHouse);

  test('the phone’s line, and the summary: the charge, the range, the bar with the limit Ford sets, charging and locked', () => {
    expect(vm.summary).toEqual({title: 'Car', line: 'Parked at home · 64% · 280 km · charging'});
    expect(vm).not.toHaveProperty('card');
    expect(vm.detail?.summary).toMatchObject({
      name: 'Car',
      picture: null,
      color: '#B03A2E',
      drawing: 'Car, side view',
      charge: '64',
      range: '280 km range',
      soc: {fill: 64, limit: 90, label: 'Battery 64 percent, charge limit 90 percent'},
      facts: [
        {text: 'Charging', tone: 'ok'},
        {text: 'Locked', tone: 'plain'},
      ],
    });
    expect(vm.detail?.summary.soc.scale).toEqual({start: '0%', limit: 'Limit 90% · set in FordPass', end: '100%'});
    expect(vm.none).toBeNull();
    expect(vm.error).toBeNull();
  });

  test('the detail has only what the house’s sensors give: the tire pressures and the odometer, no message from Ford, no plug-in yet', () => {
    const {detail} = vm;
    expect(detail?.sub).toMatch(/^Parked at home · locked · the car last checked in at \d+:\d\d [ap]m$/);
    expect(detail?.status.tires.map(({label, psi, state}) => [label, psi, state])).toEqual([
      ['Front left', '34.8', null],
      ['Front right', '35.0', null],
      ['Rear left', '34.5', null],
      ['Rear right', '34.7', null],
    ]);
    expect(detail?.status.title).toBe('Car status');
    expect(detail?.status).not.toHaveProperty('caption');
    expect(detail?.status.rows).toEqual([{label: 'Odometer', value: '12,000', unit: 'km', sub: '', word: false}]);
    expect(detail?.ford).toBeNull();
    expect(detail?.history).toEqual({
      title: 'Charging history',
      done: 'Done',
      windows: [
        {range: 'month', label: '30 days'},
        {range: 'year', label: 'Year'},
      ],
      line: '',
      value: '',
      daily: null,
    });
    expect(detail?.last).toEqual({
      title: 'Last plug-in',
      caption: "Ford hasn't reported a charging session yet.",
      tiles: [],
    });
  });
});

describe('the test house, in French', () => {
  const vm = modelOf(fullHouse, null, {language: 'fr'});

  test('the words are French’s and the numbers too: a comma, a narrow space before the percent sign, a thin space in thousands', () => {
    expect(vm.summary.line).toBe('Stationnée à la maison · 64 % · 280 km · en recharge');
    expect(vm.detail?.summary).toMatchObject({
      drawing: 'Voiture, vue de côté',
      range: "280 km d'autonomie",
      soc: {label: 'Batterie 64 pour cent, limite de charge 90 pour cent'},
    });
    expect(vm.detail?.summary.soc.scale.limit).toBe('Limite 90 % · réglée dans FordPass');
    expect(vm.detail?.summary.facts.map(({text}) => text)).toEqual(['Recharge', 'Verrouillée']);
    expect(vm.detail?.status.tires[0].psi).toBe('34,8');
    expect(vm.detail?.status.rows.map(({label, value}) => [label, value])).toEqual([['Odomètre', '12 000']]);
    expect(vm.detail?.last.caption).toBe("Ford n'a pas encore signalé de session de recharge.");
  });
});

describe('a car with every sensor', () => {
  const vm = modelOf(carHouse(), history());
  const detail = vm.detail!;

  test('the summary’s name is the picture’s without "Vehicle Picture"; the history row and its 30 days of bars', () => {
    expect(detail.summary).toMatchObject({name: 'Test', picture: '/api/image_proxy/image.t'});
    expect(detail.history).toMatchObject({title: 'Charging history', line: '3 sessions · 39 kWh', value: '$3'});
    const daily = detail.history.daily;
    expect(daily?.values).toHaveLength(30);
    expect(daily?.values.slice(-3)).toEqual([0, 12.34, 4.5]);
    expect(daily?.days.slice(-3)).toEqual(['Nov 7', 'Nov 8', 'Nov 9']);
    expect(daily?.days[0]).toBe('Oct 11');
    expect(daily?.label).toBe('Daily kWh bars, highest 12.3 kWh');
    // only one day is over 5 kWh; 12.34 + 4.5 is 17 kWh; the line says whose figures they are: the car's, where the card under it is the charger's
    expect(daily?.line).toBe('Car energy, last 30 days: 1 charging day, 17 kWh.');
  });

  test('the daily line groups the thousands of kWh as the locale does, through the formatters', () => {
    const month = history({
      daily: Array.from({length: 30}, (_, index) => ({
        day: new Date(Date.UTC(2026, 9, 11 + index)).toISOString().slice(0, 10),
        ev: 40,
      })),
    });
    expect(modelOf(carHouse(), month).detail?.history.daily?.line).toBe(
      'Car energy, last 30 days: 30 charging days, 1,200 kWh.',
    );
    // French groups with a narrow no-break space
    expect(modelOf(carHouse(), month, {language: 'fr'}).detail?.history.daily?.line).toContain(
      '30 jours de recharge, 1\u202f200 kWh.',
    );
  });

  test('the title and the line under it say where the car is and when it last checked in, from the sensor and not the clock', () => {
    expect(detail.title).toBe('Test');
    expect(detail.sub).toBe('Parked at home · locked · the car last checked in at 4:05 pm');
  });

  test('the summary: the charge and the range, the bar with the limit, and the facts, charging with its power first', () => {
    expect(detail.summary).toMatchObject({
      charge: '64',
      range: '280 km range',
      name: 'Test',
      picture: '/api/image_proxy/image.t',
      color: '#B03A2E',
      drawing: 'Car, side view',
    });
    expect(detail.status.drawing).toBe('Car seen from above');
    expect(detail.status.color).toBe('#B03A2E');
    expect(detail.summary.soc).toEqual({
      fill: 64,
      limit: 90,
      label: 'Battery 64 percent, charge limit 90 percent',
      scale: {start: '0%', limit: 'Limit 90% · set in FordPass', end: '100%'},
    });
    expect(detail.summary.facts).toEqual([
      {text: 'Charging · 7.2\u00a0kW', tone: 'ok'},
      {text: 'Doors closed', tone: 'plain'},
      {text: 'Windows closed', tone: 'plain'},
      {text: 'Hood and tailgate closed', tone: 'plain'},
      {text: 'Locked', tone: 'plain'},
      {text: 'Alarm off', tone: 'plain'},
      {text: 'In park', tone: 'plain'},
    ]);
  });

  test('the status: four tires in psi, Ford’s word for the ones that gave one, and the details as rows, the battery’s kWh and temperature among them', () => {
    expect(detail.status.title).toBe('Car status');
    expect(detail.status.tires).toEqual([
      {label: 'Front left', psi: '43.8', unit: 'psi', state: {text: 'Normal', ok: true}},
      {label: 'Front right', psi: '43.8', unit: 'psi', state: null},
      {label: 'Rear left', psi: '43.8', unit: 'psi', state: null},
      {label: 'Rear right', psi: '45.0', unit: 'psi', state: {text: 'low', ok: false}},
    ]);
    expect(detail.status.rows).toEqual([
      {label: 'Odometer', value: '12,345', unit: 'km', sub: '', word: false},
      {label: 'Full range', value: '400', unit: 'km', sub: 'at 100%', word: false},
      {label: 'AC limit', value: '32', unit: 'A', sub: '', word: false},
      {label: 'Cabin', value: '21.5', unit: '°', sub: 'outside 5.0°', word: false},
      {label: '12 V battery', value: '87', unit: '%', sub: '12.4 V', word: false},
      {label: 'Usable energy', value: '55.0', unit: 'kWh', sub: 'of 88.0 kWh', word: false},
      {label: 'Battery temperature', value: '20.0', unit: '°', sub: '', word: false},
      {label: 'Software', value: '3.4.1', unit: '', sub: 'since Nov 1', word: true},
      {label: 'Auto updates', value: 'On', unit: '', sub: '', word: true},
    ]);
  });

  test('from Ford: the warning in the household’s words and a message whose date is not one; the departure is its own row now', () => {
    expect(detail.ford?.rows).toEqual([
      {
        title: 'Tire Pressure Monitor System Warning, Nov 6',
        body: 'The Tire Pressure Monitoring System has detected one or more tires are significantly under-inflated.',
      },
      {title: 'Service due', body: 'Book a visit'},
    ]);
  });

  test('the last plug-in: when, and four tiles; the Wallbox delivered what its sessions did while the car was plugged in', () => {
    expect(detail.last.title).toBe('Last plug-in, per Ford');
    expect(detail.last.caption).toBe('Nov 6, 5:00 pm to Nov 6, 7:00 pm');
    expect(detail.last.tiles).toEqual([
      {label: 'Battery', value: '20→90', unit: '%', sub: 'stopped at the limit', word: false},
      {label: 'Range added', value: '150', unit: 'km', sub: '', word: false},
      {label: 'Plugged in', value: '2.0', unit: 'h', sub: '', word: false},
      {label: 'Delivered', value: '14.5', unit: 'kWh', sub: 'per the Wallbox', word: false},
    ]);
  });

  test('the sessions: the sentence, four tiles, the months, the table’s latest first and its toggle absent under eleven', () => {
    const {sessions} = detail;
    // the sheet is already titled Charging history: its first card is Sessions
    expect(sessions.title).toBe('Sessions');
    expect(sessions.summary).toBe(
      '3 charging sessions on the Wallbox since Oct 20. Cost is estimated at the 7¢/kWh set in the Wallbox app.',
    );
    // 38.5 kWh in all, which rounds to 39, and $2.695 at 7 cents, which rounds to 3
    expect(sessions.tiles).toEqual([
      {label: 'Sessions', value: '3', unit: '', sub: 'since Oct 20', word: false},
      {label: 'Delivered', value: '39', unit: 'kWh', sub: '', word: false},
      {label: 'Average', value: '12.8', unit: 'kWh', sub: 'per session', word: false},
      {label: 'Est. cost', value: '$3', unit: '', sub: 'at 7¢/kWh', word: false},
    ]);
    expect(sessions.months).toEqual([
      {month: '2026-10', kwh: 18, count: 1},
      {month: '2026-11', kwh: 20.5, count: 2},
    ]);
    expect(sessions.columns).toEqual({
      date: 'Date',
      time: 'Time',
      length: 'Length',
      energy: 'Energy',
      peak: 'Peak',
      cost: 'Est. cost',
    });
    expect(sessions.rows[0]).toEqual({
      key: at('2026-11-08T09:00:00-05:00'),
      date: 'Sun, Nov 8',
      times: '9:00 am to 10:00 am',
      length: '1 h',
      energy: '6.0 kWh',
      barPx: 27,
      peak: '3.5\u00a0kW',
      cost: '$0.42',
    });
    expect(sessions.rows.map(row => row.date)).toEqual(['Sun, Nov 8', 'Fri, Nov 6', 'Tue, Oct 20']);
    expect(sessions.rows[2]).toMatchObject({length: '3 h', energy: '18.0 kWh', barPx: 74, cost: '$1.26'});
    expect(sessions.toggle).toBeNull();
  });

  test('a session that ends on a later day says so: both ends carry their date, a same-day one only the clock', () => {
    const week = history({
      sessions: [session('2026-11-07T11:20:00-05:00', 171, 40), session('2026-11-08T09:00:00-05:00', 1, 6)],
    });
    const {rows} = modelOf(carHouse(), week).detail!.sessions;
    expect(rows[0].times).toBe('9:00 am to 10:00 am');
    expect(rows[1].times).toBe('Nov 7, 11:20 am to Nov 14, 2:20 pm');
    expect(modelOf(carHouse(), week, {language: 'fr'}).detail!.sessions.rows[1].times).toBe(
      'De 7 nov., 11 h 20 à 14 nov., 14 h 20',
    );
  });

  test('a house with no history yet has no bars, no sessions and nothing delivered', () => {
    const early = modelOf(carHouse());
    expect(early.detail?.history).toEqual({
      title: 'Charging history',
      done: 'Done',
      windows: [
        {range: 'month', label: '30 days'},
        {range: 'year', label: 'Year'},
      ],
      line: '',
      value: '',
      daily: null,
    });
    expect(early.detail?.sessions).toMatchObject({summary: '', tiles: [], months: [], rows: [], toggle: null});
    expect(early.detail?.last.tiles[3]).toMatchObject({
      label: 'Delivered',
      value: 'No reading',
      unit: '',
      missing: true,
    });
  });

  test('no session in the year says so, and a dash for the average', () => {
    const none = modelOf(carHouse(), history({sessions: []})).detail?.sessions;
    expect(none?.summary).toBe('No charging sessions in the last year.');
    expect(none?.tiles).toEqual([
      {label: 'Sessions', value: '0', unit: '', sub: '', word: false},
      {label: 'Delivered', value: '0', unit: 'kWh', sub: '', word: false},
      {label: 'Average', value: 'No reading', unit: '', missing: true, sub: 'per session', word: false},
      {label: 'Est. cost', value: '$0', unit: '', sub: 'at 7¢/kWh', word: false},
    ]);
  });
});

describe('the history sheet’s window', () => {
  // the history's instant is Nov 9, 12:00 (-05:00), 17:00 UTC: thirty days before it is Oct 10, 17:00 UTC
  const sessions = [
    session('2026-09-15T12:00:00Z', 2, 10),
    session('2026-10-10T16:59:00Z', 2, 20),
    session('2026-10-10T17:00:00Z', 2, 5),
    session('2026-11-06T22:00:00Z', 2, 14.46),
    session('2026-11-08T14:00:00Z', 1, 6.04),
  ];
  const house = carHouse();

  test('Month keeps the sessions of the last 30 days, from the history’s own instant, and totals only those', () => {
    const month = modelOf(house, history({sessions}), {historyWindow: 'month'}).detail!.sessions;
    // the session a minute before the cut is out, the one exactly on it is in
    expect(month.rows.map(row => row.date)).toEqual(['Sun, Nov 8', 'Fri, Nov 6', 'Sat, Oct 10']);
    expect(month.tiles).toEqual([
      {label: 'Sessions', value: '3', unit: '', sub: 'since Oct 10', word: false},
      {label: 'Delivered', value: '26', unit: 'kWh', sub: '', word: false},
      {label: 'Average', value: '8.5', unit: 'kWh', sub: 'per session', word: false},
      {label: 'Est. cost', value: '$2', unit: '', sub: 'at 7¢/kWh', word: false},
    ]);
    expect(month.summary).toBe(
      '3 charging sessions on the Wallbox since Oct 10. Cost is estimated at the 7¢/kWh set in the Wallbox app.',
    );
  });

  test('Month has no months chart: it is the year’s', () => {
    expect(modelOf(house, history({sessions}), {historyWindow: 'month'}).detail!.sessions.months).toEqual([]);
    expect(modelOf(house, history({sessions}), {historyWindow: 'year'}).detail!.sessions.months).toHaveLength(3);
  });

  test('Year keeps all five sessions', () => {
    const year = modelOf(house, history({sessions}), {historyWindow: 'year'}).detail!.sessions;
    expect(year.rows).toHaveLength(5);
    expect(year.tiles[0]).toMatchObject({label: 'Sessions', value: '5', sub: 'since Sep 15'});
  });

  test('the row on the tab keeps saying the year in both windows', () => {
    const line = (historyWindow: 'month' | 'year') =>
      modelOf(house, history({sessions}), {historyWindow}).detail!.history.line;
    expect(line('month')).toBe('5 sessions · 56 kWh');
    expect(line('year')).toBe('5 sessions · 56 kWh');
  });

  test('a month with no session says so in its own words, though the year has some; the French too', () => {
    const old = [session('2026-08-01T12:00:00Z', 2, 10)];
    expect(modelOf(house, history({sessions: old}), {historyWindow: 'month'}).detail!.sessions).toMatchObject({
      summary: 'No charging sessions in the last 30 days.',
      rows: [],
    });
    expect(modelOf(house, history({sessions: old}), {historyWindow: 'year'}).detail!.sessions.rows).toHaveLength(1);
    const french = modelOf(house, history({sessions: old}), {historyWindow: 'month', language: 'fr'});
    expect(french.detail!.sessions.summary).toBe('Aucune session de recharge au cours des 30 derniers jours.');
    expect(french.detail!.history.windows.map(chosen => chosen.label)).toEqual(['30 jours', 'Année']);
  });

  test('the table’s latest ten and its toggle follow the window', () => {
    const many = Array.from({length: 12}, (_, index) =>
      session(`2026-11-0${1 + (index % 8)}T1${index % 10}:00:00Z`, 1, 1 + index),
    ).sort((a, b) => a.start - b.start);
    const month = modelOf(house, history({sessions: many}), {historyWindow: 'month'}).detail!.sessions;
    expect(month.rows).toHaveLength(10);
    expect(month.toggle).toBe('Show all 12 sessions');
  });
});

describe('the sessions’ table', () => {
  const many = (count: number) =>
    Array.from({length: count}, (_, index) => session(`2026-0${1 + (index % 9)}-15T12:00:00-05:00`, 1, 1 + index));
  const sorted = (count: number) => many(count).sort((a, b) => a.start - b.start);

  test('twelve sessions show the latest ten and offer all of them; all of them show twelve and offer the ten', () => {
    const house = carHouse();
    const latest = modelOf(house, history({sessions: sorted(12)})).detail!.sessions;
    expect(latest.rows).toHaveLength(10);
    expect(latest.toggle).toBe('Show all 12 sessions');
    // the widest bar is the most energy, 12 kWh: 70 pixels and the stub
    expect(Math.max(...latest.rows.map(row => row.barPx))).toBe(74);
    const all = modelOf(house, history({sessions: sorted(12)}), {allSessions: true}).detail!.sessions;
    expect(all.rows).toHaveLength(12);
    expect(all.toggle).toBe('Show the latest 10');
  });

  test('ten sessions are all there is to show: no toggle', () => {
    expect(modelOf(carHouse(), history({sessions: sorted(10)})).detail!.sessions.toggle).toBeNull();
  });

  test('the Wallbox’s own price costs the sessions, and a single session is "1 charging session"', () => {
    const priced = carHouse();
    priced.states['sensor.charger_price'] = entity('sensor.charger_price', '0.1');
    const vm = modelOf(priced, history({sessions: [session('2026-11-06T17:00:00-05:00', 2, 14.46)]}), {
      config: {...FULL_CFG, entities: {...FULL_CFG.entities, ev_charger_price: 'sensor.charger_price'}},
    });
    expect(vm.detail?.sessions.summary).toBe(
      '1 charging session on the Wallbox since Nov 6. Cost is estimated at the 10¢/kWh set in the Wallbox app.',
    );
    expect(vm.detail?.sessions.tiles[3]).toMatchObject({value: '$1', sub: 'at 10¢/kWh'});
    expect(vm.detail?.sessions.rows[0].cost).toBe('$1.45');
  });
});

describe('a car with every sensor, in French', () => {
  const vm = modelOf(carHouse(), history(), {language: 'fr'});
  const detail = vm.detail!;

  test('Ford’s tire words are French: "low" is Faible, as the layer’s state words said it for the lower-cased word and not its "min"', () => {
    expect(detail.status.tires.map(({state}) => state)).toEqual([
      {text: 'Normal', ok: true},
      null,
      null,
      {text: 'Faible', ok: false},
    ]);
  });

  test('every state Ford reports for a tire has its French, and one the catalog does not know is shown as Ford sent it', () => {
    const house = (states: Record<string, string>) =>
      carHouse({
        'sensor.tirepressure': car(
          'sensor',
          'tirepressure',
          'NORMAL_OPERATION',
          Object.fromEntries(Object.entries(states).map(([tire, state]) => [`${tire}_state`, state])),
        ),
      });
    const words = (language: Language, hass: FakeHass) =>
      modelOf(hass, null, {language}).detail?.status.tires.map(tire => tire.state?.text);
    const known = house({frontLeft: 'NORMAL', frontRight: 'LOW', rearLeft: 'HIGH', rearRight: 'UNKNOWN'});
    expect(words('fr', known)).toEqual(['Normal', 'Faible', 'Élevé', 'Inconnu']);
    expect(words('en', known)).toEqual(['Normal', 'low', 'high', 'unknown']);
    const odd = house({frontLeft: 'UNAVAILABLE', frontRight: 'UNDER_INFLATED'});
    expect(words('fr', odd)?.slice(0, 2)).toEqual(['Indisponible', 'under_inflated']);
    expect(words('en', odd)?.slice(0, 2)).toEqual(['unavailable', 'under_inflated']);
  });

  test('the sentences, the rows and the facts are the rewrite layer’s French', () => {
    expect(detail.history.daily?.line).toBe('Énergie de la voiture, 30 derniers jours : 1 jour de recharge, 17 kWh.');
    expect(detail.history).toMatchObject({title: 'Historique de recharge', line: '3 sessions · 39 kWh', value: '3 $'});
    expect(detail.sub).toBe('Stationnée à la maison · verrouillée · dernier contact de la voiture à 16 h 05');
    expect([detail.summary.drawing, detail.status.drawing]).toEqual(['Voiture, vue de côté', 'Voiture vue de haut']);
    expect(detail.summary.facts.map(({text}) => text)).toEqual([
      'Recharge · 7,2\u00a0kW',
      'Portes fermées',
      'Fenêtres fermées',
      'Capot et hayon fermés',
      'Verrouillée',
      'Alarme désactivée',
      'En position P',
    ]);
    expect(detail.status.rows.map(({label, value, sub}) => [label, value, sub])).toEqual([
      ['Odomètre', '12 345', ''],
      ['Autonomie complète', '400', 'à 100 %'],
      ['Limite CA', '32', ''],
      ['Habitacle', '21,5', 'dehors 5,0°'],
      ['Batterie 12 V', '87', '12,4 V'],
      ['Énergie utilisable', '55,0', 'sur 88,0 kWh'],
      ['Température de la batterie', '20,0', ''],
      ['Logiciel', '3.4.1', 'depuis le 1 nov.'],
      ['Mises à jour automatiques', 'Activé', ''],
    ]);
  });

  test('Ford’s warning is in French, and the last plug-in writes its two times as the layer did', () => {
    expect(detail.ford?.rows[0]).toEqual({
      title: 'Avertissement du système de surveillance de la pression des pneus, 6 nov.',
      body: 'Le système de surveillance de la pression des pneus a détecté un ou plusieurs pneus nettement sous-gonflés.',
    });
    expect(detail.ford?.rows).toHaveLength(2);
    expect(detail.last.caption).toBe('6 nov., 17 h au 6 nov., 19 h');
  });

  test('the sessions: the weekday capitalised as the layer did, the cost after the amount, and no second period after "nov."', () => {
    const {sessions} = detail;
    expect(sessions.summary).toBe(
      "3 sessions de recharge sur la Wallbox depuis le 20 oct. Le coût est estimé au tarif de 7 ¢/kWh réglé dans l'application Wallbox.",
    );
    expect(sessions.tiles[3]).toMatchObject({label: 'Coût estimé', value: '3 $', sub: 'à 7 ¢/kWh'});
    expect(sessions.rows[0]).toMatchObject({date: 'Dim. 8 nov.', times: 'De 9 h à 10 h', cost: '0,42 $'});
  });

  test('a month that French writes with a point ends the sentence with it: "depuis le 6 nov." once, and "depuis le 6 août." where there is none', () => {
    const since = (iso: string) =>
      modelOf(carHouse(), history({sessions: [session(iso, 2, 14.46)]}), {language: 'fr'}).detail?.sessions.summary;
    expect(since('2026-11-06T17:00:00-05:00')).toBe(
      "1 session de recharge sur la Wallbox depuis le 6 nov. Le coût est estimé au tarif de 7 ¢/kWh réglé dans l'application Wallbox.",
    );
    expect(since('2026-08-06T17:00:00-04:00')).toBe(
      "1 session de recharge sur la Wallbox depuis le 6 août. Le coût est estimé au tarif de 7 ¢/kWh réglé dans l'application Wallbox.",
    );
  });
});

describe('the other shapes of a car', () => {
  test('plugged in and not charging, away, unlocked: the words, and the plug and the lock as facts', () => {
    const vm = modelOf(
      carHouse({
        'sensor.elvehcharging': car('sensor', 'elvehcharging', 'NOT_CHARGING', {globalAcTargetSoc: 90, chargingkW: 0}),
        'lock.doorlock': car('lock', 'doorlock', 'unlocked'),
        'device_tracker.tracker': car('device_tracker', 'tracker', 'not_home'),
      }),
    );
    expect(vm.summary.line).toBe('Away · 64% · 280 km · plugged in');
    expect(vm.detail?.summary.facts[0]).toEqual({text: 'Plugged in', tone: 'plain'});
    expect(vm.detail?.summary.facts).toContainEqual({text: 'Unlocked', tone: 'warn'});
  });

  test('unplugged, a zone’s own name, no range and no lock: no leading dot, the zone as the tracker names it', () => {
    const vm = modelOf(
      carHouse({
        'sensor.soc': car('sensor', 'soc', 12),
        'sensor.elveh': null,
        'sensor.elvehplug': car('sensor', 'elvehplug', 'DISCONNECTED'),
        'sensor.elvehcharging': null,
        'lock.doorlock': null,
        'device_tracker.tracker': car('device_tracker', 'tracker', 'Work'),
      }),
    );
    expect(vm.detail?.summary).toMatchObject({
      charge: '12',
      range: '',
      soc: {fill: 12, limit: null, label: 'Battery 12 percent'},
    });
    expect(vm.detail?.summary.soc.scale.limit).toBe('');
    expect(vm.detail?.summary.facts[0]).toEqual({text: 'Unplugged', tone: 'plain'});
    expect(vm.summary.line).toBe('Work · 12% · unplugged');
    expect(vm.detail?.status.rows.map(row => row.label)).not.toContain('Full range');
  });

  test('a car with nothing to say for its tracker, charge, odometer and sensors shows dashes and leaves its rows out', () => {
    const vm = modelOf(
      carHouse({
        'sensor.soc': car('sensor', 'soc', 64), // no range
        ...without(
          'sensor.elveh',
          'sensor.elvehcharging',
          'sensor.cabintemperature',
          'sensor.outsidetemp',
          'sensor.odometer',
          'sensor.doorstatus',
          'sensor.windowposition',
          'sensor.alarm',
          'sensor.gearleverposition',
          'sensor.tirepressure',
          'sensor.battery',
          'sensor.lastfirmwareupdate',
          'sensor.lastrefresh',
          'sensor.messages',
          'sensor.energytransferlogentry',
          'sensor.departureschedules',
          'number.globalaccurrentlimit',
          'lock.doorlock',
          'device_tracker.tracker',
          'switch.autosoftwareupdates',
          'switch.departuretimes',
        ),
      }),
    );
    const detail = vm.detail!;
    expect(vm.summary.line).toBe('64% · plugged in');
    expect(detail.sub).toBe('');
    expect(detail.summary.facts).toEqual([{text: 'Plugged in', tone: 'plain'}]);
    expect(detail.status.tires.map(tire => [tire.psi, tire.state])).toEqual([
      ['No reading', null],
      ['No reading', null],
      ['No reading', null],
      ['No reading', null],
    ]);
    expect(detail.status.rows).toEqual([]);
    expect(detail.ford).toBeNull();
    expect(detail.last.title).toBe('Last plug-in');
  });

  test('what is open or unlocked is a fact in the warning colour; the alarm and the gear are Ford’s own word, lower case', () => {
    const vm = modelOf(
      carHouse({
        'sensor.doorstatus': car('sensor', 'doorstatus', 'OPEN', {driverFront: 'OPEN', hood: 'AJAR'}),
        'sensor.windowposition': car('sensor', 'windowposition', 'Open'),
        'sensor.alarm': car('sensor', 'alarm', 'ARMED'),
        'sensor.gearleverposition': car('sensor', 'gearleverposition', 'DRIVE'),
        'lock.doorlock': car('lock', 'doorlock', 'unlocked'),
      }),
    );
    expect(vm.detail?.summary.facts.slice(1)).toEqual([
      {text: 'A door is open', tone: 'warn'},
      {text: 'A window is open', tone: 'warn'},
      {text: 'Hood or tailgate open', tone: 'warn'},
      {text: 'Unlocked', tone: 'warn'},
      {text: 'Alarm armed', tone: 'plain'},
      {text: 'Gear drive', tone: 'plain'},
    ]);
    const other = modelOf(carHouse({'sensor.alarm': car('sensor', 'alarm', 'ARMING')}), null, {language: 'fr'});
    expect(other.detail?.summary.facts.find(fact => fact.text.startsWith('Alarme'))?.text).toBe('Alarme arming');
  });
});

describe('a house with no car', () => {
  const vm = modelOf(houseOf([], [entity('sensor.charger_power', '3', {unit_of_measurement: 'kW'})]));

  test('has the line that says so for the phone, and no detail', () => {
    expect(vm).toEqual({
      summary: {title: 'Car', line: 'No FordPass car found.'},
      detail: null,
      none: 'No FordPass car found.',
      error: null,
    });
  });

  test('in French', () => {
    const french = modelOf(houseOf([], []), null, {language: 'fr'});
    expect(french.summary).toEqual({title: 'Voiture', line: 'Aucune voiture FordPass trouvée.'});
  });
});

describe('a history that did not load', () => {
  test('says why in the household’s language, and the detail is as it was without it', () => {
    const house = carHouse();
    expect(modelOf(house, null, {historyError: 'timeout'}).error).toBe(
      "History didn't load: timeout. Live values still update.",
    );
    expect(modelOf(house, null, {historyError: 'timeout', language: 'fr'}).error).toBe(
      "L'historique n'a pas pu être chargé : timeout. Les valeurs en direct continuent de se mettre à jour.",
    );
    expect(modelOf(house, null, {historyError: 'timeout'}).detail?.history.daily).toBeNull();
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the model is tested on the test house and literal houses', () => {});
    return;
  }

  test('has a car, or says it has none, in both languages', () => {
    const hass = fakeHass.fromFixture('main');
    for (const language of ['en', 'fr'] as const) {
      const vm = modelOf(hass, null, {language, config: {}});
      if (vm.detail) expect(vm.detail.title).toBeTruthy();
      else expect(vm.none).toBeTruthy();
    }
  });
});

describe('isHistoryWindow', () => {
  test('is a window of the sheet for month and year, and no other tab', () => {
    expect(['month', 'year', 'week', 'day', ''].map(isHistoryWindow)).toEqual([true, true, false, false, false]);
  });
});
