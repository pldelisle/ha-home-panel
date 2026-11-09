// The locale derivation: a Home Assistant profile and the browser's defaults in, the spec `Intl` is given out.
import {describe, expect, test} from 'vitest';
import {panelLocale} from '../../src/core/i18n/locale.ts';
import type {PanelHass} from '../../src/core/hass.ts';
import {fakeHass} from './fake-hass.ts';

const DEFAULTS = {timeZone: 'Europe/Paris', browserLocale: 'es-MX', browserHour12: true};

/** A hass whose profile is the given language, country and formats. */
const house = (
  language: string,
  country: string | null | undefined,
  locale: Partial<NonNullable<PanelHass['locale']>> = {},
) => {
  const h = fakeHass({locale: {language, ...locale}});
  return fakeHass({locale: h.locale, config: {...h.config, country}});
};

describe('the tag', () => {
  test.each([
    ['fr', 'CA', 'fr-CA', 'fr'],
    ['de', 'DE', 'de-DE', 'de'],
    ['pt-BR', 'PT', 'pt-BR', 'pt'],
    ['en-GB', null, 'en-GB', 'en'],
    ['en', undefined, 'en-CA', 'en'],
    ['en', null, 'en-CA', 'en'],
  ])('language %s with country %s gives %s', (language, country, tag, bare) => {
    const spec = panelLocale(house(language, country), DEFAULTS);
    expect(spec.tag).toBe(tag);
    expect(spec.language).toBe(bare);
  });

  test('a hass with no locale object uses hass.language', () => {
    const hass = fakeHass({locale: undefined, language: 'de'});
    expect(panelLocale({...hass, config: {...hass.config, country: 'AT'}}, DEFAULTS).tag).toBe('de-AT');
  });

  test('a hass with no language at all is English, in Canada when there is no country', () => {
    const hass = fakeHass({locale: undefined, language: undefined});
    expect(panelLocale({...hass, config: {...hass.config, country: undefined}}, DEFAULTS).tag).toBe('en-CA');
  });
});

describe('the time zone', () => {
  test("is the hass's", () => {
    expect(panelLocale(house('en', 'CA'), DEFAULTS).timeZone).toBe('America/Toronto');
  });

  test('an empty one falls back to the default the shell passed in', () => {
    const hass = house('en', 'CA');
    expect(panelLocale({...hass, config: {...hass.config, time_zone: ''}}, DEFAULTS).timeZone).toBe('Europe/Paris');
  });
});

describe('hour12 from time_format', () => {
  test.each([
    ['12', true],
    ['24', false],
    ['system', true],
    ['language', undefined],
    [undefined, undefined],
  ])('time_format %s gives %s', (time_format, hour12) => {
    expect(panelLocale(house('en', 'CA', {time_format}), DEFAULTS).hour12).toBe(hour12);
  });

  test('system gives the browser default, which may itself be unset', () => {
    const spec = panelLocale(house('en', 'CA', {time_format: 'system'}), {timeZone: 'UTC', browserLocale: 'en-US'});
    expect(spec.hour12).toBeUndefined();
  });
});

describe('numberLocale and useGrouping from number_format', () => {
  test.each([
    ['comma_decimal', 'en-US', true],
    ['decimal_comma', 'de', true],
    ['space_comma', 'fr', true],
    ['system', 'es-MX', true],
    ['none', 'fr-CA', false],
    ['language', 'fr-CA', true],
    [undefined, 'fr-CA', true],
  ])('number_format %s gives %s, grouping %s', (number_format, numberLocale, useGrouping) => {
    const spec = panelLocale(house('fr', 'CA', {number_format}), DEFAULTS);
    expect(spec.numberLocale).toBe(numberLocale);
    expect(spec.useGrouping).toBe(useGrouping);
  });
});
