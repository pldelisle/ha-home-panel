// The test house's clock: the reference instant, and the time markers a house keeps in place of dates.
// Pattern: data with late binding (a marker is resolved against `now` by the reader, so one house serves a fixed clock
// in Vitest and a faked or real clock in the browser; the marker is plain, serialisable data, after Fowler's "Time Point").
// Must not: read the real clock (every function takes `now`), or know what a house holds.

/** The instant the unit tests start a house at, and the fake clock most e2e tests start the page at (a Saturday afternoon, Toronto time). */
export const REFERENCE_INSTANT = '2026-11-07T14:00:00-05:00';
export const REFERENCE_MS = Date.parse(REFERENCE_INSTANT);

/** An instant `ms` after the house's `now` (negative: before it). */
export const fromNow = ms => ({$time: {from: 'now', plus: ms}});
/** An instant `ms` after the start of the house's local day. */
export const fromMidnight = ms => ({$time: {from: 'midnight', plus: ms}});
/** The next local `hour`:`minute` at or after `now` (today's if it is still ahead, tomorrow's if not), `ms` later. */
export const nextAt = (hour, minute, ms = 0) => ({$time: {from: 'next', at: [hour, minute], plus: ms}});
/** 'above_horizon' when the next local `set` comes before the next local `rise`, 'below_horizon' otherwise. */
export const sunState = (rise, set) => ({$sun: {rise, set}});

const WALL = ['year', 'month', 'day', 'hour', 'minute'];

/** The local wall clock of instant `t` in `timeZone` (the host's zone when undefined), as numbers. */
function wall(t, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    })
      .formatToParts(t)
      .map(p => [p.type, +p.value]),
  );
  return WALL.map(k => parts[k]);
}

/** The instant at which the wall clock of `timeZone` reads year-month-day hour:minute (month from 1; days may overflow). */
function instantAt([year, month, day, hour, minute], timeZone) {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute);
  let guess = asUtc;
  // the zone's offset depends on the instant, so settle on it in two steps (the second only matters around a change of offset)
  for (let i = 0; i < 2; i++) {
    const [y, mo, d, h, mi] = wall(guess, timeZone);
    guess += asUtc - Date.UTC(y, mo - 1, d, h, mi);
  }
  return guess;
}

/** The start of the local day that contains `now`. */
export function dayStart(now, timeZone) {
  const [y, mo, d] = wall(now, timeZone);
  return instantAt([y, mo, d, 0, 0], timeZone);
}

/** The next local hour:minute at or after `now`. */
export function nextAtMs(now, [hour, minute], timeZone) {
  const [y, mo, d] = wall(now, timeZone);
  const today = instantAt([y, mo, d, hour, minute], timeZone);
  return today < now ? instantAt([y, mo, d + 1, hour, minute], timeZone) : today;
}

/** The value of one marker at `now`. */
function resolveMarker(marker, now, timeZone) {
  if (marker.$sun) {
    const rise = nextAtMs(now, marker.$sun.rise, timeZone),
      set = nextAtMs(now, marker.$sun.set, timeZone);
    return set < rise ? 'above_horizon' : 'below_horizon';
  }
  const {from, plus, at} = marker.$time;
  const base = from === 'now' ? now : from === 'midnight' ? dayStart(now, timeZone) : nextAtMs(now, at, timeZone);
  return new Date(base + plus).toISOString();
}

/**
 * A copy of `value` with every marker replaced by what it means at `now` (ISO strings; 'above_horizon' or
 * 'below_horizon' for the sun). The harness calls it with the page's clock and the browser's zone, `fakeHass.fromHouse`
 * with a fixed instant and the house's zone: the same helper, so a model test and a screenshot see the same house.
 */
export function resolveTimes(value, now, timeZone) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(v => resolveTimes(v, now, timeZone));
  if ('$time' in value || '$sun' in value) return resolveMarker(value, now, timeZone);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveTimes(v, now, timeZone)]));
}
