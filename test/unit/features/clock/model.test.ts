// The idle clock's words (src/features/clock/model.ts) at a known instant in English and French, and what it reads from the test house
// (src/features/clock/inputs.ts, ids.ts). The French matches what the rewrite layer made of the legacy `renderIdle`'s English: the
// 24-hour time with its colon, the date lower case, "Lever 7 h 02" (test/unit/fixtures/moved/clock.json pins the words).
import {describe, expect, test} from 'vitest';
import {clockIds} from '../../../../src/features/clock/ids.ts';
import {readClock, type ClockInputs} from '../../../../src/features/clock/inputs.ts';
import {clockModel} from '../../../../src/features/clock/model.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import {fakeHass} from '../../fake-hass.ts';
import {depsOf, fullHouse, NOW, storeOf} from '../media/support.ts';

const at = (iso: string) => Date.parse(iso);
const PM = at('2026-11-07T16:07:00-05:00');
const RISE = at('2026-11-07T06:48:00-05:00'),
  SET = at('2026-11-07T16:31:00-05:00'),
  TOMORROW = at('2026-11-08T06:50:00-05:00');
const inputs = (over: Partial<ClockInputs> = {}): ClockInputs => ({
  now: PM,
  sunUp: true,
  sunrise: RISE,
  sunset: SET,
  tomorrowSunrise: TOMORROW,
  inside: 20.84,
  outside: -3.14,
  condition: 'Mainly Sunny',
  ...over,
});
const en = {...depsOf(fullHouse, 'en'), isFrench: false};
const fr = {...depsOf(fullHouse, 'fr'), isFrench: true};

describe('clockModel', () => {
  test('in English: the time split from its period, the long date, the temperatures and the next sunset', () => {
    expect(clockModel(inputs(), en)).toEqual({
      time: {main: '4:07', suffix: 'pm'},
      date: 'Saturday, November 7',
      temps: '20.8° inside · -3.1° outside',
      icon: {condition: 'Mainly Sunny', day: true, label: 'Mainly sunny'},
      nextSun: 'Sunset 4:31 pm',
    });
  });

  test('in French: the 24-hour time and no period, the date lower case, the words and the times in French', () => {
    expect(clockModel(inputs(), fr)).toEqual({
      time: {main: '16:07', suffix: ''},
      date: 'samedi 7 novembre',
      temps: '20,8° à l’intérieur · -3,1° dehors',
      icon: {condition: 'Mainly Sunny', day: true, label: 'Généralement ensoleillé'},
      nextSun: 'Coucher 16 h 31',
    });
  });

  test('the next sun event: the sunrise before it, the sunset between, tomorrow’s sunrise after; none when that one never comes', () => {
    expect(clockModel(inputs({now: at('2026-11-07T05:00:00-05:00')}), en).nextSun).toBe('Sunrise 6:48 am');
    expect(clockModel(inputs({now: at('2026-11-07T12:00:00-05:00')}), en).nextSun).toBe('Sunset 4:31 pm');
    expect(clockModel(inputs({now: at('2026-11-07T21:00:00-05:00')}), en).nextSun).toBe('Sunrise 6:50 am');
    const polar = {sunrise: null, sunset: null, tomorrowSunrise: null};
    expect(clockModel(inputs(polar), en).nextSun).toBeNull();
  });

  test('the icon by night, a Home Assistant word named by the catalog, and no icon or temperatures with nothing to show', () => {
    expect(clockModel(inputs({condition: 'partlycloudy', sunUp: false}), en).icon).toEqual({
      condition: 'partlycloudy',
      day: false,
      label: 'Partly cloudy',
    });
    const bare = clockModel(inputs({condition: null, inside: null, outside: null}), en);
    expect(bare.icon).toBeNull();
    expect(bare.temps).toBeNull();
    expect(clockModel(inputs({inside: null}), en).temps).toBe('-3.1° outside');
  });
});

describe('readClock and clockIds', () => {
  test('read the test house: the condition sensor first, the temperatures, the sun’s times at the house', () => {
    const store = storeOf(fullHouse, FULL_CFG);
    const hass = store.hass!;
    const read = readClock(hass.states, store.config, hass.config, {now: NOW, isoDay: at => store.fmt.isoDay(at)});
    expect(read.now).toBe(NOW);
    expect(read.condition).toBe(hass.states[store.config.entities.cond!].state);
    expect(read.inside).not.toBeNull();
    expect(read.outside).not.toBeNull();
    expect(read.sunrise! < read.sunset!).toBe(true);
    expect(read.tomorrowSunrise! - read.sunrise!).toBeGreaterThan(23 * 3600e3);
    expect(read.sunUp).toBe(hass.states['sun.sun'].state === 'above_horizon');
    const ids = clockIds(store);
    expect(ids).toEqual(expect.arrayContaining(['sun.sun', store.config.entities.cond, store.config.entities.weather]));
  });

  test('a house with no sun entity is day, the weather entity names the condition, and a missing place is the equator', () => {
    const hass = fakeHass({states: {'weather.home': {state: 'rainy', attributes: {temperature: 4}}}});
    const store = storeOf(hass, {entities: {weather: 'weather.home', sun: null, cond: null}});
    const read = readClock(store.hass!.states, store.config, {}, {now: NOW, isoDay: at => store.fmt.isoDay(at)});
    expect(read).toMatchObject({sunUp: true, condition: 'rainy', outside: 4, inside: null});
    expect(read.sunrise).not.toBeNull();
    expect(clockIds(store)).toEqual(['weather.home']);
  });
});
