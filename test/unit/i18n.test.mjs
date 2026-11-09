// French: the translator turns the panel's English into Québec French, numbers and dates included, and leaves people's own names alone
import {test, expect} from 'vitest';
import {fakeHass, entity} from './fake-hass.ts';
import {createFrench, FR_MAP} from '../../src/i18n/fr.js';

// The translator looks up the house's own names through its store's hass and caches them for a minute. Each test builds
// its own layer from a fake store with a tiny fake hass whose names must stay untranslated, so one test's cache never
// reaches the next and no module has to be loaded afresh.
const houseWithNames = names => ({
  areas: {a: {area_id: 'a', name: 'Home'}},
  states: Object.fromEntries(names.map((n, i) => [`light.l${i}`, entity(`light.l${i}`, 'on', {friendly_name: n})])),
});
const frTextFor = names => createFrench({hass: fakeHass(houseWithNames(names)), isFrench: true}).text;

test('greetings, numbers and dates', () => {
  const frText = frTextFor([]);
  expect(frText('Good evening')).toBe('Bonsoir');
  expect(frText('Live · history 4:07 pm')).toBe('En direct · historique 16 h 07');
  expect(frText('12.5')).toBe('12,5');
  expect(frText('Some text nobody translated')).toBe('Some text nobody translated');
});

test('a name the house gave in HA is never translated', () => {
  const frText = frTextFor(['Good evening']);
  expect(frText('Good evening')).toBe('Good evening');
});

test('no French entry is empty, and placeholders match', () => {
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
test('the Security line is French in every part and has no stray colon', () => {
  const frText = frTextFor([]);
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
test('the camera sheet line is French in every part and has no stray colon', () => {
  const frText = frTextFor([]);
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
test('the sensor battery note, the empty Cameras card, a camera tile date and the Home kWh fragments are French', () => {
  const frText = frTextFor([]);
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
test('a sensor row keeps its own form', () => {
  const frText = frTextFor([]);
  expect(frText('Front door open')).toBe('Front door : ouverte');
  expect(frText('Garage door offline')).toBe('Garage door hors ligne');
  expect(frText('Front door closed')).toBe('Front door fermée');
  expect(frText('Hall motion now')).toBe('Hall : mouvement en cours');
  expect(frText('Hall no motion')).toBe('Hall : aucun mouvement');
  expect(frText('Hall motion 5 min ago')).toBe('Hall : mouvement il y a 5 min');
});

// "·" separates parts only with a space on each side: a name with a bare "·" in it is still one sensor
test('a name with a bare middle dot stays one name', () => {
  const frText = frTextFor([]);
  expect(frText('Porte·Garage open')).toBe('Porte·Garage : ouverte');
  expect(frText('Porte·Garage offline')).toBe('Porte·Garage hors ligne');
});

// a name with " · " in it cannot be told from two parts of a line, so it is translated part by part (a part that is
// not one of ours stays as it is)
test('a name with " · " in it is read as two parts', () => {
  const frText = frTextFor([]);
  expect(frText('Lights · Front door open')).toBe('Lumières · Front door : ouverte');
});

// #79: the phone's scene tiles, the Dinner scene's "Last 2 h ago" and the movie scene's "Tap to run", and the idle stack's
// "Now playing" card were cut with an ellipsis in French; shorter words fit. Expected texts are written out, never built.
test('the scene tile sub-lines are short in French', () => {
  const frText = frTextFor([]);
  // the translator capitalises the first letter when the English one is a capital
  expect(frText('Last 2 h ago')).toBe('Il y a 2 h');
  expect(frText('Last 5 min ago')).toBe('Il y a 5 min');
  expect(frText('Last just now')).toBe("À l'instant");
  expect(frText('Tap to run')).toBe('Lancer');
  // a scene run on an earlier day keeps its date wording
  expect(frText('Last Nov 3')).toBe('Lancée le 3 nov.');
});

test('the idle stack card says "En lecture" and nothing else changed with it', () => {
  const frText = frTextFor([]);
  expect(frText('Now playing')).toBe('En lecture');
  expect(frText('Tap for the player')).toBe('Toucher pour le lecteur');
  // the other "ago" lines keep their wording
  expect(frText('Motion 2 h ago')).toBe('Mouvement il y a 2 h');
  expect(frText('last motion 5 min ago')).toBe('dernier mouvement il y a 5 min');
});

// the Lights tile's sub-line is "2 of 3 on · 59%", with the colour temperature or the mode after it on a tablet
test('the Lights tile sub-line is French in every part', () => {
  const frText = frTextFor([]);
  expect(frText('2 of 3 on')).toBe('2 sur 3 allumées');
  expect(frText('2 of 3 on · 59% · 3000 K')).toBe('2 sur 3 allumées · 59 % · 3000 K');
  expect(frText('2 of 3 on · 59% · Auto')).toBe('2 sur 3 allumées · 59 % · Auto');
  expect(frText('2 of 3 on · 59% · Night')).toBe('2 sur 3 allumées · 59 % · Nuit');
  expect(frText('2 of 3 on · 59%')).toBe('2 sur 3 allumées · 59 %');
});

// createFrench(store): the per-panel translator, fed by a store (a fake store is enough). Two panels on one page have
// two layers, and each reads the house's names from its own store: a name one house gave is still translated for the
// other. The translations themselves are covered above, where every layer is built the same way.
test('two createFrench layers over two stores each leave only the names their own house gave', () => {
  const evening = createFrench({hass: fakeHass(houseWithNames(['Good evening'])), isFrench: true});
  const morning = createFrench({hass: fakeHass(houseWithNames(['Good morning'])), isFrench: true});
  expect(evening.text('Good evening')).toBe('Good evening');
  expect(evening.text('Good morning')).toBe('Bonjour');
  expect(morning.text('Good morning')).toBe('Good morning');
  expect(morning.text('Good evening')).toBe('Bonsoir');
});

test('createFrench does nothing while the store is not French', () => {
  const store = {hass: fakeHass(), isFrench: false};
  const fr = createFrench(store);
  expect(fr.text('Good evening')).toBe('Good evening');
  const opts = {chart: {}};
  expect(fr.apex(opts)).toBe(opts);
  expect(opts.chart).toStrictEqual({});
  store.isFrench = true;
  expect(fr.text('Good evening')).toBe('Bonsoir');
  expect(fr.apex({chart: {}}).chart.defaultLocale).toBe('fr');
});

// the unit tests run without a DOM: a text node and an element are the few fields the translator reads
const textNode = data => ({nodeType: 3, data, parentNode: {nodeName: 'P'}});
const element = attrs => ({
  nodeType: 1,
  nodeName: 'BUTTON',
  getAttribute: a => attrs[a] ?? null,
  setAttribute: (a, v) => (attrs[a] = v),
});

test('createFrench translates text nodes and attributes, and keeps a name of the house untranslated', () => {
  const fr = createFrench({hass: fakeHass(houseWithNames(['Tap to run'])), isFrench: true});
  const t = textNode('Good evening'),
    name = textNode('Tap to run'),
    attrs = {'aria-label': 'Good evening', title: 'Tap to run'};
  fr.node(t);
  fr.node(name);
  fr.node(element(attrs));
  fr.tree(t); // a text node as a tree is the node itself
  expect(t.data).toBe('Bonsoir');
  expect(name.data).toBe('Tap to run');
  expect(attrs).toStrictEqual({'aria-label': 'Bonsoir', title: 'Tap to run'});
});

test('createFrench translates a node it met while the store was English once the store turns French', () => {
  const store = {hass: fakeHass(), isFrench: false};
  const fr = createFrench(store);
  const t = textNode('Good evening');
  fr.node(t);
  fr.tree(t);
  expect(t.data).toBe('Good evening');
  store.isFrench = true;
  fr.node(t);
  expect(t.data).toBe('Bonsoir');
});
