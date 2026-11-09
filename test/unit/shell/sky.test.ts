// The sky wallpaper (src/shell/sky.ts): one test per branch of the legacy `skyWp()`, with a day written out by hand,
// and a guard that the wet conditions agree with the legacy class's own `condKind` while both exist.
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe, expect, test} from 'vitest';
import {isWetCondition, skyWallpaper} from '../../../src/shell/sky.ts';

const H = 36e5;
// a day at hours since midnight: first light 5, sunrise 6, sunset 18, last light 19
const DAY = {dawn: 5 * H, rise: 6 * H, set: 18 * H, dusk: 19 * H};

describe('skyWallpaper', () => {
  test('a day on which the sun does not rise or does not set is Lake, whatever the hour and the weather', () => {
    expect(skyWallpaper('rainy', {...DAY, rise: null}, 12 * H)).toBe('lake');
    expect(skyWallpaper('rainy', {...DAY, set: null}, 3 * H)).toBe('lake');
  });

  test('night is Aurora: before first light and after last light', () => {
    expect(skyWallpaper('sunny', DAY, 4 * H)).toBe('aurora');
    expect(skyWallpaper('sunny', DAY, 20 * H)).toBe('aurora');
  });

  test('the instants first light and last light themselves are not night', () => {
    expect(skyWallpaper('sunny', DAY, 5 * H)).toBe('dawn');
    expect(skyWallpaper('sunny', DAY, 19 * H)).toBe('ember');
  });

  test('where the sun never reaches first or last light, night is bounded by sunrise and sunset', () => {
    const noTwilight = {...DAY, dawn: null, dusk: null};
    expect(skyWallpaper('sunny', noTwilight, 5.5 * H)).toBe('aurora');
    expect(skyWallpaper('sunny', noTwilight, 6 * H)).toBe('dawn');
    expect(skyWallpaper('sunny', noTwilight, 17.5 * H)).toBe('ember');
    expect(skyWallpaper('sunny', noTwilight, 18.5 * H)).toBe('aurora');
  });

  test('Dawn runs from first light to an hour after sunrise', () => {
    expect(skyWallpaper('sunny', DAY, 5.5 * H)).toBe('dawn');
    expect(skyWallpaper('sunny', DAY, 6.9 * H)).toBe('dawn');
    expect(skyWallpaper('sunny', DAY, 7 * H)).toBe('lake');
  });

  test('Ember runs from an hour before sunset to last light', () => {
    expect(skyWallpaper('sunny', DAY, 17 * H)).toBe('lake');
    expect(skyWallpaper('sunny', DAY, 17.1 * H)).toBe('ember');
    expect(skyWallpaper('sunny', DAY, 18.9 * H)).toBe('ember');
  });

  test('by day it is Lake, and Meadow when it rains, snows, storms or fogs', () => {
    expect(skyWallpaper('sunny', DAY, 12 * H)).toBe('lake');
    expect(skyWallpaper(undefined, DAY, 12 * H)).toBe('lake');
    expect(skyWallpaper('rainy', DAY, 12 * H)).toBe('meadow');
    expect(skyWallpaper('fog', DAY, 12 * H)).toBe('meadow');
  });

  test('the hours at the edges of the day keep their own wallpaper in the rain', () => {
    expect(skyWallpaper('rainy', DAY, 5.5 * H)).toBe('dawn');
    expect(skyWallpaper('rainy', DAY, 18.5 * H)).toBe('ember');
    expect(skyWallpaper('rainy', DAY, 22 * H)).toBe('aurora');
  });
});

const HOME_ASSISTANT_CODES = [
  'clear-night',
  'cloudy',
  'exceptional',
  'fog',
  'hail',
  'lightning',
  'lightning-rainy',
  'partlycloudy',
  'pouring',
  'rainy',
  'snowy',
  'snowy-rainy',
  'sunny',
  'windy',
  'windy-variant',
];
const CANADA_WORDS = [
  'Mainly Sunny',
  'Mainly Clear',
  'Sunny',
  'Clear',
  'A mix of sun and cloud',
  'Partly Cloudy',
  'Cloudy',
  'Overcast',
  'A few clouds',
  'Chance of showers',
  'Light Rain',
  'Rain showers',
  'Drizzle',
  'Freezing drizzle',
  'Periods of rain',
  'Light Snow',
  'Flurries',
  'Snow',
  'Ice pellets',
  'Hail',
  'Rain or snow',
  'Wet flurries',
  'Thunderstorm',
  'Risk of thunderstorms',
  'Fog',
  'Mist',
  'Haze',
  'Windy',
  'Blowing snow',
  'Smoke',
  '',
];

describe('isWetCondition', () => {
  test('the wet codes of Home Assistant and nothing else', () => {
    const wet = HOME_ASSISTANT_CODES.filter(isWetCondition);
    expect(wet).toEqual(['fog', 'hail', 'lightning', 'lightning-rainy', 'pouring', 'rainy', 'snowy', 'snowy-rainy']);
  });

  test('Environment Canada words are searched, in any case', () => {
    expect(isWetCondition('Light Rain')).toBe(true);
    expect(isWetCondition('FLURRIES')).toBe(true);
    expect(isWetCondition('Mainly Sunny')).toBe(false);
    expect(isWetCondition(undefined)).toBe(false);
  });

  // The legacy class keeps its own table until the Weather moves delete it (#157, #158); this reads it from the source
  // and compares answers over every code and word above. It goes when `condKind` does.
  test('agrees with the legacy class on every code and word', () => {
    const legacy = readFileSync(new URL('../../../src/home-panel.js', import.meta.url), 'utf8');
    const table = legacy.match(/^const COND = \{[\s\S]*?^\};$/m)?.[0];
    const kind = legacy.match(/^const condKind = c => \{[\s\S]*?^\};$/m)?.[0];
    expect(table, 'COND is still in the legacy class: if it is gone, delete this test').toBeDefined();
    expect(kind, 'condKind is still in the legacy class: if it is gone, delete this test').toBeDefined();
    const condKind = runInNewContext(`${table}\n${kind}\ncondKind`) as (c: string) => string;
    const wetKinds = ['rain', 'snow', 'sleet', 'storm', 'fog'];
    for (const word of [...HOME_ASSISTANT_CODES, ...CANADA_WORDS, 'constructor', 'toString'])
      expect(isWetCondition(word), word).toBe(wetKinds.includes(condKind(word)));
  });
});
