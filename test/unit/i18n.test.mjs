// French: the translator turns the panel's English into Québec French, numbers and dates included, and leaves people's own names alone
import {test, expect, vi} from 'vitest';

// frText() looks up the house's own names through hass and caches them for a minute. A tiny fake hass whose names must
// stay untranslated, set on a fresh copy of the modules so one test's cache never reaches the next.
// As in the panel, the module is loaded first and hass is handed over afterwards, so a hass read at import time fails here.
const load = async names => {
  vi.resetModules();
  const fr = await import('../../src/i18n/fr.js');
  const {setHass} = await import('../../src/legacy/globals.js');
  setHass({
    areas: {a: {name: 'Home'}},
    devices: {},
    entities: {},
    states: Object.fromEntries(names.map((n, i) => [`light.l${i}`, {attributes: {friendly_name: n}}])),
  });
  return fr;
};

test('greetings, numbers and dates', async () => {
  const {frText} = await load([]);
  expect(frText('Good evening')).toBe('Bonsoir');
  expect(frText('Live · history 4:07 pm')).toBe('En direct · historique 16 h 07');
  expect(frText('12.5')).toBe('12,5');
  expect(frText('Some text nobody translated')).toBe('Some text nobody translated');
});

test('a name the house gave in HA is never translated', async () => {
  const {frText} = await load(['Good evening']);
  expect(frText('Good evening')).toBe('Good evening');
});

test('no French entry is empty, and placeholders match', async () => {
  const {FR_MAP} = await load([]);
  for (const [en, fr] of Object.entries(FR_MAP)) {
    expect(typeof fr === 'function' || String(fr).trim(), `empty French for "${en}"`).toBeTruthy();
    if (typeof fr === 'string')
      expect((fr.match(/\{n\}/g) || []).length, `placeholders differ: "${en}" → "${fr}"`).toBe(
        (en.match(/\{n\}/g) || []).length,
      );
  }
});
