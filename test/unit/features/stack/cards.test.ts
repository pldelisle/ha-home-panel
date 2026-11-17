// The smart stack's rules at known instants: each applies or not, holds its threshold at the edge as the legacy `stackCards()`
// compared it, and gives its tone, filler flag and tap. The inputs are the test house's, read by `readStack` at its clock (a Saturday,
// 14:00 in Toronto), with the one reading a case is about replaced.
import {describe, expect, test} from 'vitest';
import {DAY_MS, HOUR_MS, MINUTE_MS} from '../../../../src/core/figures.ts';
import {registriesOf} from '../../../../src/core/registry.ts';
import {
  agenda,
  awayMode,
  cameOrLeft,
  carLow,
  chargingOvernight,
  doorOpen,
  energyToday,
  lightsUnreachable,
  nowPlaying,
  peak,
  poorAir,
  presenceFrozen,
  reminders,
  RULES,
  stackCards,
  sunrise,
  tomorrow,
  weatherWarning,
  whoFiller,
  type StackDeps,
  type StackRule,
} from '../../../../src/features/stack/cards.ts';
import {readStack, type StackInputs} from '../../../../src/features/stack/inputs.ts';
import type {CarInputs} from '../../../../src/providers/fordpass.ts';
import type {SensorInputs} from '../../../../src/providers/door-motion.ts';
import type {RoomRating} from '../../../../src/providers/air-quality.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import {fullHouse, NOW, storeOf} from '../media/support.ts';

const store = storeOf(fullHouse, FULL_CFG);
const deps: StackDeps = {t: store.t, fmt: store.fmt};
const french = storeOf({...fullHouse, locale: {...fullHouse.locale, language: 'fr'}}, FULL_CFG);
const frDeps: StackDeps = {t: french.t, fmt: french.fmt};

const house: StackInputs = readStack(fullHouse.states, registriesOf(fullHouse), store.config, store.names, {
  now: NOW,
  fmt: store.fmt,
  location: fullHouse.config,
  forecast: [],
  history: null,
});
const car = house.car!;

/** The instant at `h`:`m` on the test house's day, in Toronto (NOW is 14:00). */
const at = (h: number, m = 0) => NOW + (h - 14) * HOUR_MS + m * MINUTE_MS;
const run = (rule: StackRule, over: Partial<StackInputs>, d = deps) => rule.run({...house, ...over}, d);
const one = (rule: StackRule, over: Partial<StackInputs>, d = deps) => {
  const cards = run(rule, over, d);
  expect(cards).toHaveLength(1);
  return cards[0];
};
const withCar = (over: Partial<CarInputs>): CarInputs => ({...car, ...over});
const door = (over: Partial<SensorInputs>): SensorInputs => ({...house.doors[0], ...over});

describe('the test house', () => {
  test('shows nothing when the stack is switched off', () => {
    expect(stackCards({...house, stack: {...house.stack, on: false}}, deps)).toEqual([]);
  });

  test('shows the speaker that plays and the who’s-home filler, nothing else, in the chain’s order', () => {
    expect(stackCards(house, deps).map(c => [c.key, c.filler])).toEqual([
      ['music', false],
      ['who', true],
    ]);
    expect(RULES.map(r => r.key)).toEqual([
      'door',
      'lights',
      'wxwarn',
      'carlow',
      'presence',
      'sunrise',
      'reminders',
      'peak',
      'music',
      'who',
      'agenda',
      'away',
      'air',
      'tomorrow',
      'car',
      'energy',
      'whoFiller',
    ]);
  });
});

describe('a door left open', () => {
  test('is red from five minutes, counts minutes under an hour and hours after, and opens its history', () => {
    expect(run(doorOpen, {doors: [door({on: true, since: NOW - 4 * MINUTE_MS - 29_000})]})).toEqual([]);
    const c = one(doorOpen, {doors: [door({on: true, since: NOW - 5 * MINUTE_MS})]});
    expect(c).toMatchObject({
      key: 'door:binary_sensor.front_door',
      tone: 'red',
      filler: false,
      label: 'Front door open',
      go: {sensorHistory: 'binary_sensor.front_door'},
      body: [{kind: 'big', value: '5', unit: 'min'}],
      foot: 'Stays here until the door closes',
    });
    expect(one(doorOpen, {doors: [door({on: true, since: at(11, 50)})]}).body).toEqual([
      {kind: 'big', value: '2', unit: 'h'},
      {kind: 'mid', text: 'Open since 11:50 am'},
    ]);
    expect(run(doorOpen, {doors: [door({on: false, since: at(10)})]})).toEqual([]);
  });

  test('in French', () => {
    expect(one(doorOpen, {doors: [door({on: true, since: at(11, 50)})]}, frDeps)).toMatchObject({
      label: 'Front door\u00a0: ouverte',
      body: [
        {kind: 'big', value: '2', unit: 'h'},
        {kind: 'mid', text: 'Ouverte depuis 11 h 50'},
      ],
    });
  });
});

describe('lights that stopped answering', () => {
  const area = (since: number, name = 'Kitchen') => ({name, unavailable: [{id: `light.${name}`, since}], on: false});

  test('are red from five minutes, with the count, the rooms and the first one’s time', () => {
    expect(run(lightsUnreachable, {lights: [area(NOW - 4 * MINUTE_MS)]})).toEqual([]);
    expect(one(lightsUnreachable, {lights: [area(NOW - 5 * MINUTE_MS)]})).toMatchObject({
      tone: 'red',
      go: {tab: 'lights'},
      right: 'since 1:55 pm',
      body: [
        {kind: 'big', value: '1', unit: 'light'},
        {kind: 'chips', names: ['Kitchen'], more: 0},
      ],
    });
    const many = ['A', 'B', 'C', 'D'].map((name, i) => area(at(9 + i), name));
    expect(one(lightsUnreachable, {lights: many}).body).toEqual([
      {kind: 'big', value: '4', unit: 'lights'},
      {kind: 'chips', names: ['A', 'B', 'C'], more: 1},
    ]);
    // a day before: the date, not the time
    expect(one(lightsUnreachable, {lights: [area(NOW - DAY_MS)]}).right).toBe('since Nov 6');
  });
});

describe('a weather warning', () => {
  const warning = {
    kind: 'warning' as const,
    tone: 'crit' as const,
    title: 'Wind warning',
    count: null,
    time: '2026-11-07T10:00:00-05:00',
  };

  test('is amber, titled by the first, says how many and when it was issued, and opens the weather detail', () => {
    expect(run(weatherWarning, {alerts: [{...warning, kind: 'watch'}]})).toEqual([]);
    expect(one(weatherWarning, {alerts: [warning]})).toMatchObject({
      tone: 'amber',
      label: 'Wind warning',
      right: 'Env. Canada',
      go: {sheet: 'weather.detail'},
      body: [{kind: 'mid', text: 'In effect for your area'}],
      foot: 'Issued 10:00 am',
    });
    const counted = {...warning, title: null, count: 2, time: null};
    expect(one(weatherWarning, {alerts: [counted, warning]})).toMatchObject({
      label: '2 warnings in effect',
      body: [{kind: 'mid', text: '2 warnings in effect'}],
      foot: 'Tap for the details',
    });
    expect(one(weatherWarning, {alerts: [{...counted, count: null}]}).label).toBe('1 warning in effect');
  });
});

describe('the car low and unplugged at night', () => {
  const low = withCar({plugged: false, soc: 39});

  test('is amber under forty percent from 21:00 to 6:00 when it is home, and opens the car', () => {
    expect(run(carLow, {car: low, now: at(20, 59)})).toEqual([]);
    expect(one(carLow, {car: low, now: at(21)})).toMatchObject({
      tone: 'amber',
      label: 'Car not plugged in',
      go: {sheet: 'car.detail'},
      body: [{kind: 'ring', percent: 39, limit: null, size: 108, rows: [{label: 'Range', value: '280 km'}]}],
      foot: 'Plug in before bed',
    });
    expect(one(carLow, {car: {...low, name: 'Mach-E', range: null}, now: at(5, 59) + DAY_MS})).toMatchObject({
      label: 'Mach-E not plugged in',
      body: [{kind: 'ring', rows: []}],
    });
    expect(run(carLow, {car: low, now: at(6) + DAY_MS})).toEqual([]);
    for (const over of [{soc: 40}, {soc: null}, {plugged: true}, {home: false}])
      expect(run(carLow, {car: {...low, ...over}, now: at(22)})).toEqual([]);
    expect(run(carLow, {car: null, now: at(22)})).toEqual([]);
  });
});

describe('presence not updating', () => {
  test('is amber with the count and the first tracker’s last report', () => {
    expect(run(presenceFrozen, {frozen: []})).toEqual([]);
    const frozen = [
      {id: 'device_tracker.a', updated: new Date(at(9)).toISOString()},
      {id: 'device_tracker.b', updated: new Date(at(10)).toISOString()},
    ];
    expect(one(presenceFrozen, {frozen})).toMatchObject({
      tone: 'amber',
      right: 'since 9:00 am',
      body: [{kind: 'mid', text: "2 iPhones stopped updating. Who's home and Away may be wrong."}],
      foot: 'Sign in to iCloud again in Settings',
    });
  });
});

describe('the hour before sunrise', () => {
  const rise = at(7);
  const sun = {today: {...house.sun.today, rise}, tomorrow: {...house.sun.tomorrow, rise: rise + DAY_MS}};
  const dark = house.lights.map(a => ({...a, on: false}));

  test('shows sixty minutes before the sun, with the lights still on, and opens the lights', () => {
    expect(run(sunrise, {sun, now: rise - 61 * MINUTE_MS})).toEqual([]);
    expect(one(sunrise, {sun, now: rise - 60 * MINUTE_MS})).toMatchObject({
      label: 'Sunrise',
      tone: null,
      go: {tab: 'lights'},
      body: [
        {kind: 'big', value: '7:00', unit: 'am'},
        {kind: 'mid', text: 'in 60 min'},
        {kind: 'chips', names: ['Kitchen', 'Living room', 'Office'], more: 0},
      ],
      foot: 'Lights still on',
    });
    expect(one(sunrise, {sun, now: rise - 10 * MINUTE_MS, lights: dark})).toMatchObject({
      body: [{kind: 'big'}, {kind: 'mid', text: 'in 10 min'}],
      foot: 'Every light is off',
    });
    expect(run(sunrise, {sun, now: rise})).toEqual([]);
  });

  test('after today’s sunrise it waits for tomorrow’s; with no sunrise it says nothing', () => {
    expect(one(sunrise, {sun, now: rise + DAY_MS - 30 * MINUTE_MS}).body[1]).toEqual({kind: 'mid', text: 'in 30 min'});
    expect(run(sunrise, {sun: {today: {...sun.today, rise: null}, tomorrow: {...sun.tomorrow, rise: null}}})).toEqual(
      [],
    );
  });

  test('a house whose lights go off at sunrise: only while a light is on', () => {
    const stack = {...house.stack, sunriseOff: true};
    expect(one(sunrise, {sun, stack, now: rise - 5 * MINUTE_MS})).toMatchObject({
      label: 'Lights off at sunrise',
      foot: 'Every light turns off then',
    });
    expect(run(sunrise, {sun, stack, now: rise - 5 * MINUTE_MS, lights: dark})).toEqual([]);
  });

  test('in French, the time has no day period', () => {
    expect(one(sunrise, {sun, now: rise - 10 * MINUTE_MS}, frDeps).body[0]).toEqual({
      kind: 'big',
      value: '7 h',
      unit: '',
    });
  });
});

describe('the config’s reminders', () => {
  test('show for their lead before their time, one card each', () => {
    const stack = {
      ...house.stack,
      reminders: [
        {at: '14:30', title: 'Bedtime', text: 'Brush teeth', lead: 30},
        {at: '15:00', title: 'Call', text: '', lead: 30},
      ],
    };
    const cards = run(reminders, {stack});
    expect(cards).toEqual([
      expect.objectContaining({
        key: 'rem0',
        label: 'Bedtime',
        go: null,
        body: [
          {kind: 'big', value: '2:30', unit: 'pm'},
          {kind: 'mid', text: 'Brush teeth'},
        ],
        foot: 'in 30 min',
      }),
    ]);
    // past its time, the first is gone; the second has no text
    expect(run(reminders, {stack, now: at(14, 45)}).map(c => [c.key, c.body.length, c.foot])).toEqual([
      ['rem1', 1, 'in 15 min'],
    ]);
  });
});

describe('a critical peak or a Hilo challenge', () => {
  const hq = {
    balance: 10,
    peakNow: true,
    peakUpcoming: false,
    balancePresent: true,
    balanceUpdated: NOW,
    peakReporting: true,
  };
  const challenge = {state: 'pre_heat', active: true, nextEvent: null};

  test('a peak now, a peak coming, with the grid’s draw', () => {
    expect(one(peak, {hydroQuebec: hq})).toMatchObject({
      label: 'Critical peak now',
      right: 'Hydro-Québec',
      go: {sheet: 'energy.detail'},
      body: [{kind: 'mid', text: 'Lower consumption now'}],
      foot: 'Using 3.2 kW right now',
    });
    expect(
      one(peak, {hydroQuebec: {...hq, peakNow: false, peakUpcoming: true}, power: {...house.power, grid: 0.85}}),
    ).toMatchObject({
      label: 'Critical peak coming',
      body: [{kind: 'mid', text: 'Hydro-Québec announced a critical peak'}],
      foot: 'Using 850 W right now',
    });
  });

  test('else Hilo’s challenge with its phase; nothing when neither', () => {
    const quiet = {...hq, peakNow: false};
    expect(one(peak, {hydroQuebec: quiet, challenge, power: {...house.power, grid: null}})).toMatchObject({
      label: 'Hilo challenge',
      right: 'Hilo',
      body: [{kind: 'mid', text: 'pre_heat'}],
      foot: 'Using – right now',
    });
    expect(one(peak, {challenge}, frDeps).body).toEqual([{kind: 'mid', text: 'Préchauffage'}]);
    expect(run(peak, {hydroQuebec: quiet, challenge: {...challenge, active: false}})).toEqual([]);
  });
});

describe('now playing', () => {
  test('the playing speaker with its place, its title or "Playing", and opens Media', () => {
    expect(one(nowPlaying, {})).toMatchObject({right: 'Living room', go: {tab: 'media'}, foot: 'Tap for the player'});
    expect(one(nowPlaying, {playing: {place: 'Kitchen', picture: '/p.jpg', title: null, artist: null}}).body).toEqual([
      {kind: 'nowPlaying', picture: '/p.jpg', title: 'Playing', artist: ''},
    ]);
    expect(run(nowPlaying, {playing: null})).toEqual([]);
  });
});

describe('someone came or left', () => {
  const people = (changed: number) => [
    {name: 'Alex', home: true, since: null, changed: new Date(changed).toISOString()},
    {name: 'Sam', home: false, since: null, changed: null},
  ];

  test('within thirty minutes: the card, with the door closed last in that half hour', () => {
    expect(run(cameOrLeft, {people: people(NOW - 31 * MINUTE_MS)})).toEqual([]);
    const doors = [
      door({on: false, since: NOW - 10 * MINUTE_MS}),
      door({name: 'Back door', on: false, since: NOW - 5 * MINUTE_MS}),
    ];
    expect(one(cameOrLeft, {people: people(NOW - 30 * MINUTE_MS), doors})).toMatchObject({
      key: 'who',
      filler: false,
      go: null,
      body: [
        {kind: 'people', people: [{initial: 'A', name: 'Alex', home: true, line: 'Arrived 1:30 pm', tag: 'Home'}]},
      ],
      foot: 'Back door opened 1:55 pm',
    });
    expect(one(cameOrLeft, {people: people(NOW), doors: [door({on: false, since: NOW - 31 * MINUTE_MS})]}).foot).toBe(
      '',
    );
    // a door that stopped answering is not a door someone opened, as the legacy read only `off`
    const lost = door({on: false, available: false, since: NOW - 5 * MINUTE_MS});
    expect(one(cameOrLeft, {people: people(NOW), doors: [lost]}).foot).toBe('');
  });

  test('else, in the waking hours, the filler; never both', () => {
    expect(run(whoFiller, {people: people(NOW - 30 * MINUTE_MS)})).toEqual([]);
    expect(one(whoFiller, {people: people(at(9))})).toMatchObject({key: 'who', filler: true});
    expect(run(whoFiller, {people: people(at(5)), now: at(22)})).toEqual([]);
    expect(run(whoFiller, {people: people(at(5)), now: at(6, 59)})).toEqual([]);
    expect(one(whoFiller, {people: people(at(5)), now: at(7)}).filler).toBe(true);
    expect(run(whoFiller, {people: []})).toEqual([]);
  });

  test('in French', () => {
    expect(one(whoFiller, {}, frDeps).body).toEqual([
      {
        kind: 'people',
        people: [
          {initial: 'A', name: 'Alex', home: true, line: 'Arrivé·e à 13 h', tag: 'Maison'},
          {initial: 'S', name: 'Sam', home: false, line: 'Parti·e à 13 h', tag: 'Absent'},
        ],
      },
    ]);
  });
});

describe('today’s events, in the morning', () => {
  const events = [
    {title: 'Holiday', start: at(0), allDay: true},
    {title: 'Dentist', start: at(10, 30), allDay: false},
    {title: 'Dinner', start: at(18), allDay: false},
  ];

  test('from 6:00 to 11:00: the first two, the count and how many more', () => {
    expect(run(agenda, {events, now: at(5, 59)})).toEqual([]);
    expect(one(agenda, {events, now: at(6)})).toMatchObject({
      right: '3 events',
      body: [
        {
          kind: 'events',
          events: [
            {title: 'Holiday', time: 'All day', color: 'var(--c-home)'},
            {title: 'Dentist', time: '10:30 am', color: 'var(--m-purple)'},
          ],
        },
      ],
      foot: 'and 1 more',
    });
    expect(one(agenda, {events: events.slice(1, 2), now: at(10, 59)})).toMatchObject({
      right: '1 event',
      foot: 'From your calendars',
    });
    expect(run(agenda, {events, now: at(11)})).toEqual([]);
    expect(run(agenda, {events: [], now: at(8)})).toEqual([]);
  });
});

describe('Away mode', () => {
  const inside = house.power.rooms.flatMap(r => (r.temperature === null ? [] : [r.temperature]));
  const meanInside = inside.reduce((a, b) => a + b, 0) / inside.length;

  test('on: since when, the mean inside, the lights on; off or missing: nothing', () => {
    expect(one(awayMode, {away: {on: true, since: at(9)}})).toMatchObject({
      right: 'since 9:00 am',
      body: [
        {kind: 'big', value: `${meanInside.toFixed(1)}°`, unit: 'inside'},
        {kind: 'mid', text: '3 lights on'},
      ],
      foot: 'Ends when someone comes home',
    });
    const cold = {...house.power, rooms: []};
    expect(one(awayMode, {away: {on: true, since: at(9)}, power: cold, lights: []}).body).toEqual([
      {kind: 'mid', text: 'All lights off'},
    ]);
    expect(run(awayMode, {away: {on: false, since: at(9)}})).toEqual([]);
    expect(run(awayMode, {away: null})).toEqual([]);
  });
});

describe('a room’s poor air', () => {
  const rating = (k: 'co2' | 'co' | 'pm2_5', v: number | null, level: 0 | 1 | 2 | 3): RoomRating =>
    ({level, milaIndex: null, why: [], pollutants: [{k, v, level}]}) as RoomRating;

  test('a pollutant at poor or worse: the reading, its name, and what to do', () => {
    expect(run(poorAir, {air: [{name: 'Office', rating: rating('co2', 1300, 1)}]})).toEqual([]);
    expect(one(poorAir, {air: [{name: 'Office', rating: rating('co2', 1300, 2)}]})).toMatchObject({
      label: 'Office air',
      go: {sheet: 'air.detail'},
      body: [
        {kind: 'big', value: '1,300', unit: 'ppm'},
        {kind: 'mid', text: 'CO₂ is high'},
      ],
      foot: 'Open a door or a window a little',
    });
    expect(one(poorAir, {air: [{name: 'Office', rating: rating('co', 9.5, 2)}]})).toMatchObject({
      body: [
        {kind: 'big', value: '9.5', unit: 'ppm'},
        {kind: 'mid', text: 'CO is high'},
      ],
      foot: 'The purifier can run faster',
    });
    expect(one(poorAir, {air: [{name: 'Office', rating: rating('pm2_5', null, 3)}]}).body[0]).toEqual({
      kind: 'big',
      value: '–',
      unit: 'µg/m³',
    });
    const two = run(poorAir, {
      air: [
        {name: 'Office', rating: rating('co2', 1300, 2)},
        {name: 'Den', rating: rating('co2', 1400, 2)},
      ],
    });
    expect(two.map(c => c.key)).toEqual(['air:Office', 'air:Den']);
    expect(one(poorAir, {air: [{name: 'Bureau', rating: rating('co2', 1300, 2)}]}, frDeps).label).toBe(
      'Air\u00a0: Bureau',
    );
  });
});

describe('tomorrow’s weather, in the evening', () => {
  const day = (offset: number, over = {}) => ({
    dayKey: store.fmt.isoDay(NOW + offset * DAY_MS),
    at: NOW + offset * DAY_MS,
    hi: 5,
    lo: -2,
    condition: 'rainy',
    pop: 40,
    isTonight: false,
    ...over,
  });
  const forecast = [day(0, {lo: -3}), day(1)];

  test('from 17:00: tomorrow’s high, low, condition and chance, and tonight', () => {
    expect(run(tomorrow, {forecast, tonight: 'clear-night', now: at(16, 59)})).toEqual([]);
    expect(one(tomorrow, {forecast, tonight: 'clear-night', now: at(17)})).toMatchObject({
      right: 'Sunday',
      go: {sheet: 'weather.detail'},
      body: [{kind: 'weather', condition: 'rainy', value: '5°', unit: '/ -2°', text: 'Rain, 40%'}],
      foot: 'Tonight: Clear, low -3°',
    });
    const bare = [day(0, {lo: null}), day(1, {hi: null, pop: 0})];
    expect(one(tomorrow, {forecast: bare, tonight: 'clear-night', now: at(23)})).toMatchObject({
      body: [{kind: 'weather', value: '–', unit: '/ -2°', text: 'Rain'}],
      foot: 'Tonight: Clear',
    });
    expect(one(tomorrow, {forecast: [day(1, {lo: null})], tonight: null, now: at(18)})).toMatchObject({
      body: [{kind: 'weather', unit: ''}],
      foot: '',
    });
  });

  test('rounds a half the way the legacy `Math.round` did, never to "-0"', () => {
    const halves = [day(0, {lo: -0.4}), day(1, {hi: -2.5, lo: -3.5})];
    expect(one(tomorrow, {forecast: halves, tonight: 'clear-night', now: at(18)})).toMatchObject({
      body: [{kind: 'weather', value: '-2°', unit: '/ -3°'}],
      foot: 'Tonight: Clear, low 0°',
    });
  });

  test('no row for tomorrow, or neither a high nor a low: nothing', () => {
    expect(run(tomorrow, {forecast: [day(0)], now: at(18)})).toEqual([]);
    expect(run(tomorrow, {forecast: [day(1, {hi: null, lo: null})], now: at(18)})).toEqual([]);
  });
});

describe('the car charging overnight', () => {
  test('plugged in at home from 21:00 to 7:00: the ring, the power, range and limit, and the departure', () => {
    expect(run(chargingOvernight, {now: at(20, 59)})).toEqual([]);
    expect(one(chargingOvernight, {now: at(21)})).toMatchObject({
      label: 'Car',
      right: 'Charging',
      go: {sheet: 'car.detail'},
      body: [
        {
          kind: 'ring',
          percent: 64,
          limit: 90,
          size: 124,
          rows: [
            {label: 'Power', value: '7.1 kW'},
            {label: 'Range', value: '280 km'},
            {label: 'Limit', value: '90%'},
          ],
        },
      ],
      foot: 'Charging to 90%',
    });
    const idle = withCar({charging: false, limit: null, range: null, name: 'Mach-E'});
    expect(
      one(chargingOvernight, {car: idle, power: {...house.power, ev: 0.05}, now: at(6, 59) + DAY_MS}),
    ).toMatchObject({
      label: 'Mach-E',
      right: 'Plugged in',
      body: [{kind: 'ring', rows: []}],
      foot: 'Not charging right now',
    });
    expect(one(chargingOvernight, {car: withCar({limit: null}), now: at(22)}).foot).toBe('Charging to 100%');
    expect(run(chargingOvernight, {now: at(7) + DAY_MS})).toEqual([]);
    expect(run(chargingOvernight, {car: withCar({home: false}), now: at(22)})).toEqual([]);
    expect(run(chargingOvernight, {car: withCar({plugged: false}), now: at(22)})).toEqual([]);
  });

  test('a saved departure: every day, weekdays, or the days by name', () => {
    const departing = (days: string[]) => withCar({departureOn: true, schedule: {days, hours: 7, minutes: 30}});
    const foot = (days: string[], d = deps) => one(chargingOvernight, {car: departing(days), now: at(22)}, d).foot;
    expect(foot(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'])).toBe('Departure: Weekdays at 7:30 am');
    expect(foot(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])).toBe(
      'Departure: Every day at 7:30 am',
    );
    expect(foot(['monday', 'saturday'])).toBe('Departure: Mon, Sat at 7:30 am');
    expect(foot(['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], frDeps)).toBe(
      'Départ\u00a0: En semaine à 7 h 30',
    );
    expect(one(chargingOvernight, {car: {...departing(['monday']), departureOn: false}, now: at(22)}).foot).toBe(
      'Charging to 90%',
    );
  });
});

describe('the Energy-today filler', () => {
  const row = (t: number, ev: number, wh: number, heat: number, rest: number) =>
    [t, ev, wh, heat, rest, ev + wh + heat + rest] as [number, number, number, number, number, number];
  const history = {
    at: NOW,
    flow: [row(at(9), 1, 1, 2, 0), row(at(10), 0, 0, 0, 1), row(NOW - DAY_MS, 9, 9, 9, 9)],
    totals: {today: 12.34, yesterday: null, d30: 0, month: 0},
  };

  test('from 8:00 to 21:00: the total so far, the bar of today’s parts and the split', () => {
    expect(run(energyToday, {history, now: at(7, 59)})).toEqual([]);
    expect(one(energyToday, {history, now: at(8)})).toMatchObject({
      filler: true,
      right: 'so far',
      go: {sheet: 'energy.detail'},
      body: [
        {kind: 'big', value: '12.3', unit: 'kWh'},
        {
          kind: 'bar',
          parts: [
            {share: 40, color: 'var(--c-heat)'},
            {share: 20, color: 'var(--c-wh)'},
            {share: 20, color: 'var(--c-ev)'},
            {share: 20, color: 'var(--fg3)'},
          ],
        },
      ],
      foot: 'Heating 40% · water 20% · car 20%',
    });
    expect(one(energyToday, {history: {...history, flow: []}})).toMatchObject({body: [{kind: 'big'}], foot: ''});
    expect(run(energyToday, {history, now: at(21)})).toEqual([]);
    expect(run(energyToday, {history: null})).toEqual([]);
  });
});
