// French: the translator turns the panel's English into Québec French, numbers and dates included, and leaves people's own names alone
import {test, expect} from 'vitest';
import {readFileSync} from 'node:fs';
const read = f => readFileSync(new URL('../../src/i18n/' + f, import.meta.url), 'utf8');
// fr.js + fr-map.js run as one script in the bundle; here they get a tiny fake hass whose names must stay untranslated
const load = names =>
  new Function('hass', read('fr.js') + '\n' + read('fr-map.js') + '\nreturn {frText, FR_MAP};')({
    areas: {a: {name: 'Home'}},
    devices: {},
    entities: {},
    states: Object.fromEntries(names.map((n, i) => [`light.l${i}`, {attributes: {friendly_name: n}}])),
  });

test('greetings, numbers and dates', () => {
  const {frText} = load([]);
  expect(frText('Good evening')).toBe('Bonsoir');
  expect(frText('Live · history 4:07 pm')).toBe('En direct · historique 16 h 07');
  expect(frText('12.5')).toBe('12,5');
  expect(frText('Some text nobody translated')).toBe('Some text nobody translated');
});

test('a name the house gave in HA is never translated', () => {
  const {frText} = load(['Good evening']);
  expect(frText('Good evening')).toBe('Good evening');
});

test('no French entry is empty, and placeholders match', () => {
  const {FR_MAP} = load([]);
  for (const [en, fr] of Object.entries(FR_MAP)) {
    expect(typeof fr === 'function' || String(fr).trim(), `empty French for "${en}"`).toBeTruthy();
    if (typeof fr === 'string')
      expect((fr.match(/\{n\}/g) || []).length, `placeholders differ: "${en}" → "${fr}"`).toBe(
        (en.match(/\{n\}/g) || []).length,
      );
  }
});
