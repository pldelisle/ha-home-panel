// weatherEntitySource: the generic weather entity as a source. Literal states in, literal inputs out, through the
// config resolver the panel uses, so the entity id comes from where it does in the house.
import {describe, expect, test} from 'vitest';
import {resolveConfig} from '../../../src/core/config.ts';
import type {HassEntities} from '../../../src/core/hass.ts';
import {weatherEntitySource} from '../../../src/providers/weather-entity.ts';
import {entity} from '../fake-hass.ts';

const ID = 'weather.springfield_forecast';
const house = (state: string, attributes: Record<string, unknown>): HassEntities => ({
  [ID]: entity(ID, state, attributes),
});
const read = (states: HassEntities) => weatherEntitySource.read(states, resolveConfig({}, states));

describe('presence and ids', () => {
  test('a house with a weather entity has the source, which reads that one id', () => {
    const states = house('cloudy', {});
    const config = resolveConfig({}, states);
    expect(weatherEntitySource.name).toBe('weather-entity');
    expect(weatherEntitySource.present(states, config)).toBe(true);
    expect(weatherEntitySource.ids(config)).toEqual([ID]);
  });

  test('a house with none has no source, no id and nothing read', () => {
    const states = {'light.lamp': entity('light.lamp', 'on')};
    const config = resolveConfig({}, states);
    expect(weatherEntitySource.present(states, config)).toBe(false);
    expect(weatherEntitySource.ids(config)).toEqual([]);
    expect(weatherEntitySource.read(states, config)).toEqual({});
  });

  test('an entity named in the config that Home Assistant does not have is not present', () => {
    const states = house('cloudy', {});
    const config = resolveConfig({entities: {weather: 'weather.gone'}}, states);
    expect(weatherEntitySource.present(states, config)).toBe(false);
    expect(weatherEntitySource.read(states, config)).toEqual({});
  });
});

describe('what it reads', () => {
  test('the condition is the state, and the reading, the humidity and the credit are its attributes', () => {
    expect(
      read(
        house('partlycloudy', {
          temperature: 4.2,
          humidity: 71,
          pressure: 101.9,
          wind_speed: 14,
          wind_bearing: 225,
          attribution: 'Data from a weather service',
        }),
      ),
    ).toEqual({
      condition: 'partlycloudy',
      temperature: 4.2,
      humidity: 71,
      pressure: {kpa: 101.9, tendency: null},
      wind: {speed: 14, gust: null, direction: null, bearing: 225},
      attribution: 'Data from a weather service',
    });
  });

  test('an entity that knows only its condition fills only that', () => {
    expect(read(house('rainy', {}))).toEqual({condition: 'rainy'});
  });

  test('an unavailable entity has no condition', () => {
    expect(read(house('unavailable', {}))).toEqual({});
  });

  test('a compass bearing is the direction, not a bearing in degrees', () => {
    expect(read(house('sunny', {wind_bearing: 'SW'})).wind).toEqual({
      speed: null,
      gust: null,
      direction: 'SW',
      bearing: null,
    });
  });

  test('values that are not numbers are left out', () => {
    expect(read(house('sunny', {temperature: 'warm', humidity: null, pressure: '101', wind_speed: NaN}))).toEqual({
      condition: 'sunny',
    });
  });
});

describe('the panel units, kPa and km/h', () => {
  test.each([
    ['kPa', 101.9, 101.9],
    ['hPa', 1019, 101.9],
    ['mbar', 1019, 101.9],
    ['Pa', 101900, 101.9],
    ['inHg', 30, 101.5917],
    ['mmHg', 760, 101.32472],
  ])('a pressure in %s', (unit, value, kpa) => {
    const {pressure} = read(house('cloudy', {pressure: value, pressure_unit: unit}));
    expect(pressure?.kpa).toBeCloseTo(kpa, 3);
  });

  test.each([
    ['km/h', 14, 14],
    ['m/s', 10, 36],
    ['mph', 10, 16.09344],
    ['kn', 10, 18.52],
  ])('a wind speed in %s', (unit, value, kmh) => {
    const {wind} = read(house('cloudy', {wind_speed: value, wind_speed_unit: unit}));
    expect(wind?.speed).toBeCloseTo(kmh, 4);
  });

  test('a unit it does not know is not guessed', () => {
    expect(
      read(house('cloudy', {pressure: 1019, pressure_unit: 'bananas', wind_speed: 4, wind_speed_unit: 'furlongs'})),
    ).toEqual({
      condition: 'cloudy',
    });
  });

  test('a unit that is not text is the panel own', () => {
    expect(read(house('cloudy', {pressure: 101.9, pressure_unit: 5})).pressure?.kpa).toBe(101.9);
  });
});
