// sunTimes() and isDayAt(): the suncalc maths against the times a published table gives for three places, and the
// panel's own numbers pinned so that the move out of the class changes none.
import {describe, expect, test} from 'vitest';
import {isDayAt, sunTimes} from '../../../src/core/sun.ts';

// sunrise-sunset.org (NOAA's solar calculator), to the second: London 2026-06-21, Toronto 2026-11-07, Sydney 2026-12-21 (a
// local day that starts the evening before in UTC). suncalc's constant J0 runs every time 50 to 110 seconds after NOAA's,
// so the tolerance is two minutes; the exact numbers are pinned in the next test.
const PUBLISHED = [
  {
    place: 'London',
    at: [51.5074, -0.1278, '2026-06-21'],
    rise: '2026-06-21T03:43:04Z',
    set: '2026-06-21T20:21:36Z',
    dawn: '2026-06-21T02:55:24Z',
    dusk: '2026-06-21T21:09:15Z',
    noon: '2026-06-21T12:02:20Z',
  },
  {
    place: 'Toronto',
    at: [43.65, -79.38, '2026-11-07'],
    rise: '2026-11-07T12:01:26Z',
    set: '2026-11-07T22:00:58Z',
    dawn: '2026-11-07T11:31:13Z',
    dusk: '2026-11-07T22:31:11Z',
    noon: '2026-11-07T17:01:12Z',
  },
  {
    place: 'Sydney',
    at: [-33.8688, 151.2093, '2026-12-21'],
    rise: '2026-12-20T18:40:40Z',
    set: '2026-12-21T09:05:22Z',
    dawn: '2026-12-20T18:11:37Z',
    dusk: '2026-12-21T09:34:24Z',
    noon: '2026-12-21T01:53:01Z',
  },
] as const;

const TWO_MINUTES = 120e3;

describe('against published times', () => {
  test.each(PUBLISHED)('$place: rise, set, dawn, dusk and noon within two minutes', ({at, ...published}) => {
    const [latitude, longitude, day] = at;
    const times = sunTimes(latitude, longitude, day);
    for (const name of ['rise', 'set', 'dawn', 'dusk', 'noon'] as const) {
      expect(Math.abs((times[name] as number) - Date.parse(published[name]))).toBeLessThan(TWO_MINUTES);
    }
  });
});

describe('the panel own numbers', () => {
  test('the test house day, to the millisecond (7:02 am and 5:02 pm in the Weather baseline)', () => {
    const times = sunTimes(43.65, -79.38, '2026-11-07');
    expect(new Date(times.rise as number).toISOString()).toBe('2026-11-07T12:02:17.907Z');
    expect(new Date(times.set as number).toISOString()).toBe('2026-11-07T22:02:44.260Z');
    expect(new Date(times.dawn as number).toISOString()).toBe('2026-11-07T11:32:00.485Z');
    expect(new Date(times.dusk as number).toISOString()).toBe('2026-11-07T22:33:01.682Z');
    expect(new Date(times.noon).toISOString()).toBe('2026-11-07T17:02:31.084Z');
  });

  test('the next day is a day later, give or take the equation of time', () => {
    const delta = sunTimes(43.65, -79.38, '2026-11-08').noon - sunTimes(43.65, -79.38, '2026-11-07').noon;
    expect(Math.abs(delta - 864e5)).toBeLessThan(60e3);
  });

  test('the days shorten in November and lengthen in January at this latitude', () => {
    const length = (day: string) => {
      const {rise, set} = sunTimes(43.65, -79.38, day);
      return (set as number) - (rise as number);
    };
    expect(length('2026-11-08')).toBeLessThan(length('2026-11-07'));
    expect(length('2027-01-28')).toBeGreaterThan(length('2027-01-14'));
  });
});

describe('where the sun does not rise or set', () => {
  test.each(['2026-06-21', '2026-12-21'])('Svalbard on %s has no rise, set, dawn or dusk, and still a noon', day => {
    const times = sunTimes(78.22, 15.65, day);
    expect([times.rise, times.set, times.dawn, times.dusk]).toEqual([null, null, null, null]);
    expect(Number.isFinite(times.noon)).toBe(true);
  });

  test('isDayAt is false there, on a polar day as on a polar night (the panel has always said so)', () => {
    expect(isDayAt(Date.parse('2026-06-21T12:00:00Z'), 78.22, 15.65, '2026-06-21')).toBe(false);
    expect(isDayAt(Date.parse('2026-12-21T12:00:00Z'), 78.22, 15.65, '2026-12-21')).toBe(false);
  });
});

describe('isDayAt', () => {
  const day = (iso: string) => isDayAt(Date.parse(iso), 43.65, -79.38, '2026-11-07');

  test('noon is day and midnight is night', () => {
    expect(day('2026-11-07T17:00:00Z')).toBe(true);
    expect(day('2026-11-07T05:00:00Z')).toBe(false);
  });

  test('the instants around sunrise and sunset are on either side', () => {
    const {rise, set} = sunTimes(43.65, -79.38, '2026-11-07');
    expect(isDayAt((rise as number) - 1, 43.65, -79.38, '2026-11-07')).toBe(false);
    expect(isDayAt((rise as number) + 1, 43.65, -79.38, '2026-11-07')).toBe(true);
    expect(isDayAt((set as number) - 1, 43.65, -79.38, '2026-11-07')).toBe(true);
    expect(isDayAt((set as number) + 1, 43.65, -79.38, '2026-11-07')).toBe(false);
  });
});
