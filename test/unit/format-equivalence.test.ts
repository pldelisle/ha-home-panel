// The French formatters against the rewrite layer: for every row of the formatter table and every sample, the French
// formatter's output equals what the layer makes of the English formatter's output, which is the old class's output today.
// This is the proof that a phase-3 move can switch a feature from `fmtEn` to `fmt` without changing a pixel.
// Deleted in phase 4, with the layer (src/i18n/fr.js) and `fmtEn`.
//
// Three ways the layer meets text, and each row says which it uses:
// - `text`: the whole text node is the date, time or number, as in a tile or a label;
// - `capitalised`: the whole text node is a weekday or a month name, which the layer always starts with a capital
//   (`Samedi`, `Nov.`), so the formatter's lower-case output is compared through a capitalize, as the call site does
//   today (dayName);
// - `sentence`: the date follows a word, as the header date and the sessions table do, where the layer leaves it lower-case.
import {describe, expect, test} from 'vitest';
import {createFormatters, type Formatters} from '../../src/core/i18n/format.ts';
import {englishLocale, panelLocale} from '../../src/core/i18n/locale.ts';
import {createFrench} from '../../src/i18n/fr.js';
import {fakeHass} from './fake-hass.ts';

const TZ = 'America/Toronto';
const hass = fakeHass({locale: {language: 'fr'}});
const fr = createFormatters(panelLocale(hass, {timeZone: TZ, browserLocale: 'en-US'}));
const en = createFormatters(englishLocale(TZ));
const layer = createFrench({hass, isFrench: true, names: {name: key => key}});
/** What the layer makes of a whole text node (the layer is untyped JavaScript). */
const layerText = (s: string): string => layer.text(s) as string;

test('Intl resolves fr-CA (a Node without full ICU would silently give English)', () => {
  expect(new Intl.DateTimeFormat('fr-CA').resolvedOptions().locale).toBe('fr-CA');
});

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Saturday 16:07, 16:00 and a Sunday 00:30 in Toronto, then the 14th of every month at 17:07 or 16:07 (the zone's offset
// changes in March and November), so that every month and weekday name is met
const T1607 = new Date('2026-11-07T21:07:00Z');
const T1600 = new Date('2026-11-07T21:00:00Z');
const T0030 = new Date('2026-11-08T05:30:00Z');
const MONTHS = Array.from({length: 12}, (_, m) => new Date(Date.UTC(2026, m, 14, 21, 7)));
const SAMPLES = [T1607, T1600, T0030, ...MONTHS];

type How = 'text' | 'capitalised' | 'sentence';
interface Row {
  name: string;
  how: How;
  of: (f: Formatters, d: Date) => string;
  /** The layer turns a bare `Sun` into `Soleil`, the label of the sun tile, so this row skips the Sundays. */
  notSunday?: boolean;
}
const rows: Row[] = [
  {name: 'time', how: 'text', of: (f, d) => f.time(d)},
  {name: 'hour', how: 'text', of: (f, d) => f.hour(d)},
  {name: 'time24', how: 'text', of: (f, d) => f.time24(d)},
  {name: 'time24s', how: 'text', of: (f, d) => f.time24s(d)},
  {name: 'date', how: 'text', of: (f, d) => f.date(d)},
  {name: 'dateWeekday', how: 'sentence', of: (f, d) => f.dateWeekday(d)},
  {name: 'dateLong', how: 'sentence', of: (f, d) => f.dateLong(d)},
  {name: 'weekday long', how: 'capitalised', of: (f, d) => f.weekday(d, 'long')},
  {name: 'weekday short', how: 'capitalised', of: (f, d) => f.weekday(d, 'short'), notSunday: true},
  {name: 'month long', how: 'capitalised', of: (f, d) => f.month(d, 'long')},
  {name: 'month short', how: 'capitalised', of: (f, d) => f.month(d, 'short')},
  {name: 'isoDay', how: 'text', of: (f, d) => f.isoDay(d)},
  {name: 'dayParts day', how: 'text', of: (f, d) => f.dayParts(d).day},
  {name: 'dayParts weekday', how: 'capitalised', of: (f, d) => f.dayParts(d).wd, notSunday: true},
];

const isSunday = (d: Date) => en.weekday(d, 'short') === 'Sun';
const through = (how: How, english: string, french: string): [string, string] =>
  how === 'text'
    ? [layerText(english), french]
    : how === 'capitalised'
      ? [layerText(english), capitalise(french)]
      : [layerText(`until ${english}`), `jusqu'à ${french}`];

describe('the French formatter equals the layer on the English output', () => {
  for (const row of rows) {
    test.each(SAMPLES.filter(d => !row.notSunday || !isSunday(d)).map(d => [d.toISOString(), d] as const))(
      `${row.name} at %s`,
      (_iso, d) => {
        const [fromLayer, fromFormatter] = through(row.how, row.of(en, d), row.of(fr, d));
        expect(fromFormatter).toBe(fromLayer);
      },
    );
  }

  test.each(SAMPLES.map(d => [d.toISOString(), d] as const))('dayParts hour at %s', (_iso, d) => {
    expect(fr.dayParts(d).h).toBe(en.dayParts(d).h);
  });

  test.each(SAMPLES.map(d => [d.toISOString(), d] as const))(
    'hourNow at %s is a number, the same in both',
    (_iso, d) => {
      expect(fr.hourNow(d)).toBe(en.hourNow(d));
    },
  );
});

// `ago` is the one formatter that reads two instants; its text is a node on its own or a sentence's tail (`Motion 5 min ago`,
// where the layer words only the relative forms: it puts `le` before a date, which `ago` does not)
describe('ago', () => {
  const NOW = T1607.getTime();
  const SPANS_MS = [
    0,
    20e3,
    30e3,
    5 * 60e3,
    59 * 60e3,
    60 * 60e3,
    90 * 60e3,
    23 * 60 * 60e3,
    24 * 60 * 60e3,
    40 * 864e5,
  ];

  test.each(SPANS_MS)('%s ms before now, as a node', span => {
    expect(fr.ago(NOW - span, NOW)).toBe(layerText(en.ago(NOW - span, NOW)));
  });

  test.each(SPANS_MS.filter(span => span < 864e5))('%s ms before now, after a word', span => {
    expect(`Mouvement ${fr.ago(NOW - span, NOW)}`).toBe(layerText(`Motion ${en.ago(NOW - span, NOW)}`));
  });
});

describe('the numbers', () => {
  const VALUES = [0, 7, 12.5, 12.56, 999.99, 1234, 1234.5, 1234567, 0.04, 1.005, -3.5, 1.2345];

  test.each(VALUES)('integer of %s', v => {
    expect(fr.integer(v)).toBe(layerText(en.integer(v)));
  });

  test.each(VALUES.flatMap(v => [0, 1, 2, 3, undefined].map(digits => [v, digits] as const)))(
    'number of %s with %s fraction digits',
    (v, digits) => {
      expect(fr.number(v, digits)).toBe(layerText(en.number(v, digits)));
    },
  );

  test.each(VALUES.flatMap(v => [0, 1, 2].map(digits => [v, digits] as const)))(
    'fixed of %s with %s fraction digits',
    (v, digits) => {
      expect(fr.fixed(v, digits)).toBe(layerText(en.fixed(v, digits)));
    },
  );
});
