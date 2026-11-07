// French: the translator turns the panel's English into Québec French, numbers and dates included, and leaves people's own names alone
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = f => readFileSync(new URL('../../src/i18n/' + f, import.meta.url), 'utf8');
// fr.js + fr-map.js run as one script in the bundle; here they get a tiny fake hass whose names must stay untranslated
const load = names => new Function('hass', read('fr.js') + '\n' + read('fr-map.js') + '\nreturn {frText, FR_MAP};')(
  {areas: {a: {name: 'Home'}}, devices: {}, entities: {}, states: Object.fromEntries(names.map((n, i) => [`light.l${i}`, {attributes: {friendly_name: n}}]))});

test('greetings, numbers and dates', () => {
  const {frText} = load([]);
  assert.equal(frText('Good evening'), 'Bonsoir');
  assert.equal(frText('Live · history 4:07 pm'), 'En direct · historique 16 h 07');
  assert.equal(frText('12.5'), '12,5');
  assert.equal(frText('Some text nobody translated'), 'Some text nobody translated');
});

test('a name the house gave in HA is never translated', () => {
  const {frText} = load(['Good evening']);
  assert.equal(frText('Good evening'), 'Good evening');
});

test('no French entry is empty, and placeholders match', () => {
  const {FR_MAP} = load([]);
  for (const [en, fr] of Object.entries(FR_MAP)) {
    assert.ok(typeof fr === 'function' || String(fr).trim(), `empty French for "${en}"`);
    if (typeof fr === 'string') assert.equal((fr.match(/\{n\}/g) || []).length, (en.match(/\{n\}/g) || []).length, `placeholders differ: "${en}" → "${fr}"`);
  }
});
