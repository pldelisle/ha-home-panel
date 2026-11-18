// The sensor history sheet's rules as pure functions: a door's or motion sensor's states in, the on-periods, the strip's axis,
// the event rows, the four tiles and the sheet's words out.
// Pattern: functional core (Bernhardt, Boundaries), the data half of a humble object (Meszaros); each rule is that of the legacy
// panel's `sensSheet`, deleted by #227, and the sheet only places what comes out; `fmt`, `t` and `now` are arguments.
// Must not: call the API client or the cache, read the clock or the DOM, or keep a state between two calls.
import {bareReading, type Reading} from '../../ui/reading.ts';
import type {HistoryPoint} from '../../core/ha.ts';
import type {MessageKey} from '../../core/i18n/en.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import type {Translate} from '../../core/i18n/messages.ts';
import type {SensorKind} from '../../providers/door-motion.ts';

/** The words that differ by kind: a door opens and closes, a motion sensor detects; the rows, the tiles and the sheet read this one table. */
const KIND_WORDS: Record<
  SensorKind,
  {
    /** The line under the sheet's title. */
    kind: MessageKey;
    /** A period still on: "Still open", "Motion now". */
    live: MessageKey;
    /** A period that ended, with its length `{d}`: "Open for 3 min". */
    lasted: MessageKey;
    /** The count tile's label. */
    count: MessageKey;
    /** The total tile's label. */
    total: MessageKey;
    /** The strip's name for a screen reader. */
    periods: MessageKey;
    /** What the list says without a period. */
    none: MessageKey;
  }
> = {
  door: {
    kind: 'security.door',
    live: 'security.stillOpen',
    lasted: 'security.openFor',
    count: 'security.timesOpened',
    total: 'security.totalOpen',
    periods: 'security.openPeriods',
    none: 'security.notOpenedInPeriod',
  },
  motion: {
    kind: 'security.motion',
    live: 'security.motionNow',
    lasted: 'security.motionFor',
    count: 'security.motionEvents',
    total: 'security.totalMotion',
    periods: 'security.motionPeriods',
    none: 'security.noMotionInPeriod',
  },
};

/** The two ranges the sheet offers; its axis is four spans of the day, or seven of the week. */
export type SheetRange = 'day' | 'week';

/** One period the sensor was on: from `a` to `b`, in milliseconds; `live` when it is still on, and `b` is then the moment asked. */
export interface Segment {
  a: number;
  b: number;
  live: boolean;
}

/** How long a sensor's history stays fresh in the pane's cache: the ten minutes Weather's history keeps its own. */
export const HISTORY_TTL_MS = 10 * 60_000;

/** The most event rows the sheet lists, newest first. */
export const EVENT_LIMIT = 40;

/**
 * The on-periods of a sensor's states, sorted by time: the first `on` starts at its own time, or at `t0` when it began before
 * the window (Home Assistant sends the state at the window's start); an `on` run ends at the next state that is not `on`; a run
 * still on at the end ends at `now` and is live.
 */
export function segments(points: readonly HistoryPoint[], t0: number, now: number): Segment[] {
  const out: Segment[] = [];
  let from: number | null = null;
  for (const {state, lastUpdated} of points) {
    if (state === 'on' && from === null) from = Math.max(lastUpdated, t0);
    else if (state !== 'on' && from !== null) {
      out.push({a: from, b: lastUpdated, live: false});
      from = null;
    }
  }
  if (from !== null) out.push({a: from, b: now, live: true});
  return out;
}

export interface PeriodStats {
  /** The number of on-periods. */
  count: number;
  /** Their total length in milliseconds. */
  total: number;
  /** The longest one in milliseconds. */
  longest: number;
  /** When the last one began (still on) or ended, in milliseconds; null with no period. */
  last: number | null;
}

/** The tiles' numbers; a live period is counted up to `now`, so a later `now` grows it without new segments. */
export function periodStats(segs: readonly Segment[], now: number): PeriodStats {
  const length = (s: Segment) => (s.live ? now : s.b) - s.a;
  const last = segs.at(-1);
  return {
    count: segs.length,
    total: segs.reduce((sum, s) => sum + length(s), 0),
    longest: segs.reduce((most, s) => Math.max(most, length(s)), 0),
    last: last ? (last.live ? last.a : last.b) : null,
  };
}

/** `n + 1` instants spread evenly from `t0` to `now`, the labels of the strip's axis (the caller formats them). */
export function axisTicks(t0: number, now: number, n: number): number[] {
  return Array.from({length: n + 1}, (_, i) => t0 + ((now - t0) * i) / n);
}

/** One bar of the strip: where it starts and how wide it is, in percent of the window, as the two-decimal text the style takes. */
export interface StripBar {
  left: string;
  width: string;
}

/** The narrowest a bar is drawn, in percent of the window: a blink of the sensor stays visible. */
const MIN_BAR = 0.35;

/** The strip's bars: each period placed by percent of the window from `t0` to `now`. */
export function stripBars(segs: readonly Segment[], t0: number, now: number): StripBar[] {
  const pct = (t: number) => ((t - t0) / (now - t0)) * 100;
  return segs.map(s => ({
    left: pct(s.a).toFixed(2),
    width: Math.max(MIN_BAR, pct(s.b) - pct(s.a)).toFixed(2),
  }));
}

/** The axis under the strip: four spans of the day labelled by time, seven of the week labelled by date, in the profile's formats. */
export function axisLabels(range: SheetRange, t0: number, now: number, fmt: Formatters): string[] {
  const day = range === 'day';
  return axisTicks(t0, now, day ? 4 : 7).map(tick => (day ? fmt.time(tick) : fmt.date(tick)));
}

/** How long a period lasted: `40 s` under a minute (at least one second), `12 min` under an hour, then `1 h 5 min`. */
export function durationText(ms: number, t: Translate): string {
  if (ms < 6e4) return t('security.duration.seconds', {n: Math.max(1, Math.round(ms / 1e3))});
  if (ms < 36e5) return t('security.duration.minutes', {n: Math.round(ms / 6e4)});
  return t('security.duration.hours', {n: Math.floor(ms / 36e5), m: Math.round(ms / 6e4) % 60});
}

export interface EventRow {
  /** The period's start, so the list keeps a row's node across updates. */
  key: number;
  /** When it began: the time on the day range, the date and the time on the week's. */
  when: string;
  /** "Open for 3 min", "Motion for 40 s", "Still open", "Motion now". */
  text: string;
}

/** The last forty periods, newest first, as the list's rows. */
export function eventRows(
  segs: readonly Segment[],
  kind: SensorKind,
  range: SheetRange,
  fmt: Formatters,
  t: Translate,
): EventRow[] {
  const words = KIND_WORDS[kind];
  return segs
    .slice(-EVENT_LIMIT)
    .reverse()
    .map(s => ({
      key: s.a,
      when: range === 'day' ? fmt.time(s.a) : `${fmt.date(s.a)} ${fmt.time(s.a)}`,
      text: s.live ? t(words.live) : t(words.lasted, {d: durationText(s.b - s.a, t)}),
    }));
}

export interface StatTile extends Pick<Reading, 'value' | 'missing'> {
  label: string;
}

/** The four tiles under the strip: how many, the total, the longest, and when the last one was; "No reading" for what there is not. */
export function statTiles(
  stats: PeriodStats,
  kind: SensorKind,
  now: number,
  fmt: Formatters,
  t: Translate,
): StatTile[] {
  const words = KIND_WORDS[kind];
  const some = stats.count > 0;
  return [
    {label: t(words.count), ...bareReading(t, String(stats.count))},
    {label: t(words.total), ...bareReading(t, some ? durationText(stats.total, t) : null)},
    {label: t('security.longest'), ...bareReading(t, some ? durationText(stats.longest, t) : null)},
    {
      label: t('security.last'),
      ...bareReading(t, stats.last === null ? null : t('security.ago', fmt.ago(stats.last, now))),
    },
  ];
}

export interface SheetTexts {
  /** The sheet's title. */
  title: string;
  /** The line under it: "Door" or "Motion". */
  kind: string;
  /** The strip's heading: "Front door, last 24 hours". */
  heading: string;
  /** The strip's name for a screen reader. */
  strip: string;
  /** What the list says when there is no period. */
  empty: string;
  loading: string;
  unavailable: string;
  /** The tiles' heading. */
  overPeriod: string;
}

/** The sheet's words for a sensor and the range's label ("last 24 hours"). */
export function sheetTexts(kind: SensorKind, name: string, rangeLabel: string, t: Translate): SheetTexts {
  const words = KIND_WORDS[kind];
  return {
    title: name,
    kind: t(words.kind),
    heading: t('security.heading', {name, range: rangeLabel}),
    strip: t(words.periods),
    empty: t(words.none),
    loading: t('security.loading'),
    unavailable: t('security.unavailable'),
    overPeriod: t('security.overPeriod'),
  };
}
