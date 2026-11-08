// French: the translator turns the panel's English into Québec French, numbers and dates included, and leaves people's own names alone
import {test, expect, vi} from 'vitest';

// frText() looks up the house's own names through hass and caches them for a minute. A tiny fake hass whose names must
// stay untranslated, set on a fresh copy of the modules so one test's cache never reaches the next.
// As in the panel, the module is loaded first and hass is handed over afterwards, so a hass read at import time
// fails here.
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

// The Security card, the Cams pane and the Home tile join fragments with " · " ("2 cameras · all doors closed · motion now").
// The expected French is written out in full, never built by the code under test.
test('the Security line is French in every part and has no stray colon', async () => {
  const {frText} = await load([]);
  expect(frText('2 cameras · all doors closed · motion now')).toBe(
    '2 caméras · toutes les portes fermées · mouvement en cours',
  );
  expect(frText('all doors closed · no motion')).toBe('toutes les portes fermées · aucun mouvement');
  expect(frText('1 door open · motion now')).toBe('1 porte ouverte · mouvement en cours');
  expect(frText('2 cameras · 2 doors open · no motion')).toBe('2 caméras · 2 portes ouvertes · aucun mouvement');
  expect(frText('No cameras · all doors closed')).toBe('Aucune caméra · toutes les portes fermées');
  // without a motion part the line ends in "open", and the sensor-row pattern must not take the whole line
  expect(frText('2 cameras · 1 door open')).toBe('2 caméras · 1 porte ouverte');
  expect(frText('2 cameras · all doors closed')).toBe('2 caméras · toutes les portes fermées');
  // the Home tile (capital D) and the lone fragments
  expect(frText('Doors closed · motion now')).toBe('Portes fermées · mouvement en cours');
  expect(frText('motion now')).toBe('mouvement en cours');
  expect(frText('no motion')).toBe('aucun mouvement');
  expect(frText('all doors closed')).toBe('toutes les portes fermées');
});

test('the camera sheet line: state, motion now or last motion', async () => {
  const {frText} = await load([]);
  expect(frText('Streaming · motion now')).toBe('En direct · mouvement en cours');
  expect(frText('Streaming · last motion 5 min ago')).toBe('En direct · dernier mouvement il y a 5 min');
});

// a sensor row puts the colon after the name ("Hall : mouvement en cours"); the Security line must never reach that form
test('a sensor row keeps its colon', async () => {
  const {frText} = await load([]);
  expect(frText('Hall motion now')).toBe('Hall : mouvement en cours');
  expect(frText('Hall no motion')).toBe('Hall : aucun mouvement');
  expect(frText('Hall motion 5 min ago')).toBe('Hall : mouvement il y a 5 min');
  expect(frText('Front door closed')).toBe('Front door fermée');
});
