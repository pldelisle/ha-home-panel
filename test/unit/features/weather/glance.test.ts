// The phone's Home weather card's name for a screen reader (#389, moved to the feature's glance in #376's review), and the entities it reads.
import {describe, expect, test} from 'vitest';
import {createStore} from '../../../../src/core/store.ts';
import {resolveConfig} from '../../../../src/core/config.ts';
import {weatherIds} from '../../../../src/features/weather/ids.ts';
import {weatherCardLabel, weatherCardLabelIds} from '../../../../src/features/weather/glance.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import {storeOf} from '../media/support.ts';
import {fullHouse} from './support.ts';

describe('weatherCardLabel', () => {
  test('says the temperature, the condition and where a tap goes, from the house', () => {
    expect(weatherCardLabel(storeOf(fullHouse, FULL_CFG))).toMatch(/^Weather: 4\.2°, [a-z].*\. Opens the forecast$/);
  });

  test('is empty before Home Assistant answers', () => {
    const store = createStore({defaultTimeZone: 'America/Toronto', resolve: resolveConfig});
    expect(weatherCardLabel(store)).toBe('');
  });
});

describe('weatherCardLabelIds', () => {
  test('are the weather feature’s own ids, so the card is named again when one of them changes', () => {
    const store = storeOf(fullHouse, FULL_CFG);
    expect(weatherCardLabelIds(store)).toEqual(weatherIds(store.config));
    expect(weatherCardLabelIds(store).length).toBeGreaterThan(0);
  });
});
