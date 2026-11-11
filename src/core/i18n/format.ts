// The formatters: every date, time and number the panel shows, built once from a locale spec over `Intl` (Unicode CLDR).
// Pattern: a factory returning the instance's functions and its per-hour cache (Ousterhout, deep module), on the same CLDR
// data as Home Assistant's formatTime and formatNumber. Deliberate overrides of CLDR and `Intl`, and the only
// post-processing: the three house rules (en-* am/pm without periods, fr-* "16 h" on the hour, fr-* thousands U+202F)
// and number() and fixed() clamping their fraction digits to 2, and time24 and time24s, which join the parts with a colon and Latin
// digits in every locale because the table asks for `16:07`. Must not: read the clock, the DOM or a browser default.
import {HOUR_MS, MINUTE_MS} from '../figures.ts';
import type {PanelLocaleSpec} from './locale.ts';

type Instant = Date | number;

/** The local day, hour (0 to 23) and short weekday of an instant. */
export interface DayParts {
  day: string;
  h: number;
  wd: string;
}

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
  /** The local day, hour and short weekday, cached by hour. */
  dayParts(d: Instant): DayParts;
  /** The local time as a fractional hour: `16.12` for 16:07. */
  hourNow(now: Instant): number;
  integer(n: number): string;
  /** At most `maxFraction` digits (default 1), clamped to 2. */
  number(n: number, maxFraction?: number): string;
  /** Exactly `digits` fraction digits, clamped to 2: `4.0`, `101.9`, `4,0`; the former `toFixed`. */
  fixed(n: number, digits: number): string;
  /**
   * How long before `now` an instant was: `just now`, `5 min ago`, `2 h ago`, and from a day on its date (`Nov 7`).
   * The legacy panel's `ago` rule, which stays there until the last feature that says it has moved; `now` is passed in, never read.
   */
  ago(d: Instant, now: number): string;
}

// `ago`'s words, which the rewrite layer makes of the English ones (`just now`, `{n} min ago`, `{n} h ago`); a language
// with no row says them in English, as the catalog does
const AGO_WORDS: Record<string, {now: string; min: (n: number) => string; hour: (n: number) => string}> = {
  en: {now: 'just now', min: n => `${n} min ago`, hour: n => `${n} h ago`},
  fr: {now: "à l'instant", min: n => `il y a ${n} min`, hour: n => `il y a ${n} h`},
};

const PARTS_CACHE_LIMIT = 20_000;

type HouseRule = (text: string) => string;
const asIs: HouseRule = text => text;

// The three house rules, as functions of a formatted string. Rule 1: the English day period, the former `ampm()`.
const englishDayPeriod: HouseRule = text => text.replace(/\s?([ap])\.\s?m\.?/i, ' $1m');
// Rule 2: French time on the hour, and the bare hour `Intl` gives for fr-* gains " h", as the rewrite layer's `frH`.
const frenchOnTheHour: HouseRule = text => text.replace(/ 00$/, '');
// (some ICU versions already add the " h", with a leading zero at midnight, and some give the bare digits)
const frenchBareHour: HouseRule = text =>
  text.replace(/^(\d+)(?: h)?$/, (_match, digits: string) => `${Number(digits)} h`);
// Rule 3: the French thousands separator, the character the rewrite layer writes today.
const frenchThousands: HouseRule = text => text.replace(/\u00a0/g, '\u202f');

/** A whole number; the -0 of Math.round(-0.4) is 0, which Intl would otherwise write as `-0`. */
export const whole = (fmt: Formatters, n: number): string => fmt.integer(Math.round(n) + 0);
/** A whole number of degrees: `12°`. */
export const degrees = (fmt: Formatters, n: number): string => `${whole(fmt, n)}°`;

export function createFormatters(locale: PanelLocaleSpec): Formatters {
  const {language, tag, timeZone, hour12} = locale;
  // the rules are chosen once, by the tag's language; every other language is `Intl`'s own output
  const timeRule = language === 'en' ? englishDayPeriod : language === 'fr' ? frenchOnTheHour : asIs;
  const hourRule = language === 'en' ? englishDayPeriod : language === 'fr' ? frenchBareHour : asIs;
  const numberRule = language === 'fr' ? frenchThousands : asIs;
  const agoWords = AGO_WORDS[language] ?? AGO_WORDS.en;

  // `Intl` formatters are expensive to build: each is built once per instance, and always with the time zone
  const dateFormat = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(tag, {timeZone, ...options});
  // a clock or a calendar day is composed from parts, in Latin digits, so no locale puts "h" or "min" into it
  const partsOf = (options: Intl.DateTimeFormatOptions) => {
    const format = dateFormat({numberingSystem: 'latn', ...options});
    return (d: Instant) => {
      const parts = format.formatToParts(d);
      return (type: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === type)!.value;
    };
  };
  type Part = ReturnType<ReturnType<typeof partsOf>>;
  const isoDayOf = (part: Part) => `${part('year')}-${part('month')}-${part('day')}`;

  const time = dateFormat({hour: 'numeric', minute: '2-digit', hour12});
  const hour = dateFormat({hour: 'numeric', hour12});
  const clock = partsOf({hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
  const clockS = partsOf({hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'});
  const date = dateFormat({month: 'short', day: 'numeric'});
  const dateWeekday = dateFormat({weekday: 'short', month: 'short', day: 'numeric'});
  const dateLong = dateFormat({weekday: 'long', month: 'long', day: 'numeric'});
  const weekday = {long: dateFormat({weekday: 'long'}), short: dateFormat({weekday: 'short'})};
  const month = {long: dateFormat({month: 'long'}), short: dateFormat({month: 'short'})};
  const day = partsOf({year: 'numeric', month: '2-digit', day: '2-digit'});
  const local = partsOf({
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: 'numeric',
    hourCycle: 'h23',
    weekday: 'short',
  });
  const numberFormat = (maximumFractionDigits: number) =>
    new Intl.NumberFormat(locale.numberLocale, {maximumFractionDigits, useGrouping: locale.useGrouping});
  const integer = numberFormat(0);
  const numbers = new Map<number, Intl.NumberFormat>();
  const fixedFormats = new Map<number, Intl.NumberFormat>();

  // the hour-bucket cache of the former `localParts`: an instant is formatted at the top of its UTC hour, which is also
  // the top of its local hour in every whole-hour zone; a half-hour zone (Asia/Kolkata) can be given the previous hour
  const cache = new Map<number, DayParts>();

  return {
    time: d => timeRule(time.format(d)),
    hour: d => hourRule(hour.format(d)),
    time24: d => {
      const part = clock(d);
      return `${part('hour')}:${part('minute')}`;
    },
    time24s: d => {
      const part = clockS(d);
      return `${part('hour')}:${part('minute')}:${part('second')}`;
    },
    date: d => date.format(d),
    dateWeekday: d => dateWeekday.format(d),
    dateLong: d => dateLong.format(d),
    weekday: (d, style) => weekday[style].format(d),
    month: (d, style) => month[style].format(d),
    isoDay: d => isoDayOf(day(d)),
    dayParts: d => {
      const key = Math.floor(Number(d) / HOUR_MS);
      const hit = cache.get(key);
      if (hit) return hit;
      const part = local(key * HOUR_MS);
      const parts: DayParts = {day: isoDayOf(part), h: Number(part('hour')), wd: part('weekday')};
      if (cache.size > PARTS_CACHE_LIMIT) cache.clear();
      cache.set(key, parts);
      return parts;
    },
    hourNow: now => {
      const part = clock(now);
      return Number(part('hour')) + Number(part('minute')) / 60;
    },
    // Math.round first: Intl rounds a half away from zero, the former `Math.round(v).toLocaleString` does not
    integer: n => numberRule(integer.format(Math.round(n))),
    number: (n, maxFraction) => {
      const digits = Math.min(maxFraction ?? 1, 2);
      let format = numbers.get(digits);
      if (!format) numbers.set(digits, (format = numberFormat(digits)));
      return numberRule(format.format(n));
    },
    fixed: (n, digits) => {
      const exactly = Math.min(digits, 2);
      let format = fixedFormats.get(exactly);
      if (!format) {
        const options = {
          minimumFractionDigits: exactly,
          maximumFractionDigits: exactly,
          useGrouping: locale.useGrouping,
        };
        fixedFormats.set(exactly, (format = new Intl.NumberFormat(locale.numberLocale, options)));
      }
      return numberRule(format.format(n));
    },
    ago: (d, now) => {
      const minutes = Math.round((now - Number(d)) / MINUTE_MS);
      if (minutes < 1) return agoWords.now;
      if (minutes < 60) return agoWords.min(minutes);
      if (minutes < 1440) return agoWords.hour(Math.round(minutes / 60));
      return date.format(d);
    },
  };
}
