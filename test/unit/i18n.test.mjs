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

// The camera sheet's sub-line is the camera's state, then its motion, joined with " · " (camSheet). Its fragments have
// exact entries so that the sensor-row rule (FR_DOOR) never reads "last" as a sensor name.
// The date is what fmtDate draws (en-CA, "Oct 3"); frKey turns it into {n}.
test('the camera sheet line is French in every part and has no stray colon', async () => {
  const {frText} = await load([]);
  expect(frText('Streaming · last motion just now')).toBe("En direct · dernier mouvement à l'instant");
  expect(frText('Idle · last motion 5 min ago')).toBe('Au repos · dernier mouvement il y a 5 min');
  expect(frText('Recording · motion now')).toBe('Enregistrement · mouvement en cours');
  expect(frText('Streaming · last motion Oct 3')).toBe('En direct · dernier mouvement le 3 oct.');
  expect(frText('Idle · last motion 2 h ago')).toBe('Au repos · dernier mouvement il y a 2 h');
  expect(frText('Recording')).toBe('Enregistrement');
  expect(frText('The camera is offline.')).toBe('La caméra est hors ligne.');
  // the sensor-row rule is untouched
  expect(frText('Hall motion 5 min ago')).toBe('Hall\u00a0: mouvement il y a 5 min');
});

// Strings drawn on French screens that had no entry (#91). Names people gave in Home Assistant are not part of this.
test('the sensor battery note, the empty Cameras card, a camera tile date and the Home kWh fragments are French', async () => {
  const {frText} = await load([]);
  expect(frText('5 min ago · battery 12%')).toBe('il y a 5 min · pile à 12\u202f%');
  expect(frText('Motion Oct 3')).toBe('Mouvement le 3 oct.');
  expect(
    frText(
      'Add UniFi Protect in Settings → Devices & services, with a local Protect user. Your cameras show up here on their own.',
    ),
  ).toBe(
    "Ajoutez UniFi Protect dans Paramètres → Appareils et services, avec un utilisateur Protect local. Vos caméras apparaîtront ici d'elles-mêmes.",
  );
  expect(frText('Now · 0.0 kWh today · rate unknown')).toBe("Maintenant · 0,0 kWh aujourd'hui · tarif inconnu");
  expect(frText('Idle · 34.5 kWh today')).toBe("Au repos · 34,5 kWh aujourd'hui");
});

// A sensor row ("Front door open", "Garage door offline": `${name} open`, `${name} offline` in sensorState and the attention
// list) keeps the form it had, colon included; the Security line must never reach it. FR_DOOR's motion forms and
// "Front door closed" are not drawn by the panel today; they are pinned so that FR_DOOR stays as it is.
test('a sensor row keeps its own form', async () => {
  const {frText} = await load([]);
  expect(frText('Front door open')).toBe('Front door : ouverte');
  expect(frText('Garage door offline')).toBe('Garage door hors ligne');
  expect(frText('Front door closed')).toBe('Front door fermée');
  expect(frText('Hall motion now')).toBe('Hall : mouvement en cours');
  expect(frText('Hall no motion')).toBe('Hall : aucun mouvement');
  expect(frText('Hall motion 5 min ago')).toBe('Hall : mouvement il y a 5 min');
});

// "·" separates parts only with a space on each side: a name with a bare "·" in it is still one sensor
test('a name with a bare middle dot stays one name', async () => {
  const {frText} = await load([]);
  expect(frText('Porte·Garage open')).toBe('Porte·Garage : ouverte');
  expect(frText('Porte·Garage offline')).toBe('Porte·Garage hors ligne');
});

// a name with " · " in it cannot be told from two parts of a line, so it is translated part by part (a part that is
// not one of ours stays as it is)
test('a name with " · " in it is read as two parts', async () => {
  const {frText} = await load([]);
  expect(frText('Lights · Front door open')).toBe('Lumières · Front door : ouverte');
});

// #79: the phone's scene tiles, the Dinner scene's "Last 2 h ago" and the movie scene's "Tap to run", and the idle stack's
// "Now playing" card were cut with an ellipsis in French; shorter words fit. Expected texts are written out, never built.
test('the scene tile sub-lines are short in French', async () => {
  const {frText} = await load([]);
  // the translator capitalises the first letter when the English one is a capital
  expect(frText('Last 2 h ago')).toBe('Il y a 2 h');
  expect(frText('Last 5 min ago')).toBe('Il y a 5 min');
  expect(frText('Last just now')).toBe("À l'instant");
  expect(frText('Tap to run')).toBe('Lancer');
  // a scene run on an earlier day keeps its date wording
  expect(frText('Last Nov 3')).toBe('Lancée le 3 nov.');
});

test('the idle stack card says "En lecture" and nothing else changed with it', async () => {
  const {frText} = await load([]);
  expect(frText('Now playing')).toBe('En lecture');
  expect(frText('Tap for the player')).toBe('Toucher pour le lecteur');
  // the other "ago" lines keep their wording
  expect(frText('Motion 2 h ago')).toBe('Mouvement il y a 2 h');
  expect(frText('last motion 5 min ago')).toBe('dernier mouvement il y a 5 min');
});

// the Lights tile's sub-line is "2 of 3 on · 59%", with the colour temperature or the mode after it on a tablet
test('the Lights tile sub-line is French in every part', async () => {
  const {frText} = await load([]);
  expect(frText('2 of 3 on')).toBe('2 sur 3 allumées');
  expect(frText('2 of 3 on · 59% · 3000 K')).toBe('2 sur 3 allumées · 59 % · 3000 K');
  expect(frText('2 of 3 on · 59% · Auto')).toBe('2 sur 3 allumées · 59 % · Auto');
  expect(frText('2 of 3 on · 59% · Night')).toBe('2 sur 3 allumées · 59 % · Nuit');
  expect(frText('2 of 3 on · 59%')).toBe('2 sur 3 allumées · 59 %');
});
