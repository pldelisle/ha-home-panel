// readWeather: the sources applied in list order, a later one winning field by field, and the sun's part read from the house.
// Literal states in, literal inputs out; the order of resolution is the thing under test.
import {describe, expect, test} from 'vitest';
import {resolveConfig} from '../../../../src/core/config.ts';
import type {HassEntities} from '../../../../src/core/hass.ts';
import {readWeather, WEATHER_SOURCES} from '../../../../src/features/weather/inputs.ts';
import {EMPTY_INPUTS, type WeatherInputs, type WeatherSource} from '../../../../src/providers/weather-source.ts';
import {entity} from '../../fake-hass.ts';
import {bareHouse, fullHouse} from './support.ts';

/** A source with a name and a reading, present or not. */
const source = (name: string, read: Partial<WeatherInputs>, present = true): WeatherSource => ({
  name,
  ids: () => [],
  present: () => present,
  read: () => read,
});
const NO_STATES: HassEntities = {};
const config = resolveConfig({}, {});
const read = (sources: WeatherSource[]) => readWeather(NO_STATES, config, sources);

describe('the order of resolution', () => {
  test('the default list is the weather entity, then Environment Canada over it', () => {
    expect(WEATHER_SOURCES.map(s => s.name)).toEqual(['weather-entity', 'environment-canada']);
  });

  test('a later source wins a field both know, and the earlier one keeps the rest', () => {
    const first = source('first', {temperature: 1, humidity: 50});
    const second = source('second', {temperature: 2});
    expect(read([first, second])).toMatchObject({temperature: 2, humidity: 50});
    expect(read([second, first])).toMatchObject({temperature: 1, humidity: 50});
  });

  test('a field a source gives way on is filled only when no earlier source did', () => {
    const entity = source('entity', {temperature: 3});
    const sensor = {...source('sensor', {temperature: 4.2, humidity: 70}), fallback: ['temperature'] as const};
    expect(read([entity, sensor])).toMatchObject({temperature: 3, humidity: 70});
    expect(read([source('empty', {}), sensor])).toMatchObject({temperature: 4.2});
  });

  test('the outdoor sensor is the temperature only when the weather entity has none', () => {
    const states = (attributes: object) => fullHouse.next({'weather.springfield_forecast': {attributes}}).states;
    const temperature = (attributes: object) =>
      readWeather(states(attributes), resolveConfig({}, states(attributes))).temperature;
    expect(temperature({temperature: 3})).toBe(3);
    expect(temperature({temperature: null})).toBe(4.2);
  });

  test('a source that is absent fills nothing', () => {
    expect(read([source('first', {temperature: 1}), source('absent', {temperature: 2}, false)]).temperature).toBe(1);
  });

  test('a field a source leaves undefined does not erase an earlier one', () => {
    expect(read([source('first', {temperature: 1}), source('second', {temperature: undefined})]).temperature).toBe(1);
  });

  test('the merge is shallow: a later group replaces the earlier group whole', () => {
    const first = source('first', {wind: {speed: 14, gust: null, direction: null, bearing: 225}});
    const second = source('second', {wind: {speed: null, gust: 30, direction: 'SW', bearing: null}});
    expect(read([first, second]).wind).toEqual({speed: null, gust: 30, direction: 'SW', bearing: null});
  });

  test('with no source at all the inputs are the empty ones, the sun up or unknown', () => {
    expect(read([])).toEqual(EMPTY_INPUTS);
  });
});

describe('the test houses', () => {
  test('the full house: Environment Canada overrides the entity, and its wind group replaces the entity one', () => {
    const inputs = readWeather(fullHouse.states, resolveConfig({}, fullHouse.states));
    const {foldForecast, ...rest} = inputs;
    expect(typeof foldForecast).toBe('function');
    expect(rest).toEqual({
      temperature: 4.2,
      condition: 'Mainly Sunny',
      conditionWords: 'weather.cond.ec.mainlySunny',
      isDay: true,
      sun: {up: true, next: {kind: 'set', at: Date.parse('2026-11-07T16:45:00-05:00')}, hasFirstLight: true},
      today: {hi: 7, lo: -1, pop: null},
      normals: {hi: 6, lo: -2},
      wind: {speed: 14, gust: 25, direction: 'SW', bearing: null},
      humidity: 71,
      dewPoint: -0.5,
      pressure: {kpa: 101.9, tendency: 'rising'},
      uv: 1,
      aqhi: 2,
      visibility: null,
      feelsLike: null,
      summary: 'Sunny with cloudy periods.',
      observation: {at: Date.parse('2026-11-07T13:30:00-05:00'), station: null},
      alerts: [],
      attribution: null,
    });
  });

  test('the bare house: only what the weather entity knows, and the sun', () => {
    const inputs = readWeather(bareHouse.states, resolveConfig({}, bareHouse.states));
    expect(inputs).toEqual({
      ...EMPTY_INPUTS,
      temperature: 4.2,
      condition: 'partlycloudy',
      humidity: 71,
      pressure: {kpa: 101.9, tendency: null},
      wind: {speed: 14, gust: null, direction: null, bearing: null},
      sun: {up: true, next: {kind: 'set', at: Date.parse('2026-11-07T16:45:00-05:00')}, hasFirstLight: true},
    });
    expect(inputs.foldForecast).toBeUndefined();
  });
});

describe("the sun's part", () => {
  const sunHouse = (state: string, extra: HassEntities = {}): HassEntities => ({
    'sun.sun': entity('sun.sun', state),
    'sensor.sun_next_setting': entity('sensor.sun_next_setting', '2026-11-07T21:45:00.000Z'),
    'sensor.sun_next_rising': entity('sensor.sun_next_rising', '2026-11-08T12:00:00.000Z'),
    ...extra,
  });
  const sunOf = (states: HassEntities) => {
    const {isDay, sun} = readWeather(states, resolveConfig({}, states), []);
    return {isDay, sun};
  };

  test('above the horizon: up, the next event is the setting', () => {
    expect(sunOf(sunHouse('above_horizon'))).toEqual({
      isDay: true,
      sun: {up: true, next: {kind: 'set', at: Date.parse('2026-11-07T21:45:00Z')}, hasFirstLight: false},
    });
  });

  test('below the horizon: not day, the next event is the rising', () => {
    expect(sunOf(sunHouse('below_horizon'))).toEqual({
      isDay: false,
      sun: {up: false, next: {kind: 'rise', at: Date.parse('2026-11-08T12:00:00Z')}, hasFirstLight: false},
    });
  });

  test('a house with no sun entity is taken to be in daylight, with nothing next', () => {
    expect(sunOf({})).toEqual({isDay: true, sun: {up: false, next: null, hasFirstLight: false}});
  });

  test('a sun entity that is unavailable is not day, and a next event that is not a date is nothing', () => {
    const states = sunHouse('unavailable', {
      'sensor.sun_next_rising': entity('sensor.sun_next_rising', 'unknown'),
    });
    expect(sunOf(states)).toEqual({isDay: false, sun: {up: false, next: null, hasFirstLight: false}});
  });

  test('knows the first light when the house has the dawn sensor', () => {
    const states = sunHouse('above_horizon', {
      'sensor.sun_next_dawn': entity('sensor.sun_next_dawn', '2026-11-08T11:30:00Z'),
    });
    expect(sunOf(states).sun.hasFirstLight).toBe(true);
  });
});
