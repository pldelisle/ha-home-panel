// sunToday: the one sunrise and sunset every tab shows for today. The computed pair (`sunTimes`) wins; the sun sensors, which name the NEXT
// event and so are tomorrow's sunrise once today's has passed, answer only for a house with no coordinates.
import {describe, expect, test} from 'vitest';
import {resolveConfig} from '../../../src/core/config.ts';
import {sunTimes} from '../../../src/core/sun.ts';
import {sunToday} from '../../../src/providers/sun.ts';
import {entity} from '../fake-hass.ts';
import {fullHouse} from '../features/media/support.ts';

const config = resolveConfig({}, fullHouse.states);
const DAY = '2026-11-07';

describe('sunToday', () => {
  test("is the computed pair for today whatever the sensors say (the sensor's sunrise is tomorrow's)", () => {
    const expected = sunTimes(43.65, -79.38, DAY);
    expect(sunToday(fullHouse.states, config, {latitude: 43.65, longitude: -79.38, day: DAY})).toStrictEqual({
      rise: expected.rise,
      set: expected.set,
      noon: expected.noon,
    });
  });

  test('without coordinates the noon is the midpoint of the two sensors, and none when a sensor reads nothing', () => {
    const times = sunToday(fullHouse.states, config, {day: DAY});
    expect(times.noon).toBe((times.rise! + times.set!) / 2);
    const off = {
      ...fullHouse.states,
      'sun.sun': entity('sun.sun', 'above_horizon'),
      [config.entities.setting!]: entity(config.entities.setting!, 'unavailable'),
    };
    expect(sunToday(off, config, {day: DAY})).toStrictEqual({rise: times.rise, set: null, noon: null});
  });

  test('falls back to the two sensors for a house with no coordinates', () => {
    const times = sunToday(fullHouse.states, config, {day: DAY});
    expect(typeof times.rise).toBe('number');
    expect(times.set).toBe(Date.parse(fullHouse.states[config.entities.setting!].state));
  });
});
