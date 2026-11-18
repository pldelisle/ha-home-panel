// The three live activities at a fixed instant in a fixed zone (the test house's clock, Toronto): the Hilo phases and progress, the
// car's paused rule and its three ETA rules in order, the current session, the water heater's median cycle, rate and time left.
// The inputs are the test house's, read by `readLive`, with the reading a case is about replaced.
import {describe, expect, test} from 'vitest';
import {registriesOf} from '../../../../src/core/registry.ts';
import {
  carActivity,
  chargeEta,
  chargingPaused,
  currentSession,
  hiloActivity,
  phaseTime,
  sortActivities,
  waterActivity,
  waterRuns,
  type ActivityDeps,
  type LiveHistoryData,
} from '../../../../src/features/live/activities.ts';
import {readLive, type LiveInputs} from '../../../../src/features/live/inputs.ts';
import type {HiloChallenge} from '../../../../src/providers/hilo.ts';
import type {Point} from '../../../../src/providers/power-history.ts';
import {pauseHold} from '../../../../src/providers/wallbox.ts';
import type {Overlay} from '../../../../src/ui/overlay-store.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import {fullHouse, NOW, storeOf} from '../media/support.ts';

const MIN = 60_000;
const HOUR = 60 * MIN;
const store = storeOf(fullHouse, FULL_CFG);
/** No value held: each switch reads as Home Assistant says. */
const unheld: Overlay = (_key, current) => current;
const deps: ActivityDeps = {t: store.t, fmt: store.fmt, overlay: unheld};
const french = storeOf({...fullHouse, locale: {...fullHouse.locale, language: 'fr'}}, FULL_CFG);
const frDeps: ActivityDeps = {t: french.t, fmt: french.fmt, overlay: unheld};

/** The test house at its clock (2 pm in Toronto): the car charging at 64 % to 90 %, the Wallbox at 7.1\u00a0kW, the water heater idle at 50°. */
const house: LiveInputs = readLive(fullHouse.states, registriesOf(fullHouse), store.config, store.names, NOW);
const car = house.car!;
const with_ = (over: Partial<LiveInputs>): LiveInputs => ({...house, ...over});

/** `2026-11-07 14:00:00`, the challenge sensor's way, at an offset from now: a local time, read in the zone the panel runs in, as the legacy panel read it. */
const local = (offset: number) => {
  const d = new Date(NOW + offset);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}:${two(d.getMinutes())}:00`;
};

describe('the Hilo challenge', () => {
  // pre-heat from an hour ago to now + 1 h, the reduction to now + 3 h, recovery to now + 4 h
  const phases = {
    preheat_start: local(-HOUR),
    preheat_end: local(HOUR),
    reduction_start: local(HOUR),
    reduction_end: local(3 * HOUR),
    recovery_start: local(3 * HOUR),
    recovery_end: local(4 * HOUR),
  };
  const challenge = (state: string, over: Partial<HiloChallenge['nextEvent']> = {}): LiveInputs =>
    with_({
      hilo: {
        ...house.hilo,
        challenge: {state, active: state !== 'off', nextEvent: {phases, used: 1.2, allowed: 3, ...over}},
      },
    });

  test('the sensor’s times read as local times, the space as a T', () => {
    expect(phaseTime(local(0))).toBe(NOW);
    expect(phaseTime(undefined)).toBeNull();
    expect(phaseTime('soon')).toBeNull();
  });

  test('pre-heat: half way, the challenge in an hour, priority 1 in the grid’s colour', () => {
    const activity = hiloActivity(challenge('pre_heat'), deps)!;
    expect(activity).toMatchObject({
      key: 'hilo',
      priority: 1,
      color: 'var(--c-grid)',
      tint: false,
      progress: 0.5,
      pill: {label: 'Hilo pre-heat', value: null, extra: 'challenge in 1 h'},
      short: {label: 'Pre-heat', value: null, extra: '1 h'},
      ariaLabel: 'Hilo pre-heat, challenge in 1 h',
    });
    expect(activity.card).toMatchObject({
      title: 'Hilo challenge',
      right: 'Pre-heat · 1:00 pm – 3:00 pm',
      big: {n: '1 h', to: 'until heating holds back'},
      note: 'Rooms are warming up before the challenge.',
    });
  });

  test('`on` is the reduction: priority 0, tinted red, ending at the reduction’s end; the meta says inside, the house’s power and used of allowed', () => {
    // read before the reduction's start, as the sensor may: the progress is below zero, which the ring clamps
    const activity = hiloActivity(challenge('on'), deps)!;
    expect(activity).toMatchObject({priority: 0, tint: true, color: 'var(--crit)', progress: -0.5});
    expect(activity.pill.extra).toBe('ends in 3 h');
    expect(activity.card.kind === 'hilo' && activity.card.meta.map(piece => piece.text).join('')).toBe(
      '20.6° inside · house using 3.2\u00a0kW · 1.2 of 3.0 kWh allowed',
    );
  });

  test('recovery: its progress runs from the recovery’s start to its end; the phase bar: four ticks without the day period, the marker at now, the aria in full', () => {
    const recovery = hiloActivity(challenge('recovery'), deps)!;
    expect(recovery).toMatchObject({priority: 1, tint: false, progress: -3});
    const card = recovery.card;
    expect(card.kind === 'hilo' && card.phases).toEqual({
      segments: [
        {label: 'Pre-heat', flex: 2 * HOUR, color: 'var(--c-grid)'},
        {label: 'Reduction', flex: 2 * HOUR, color: 'var(--crit)'},
        {label: 'Recovery', flex: HOUR, color: 'var(--c-ev)'},
      ],
      ticks: [
        {left: 0, text: '1:00'},
        {left: 40, text: '3:00'},
        {left: 80, text: '5:00'},
        {left: 100, text: '6:00'},
      ],
      marker: 20,
      aria: 'Pre-heat 1:00 pm, reduction 3:00 pm to 5:00 pm, recovery until 6:00 pm',
    });
    const fr = hiloActivity(challenge('recovery'), frDeps)!.card;
    expect(fr.kind === 'hilo' && fr.phases?.ticks.map(tick => tick.text)).toEqual(['13 h', '15 h', '17 h', '18 h']);
  });

  test('no bar, no time left and no progress when the sensor names no times; nothing when it is off', () => {
    const bare = hiloActivity(challenge('recovery', {phases: {}, used: null, allowed: null}), deps)!;
    expect(bare).toMatchObject({progress: null, pill: {extra: null}, ariaLabel: 'Hilo recovery'});
    expect(bare.card).toMatchObject({phases: null, big: null, right: 'Recovery', note: ''});
    expect(hiloActivity(challenge('off'), deps)).toBeNull();
    expect(hiloActivity(house, deps)).toBeNull();
  });
});

describe('the car', () => {
  const sessions = (end: number, start = car.plugChangedAt!): LiveHistoryData => ({
    at: NOW,
    wh24: {t: [], p: []},
    sessions: [{start, end, kwh: 14.2, peak: 7.4}],
  });

  test('charging: the percent, the Wallbox’s power, plugged in at, the range', () => {
    const activity = carActivity(house, null, deps)!;
    expect(activity).toMatchObject({
      key: 'car',
      priority: 2,
      color: 'var(--c-ev)',
      progress: 0.64,
      pill: {label: 'Charging', value: '64%', extra: null},
      short: {label: null, value: '64%', extra: 'charging'},
      ariaLabel: 'Car charging, 64 percent',
    });
    expect(activity.card).toMatchObject({
      name: 'Car',
      state: 'charging',
      right: '7.1\u00a0kW',
      big: {soc: '64', limit: '→ 90% limit', eta: null},
      bar: {soc: 64, limit: 90, aria: 'Battery 64 percent, limit 90 percent'},
      pause: {id: house.wallbox.pause.id, resume: false, label: 'Pause charging'},
      openCar: 'Open Car ›',
    });
  });

  test('paused below the limit: plugged in, not charging, the pause switch off, under the limit less one', () => {
    const paused = (soc: number | null, over: Partial<LiveInputs['wallbox']['pause']> = {}) =>
      with_({
        car: {...car, charging: false, soc},
        wallbox: {...house.wallbox, pause: {...house.wallbox.pause, on: false, ...over}},
      });
    expect(chargingPaused(paused(88), unheld)).toBe(true);
    expect(chargingPaused(paused(null), unheld)).toBe(true);
    expect(chargingPaused(paused(89), unheld)).toBe(false);
    expect(chargingPaused(paused(50, {available: false}), unheld)).toBe(false);
    expect(chargingPaused(paused(50, {on: true}), unheld)).toBe(false);
    const activity = carActivity(paused(50), null, deps)!;
    expect(activity).toMatchObject({
      color: 'var(--fg3)',
      pill: {label: 'Charging paused'},
      short: {extra: 'paused'},
      ariaLabel: 'Charging paused, 50 percent',
    });
    expect(activity.card).toMatchObject({state: 'paused', pause: {resume: true, label: 'Resume charging'}});
    // a tap on Resume holds the switch on: the car is no longer paused before Home Assistant says so, and a tap on Pause the reverse
    const held =
      (on: boolean): Overlay =>
      (key, current) =>
        key === pauseHold(house.wallbox.pause.id!) ? (on as typeof current) : current;
    expect(chargingPaused(paused(50), held(true))).toBe(false);
    const pausing = carActivity(house, null, {...deps, overlay: held(false)})!;
    expect(pausing.card).toMatchObject({pause: {resume: true}});
    // no button where the switch is unset or Home Assistant has no value for it
    const noSwitch = (pause: Partial<LiveInputs['wallbox']['pause']>) =>
      carActivity(with_({wallbox: {...house.wallbox, pause: {...house.wallbox.pause, ...pause}}}), null, deps)!.card;
    expect(noSwitch({available: false})).toMatchObject({pause: null});
    expect(noSwitch({id: null})).toMatchObject({pause: null});
    expect(carActivity(with_({car: {...car, charging: false}}), null, deps)).toBeNull();
    expect(carActivity(with_({car: null}), null, deps)).toBeNull();
  });

  test('the ETA: Ford’s first date ahead, else its minutes, else the capacity at the charger’s power', () => {
    const eta = (estimates: typeof car.chargeEstimates, battery: number | null = null) =>
      chargeEta(with_({car: {...car, chargeEstimates: estimates}, carBatteryKwh: battery}), 7.1);
    expect(eta([{at: NOW - HOUR}, {at: NOW + 2 * HOUR}, {minutes: 30}])).toBe(NOW + 2 * HOUR);
    expect(eta([{at: NOW - HOUR}, {minutes: 30}, {at: NOW + 2 * HOUR}])).toBe(NOW + 30 * MIN);
    // 26 % of 71 kWh at 7.1 kW: 2.6 hours
    expect(eta([], 71)).toBeCloseTo(NOW + 2.6 * HOUR);
    expect(eta([])).toBeNull();
    expect(chargeEta(with_({carBatteryKwh: 71}), 0.3)).toBeNull();
    expect(chargeEta(with_({car: null}), 7.1)).toBeNull();
  });

  test('with an ETA: the time left on the pill and the card, full at', () => {
    const activity = carActivity(with_({car: {...car, chargeEstimates: [{minutes: 110}]}}), null, deps)!;
    expect(activity.pill.extra).toBe('1 h 50');
    expect(activity.ariaLabel).toBe('Car charging, 64 percent, full in 1 h 50');
    expect(activity.card.kind === 'car' && activity.card.big.eta).toEqual({at: 'Full at 3:50 pm', inText: 'in 1 h 50'});
  });

  test('the current session: the last, ended within two hours, started at most an hour before the plug-in; its kWh and cost', () => {
    const plugged = car.plugChangedAt!;
    expect(currentSession(sessions(NOW - 2 * HOUR).sessions, plugged, NOW)).not.toBeNull();
    expect(currentSession(sessions(NOW - 2 * HOUR - 1).sessions, plugged, NOW)).toBeNull();
    expect(currentSession(sessions(NOW, plugged - HOUR - 1).sessions, plugged, NOW)).toBeNull();
    expect(currentSession(sessions(NOW, plugged - HOUR - 1).sessions, null, NOW)).not.toBeNull();
    expect(currentSession([], plugged, NOW)).toBeNull();
    const card = carActivity(house, sessions(NOW, plugged), deps)!.card;
    expect(card.kind === 'car' && card.meta.map(piece => piece.text).join('')).toBe(
      'Plugged in at 1:00 pm · +14.2 kWh so far · about $0.99 · 280 km range',
    );
    const fr = carActivity(house, sessions(NOW, plugged), frDeps)!.card;
    expect(fr.kind === 'car' && fr.meta.map(piece => piece.text).join('')).toBe(
      "Branchée à 13 h · +14,2 kWh jusqu'ici · environ 0,99 $ · 280 km d'autonomie",
    );
  });
});

describe('the water heater', () => {
  /** Five-minute means from `from` (minutes before now) for `kws`. */
  const series = (from: number, values: number[]): Point[] => values.map((v, i) => [NOW - from * MIN + i * 5 * MIN, v]);
  const on = (n: number) => Array<number>(n).fill(4.5);
  const off = (n: number) => Array<number>(n).fill(0);
  // two finished cycles of 30 and 50 minutes, then one started 20 minutes ago (the last point is 5 minutes old)
  const power = series(24 * 60 - 10, [...on(6), ...off(100), ...on(10), ...off(160)]).concat(series(20, on(4)));
  const history = (p: Point[], t: Point[] = []): LiveHistoryData => ({at: NOW, wh24: {t, p}, sessions: []});
  const heating = with_({waterHeater: {power: 4.5, temperature: 48.6, powerChangedAt: NOW - 20 * MIN}});

  test('runs are the points above 0.2\u00a0kW; one still on at the end closes five minutes after its last point', () => {
    expect(waterRuns(series(30, [0, 1, 1, 0, 1]))).toEqual([
      [NOW - 25 * MIN, NOW - 15 * MIN],
      [NOW - 10 * MIN, NOW - 5 * MIN],
    ]);
  });

  test('the time left is the upper median of the other cycles less the time since this one began', () => {
    const activity = waterActivity(heating, history(power), deps)!;
    // the cycles: 30 and 50 minutes; the upper middle is 50; 20 elapsed
    expect(activity).toMatchObject({
      key: 'wh',
      priority: 3,
      progress: 20 / 50,
      pill: {label: 'Water heater', value: '48.6°', extra: '~30 min'},
      short: {label: 'Water', value: null, extra: '~30 min'},
      ariaLabel: 'Water heater heating, about 30 min left',
    });
    expect(activity.card).toMatchObject({
      title: 'Water heater heating',
      right: '4.5\u00a0kW',
      big: {t: '48.6', rate: null, left: {main: '~30 min left', usual: 'usual cycle 50 min'}},
    });
    expect(activity.card.kind === 'wh' && activity.card.meta.map(piece => piece.text).join('')).toBe(
      'Started 1:40 pm · 1.5 kWh this cycle · 3 cycles in 24 h',
    );
  });

  test('almost done under three minutes; nothing to say without other cycles', () => {
    const late = with_({waterHeater: {...heating.waterHeater}, now: NOW + 48 * MIN});
    const almost = waterActivity(late, history(power), deps)!;
    expect(almost.pill.extra).toBe('almost done');
    expect(almost.card.kind === 'wh' && almost.card.big.left?.main).toBe('Almost done');
    expect(almost.ariaLabel).toBe('Water heater heating, almost done left');
    const alone = waterActivity(heating, null, deps)!;
    expect(alone).toMatchObject({progress: null, pill: {extra: null}, ariaLabel: 'Water heater heating'});
    expect(alone.card).toMatchObject({spark: null, big: {left: null}, meta: [{text: 'Started 1:40 pm'}]});
  });

  test('the rate per ten minutes from ten minutes before the cycle, shown from 0.05°, with its sparkline', () => {
    const temps = series(30, [44, 45, 46, 47, 48, 49]);
    const card = waterActivity(heating, history(power, temps), deps)!.card;
    expect(card.kind === 'wh' && card.big.rate).toBe('↗ 2.0° / 10 min');
    expect(card.kind === 'wh' && card.spark).toMatchObject({aria: 'Water temperature this cycle'});
    expect(card.kind === 'wh' && card.spark?.line.startsWith('M')).toBe(true);
    const flat = waterActivity(heating, history(power, series(30, [48, 48, 48, 48])), deps)!.card;
    expect(flat.kind === 'wh' && flat.big.rate).toBeNull();
    const down = waterActivity(heating, history(power, series(20, [50, 49])), deps)!.card;
    expect(down.kind === 'wh' && down.big.rate).toBe('↘ 2.0° / 10 min');
  });

  test('not heating, or no reading: nothing', () => {
    expect(waterActivity(house, null, deps)).toBeNull();
    expect(
      waterActivity(with_({waterHeater: {power: null, temperature: 50, powerChangedAt: null}}), null, deps),
    ).toBeNull();
  });
});

test('sortActivities: by priority, a missing activity left out', () => {
  const water = waterActivity(with_({waterHeater: {power: 4.5, temperature: 48, powerChangedAt: NOW}}), null, deps);
  const charge = carActivity(house, null, deps);
  expect(sortActivities([water, null, charge]).map(a => a.key)).toEqual(['car', 'wh']);
});
