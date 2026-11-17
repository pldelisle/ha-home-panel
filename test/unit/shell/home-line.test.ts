// The header's greeting and the date line it shares with the Home pane's heading (#269): the greeting by the hour, the first name, the
// line's parts in English, and in French what the rewrite layer made of the English line, the date upper case first as it wrote it.
import {describe, expect, test} from 'vitest';
import {
  firstName,
  greetingKey,
  homeLine,
  homeTemperatureIds,
  readHomeTemperatures,
} from '../../../src/shell/home-line.ts';
import {createFrench} from '../../../src/i18n/fr.js';
import {FULL_CFG} from '../../e2e/houses.ts';
import {fakeHass} from '../fake-hass.ts';
import {fullHouse, NOW, storeOf} from '../features/media/support.ts';

const inLanguage = (language: string) => storeOf({...fullHouse, locale: {...fullHouse.locale, language}}, FULL_CFG);
const layer = createFrench({
  hass: fakeHass({locale: {language: 'fr'}}),
  isFrench: true,
  names: {name: (key: string) => key},
});

describe('the greeting', () => {
  test('changes at 5, at noon and at 6 pm', () => {
    expect([4.99, 5, 11.99, 12, 17.99, 18, 23].map(greetingKey)).toEqual([
      'home.greeting.night',
      'home.greeting.morning',
      'home.greeting.morning',
      'home.greeting.afternoon',
      'home.greeting.afternoon',
      'home.greeting.evening',
      'home.greeting.evening',
    ]);
  });

  test("says the first word of the user's name, each part after a hyphen upper case, and nothing without a name", () => {
    expect(firstName('jean-luc tremblay')).toBe('Jean-Luc');
    expect(firstName('Alex')).toBe('Alex');
    expect(firstName(undefined)).toBe('');
  });
});

describe('the date line', () => {
  const temps = {inside: 20.6, outside: -4.2};

  test('in English: the date, then the temperatures and the checks that need attention, each when it has something', () => {
    const {t, fmt} = inLanguage('en');
    expect(homeLine({now: NOW}, {t, fmt})).toBe(fmt.dateLong(NOW));
    // the pane's line, under the greeting that already says the date
    expect(homeLine({...temps, attention: 1}, {t, fmt})).toBe('20.6° inside · -4.2° outside · 1 item needs attention');
    expect(homeLine({now: NOW, ...temps, attention: 2}, {t, fmt})).toBe(
      `${fmt.dateLong(NOW)} · 20.6° inside · -4.2° outside · 2 items need attention`,
    );
    expect(homeLine({now: NOW, inside: null, outside: 3, attention: 1}, {t, fmt})).toBe(
      `${fmt.dateLong(NOW)} · 3.0° outside · 1 item needs attention`,
    );
  });

  test('in French, what the rewrite layer made of the English line, the weekday upper case', () => {
    const en = inLanguage('en'),
      fr = inLanguage('fr');
    const french = homeLine({now: NOW, ...temps}, fr);
    expect(french).toBe(layer.text(homeLine({now: NOW, ...temps}, en)));
    expect(french.charAt(0)).toBe(french.charAt(0).toUpperCase());
  });
});

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
