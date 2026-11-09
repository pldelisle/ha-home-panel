// The readers over a map of states: what counts as no value, and the number, the text and the attribute of an entity.
import {describe, expect, test} from 'vitest';
import {attributeOf, isAvailable, numberAttributeOf, numberOf, textOf} from '../../../src/core/states.ts';
import {entity} from '../fake-hass.ts';

const states = {
  'sensor.temperature': entity('sensor.temperature', '4.2', {unit_of_measurement: '°C'}),
  'sensor.word': entity('sensor.word', 'rising'),
  'sensor.gone': entity('sensor.gone', 'unavailable', {unit_of_measurement: '°C'}),
  'sensor.unsure': entity('sensor.unsure', 'unknown'),
  'sensor.zero': entity('sensor.zero', '0'),
  'weather.home': entity('weather.home', 'cloudy', {temperature: 4.2, wind_bearing: 'SW', humidity: NaN, pressure: '101'}),
};

describe('isAvailable', () => {
  test('a state with a value is available, a missing one, unavailable and unknown are not', () => {
    expect(isAvailable(states['sensor.temperature'])).toBe(true);
    expect(isAvailable(states['sensor.zero'])).toBe(true);
    expect(isAvailable(undefined)).toBe(false);
    expect(isAvailable(states['sensor.gone'])).toBe(false);
    expect(isAvailable(states['sensor.unsure'])).toBe(false);
  });
});

describe('numberOf', () => {
  test('reads the numeric state, zero included', () => {
    expect(numberOf(states, 'sensor.temperature')).toBe(4.2);
    expect(numberOf(states, 'sensor.zero')).toBe(0);
  });

  test.each([['sensor.word'], ['sensor.gone'], ['sensor.unsure'], ['sensor.absent'], [null], [undefined], ['']])(
    'is null for %s',
    id => {
      expect(numberOf(states, id)).toBeNull();
    },
  );

  test('is null when there are no states at all', () => {
    expect(numberOf(undefined, 'sensor.temperature')).toBeNull();
  });
});

describe('textOf', () => {
  test('reads the state text of an available entity', () => {
    expect(textOf(states, 'sensor.word')).toBe('rising');
    expect(textOf(states, 'sensor.zero')).toBe('0');
  });

  test.each([['sensor.gone'], ['sensor.unsure'], ['sensor.absent'], [null], [undefined]])('is null for %s', id => {
    expect(textOf(states, id)).toBeNull();
  });

  test('is null when there are no states at all', () => {
    expect(textOf(undefined, 'sensor.word')).toBeNull();
  });
});

describe('attributeOf', () => {
  test('reads an attribute, even of an unavailable entity', () => {
    expect(attributeOf(states, 'sensor.temperature', 'unit_of_measurement')).toBe('°C');
    expect(attributeOf(states, 'sensor.gone', 'unit_of_measurement')).toBe('°C');
  });

  test('is undefined for a missing attribute, entity, id or states', () => {
    expect(attributeOf(states, 'sensor.word', 'unit_of_measurement')).toBeUndefined();
    expect(attributeOf(states, 'sensor.absent', 'unit_of_measurement')).toBeUndefined();
    expect(attributeOf(states, null, 'unit_of_measurement')).toBeUndefined();
    expect(attributeOf(undefined, 'sensor.temperature', 'unit_of_measurement')).toBeUndefined();
  });
});

describe('numberAttributeOf', () => {
  test('reads a finite number', () => {
    expect(numberAttributeOf(states, 'weather.home', 'temperature')).toBe(4.2);
  });

  test.each([['wind_bearing'], ['humidity'], ['pressure'], ['visibility']])('is null for the attribute %s', name => {
    expect(numberAttributeOf(states, 'weather.home', name)).toBeNull();
  });

  test('is null for a missing entity, id or states', () => {
    expect(numberAttributeOf(states, 'weather.absent', 'temperature')).toBeNull();
    expect(numberAttributeOf(states, null, 'temperature')).toBeNull();
    expect(numberAttributeOf(undefined, 'weather.home', 'temperature')).toBeNull();
  });
});
