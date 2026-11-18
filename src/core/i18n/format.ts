// The formatters: every date, time and number the panel shows, built once from a locale spec over `Intl` (Unicode CLDR).
// Pattern: a factory returning the instance's functions and its per-hour cache (Ousterhout, deep module), on the same CLDR
// data as Home Assistant's formatTime and formatNumber. Deliberate overrides of CLDR and `Intl`, and the only post-processing:
// the three house rules (en-* am/pm without periods, fr-* "16 h" on the hour, fr-* thousands U+202F), number() and fixed() clamping
// their fraction digits to 2, `clock` placing a time of day on a fixed UTC day, `timeSeconds` and `hourOfDay` following `time` and `hour`, time24 and time24s joining the parts with a colon and Latin digits in every locale (the table asks for `16:07`),
// and `ago`, the one function that returns no text: it cuts a span into a kind and a count (the legacy rule) and formats only the date, so the words stay in the catalog.
// Beside the factory, the module functions over an instance: `fixedOr`, `whole`, `degrees`, and the day keys' `utcNoonOf` and `noonOf`.
// One rule per kind of quantity, which every tab routes its figures through (#417, Apple HIG consistency). Figure only (a catalog
// message adds the sign): `percent` (whole, `64`; the catalog spaces the `%`), `temperatureFigure` (a tenth, `20.6`, for what is
// measured), `forecastFigure` (whole degrees, for highs, lows and normals), `money(fmt, n, 'headline' | 'cents')` (whole dollars in a
// tile, cents in a table; the catalog's `car.money` adds the `$`), `powerParts` (`{n, unit}`, watts in, two significant figures, W
// under a kilowatt, then kW), `whole` and `fixedOr`. The FIGURE forms take `number | null` and give `null` for `null`: the only
// path of a missing value, which `reading()` (src/ui/reading.ts) turns into the words for it on a tile. The JOINED forms, a figure
// with its unit symbol and a no-break space, `temperature` (`20.6°`), `forecastTemperature` (`5°`) and `power` (`0 W` `850 W`
// `3.2 kW` `12 kW`), give the dash for none, for text that is no tile's figure (a sentence, a chart's label).
// Must not: read the clock, the DOM or a browser default, or hold a word a person reads.
import {DAY_MS, DASH, HOUR_MS, MINUTE_MS} from '../figures.ts';
import type {PanelLocaleSpec} from './locale.ts';

type Instant = Date | number;

/** The local day, hour (0 to 23) and short weekday of an instant. */
export interface DayParts {
  day: string;
  h: number;
  wd: string;
}

/**
 * How long before `now` an instant was, as a kind and a count for the catalog to word: under a minute (or ahead of now), whole
 * minutes under an hour, whole hours under a day, then the instant's date as this locale writes it.
 */
export type Ago =
  {kind: 'now'} | {kind: 'minutes'; n: number} | {kind: 'hours'; n: number} | {kind: 'date'; date: string};

export interface Formatters {
  /** `4:07 pm`, `16 h 07`, `16:07`. */
  time(d: Instant): string;
  /** `4:07:09 pm`, `16 h 07 min 09 s`, `16:07:09`: `time` with its seconds, for the few places they matter (a flow step's moment). */
  timeSeconds(d: Instant): string;
  /** A time of day with no date, such as a schedule's hours and minutes, as `time` writes it; no zone moves it: `8:30 am`, `8 h 30`. */
  clock(hours: number, minutes: number): string;
  /** `4 pm`, `16 h`, `16 Uhr`. */
  hour(d: Instant): string;
  /** A whole hour of the day (0 to 23) with no date, as `hour` writes it, for an axis of hours; no zone moves it: `6 am`, `18 h`. */
  hourOfDay(hours: number): string;
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
  /** The legacy panel's `ago` rule (1, 60 and 1440 minutes), which stays there until the last feature that says it has moved; `now` is passed in, never read. */
  ago(d: Instant, now: number): Ago;
  /** A span for the live pill: `52 min`, `1 h 50`, `3 h`, at least a minute; the legacy panel's `durTxt` (#257 deletes it), the same in both languages. */
  durationShort(ms: number): string;
}

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

/** What the figure helpers need of an instance, so a model that was given a few formatters can still call them. */
export type Numbers = Pick<Formatters, 'integer' | 'fixed'>;

/** A whole number; the -0 of Math.round(-0.4) is 0, which Intl would otherwise write as `-0`. No reading (`null`) gives `null`. */
export function whole(fmt: Numbers, n: number): string;
export function whole(fmt: Numbers, n: number | null): string | null;
export function whole(fmt: Numbers, n: number | null): string | null {
  return n === null ? null : fmt.integer(Math.round(n) + 0);
}
/** A whole number of degrees: `12°`. */
export const degrees = (fmt: Numbers, n: number): string => `${whole(fmt, n)}°`;
/** `fmt.fixed` of a reading, or `null` when there is none: the figure forms' rule, which `reading()` turns into the words for it. */
export function fixedOr(fmt: Pick<Formatters, 'fixed'>, n: number, digits: number): string;
export function fixedOr(fmt: Pick<Formatters, 'fixed'>, n: number | null, digits: number): string | null;
export function fixedOr(fmt: Pick<Formatters, 'fixed'>, n: number | null, digits: number): string | null {
  return n === null ? null : fmt.fixed(n, digits);
}

// One rule per kind of quantity (#417): every tab writes a battery charge, a temperature, a power or a sum of money through these,
// so the same value never reads two ways. Each rule has a figure-only form, for a catalog message that carries its own sign
// ('{n}° outside'), and a joined form that adds the unit symbol (°, W, kW) here, once, with a no-break space where a space is used.

const NO_BREAK_SPACE = '\u00a0';
const HALF_TENTH = 0.05;
const HALF_CENT = 0.005;

/** A battery charge or any percent, the figure only: whole, `64`, `null` for no reading. The catalog's `car.percent` adds the sign, which French spaces. */
export function percent(fmt: Numbers, n: number): string;
export function percent(fmt: Numbers, n: number | null): string | null;
export function percent(fmt: Numbers, n: number | null): string | null {
  return whole(fmt, n);
}

/** A measured temperature (inside, outside, feels like, the tank) to a tenth, the figure only: `20.6`, `null` for no reading; never `-0.0`. */
export function temperatureFigure(fmt: Pick<Formatters, 'fixed'>, n: number): string;
export function temperatureFigure(fmt: Pick<Formatters, 'fixed'>, n: number | null): string | null;
export function temperatureFigure(fmt: Pick<Formatters, 'fixed'>, n: number | null): string | null {
  return fixedOr(fmt, n !== null && Math.abs(n) < HALF_TENTH ? 0 : n, 1);
}

/** `temperatureFigure` with its degree sign: `20.6°`, `–°` for no reading (text that is no tile's figure). */
export const temperature = (fmt: Pick<Formatters, 'fixed'>, n: number | null): string =>
  `${temperatureFigure(fmt, n) ?? DASH}°`;

/** A forecast temperature (a high, a low, a normal) in whole degrees, the figure only: `5`, `null` for no reading. */
export function forecastFigure(fmt: Numbers, n: number): string;
export function forecastFigure(fmt: Numbers, n: number | null): string | null;
export function forecastFigure(fmt: Numbers, n: number | null): string | null {
  return whole(fmt, n);
}

/** `forecastFigure` with its degree sign: `5°`, `–°` for no reading (text that is no tile's figure). */
export const forecastTemperature = (fmt: Numbers, n: number | null): string => `${forecastFigure(fmt, n) ?? DASH}°`;

/** A power as a figure and its fixed unit: `{n: '3.2', unit: 'kW'}`. */
export interface PowerParts {
  n: string;
  unit: 'W' | 'kW';
}

const KILO = 1000;
const TWO_FIGURES = 2;
const KW_TENTHS_BELOW = 10;

/**
 * A power in watts to two significant figures with one unit per magnitude: `0 W`, `850 W`, `3.2 kW`, `12 kW`. Under a kilowatt it
 * is watts (rounded to two figures, so 856 W reads 860 W), from a kilowatt it is kW with a tenth below 10 kW and whole kW above.
 * The unit is picked after rounding, so 999.6 W is `1.0 kW`, never `1000 W`.
 */
export function powerParts(fmt: Numbers, watts: number): PowerParts;
export function powerParts(fmt: Numbers, watts: number | null): PowerParts | null;
export function powerParts(fmt: Numbers, watts: number | null): PowerParts | null {
  if (watts === null) return null;
  const sign = watts < 0 ? -1 : 1;
  const rounded = Number(Math.abs(watts).toPrecision(TWO_FIGURES));
  if (rounded < KILO) return {n: whole(fmt, sign * rounded), unit: 'W'};
  const kw = rounded / KILO;
  return {n: kw < KW_TENTHS_BELOW ? fmt.fixed(sign * kw, 1) : whole(fmt, sign * kw), unit: 'kW'};
}

/** `powerParts` as one text with a no-break space, `3.2 kW`; the dash for no reading (text that is no tile's figure). */
export function power(fmt: Numbers, watts: number | null): string {
  const parts = powerParts(fmt, watts);
  return parts === null ? DASH : `${parts.n}${NO_BREAK_SPACE}${parts.unit}`;
}

/**
 * A sum of money, the figure only (the catalog's `car.money` adds the `$`, which French follows with a no-break space): whole dollars
 * in a headline, cents in a table; `null` for none, never `-0.00`.
 */
export function money(fmt: Numbers, n: number, kind: 'headline' | 'cents'): string;
export function money(fmt: Numbers, n: number | null, kind: 'headline' | 'cents'): string | null;
export function money(fmt: Numbers, n: number | null, kind: 'headline' | 'cents'): string | null {
  if (n === null) return null;
  return kind === 'cents' ? fmt.fixed(Math.abs(n) < HALF_CENT ? 0 : n, 2) : whole(fmt, n);
}

/** A `2026-11-07` day key's noon in UTC, in milliseconds: the instant arithmetic on day keys starts from (Climate's week starts on the Monday by it). */
export const utcNoonOf = (day: string): number => Date.parse(`${day}T12:00:00Z`);

/** A day key's noon as an instant that reads as that day in the formatters' zone: UTC noon, or its neighbour in a zone far east or west. Energy and Climate label a day by it. */
export function noonOf(day: string, fmt: Pick<Formatters, 'isoDay'>): number {
  const utc = utcNoonOf(day);
  return [utc, utc - DAY_MS, utc + DAY_MS].find(at => fmt.isoDay(at) === day) ?? utc;
}

/**
 * The first instant of a day key in the formatters' zone, to the minute (a zone's offset is whole minutes): the search runs between the day's
 * noon and the noon before it, where `isoDay` turns from the day before to the day. The archive's day rows start there, as the recorder's do.
 */
export function startOfDay(day: string, fmt: Pick<Formatters, 'isoDay'>): number {
  let [before, from] = [Math.floor((noonOf(day, fmt) - DAY_MS) / MINUTE_MS), Math.floor(noonOf(day, fmt) / MINUTE_MS)];
  while (from - before > 1) {
    const middle = Math.floor((before + from) / 2);
    if (fmt.isoDay(middle * MINUTE_MS) === day) from = middle;
    else before = middle;
  }
  return from * MINUTE_MS;
}

export function createFormatters(locale: PanelLocaleSpec): Formatters {
  const {language, tag, timeZone, hour12} = locale;
  // the rules are chosen once, by the tag's language; every other language is `Intl`'s own output
  const timeRule = language === 'en' ? englishDayPeriod : language === 'fr' ? frenchOnTheHour : asIs;
  const hourRule = language === 'en' ? englishDayPeriod : language === 'fr' ? frenchBareHour : asIs;
  const numberRule = language === 'fr' ? frenchThousands : asIs;

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
  const timeS = dateFormat({hour: 'numeric', minute: '2-digit', second: '2-digit', hour12});
  const hour = dateFormat({hour: 'numeric', hour12});
  // a time of day is placed on a fixed day in UTC and read back by a UTC-pinned format, so neither the browser's zone nor the house's moves it
  const hourOfDayFormat = new Intl.DateTimeFormat(tag, {timeZone: 'UTC', hour: 'numeric', hour12});
  const clockFormat = new Intl.DateTimeFormat(tag, {timeZone: 'UTC', hour: 'numeric', minute: '2-digit', hour12});
  const clockParts = partsOf({hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
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
    timeSeconds: d => timeRule(timeS.format(d)),
    clock: (hours, minutes) => timeRule(clockFormat.format(Date.UTC(2026, 0, 1, hours, minutes))),
    hour: d => hourRule(hour.format(d)),
    hourOfDay: hours => hourRule(hourOfDayFormat.format(Date.UTC(2026, 0, 1, hours))),
    time24: d => {
      const part = clockParts(d);
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
      const part = clockParts(now);
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
      if (minutes < 1) return {kind: 'now'};
      if (minutes < 60) return {kind: 'minutes', n: minutes};
      if (minutes < 1440) return {kind: 'hours', n: Math.round(minutes / 60)};
      return {kind: 'date', date: date.format(d)};
    },
    // the units both languages abbreviate alike, in Latin digits, so the span needs no catalog message
    durationShort: span => {
      const minutes = Math.max(1, Math.round(span / MINUTE_MS));
      if (minutes < 60) return `${minutes} min`;
      const rest = minutes % 60;
      return `${Math.floor(minutes / 60)} h${rest ? ` ${String(rest).padStart(2, '0')}` : ''}`;
    },
  };
}
