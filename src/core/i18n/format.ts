// The formatters: every date, time and number the panel shows, built once from a locale spec over `Intl` (Unicode CLDR).
// Pattern: a factory returning the instance's functions and its per-hour cache (Ousterhout, deep module), on the same CLDR
// data as Home Assistant's formatTime and formatNumber. Deliberate overrides of CLDR and `Intl`, and the only
// post-processing: the three house rules (en-* am/pm without periods, fr-* "16 h" on the hour, fr-* thousands U+202F)
// and number() clamping its fraction digits to 2, and time24 and time24s, which join the parts with a colon and Latin
// digits in every locale because the table asks for `16:07`. Must not: read the clock, the DOM or a browser default.
import type {PanelLocaleSpec} from './locale.ts';

type Instant = Date | number;

export interface Formatters {
  /** `4:07 pm`, `16 h 07`, `16:07`. */
  time(d: Instant): string;
  /** `4 pm`, `16 h`, `16 Uhr`. */
  hour(d: Instant): string;
  /** `16:07`, never `24:07`, whatever the locale. */
  time24(d: Instant): string;
  /** `16:07:09`, whatever the locale. */
  time24s(d: Instant): string;
  /** `Nov 7`, `7 nov.`. */
  date(d: Instant): string;
  /** `Sat, Nov 7`, `sam. 7 nov.`. */
  dateWeekday(d: Instant): string;
  /** `Saturday, November 7`, `samedi 7 novembre`. */
  dateLong(d: Instant): string;
  weekday(d: Instant, style: 'long' | 'short'): string;
  month(d: Instant, style: 'long' | 'short'): string;
  /** `2026-11-07`, the local day. */
  isoDay(d: Instant): string;
  /** The local day, hour (0 to 23) and short weekday, cached by hour. */
  dayParts(d: Instant): {day: string; h: number; wd: string};
  /** The local time as a fractional hour: `16.12` for 16:07. */
  hourNow(now: Instant): number;
  integer(n: number): string;
  /** At most `maxFraction` digits (default 1), clamped to 2. */
  number(n: number, maxFraction?: number): string;
}

const PARTS_CACHE_LIMIT = 20_000;
const HOUR_MS = 36e5;

export function createFormatters(l: PanelLocaleSpec): Formatters {
  const lang = l.tag.split('-')[0].toLowerCase();
  const en = lang === 'en';
  const fr = lang === 'fr';

  // `Intl` formatters are expensive to build: each is built once per instance, and always with the time zone
  const dtf = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(l.tag, {timeZone: l.timeZone, ...o});
  // a clock or a calendar day is composed from parts, in Latin digits, so no locale puts "h" or "min" into it
  const partsOf = (o: Intl.DateTimeFormatOptions) => {
    const f = dtf({numberingSystem: 'latn', ...o});
    return (d: Instant) => {
      const parts = f.formatToParts(d);
      return (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
    };
  };

  const time = dtf({hour: 'numeric', minute: '2-digit', hour12: l.hour12});
  const hour = dtf({hour: 'numeric', hour12: l.hour12});
  const clock = partsOf({hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
  const clockS = partsOf({hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'});
  const date = dtf({month: 'short', day: 'numeric'});
  const dateWeekday = dtf({weekday: 'short', month: 'short', day: 'numeric'});
  const dateLong = dtf({weekday: 'long', month: 'long', day: 'numeric'});
  const weekday = {long: dtf({weekday: 'long'}), short: dtf({weekday: 'short'})};
  const month = {long: dtf({month: 'long'}), short: dtf({month: 'short'})};
  const day = partsOf({year: 'numeric', month: '2-digit', day: '2-digit'});
  const local = partsOf({
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const clockNow = partsOf({hour: 'numeric', minute: 'numeric', hourCycle: 'h23'});
  const nf = (maximumFractionDigits: number) =>
    new Intl.NumberFormat(l.numberLocale, {maximumFractionDigits, useGrouping: l.useGrouping});
  const integer = nf(0);
  const numbers = new Map<number, Intl.NumberFormat>();

  // the three house rules, in one place and keyed by the tag's language; every other language is `Intl`'s own output
  const post = (kind: 'time' | 'hour' | 'number', text: string): string => {
    if (en && kind !== 'number') return text.replace(/\s?([ap])\.\s?m\.?/i, ' $1m');
    if (fr && kind === 'time') return text.replace(/ 00$/, '');
    if (fr && kind === 'hour') return /^\d+$/.test(text) ? `${Number(text)} h` : text;
    if (fr && kind === 'number') return text.replace(/\u00a0/g, '\u202f');
    return text;
  };

  const cache = new Map<number, {day: string; h: number; wd: string}>();

  return {
    time: d => post('time', time.format(d)),
    hour: d => post('hour', hour.format(d)),
    time24: d => {
      const p = clock(d);
      return `${p('hour')}:${p('minute')}`;
    },
    time24s: d => {
      const p = clockS(d);
      return `${p('hour')}:${p('minute')}:${p('second')}`;
    },
    date: d => date.format(d),
    dateWeekday: d => dateWeekday.format(d),
    dateLong: d => dateLong.format(d),
    weekday: (d, style) => weekday[style].format(d),
    month: (d, style) => month[style].format(d),
    isoDay: d => {
      const p = day(d);
      return `${p('year')}-${p('month')}-${p('day')}`;
    },
    dayParts: d => {
      const key = Math.floor(Number(d) / HOUR_MS);
      const hit = cache.get(key);
      if (hit) return hit;
      const p = local(key * HOUR_MS);
      const v = {day: `${p('year')}-${p('month')}-${p('day')}`, h: Number(p('hour')), wd: p('weekday')};
      if (cache.size > PARTS_CACHE_LIMIT) cache.clear();
      cache.set(key, v);
      return v;
    },
    hourNow: now => {
      const p = clockNow(now);
      return Number(p('hour')) + Number(p('minute')) / 60;
    },
    // Math.round first: Intl rounds a half away from zero, the legacy `Math.round(v).toLocaleString` does not
    integer: n => post('number', integer.format(Math.round(n))),
    number: (n, maxFraction) => {
      const digits = Math.min(maxFraction ?? 1, 2);
      let f = numbers.get(digits);
      if (!f) numbers.set(digits, (f = nf(digits)));
      return post('number', f.format(n));
    },
  };
}
