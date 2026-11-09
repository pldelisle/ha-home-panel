// The message catalogs and t(): parity between English and French, plurals and fallback, at the catalog seam.
// Expected strings are literals; the ICU parity check parses with the parser intl-messageformat itself depends on.
import {describe, expect, test} from 'vitest';
import {
  isArgumentElement,
  isDateElement,
  isNumberElement,
  isPluralElement,
  isSelectElement,
  isTagElement,
  isTimeElement,
  parse,
  type MessageFormatElement,
} from '@formatjs/icu-messageformat-parser';
import {en, type MessageKey} from '../../src/core/i18n/en.ts';
import {fr} from '../../src/core/i18n/fr.ts';
import {createMessages, type Catalogs, type MessageValues} from '../../src/core/i18n/messages.ts';
import type {PanelLocaleSpec} from '../../src/core/i18n/locale.ts';

const spec = (tag: string): PanelLocaleSpec => ({
  language: tag.split('-')[0],
  tag,
  timeZone: 'America/Toronto',
  numberLocale: tag,
  useGrouping: true,
});

/** The argument names of a message, and for each plural or select its sorted option keys. */
function shape(elements: MessageFormatElement[], args = new Set<string>(), options = new Map<string, string[]>()) {
  for (const el of elements) {
    if (isTagElement(el)) shape(el.children, args, options);
    else if (isPluralElement(el) || isSelectElement(el)) {
      args.add(el.value);
      options.set(`${el.type}:${el.value}`, Object.keys(el.options).sort());
      for (const option of Object.values(el.options)) shape(option.value, args, options);
    } else if (isArgumentElement(el) || isNumberElement(el) || isDateElement(el) || isTimeElement(el)) {
      args.add(el.value);
    }
  }
  return {args: [...args].sort(), options: [...options].sort()};
}

const keys = Object.keys(en) as MessageKey[];

describe('the shipped catalogs', () => {
  test('every English key is in French and French has no other (the compiler also requires it)', () => {
    expect(Object.keys(fr).sort()).toEqual([...keys].sort());
  });

  test.each(keys)('%s: the ICU argument names and plural categories match', key => {
    expect(shape(parse(fr[key]))).toEqual(shape(parse(en[key])));
  });

  test.each(keys)('%s: no message is empty', key => {
    expect(en[key].trim()).not.toBe('');
    expect(fr[key].trim()).not.toBe('');
  });
});

describe('the parity check itself', () => {
  test('it tells a plural with other categories, or another argument name, from a match', () => {
    const one = shape(parse('{n, plural, one {# door} other {# doors}}'));
    expect(shape(parse('{n, plural, one {# porte} other {# portes}}'))).toEqual(one);
    expect(shape(parse('{n, plural, other {# portes}}'))).not.toEqual(one);
    expect(shape(parse('{count, plural, one {# porte} other {# portes}}'))).not.toEqual(one);
  });

  test('it sees arguments inside tags, selects, numbers, dates and times', () => {
    const m = parse('<b>{a}</b> {s, select, x {{b}} other {y}} {n, number} {d, date} {t, time}');
    expect(shape(m).args).toEqual(['a', 'b', 'd', 'n', 's', 't']);
  });
});

describe('t()', () => {
  // a test catalog: the shipped ones hold no plural yet, and the cast is the cost of keys nobody ships
  const catalogs = {
    en: {'x.doors': '{n, plural, one {# door open} other {# doors open}}', 'x.hello': 'Hello {name}'},
    fr: {'x.doors': '{n, plural, one {# porte ouverte} other {# portes ouvertes}}', 'x.hello': 'Bonjour {name}'},
  } as unknown as Catalogs;
  const say = (tag: string, key: string, values?: MessageValues) =>
    (createMessages(spec(tag), catalogs).t as (k: string, v?: MessageValues) => string)(key, values);

  test('a plural renders in English', () => {
    expect(say('en-CA', 'x.doors', {n: 1})).toBe('1 door open');
    expect(say('en-CA', 'x.doors', {n: 2})).toBe('2 doors open');
  });

  test('a plural renders in French, where zero and one are both singular', () => {
    expect(say('fr-CA', 'x.doors', {n: 0})).toBe('0 porte ouverte');
    expect(say('fr-CA', 'x.doors', {n: 1})).toBe('1 porte ouverte');
    expect(say('fr-CA', 'x.doors', {n: 2})).toBe('2 portes ouvertes');
  });

  test('a placeholder is filled', () => {
    expect(say('fr-CA', 'x.hello', {name: 'Alex'})).toBe('Bonjour Alex');
  });

  test('an unknown language falls back to the English text', () => {
    expect(say('de-DE', 'x.hello', {name: 'Alex'})).toBe('Hello Alex');
    expect(say('de-DE', 'x.doors', {n: 2})).toBe('2 doors open');
  });

  test('the same key twice gives each call its own values (the compiled message is reused)', () => {
    const t = createMessages(spec('en-CA'), catalogs).t as (k: string, v?: MessageValues) => string;
    expect(t('x.hello', {name: 'A'})).toBe('Hello A');
    expect(t('x.hello', {name: 'B'})).toBe('Hello B');
  });
});
