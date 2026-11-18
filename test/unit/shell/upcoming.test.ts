// The phone's "Coming up" list (#267): what `readUpcoming` reads of the test house, and each row `upcoming` words, in the legacy
// `upcoming()`'s order: the sun's two events in the order they come, then Hilo, Hydro-Québec, the car's departure and the modes on.
import {describe, expect, test} from 'vitest';
import {sunTimes} from '../../../src/core/sun.ts';
import {readUpcoming, upcoming, type UpcomingInputs} from '../../../src/shell/upcoming.ts';
import {FULL_CFG} from '../../e2e/houses.ts';
import type {FakeHass} from '../fake-hass.ts';
import {fullHouse, storeOf} from '../features/media/support.ts';

const withSources = {
  ...FULL_CFG,
  entities: {...FULL_CFG.entities, hilo_challenge: 'sensor.defi', hydro_quebec_upcoming_peak: 'binary_sensor.peak'},
};
const storeAt = (patch: Parameters<FakeHass['next']>[0] = {}, language = 'en') => {
  const hass = fullHouse.next(patch);
  return storeOf({...hass, locale: {...hass.locale, language}}, withSources);
};
const rows = (store: ReturnType<typeof storeAt>) =>
  upcoming(readUpcoming(store.hass!.states, store.config, store.names), {t: store.t, fmt: store.fmt}).map(
    ({when, what}) => `${when} | ${what}`,
  );
const schedule = (days: string[]) => ({
  'switch.fordpass_test_departuretimes': {state: 'on'},
  'sensor.fordpass_test_departureschedules': {
    state: 'on',
    attributes: {schedule: Object.fromEntries(days.map(day => [day, {timeOfDay: {hours: 7, minutes: 30}}]))},
  },
});
const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

describe('readUpcoming and upcoming', () => {
  test('by day the sunset comes first; nothing else is planned in the test house', () => {
    expect(rows(storeAt())).toStrictEqual([
      '4:45 pm | Sunset · theme turns dark',
      '7:00 am | Sunrise · every light off, night modes off',
    ]);
  });

  test("given the house's place and day, the sun's rows are today's computed pair, the same as Lights and Weather say", () => {
    const store = storeAt();
    const {rise, set} = sunTimes(43.65, -79.38, '2026-11-07');
    const today = {latitude: 43.65, longitude: -79.38, day: '2026-11-07'};
    const inputs = readUpcoming(store.hass!.states, store.config, store.names, today);
    expect([inputs.sunrise, inputs.sunset]).toStrictEqual([rise, set]);
  });

  test('by night the sunrise comes first, and a sun sensor that reads nothing has no row', () => {
    expect(rows(storeAt({'sun.sun': {state: 'below_horizon'}}))).toStrictEqual([
      '7:00 am | Sunrise · every light off, night modes off',
      '4:45 pm | Sunset · theme turns dark',
    ]);
    expect(rows(storeAt({'sensor.sun_next_setting': {state: 'unavailable'}}))).toStrictEqual([
      '7:00 am | Sunrise · every light off, night modes off',
    ]);
  });

  test("Hilo's challenge, the coming peak, the departure every weekday and the modes on, in that order", () => {
    const store = storeAt({
      'sensor.defi': {state: 'reduction'},
      'binary_sensor.peak': {state: 'on'},
      'input_boolean.kids_bedtime': {state: 'on'},
      ...schedule(WEEKDAYS),
    });
    expect(rows(store).slice(2)).toStrictEqual([
      'Hilo | Challenge: reduction',
      'Hydro-Québec | Critical peak coming',
      'Car | Weekdays at 7:30 am departure',
      'On | Kids bedtime',
    ]);
  });

  test('in French', () => {
    const store = storeAt({'sensor.defi': {state: 'reduction'}, ...schedule(WEEKDAYS)}, 'fr');
    expect(rows(store)).toStrictEqual([
      '16 h 45 | Coucher du soleil · le thème passe en sombre',
      '7 h | Lever du soleil · toutes les lumières éteintes, modes nuit désactivés',
      'Hilo | Défi : réduction',
      'Voiture | Départ : En semaine à 7 h 30',
    ]);
  });

  test('a challenge that is off, and a departure whose switch is off, have no row', () => {
    const store = storeAt({
      'sensor.defi': {state: 'off'},
      ...schedule(WEEKDAYS),
      'switch.fordpass_test_departuretimes': {state: 'off'},
    });
    expect(rows(store)).toHaveLength(2);
  });

  test('the departure every day, and on named days', () => {
    const every = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    expect(rows(storeAt(schedule(every))).at(-1)).toBe('Car | Every day at 7:30 am departure');
    expect(rows(storeAt(schedule(['monday', 'wednesday']))).at(-1)).toMatch(/^Car \| Mon, Wed at 7:30 am departure$/);
  });
});

describe('upcoming without a house', () => {
  const none: UpcomingInputs = {
    day: true,
    sunset: null,
    sunrise: null,
    challenge: null,
    peakComing: false,
    departure: null,
    modes: [],
  };
  test('says nothing when nothing is planned', () => {
    const store = storeAt();
    expect(upcoming(none, {t: store.t, fmt: store.fmt})).toStrictEqual([]);
  });
});
