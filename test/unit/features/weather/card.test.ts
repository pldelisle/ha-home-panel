// The Home pane's weather card (#268): `sunToday` reads today's sunset and sunrise, and `weatherCardModel` words the sun line in the
// order the events come, the big temperature, the condition and the high and low, as the legacy `renderHome` did, in English and French.
import {describe, expect, test} from 'vitest';
import {resolveConfig} from '../../../../src/core/config.ts';
import {createFormatters} from '../../../../src/core/i18n/format.ts';
import {panelLocale} from '../../../../src/core/i18n/locale.ts';
import {createMessages} from '../../../../src/core/i18n/messages.ts';
import {readWeather} from '../../../../src/features/weather/inputs.ts';
import {sunToday} from '../../../../src/providers/sun.ts';
import {weatherCardModel, weatherChipModel} from '../../../../src/features/weather/model.ts';
import {entity} from '../../fake-hass.ts';
import {fullHouse, inputsWith, type Language} from './support.ts';

const SET = Date.UTC(2026, 10, 7, 21, 45);
const RISE = Date.UTC(2026, 10, 8, 12, 0);

function say(language: Language) {
  const locale = panelLocale({...fullHouse, locale: {language}}, {timeZone: 'America/Toronto', browserLocale: 'en'});
  return {t: createMessages(locale).t, fmt: createFormatters(locale)};
}

describe('sunToday without coordinates', () => {
  test('reads the two sun sensors of the house, in milliseconds', () => {
    const config = resolveConfig({}, fullHouse.states);
    const times = sunToday(fullHouse.states, config, {day: '2026-11-07'});
    expect(typeof times.set).toBe('number');
    expect(typeof times.rise).toBe('number');
  });

  test('says null for a sensor that reads nothing or is not set', () => {
    const config = resolveConfig({}, fullHouse.states);
    const id = config.entities.setting!;
    // `sun.sun`'s own attributes come first, so the sensors answer only once it says nothing
    const bare = {...fullHouse.states, 'sun.sun': entity('sun.sun', 'above_horizon')};
    const states = {...bare, [id]: entity(id, 'unknown')};
    expect(sunToday(states, config, {day: '2026-11-07'}).set).toBeNull();
    const unset = {...config, entities: {...config.entities, rising: null}};
    expect(sunToday(bare, unset, {day: '2026-11-07'}).rise).toBeNull();
  });
});

describe('weatherCardModel', () => {
  test('by day: sunset first, then sunrise, with the high and the low', () => {
    const inputs = inputsWith({
      temperature: 4.2,
      condition: 'partlycloudy',
      today: {...inputsWith({}).today, hi: 7.4, lo: -1.2},
      sun: {up: true, next: null, hasFirstLight: false},
    });
    const view = weatherCardModel(inputs, {set: SET, rise: RISE}, say('en'));
    expect(view).toEqual({
      next: {label: 'Sunset', time: '4:45 pm'},
      then: {label: 'sunrise', time: '7:00 am'},
      temperature: '4.2°',
      condition: 'Partly cloudy',
      range: 'High 7° · low -1°',
    });
  });

  test('by night, in French: sunrise first, then sunset', () => {
    const inputs = inputsWith({
      today: {...inputsWith({}).today, hi: 7.4, lo: null},
      sun: {up: false, next: null, hasFirstLight: false},
    });
    const view = weatherCardModel(inputs, {set: SET, rise: RISE}, say('fr'));
    expect(view.next.label).toBe('Lever du soleil');
    expect(view.then?.label).toBe('coucher du soleil');
    expect(view.range).toBe('Max 7°');
  });

  test('a dash for a sun sensor that reads nothing, "No reading" for the temperature, and no second event', () => {
    const inputs = inputsWith({sun: {up: true, next: null, hasFirstLight: false}});
    const view = weatherCardModel(inputs, {set: null, rise: null}, say('en'));
    expect(view.next.time).toBe('–');
    expect(view.then).toBeNull();
    expect(view).toMatchObject({temperature: 'No reading', temperatureMissing: true});
    expect(view.range).toBe('');
  });

  test('the full house reads a card', () => {
    const config = resolveConfig({}, fullHouse.states);
    const view = weatherCardModel(
      readWeather(fullHouse.states, config),
      sunToday(fullHouse.states, config, {day: '2026-11-07'}),
      say('en'),
    );
    expect(view.next.label).toMatch(/^Sun(set|rise)$/);
  });
});

// The header's chip (#269): the temperature to a tenth and the condition, as the legacy chip wrote them; none without a temperature.
describe('weatherChipModel', () => {
  test('words the temperature to a tenth and the condition, in English and French', () => {
    const inputs = inputsWith({temperature: -4.25, condition: 'partlycloudy'});
    expect(weatherChipModel(inputs, say('en'))).toEqual({temperature: '-4.3°', condition: 'Partly cloudy'});
    expect(weatherChipModel(inputs, say('fr'))).toEqual({temperature: '-4,3°', condition: 'Partiellement nuageux'});
  });

  test('is null when the house reads no temperature', () => {
    expect(weatherChipModel(inputsWith({condition: 'sunny'}), say('en'))).toBeNull();
  });
});
