// hasClimate: whether a house has something for the Climate tab, the descriptor's `available`: a thermostat in the config, or a heat pump Home Assistant knows.
import {describe, expect, test} from 'vitest';
import {hasClimate} from '../../../../src/features/climate/inputs.ts';
import {entity} from '../../fake-hass.ts';

const states = (...ids: string[]) => Object.fromEntries(ids.map(id => [id, entity(id, 'heat')]));
const config = (rooms: number, hp: string | null) =>
  ({entities: {hp}, rooms: Array.from({length: rooms}, () => ({}))}) as Parameters<typeof hasClimate>[1];

describe('hasClimate', () => {
  test('a thermostat in the config is enough, whatever Home Assistant knows', () => {
    expect(hasClimate({}, config(1, null))).toBe(true);
  });

  test('a heat pump the house names and Home Assistant knows is enough', () => {
    expect(hasClimate(states('climate.pump'), config(0, 'climate.pump'))).toBe(true);
  });

  test('a heat pump Home Assistant does not know, and one the house does not name, are not', () => {
    expect(hasClimate({}, config(0, 'climate.pump'))).toBe(false);
    expect(hasClimate(states('climate.pump'), config(0, null))).toBe(false);
  });
});
