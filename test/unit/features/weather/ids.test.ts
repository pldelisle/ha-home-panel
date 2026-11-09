// weatherIds: every entity id the Weather pane reads, so the store tells it about those and no others.
import {describe, expect, test} from 'vitest';
import {resolveConfig} from '../../../../src/core/config.ts';
import {weatherIds} from '../../../../src/features/weather/ids.ts';
import type {WeatherSource} from '../../../../src/providers/weather-source.ts';
import {entity} from '../../fake-hass.ts';
import {bareHouse, fullHouse} from './support.ts';

const SUN = ['sun.sun', 'sensor.sun_next_rising', 'sensor.sun_next_setting', 'sensor.sun_next_dawn'];

describe('weatherIds', () => {
  test('the full house: the entity, its seventeen sensors and the sun', () => {
    const ids = weatherIds(resolveConfig({}, fullHouse.states));
    expect([...ids].sort()).toEqual(
      [
        'weather.springfield_forecast',
        ...[
          'current_condition',
          'temperature',
          'high_temperature',
          'low_temperature',
          'normal_high_temperature',
          'normal_low_temperature',
          'wind_speed',
          'wind_direction',
          'humidity',
          'uv_index',
          'aqhi',
          'dew_point',
          'barometric_pressure',
          'tendency',
          'wind_gust',
          'observation_time',
          'summary',
        ].map(suffix => `sensor.springfield_${suffix}`),
        ...SUN,
      ].sort(),
    );
  });

  test('the bare house: the entity and the sun', () => {
    expect([...weatherIds(resolveConfig({}, bareHouse.states))].sort()).toEqual(
      ['weather.springfield_forecast', ...SUN].sort(),
    );
  });

  test('a house with no weather entity still reads the sun', () => {
    expect(weatherIds(resolveConfig({}, {}))).toEqual(SUN);
  });

  test('an id the config clears is left out, and an id two sources share is listed once', () => {
    const states = {'weather.home': entity('weather.home', 'cloudy')};
    const config = resolveConfig({entities: {sun: ''}}, states);
    const both: WeatherSource[] = ['a', 'b'].map(name => ({
      name,
      ids: () => ['weather.home', 'sensor.shared'],
      present: () => true,
      read: () => ({}),
    }));
    expect(weatherIds(config, both)).toEqual([
      'weather.home',
      'sensor.shared',
      'sensor.sun_next_rising',
      'sensor.sun_next_setting',
      'sensor.sun_next_dawn',
    ]);
  });
});
