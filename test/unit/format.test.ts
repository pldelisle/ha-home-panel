// The formatters in three locales, with the time zone passed in and the instants written as ISO strings.
// Expected strings are literals (U+202F written as an escape), never built by the code under test.
import {describe, expect, test} from 'vitest';
import {
  createFormatters,
  fixedOr,
  forecastFigure,
  forecastTemperature,
  money,
  percent,
  power,
  powerParts,
  startOfDay,
  temperature,
  temperatureFigure,
  type Formatters,
  whole,
} from '../../src/core/i18n/format.ts';
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
  ['clock 8:30', f => f.clock(8, 30), '8:30 am', '8 h 30', '8:30'],
  ['clock 16:00', f => f.clock(16, 0), '4:00 pm', '16 h', '16:00'],
  ['clock midnight', f => f.clock(0, 0), '12:00 am', '0 h', '0:00'],
  ['hourOfDay 0', f => f.hourOfDay(0), '12 am', '0 h', '00 Uhr'],
  ['hourOfDay 6', f => f.hourOfDay(6), '6 am', '6 h', '06 Uhr'],
  ['hourOfDay 12', f => f.hourOfDay(12), '12 pm', '12 h', '12 Uhr'],
  ['hourOfDay 18', f => f.hourOfDay(18), '6 pm', '18 h', '18 Uhr'],
  ['hour 16:07', f => f.hour(T1607), '4 pm', '16 h', '16 Uhr'],
  ['hour 16:00', f => f.hour(T1600), '4 pm', '16 h', '16 Uhr'],
  ['hour at midnight', f => f.hour(T0030), '12 am', '0 h', '00 Uhr'],
  ['timeSeconds 16:07:09', f => f.timeSeconds(T1607S), '4:07:09 pm', '16 h 07 min 09 s', '16:07:09'],
  ['timeSeconds on the hour', f => f.timeSeconds(T1600), '4:00:00 pm', '16 h 00 min 00 s', '16:00:00'],
  ['timeSeconds after midnight', f => f.timeSeconds(T0030), '12:30:00 am', '0 h 30 min 00 s', '0:30:00'],
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

describe('startOfDay: the first instant of a day key in the zone', () => {
  const startIn = (day: string, timeZone: string) => startOfDay(day, make('en-CA', {timeZone}));

  test("is local midnight, across the change of clock (Toronto, UTC-4 then UTC-5) and in a zone off the hour (St. John's)", () => {
    expect(startIn('2026-10-31', 'America/Toronto')).toBe(Date.parse('2026-10-31T04:00:00Z'));
    expect(startIn('2026-11-01', 'America/Toronto')).toBe(Date.parse('2026-11-01T04:00:00Z'));
    expect(startIn('2026-11-02', 'America/Toronto')).toBe(Date.parse('2026-11-02T05:00:00Z'));
    expect(startIn('2026-11-10', 'America/St_Johns')).toBe(Date.parse('2026-11-10T03:30:00Z'));
    expect(startIn('2026-11-10', 'Pacific/Auckland')).toBe(Date.parse('2026-11-09T11:00:00Z'));
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

  test('a time of day is the same in every zone, and follows the hour cycle', () => {
    expect(make('en-CA', {timeZone: 'Asia/Tokyo'}).clock(8, 30)).toBe('8:30 am');
    expect(make('fr-CA', {timeZone: 'Pacific/Auckland'}).clock(8, 30)).toBe('8 h 30');
    expect(make('en-CA', {hour12: false}).clock(8, 30)).toBe('08:30');
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

describe("ago, the legacy panel's rule: a kind and a count, then the date", () => {
  const NOW = T1607.getTime();
  const MIN = 60_000;
  // the kind and the count do not depend on the locale: the words are the catalog's
  const spans = [
    ['a few seconds', 20_000, {kind: 'now'}],
    ['a moment in the future', -5 * MIN, {kind: 'now'}],
    ['half a minute rounds up', 30_000, {kind: 'minutes', n: 1}],
    ['five minutes', 5 * MIN, {kind: 'minutes', n: 5}],
    ['59 minutes', 59 * MIN, {kind: 'minutes', n: 59}],
    ['an hour', 60 * MIN, {kind: 'hours', n: 1}],
    ['90 minutes rounds to two hours', 90 * MIN, {kind: 'hours', n: 2}],
    ['23 hours', 23 * 60 * MIN, {kind: 'hours', n: 23}],
  ] as const;
  describe.each(['en-CA', 'fr-CA', 'de-DE'])('%s', tag => {
    test.each(spans)('%s', (_name, before, expected) => {
      expect(make(tag).ago(NOW - before, NOW)).toEqual(expected);
    });
  });

  // from a day on, the date as the locale writes it
  test.each([
    ['a day', 24 * 60 * MIN, 'Nov 6', '6 nov.', '6. Nov.'],
    ['a week', 7 * 24 * 60 * MIN, 'Oct 31', '31 oct.', '31. Okt.'],
  ] as const)('%s is a date', (_name, before, en, fr, de) => {
    expect(make('en-CA').ago(NOW - before, NOW)).toEqual({kind: 'date', date: en});
    expect(make('fr-CA').ago(NOW - before, NOW)).toEqual({kind: 'date', date: fr});
    expect(make('de-DE').ago(NOW - before, NOW)).toEqual({kind: 'date', date: de});
  });

  test('takes a Date as well as a timestamp', () => {
    expect(make('en-CA').ago(new Date(NOW - 5 * MIN), NOW)).toEqual({kind: 'minutes', n: 5});
  });
});

describe("durationShort, the live pill's span: minutes under an hour, then hours and two-digit minutes", () => {
  const MIN = 60_000;
  test.each([
    ['nothing is a minute', 0, '1 min'],
    ['29 seconds is still a minute', 29_000, '1 min'],
    ['52 minutes', 52 * MIN, '52 min'],
    ['59 and a half minutes rounds to the hour', 59.5 * MIN, '1 h'],
    ['an hour and five minutes', 65 * MIN, '1 h 05'],
    ['an hour and fifty', 110 * MIN, '1 h 50'],
    ['three hours', 180 * MIN, '3 h'],
  ] as const)('%s', (_name, span, text) => {
    for (const tag of ['en-CA', 'fr-CA']) expect(make(tag).durationShort(span)).toBe(text);
  });
});

describe('one formatter per kind of quantity (#417)', () => {
  const en = make('en-CA');
  const fr = make('fr-CA');

  test('percent writes a whole figure, null for no reading', () => {
    expect(percent(en, 64)).toBe('64');
    expect(percent(en, 63.96)).toBe('64');
    expect(percent(en, 0)).toBe('0');
    expect(percent(en, -0.2)).toBe('0');
    expect(percent(fr, 64.4)).toBe('64');
    expect(percent(fr, null)).toBeNull();
  });

  test('temperature is a tenth, with the degree sign or without it', () => {
    expect(temperature(en, 4)).toBe('4.0°');
    expect(temperature(en, 4.24)).toBe('4.2°');
    expect(temperature(en, 20.6)).toBe('20.6°');
    expect(temperature(en, 0)).toBe('0.0°');
    expect(temperature(en, -0.04)).toBe('0.0°');
    expect(temperature(en, -3.25)).toMatch(/^[-−]3\.[23]°$/);
    expect(temperature(fr, 20.6)).toBe('20,6°');
    expect(temperature(fr, null)).toBe('–°');
    expect(temperatureFigure(en, 20.6)).toBe('20.6');
    expect(temperatureFigure(fr, 20.64)).toBe('20,6');
    expect(temperatureFigure(en, null)).toBeNull();
  });

  test('a forecast is a whole degree, with the degree sign or without it', () => {
    expect(forecastTemperature(en, 4.6)).toBe('5°');
    expect(forecastTemperature(fr, -0.4)).toBe('0°');
    expect(forecastTemperature(fr, null)).toBe('–°');
    expect(forecastFigure(en, 4.4)).toBe('4');
    expect(forecastFigure(fr, null)).toBeNull();
  });

  test('power keeps two significant figures and one unit per magnitude, a no-break space between', () => {
    expect(power(en, 0)).toBe('0\u00a0W');
    expect(power(en, 0.4)).toBe('0\u00a0W');
    expect(power(en, 47.6)).toBe('48\u00a0W');
    expect(power(en, 850)).toBe('850\u00a0W');
    expect(power(en, 856)).toBe('860\u00a0W');
    expect(power(en, 3240)).toBe('3.2\u00a0kW');
    expect(power(en, 12340)).toBe('12\u00a0kW');
    expect(power(en, -850)).toMatch(/^[-−]850\u00a0W$/);
    expect(power(en, -3240)).toMatch(/^[-−]3\.2\u00a0kW$/);
    expect(power(fr, 3240)).toBe('3,2\u00a0kW');
    expect(power(fr, 12340)).toBe('12\u00a0kW');
    expect(power(fr, null)).toBe('–');
    expect(powerParts(en, 3240)).toEqual({n: '3.2', unit: 'kW'});
    expect(powerParts(en, 0)).toEqual({n: '0', unit: 'W'});
    expect(powerParts(en, null)).toBeNull();
    expect([whole(en, null), fixedOr(en, null, 1), fixedOr(en, 4, 1)]).toEqual([null, null, '4.0']);
  });

  test('the unit is chosen after rounding: 999.6 W is 1.0 kW, never 1000 W; 9.96 kW is 10 kW', () => {
    expect(power(en, 994)).toBe('990\u00a0W');
    expect(power(en, 996)).toBe('1.0\u00a0kW');
    expect(power(en, 999.6)).toBe('1.0\u00a0kW');
    expect(power(fr, 999.6)).toBe('1,0\u00a0kW');
    expect(power(en, 9960)).toBe('10\u00a0kW');
  });

  test('money is whole dollars in a headline and cents in a table, the same rounding', () => {
    expect(money(en, 17.59, 'headline')).toBe('18');
    expect(money(en, 17.59, 'cents')).toBe('17.59');
    expect(money(en, 0, 'cents')).toBe('0.00');
    expect(money(en, -0.004, 'cents')).toBe('0.00');
    expect(money(en, -2.5, 'cents')).toMatch(/^[-−]2\.50$/);
    expect(money(fr, 17.59, 'cents')).toBe('17,59');
    expect(money(fr, 17.59, 'headline')).toBe('18');
    expect(money(fr, 1234.5, 'headline')).toBe('1\u202f235');
    expect(money(fr, 0.4, 'headline')).toBe('0');
    expect(money(fr, null, 'cents')).toBeNull();
    expect(money(fr, null, 'headline')).toBeNull();
  });
});
