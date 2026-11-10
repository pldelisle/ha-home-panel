// What the Weather model tests share: a model built from a house or from literal inputs, in a language, at an instant.
// Pattern: a test helper at the pure-function seam (ADR 0005); it builds the locale, the formatters and `t` the way the store
// does, so a test reads what the elements would be given.
// Must not: hold an expectation, or reach into the model.
import {resolveConfig} from '../../../../src/core/config.ts';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {panelLocale} from '../../../../src/core/i18n/locale.ts';
import {createMessages} from '../../../../src/core/i18n/messages.ts';
import {readWeather} from '../../../../src/features/weather/inputs.ts';
import {weatherModel, type WeatherViewModel} from '../../../../src/features/weather/model.ts';
import {EMPTY_INPUTS, type ForecastEntry, type WeatherInputs} from '../../../../src/providers/weather-source.ts';
import * as bare from '../../../houses/bare.mjs';
import {REFERENCE_MS} from '../../../houses/clock.mjs';
import * as full from '../../../houses/full.mjs';
import {fakeHass, type FakeHass} from '../../fake-hass.ts';

export type Language = 'en' | 'fr';
export type Forecast = {daily: ForecastEntry[]; hourly: ForecastEntry[]};
export const NO_FORECAST: Forecast = {daily: [], hourly: []};

export const fullHouse = fakeHass.fromHouse(full);
export const bareHouse = fakeHass.fromHouse(bare);

interface Reading {
  forecast?: Forecast;
  now?: number;
  /** Another place than the house's, for the sun. */
  where?: {latitude: number; longitude: number};
  /** The config's house picture. */
  house?: {day: string | null; night: string | null} | null;
}

/** The model of these inputs, in a language, at an instant (the house's own by default), for a forecast. */
export function modelFromInputs(
  inputs: WeatherInputs,
  language: Language,
  {forecast = NO_FORECAST, now = REFERENCE_MS, where, house: picture}: Reading = {},
): WeatherViewModel {
  const house: FakeHass = {...fullHouse, locale: {language}};
  const locale = panelLocale(house, {timeZone: 'America/Toronto', browserLocale: 'en'});
  const fmt = createFormatters(locale);
  return weatherModel(inputs, forecast, {
    now,
    fmt,
    t: createMessages(locale).t,
    latitude: where?.latitude ?? house.config.latitude,
    longitude: where?.longitude ?? house.config.longitude,
    house: picture,
  });
}

/** The model of a house: its states read by `readWeather` through the config the resolver makes. */
export function modelOf(house: FakeHass, language: Language, reading: Reading = {}): WeatherViewModel {
  const inputs = readWeather(house.states, resolveConfig({}, house.states));
  return modelFromInputs(inputs, language, reading);
}

/** Empty inputs with some fields replaced, for the rules that need a reading the test house does not have. */
export const inputsWith = (patch: Partial<WeatherInputs>): WeatherInputs => ({...EMPTY_INPUTS, ...patch});

/** The model of those fields alone, in English. */
export const inEnglish = (patch: Partial<WeatherInputs>, reading: Reading = {}) =>
  modelFromInputs(inputsWith(patch), 'en', reading);

/** The figures and words of tiles, without their label, icon and tone. */
export const shown = (tiles: WeatherViewModel['tiles']) =>
  tiles.map(({key, value, unit, sub}) => ({key, value, unit, sub}));
