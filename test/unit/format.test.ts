// The formatters in three locales, with the time zone passed in and the instants written as ISO strings.
// Expected strings are literals (U+202F written as an escape), never built by the code under test.
import {describe, expect, test} from 'vitest';
import {createFormatters, type Formatters} from '../../src/core/i18n/format.ts';
import type {PanelLocaleSpec} from '../../src/core/i18n/locale.ts';

const TZ = 'America/Toronto';

/** A locale spec for a tag, the number locale following the tag unless overridden. */
const spec = (tag: string, over: Partial<PanelLocaleSpec> = {}): PanelLocaleSpec => ({
  language: tag.split('-')[0],
  tag,
  timeZone: TZ,
  numberLocale: tag,
  useGrouping: true,
  ...over,
});
const make = (tag: string, over: Partial<PanelLocaleSpec> = {}): Formatters => createFormatters(spec(tag, over));

const T1607 = new Date('2026-11-07T21:07:00Z'); // 16:07 on Saturday Nov 7 in Toronto
const T1607S = new Date('2026-11-07T21:07:09Z'); // 16:07:09
const T1600 = new Date('2026-11-07T21:00:00Z'); // 16:00
const T2230 = new Date('2026-11-08T03:30:00Z'); // 22:30 on Nov 7 in Toronto, already Nov 8 in UTC
const T0030 = new Date('2026-11-08T05:30:00Z'); // 00:30 on Sunday Nov 8 in Toronto

test('Intl resolves fr-CA (a Node without full ICU would silently give English)', () => {
  expect(new Intl.DateTimeFormat('fr-CA').resolvedOptions().locale).toBe('fr-CA');
  expect(new Intl.DateTimeFormat('de-DE').resolvedOptions().locale).toBe('de-DE');
});

// one row per formatter and sample: [name, call, en-CA, fr-CA, de-DE]
type Row = [string, (f: Formatters) => unknown, unknown, unknown, unknown];
const rows: Row[] = [
  ['time 16:07', f => f.time(T1607), '4:07 pm', '16 h 07', '16:07'],
  ['time 16:00', f => f.time(T1600), '4:00 pm', '16 h', '16:00'],
  ['time after midnight', f => f.time(T0030), '12:30 am', '0 h 30', '0:30'],
  ['hour 16:07', f => f.hour(T1607), '4 pm', '16 h', '16 Uhr'],
  ['hour 16:00', f => f.hour(T1600), '4 pm', '16 h', '16 Uhr'],
  ['hour at midnight', f => f.hour(T0030), '12 am', '0 h', '00 Uhr'],
  ['time24 16:07', f => f.time24(T1607), '16:07', '16:07', '16:07'],
  ['time24 16:00', f => f.time24(T1600), '16:00', '16:00', '16:00'],
  ['time24 never reads 24:', f => f.time24(T0030), '00:30', '00:30', '00:30'],
  ['time24s', f => f.time24s(T1607S), '16:07:09', '16:07:09', '16:07:09'],
  ['time24s 16:00', f => f.time24s(T1600), '16:00:00', '16:00:00', '16:00:00'],
  ['time24s after midnight', f => f.time24s(T0030), '00:30:00', '00:30:00', '00:30:00'],
  ['date 16:07', f => f.date(T1607), 'Nov 7', '7 nov.', '7. Nov.'],
  ['date 16:00', f => f.date(T1600), 'Nov 7', '7 nov.', '7. Nov.'],
  ['date of a UTC-next-day instant', f => f.date(T2230), 'Nov 7', '7 nov.', '7. Nov.'],
  ['dateWeekday 16:07', f => f.dateWeekday(T1607), 'Sat, Nov 7', 'sam. 7 nov.', 'Sa., 7. Nov.'],
  ['dateWeekday 16:00', f => f.dateWeekday(T1600), 'Sat, Nov 7', 'sam. 7 nov.', 'Sa., 7. Nov.'],
  ['dateLong 16:07', f => f.dateLong(T1607), 'Saturday, November 7', 'samedi 7 novembre', 'Samstag, 7. November'],
  ['dateLong 16:00', f => f.dateLong(T1600), 'Saturday, November 7', 'samedi 7 novembre', 'Samstag, 7. November'],
  ['weekday long 16:07', f => f.weekday(T1607, 'long'), 'Saturday', 'samedi', 'Samstag'],
  ['weekday long 16:00', f => f.weekday(T1600, 'long'), 'Saturday', 'samedi', 'Samstag'],
  ['weekday short 16:07', f => f.weekday(T1607, 'short'), 'Sat', 'sam.', 'Sa'],
  ['weekday short 16:00', f => f.weekday(T1600, 'short'), 'Sat', 'sam.', 'Sa'],
  ['month long 16:07', f => f.month(T1607, 'long'), 'November', 'novembre', 'November'],
  ['month long 16:00', f => f.month(T1600, 'long'), 'November', 'novembre', 'November'],
  ['month short 16:07', f => f.month(T1607, 'short'), 'Nov', 'nov.', 'Nov'],
  ['month short 16:00', f => f.month(T1600, 'short'), 'Nov', 'nov.', 'Nov'],
  ['isoDay 16:07', f => f.isoDay(T1607), '2026-11-07', '2026-11-07', '2026-11-07'],
  ['isoDay 16:00', f => f.isoDay(T1600), '2026-11-07', '2026-11-07', '2026-11-07'],
  ['isoDay of an instant that is the next day in UTC', f => f.isoDay(T2230), '2026-11-07', '2026-11-07', '2026-11-07'],
  ['isoDay after midnight', f => f.isoDay(T0030), '2026-11-08', '2026-11-08', '2026-11-08'],
  ['dayParts 16:07', f => f.dayParts(T1607), ...parts('Sat', 'sam.', 'Sa.', 16, '2026-11-07')],
  ['dayParts 16:00', f => f.dayParts(T1600), ...parts('Sat', 'sam.', 'Sa.', 16, '2026-11-07')],
  ['dayParts 22:30', f => f.dayParts(T2230), ...parts('Sat', 'sam.', 'Sa.', 22, '2026-11-07')],
  ['dayParts 00:30', f => f.dayParts(T0030), ...parts('Sun', 'dim.', 'So.', 0, '2026-11-08')],
  ['integer', f => f.integer(1234567), '1,234,567', '1\u202f234\u202f567', '1.234.567'],
  ['integer rounds', f => f.integer(1234.5), '1,235', '1\u202f235', '1.235'],
  ['number default one digit', f => f.number(12.56), '12.6', '12,6', '12,6'],
  ['number one digit', f => f.number(12.5, 1), '12.5', '12,5', '12,5'],
  ['number two digits', f => f.number(1234.567, 2), '1,234.57', '1\u202f234,57', '1.234,57'],
  ['number clamps three digits to two', f => f.number(1234.5678, 3), '1,234.57', '1\u202f234,57', '1.234,57'],
  ['number clamps many digits to two', f => f.number(0.12345, 9), '0.12', '0,12', '0,12'],
  ['number with no digits', f => f.number(12.5, 0), '13', '13', '13'],
  ['number does not pad', f => f.number(12, 2), '12', '12', '12'],
  ['fixed pads one digit', f => f.fixed(4, 1), '4.0', '4,0', '4,0'],
  ['fixed rounds to one digit', f => f.fixed(101.94, 1), '101.9', '101,9', '101,9'],
  ['fixed two digits and grouping', f => f.fixed(1234.5, 2), '1,234.50', '1\u202f234,50', '1.234,50'],
  ['fixed with no digits', f => f.fixed(12.5, 0), '13', '13', '13'],
  ['fixed clamps three digits to two', f => f.fixed(0.5, 3), '0.50', '0,50', '0,50'],
  ['fixed keeps the sign of a small negative, as toFixed does', f => f.fixed(-0.04, 1), '-0.0', '-0,0', '-0,0'],
];
/** The dayParts row: the day and hour are the same everywhere, the weekday is localised. */
function parts(en: string, fr: string, de: string, h: number, day: string): [unknown, unknown, unknown] {
  return [
    {day, h, wd: en},
    {day, h, wd: fr},
    {day, h, wd: de},
  ];
}

describe.each([
  ['en-CA', 0],
  ['fr-CA', 1],
  ['de-DE', 2],
] as const)('%s', (tag, col) => {
  const f = make(tag);
  test.each(rows)('%s', (_name, call, ...expected) => {
    expect(call(f)).toEqual(expected[col]);
  });
});

describe('hourNow', () => {
  test.each(['en-CA', 'fr-CA', 'de-DE'])('%s gives the fractional hour', tag => {
    const f = make(tag);
    expect(f.hourNow(T1607)).toBeCloseTo(16.1167, 4);
    expect(f.hourNow(T1600)).toBe(16);
    expect(f.hourNow(T0030)).toBeCloseTo(0.5, 6);
  });

  test('takes a timestamp as well as a Date', () => {
    expect(make('en-CA').hourNow(T1607.getTime())).toBeCloseTo(16.1167, 4);
  });
});

describe('a timestamp is accepted as well as a Date', () => {
  test('time, date and isoDay', () => {
    const f = make('fr-CA');
    expect(f.time(T1607.getTime())).toBe('16 h 07');
    expect(f.date(T1607.getTime())).toBe('7 nov.');
    expect(f.isoDay(T2230.getTime())).toBe('2026-11-07');
  });
});

describe('the time zone is the locale spec', () => {
  test('the same instant reads differently in another zone', () => {
    const f = make('en-CA', {timeZone: 'Europe/Paris'});
    expect(f.time(T1607)).toBe('10:07 pm');
    expect(f.isoDay(T2230)).toBe('2026-11-08');
  });
});

describe('the time_format preference', () => {
  test('24 hours in English gives 16:07 and 00:30', () => {
    const f = make('en-CA', {hour12: false});
    expect(f.time(T1607)).toBe('16:07');
    expect(f.time(T0030)).toBe('00:30');
    expect(f.hour(T1607)).toBe('16');
  });

  test('12 hours in English follows the house rule', () => {
    expect(make('en-CA', {hour12: true}).time(T1607)).toBe('4:07 pm');
  });

  test('24 hours in German is unchanged', () => {
    expect(make('de-DE', {hour12: false}).time(T1607)).toBe('16:07');
  });
});

describe('the number_format preference', () => {
  test('decimal_comma in English gives 12,5', () => {
    const f = make('en-CA', {numberLocale: 'de'});
    expect(f.number(12.5)).toBe('12,5');
    expect(f.integer(1234567)).toBe('1.234.567');
  });

  test('comma_decimal in French gives 12.5 and keeps the commas', () => {
    const f = make('fr-CA', {numberLocale: 'en-US'});
    expect(f.number(12.5)).toBe('12.5');
    expect(f.integer(1234567)).toBe('1,234,567');
  });

  test('space_comma in English gives 12,5 and a space', () => {
    const f = make('en-CA', {numberLocale: 'fr'});
    expect(f.number(12.5)).toBe('12,5');
    expect(f.integer(1234567)).toBe('1\u202f234\u202f567');
  });

  test('integer rounds a negative half toward zero, as Math.round does', () => {
    expect(make('en-CA').integer(-1234.5)).toBe('-1,234');
    expect(make('en-CA').integer(-1234.6)).toBe('-1,235');
  });

  test('none gives no grouping in all three locales', () => {
    expect(make('en-CA', {useGrouping: false}).integer(1234567)).toBe('1234567');
    expect(make('fr-CA', {useGrouping: false}).integer(1234567)).toBe('1234567');
    expect(make('de-DE', {useGrouping: false}).number(1234.5)).toBe('1234,5');
    expect(make('en-CA', {useGrouping: false}).fixed(1234.5, 1)).toBe('1234.5');
  });
});

describe('the three house rules, and only those', () => {
  test('English day period is am or pm without periods, for every en tag', () => {
    expect(make('en-GB', {hour12: true}).time(T1607)).toBe('4:07 pm');
    expect(make('en-GB', {hour12: true}).time(T0030)).toBe('12:30 am');
    expect(make('en-CA').hour(T1607)).toBe('4 pm');
  });

  test('French on the hour drops the minutes and a bare hour gains " h"', () => {
    const f = make('fr-CA');
    expect(f.time(T1600)).toBe('16 h');
    expect(f.time(T1607)).toBe('16 h 07');
    expect(f.hour(T1607)).toBe('16 h');
  });

  test('French thousands separator is U+202F, not U+00A0', () => {
    expect(make('fr-CA').integer(1234567)).toBe('1\u202f234\u202f567');
    expect(make('fr-FR').number(1234.5)).toBe('1\u202f234,5');
  });

  test('other languages get Intl output as it is', () => {
    expect(make('de-DE').hour(T1600)).toBe('16 Uhr');
    expect(make('de-DE').time(T1600)).toBe('16:00');
    expect(make('en-CA').integer(1234567)).toBe('1,234,567');
  });
});

describe('dayParts cache', () => {
  test('an instant in the same hour gives the same object', () => {
    const f = make('en-CA');
    expect(f.dayParts(T1607)).toBe(f.dayParts(T1607.getTime() + 60_000));
  });

  test('another hour gives another object', () => {
    const f = make('en-CA');
    expect(f.dayParts(T1607)).not.toBe(f.dayParts(T1607.getTime() + 36e5));
  });

  test('each instance has its own cache', () => {
    expect(make('en-CA').dayParts(T1607)).not.toBe(make('en-CA').dayParts(T1607));
  });

  test('it clears itself past 20,000 hours and goes on giving the right answer', () => {
    const f = make('en-CA');
    const first = f.dayParts(T1607);
    for (let i = 1; i <= 20_001; i++) f.dayParts(T1607.getTime() + i * 36e5);
    const again = f.dayParts(T1607);
    expect(again).not.toBe(first);
    expect(again).toEqual({day: '2026-11-07', h: 16, wd: 'Sat'});
  });
});
