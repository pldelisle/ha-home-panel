// The house's two temperatures (src/providers/home-temperatures.ts), moved from the shell's home line by #276: the rooms' average and the
// weather's, read from the ids the readers listen to.
import {describe, expect, test} from 'vitest';
import {homeTemperatureIds, readHomeTemperatures} from '../../../src/providers/home-temperatures.ts';
import {FULL_CFG} from '../../e2e/houses.ts';
import {fakeHass} from '../fake-hass.ts';
import {fullHouse, storeOf} from '../features/media/support.ts';

const inLanguage = (language: string) => storeOf({...fullHouse, locale: {...fullHouse.locale, language}}, FULL_CFG);

describe('the temperatures', () => {
  test("are the rooms' average and the weather's, read from the ids the line listens to", () => {
    const store = inLanguage('en');
    const {inside, outside} = readHomeTemperatures(store.hass!.states, store.config);
    expect(inside).not.toBeNull();
    expect(outside).not.toBeNull();
    const ids = homeTemperatureIds(store.config);
    expect(ids).toContain('climate.living_room');
    expect(ids).toContain(store.config.entities.weather);
  });

  test('are null when nothing reads', () => {
    const store = storeOf(fakeHass({}), {});
    expect(readHomeTemperatures(store.hass!.states, store.config)).toEqual({inside: null, outside: null});
  });
});
