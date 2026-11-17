// French: the translator turns the panel's English into Québec French, numbers and dates included, and leaves people's own names alone
import {describe, test, expect} from 'vitest';
import {fakeHass, entity} from './fake-hass.ts';
import {createFrench, FR_MAP} from '../../src/i18n/fr.js';
import {createMessages} from '../../src/core/i18n/messages.ts';
import {createStore} from '../../src/core/store.ts';

// The translator looks up the house's own names through its store's hass and caches them for a minute. Each test builds
// its own layer from a fake store with a tiny fake hass whose names must stay untranslated, so one test's cache never
// reaches the next and no module has to be loaded afresh.
// display names that change nothing: the layer's own tests are about the names Home Assistant gave
const plain = {name: key => key};
const houseWithNames = names => ({
  areas: {a: {area_id: 'a', name: 'Home'}},
  states: Object.fromEntries(names.map((n, i) => [`light.l${i}`, entity(`light.l${i}`, 'on', {friendly_name: n})])),
});
const frTextFor = names => createFrench({hass: fakeHass(houseWithNames(names)), isFrench: true, names: plain}).text;

test('words, numbers and dates', () => {
  const frText = frTextFor([]);
  expect(frText('Doors closed')).toBe('Portes fermées');
  expect(frText('4.2° outside')).toBe('4,2° dehors');
  expect(frText('12.5')).toBe('12,5');
  expect(frText('Some text nobody translated')).toBe('Some text nobody translated');
});

// The charts-failed toast moved from the rewrite map to the catalogs: the former map text, written out, is what t() says
// in French, the English is the constant it replaced, and the layer leaves the already-French toast as it is.
test('the charts-failed toast reads the same in both languages as it did from the map', () => {
  const fr = createMessages({language: 'fr', tag: 'fr-CA'}).t('charts.failed');
  expect(fr).toBe("La bibliothèque de graphiques n'a pas chargé");
  expect(createMessages({language: 'en', tag: 'en-CA'}).t('charts.failed')).toBe('Charts library failed to load');
  expect(FR_MAP).not.toHaveProperty('Charts library failed to load');
  expect(frTextFor([])(fr)).toBe(fr);
});

test('a name the house gave in HA is never translated', () => {
  const frText = frTextFor(['Doors closed']);
  expect(frText('Doors closed')).toBe('Doors closed');
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

// The More sheet joins its Security fragments with " · " ("1 door open · motion now"). The expected French is written out in
// full, never built by the code under test. The Security move's other fragments are the `was` rows of
// test/unit/fixtures/moved/security.json, checked by moved-strings.test.ts.
test('the More sheet line for Security is French in every part and has no stray colon', () => {
  const frText = frTextFor([]);
  expect(frText('1 door open · motion now')).toBe('1 porte ouverte · mouvement en cours');
  // without a motion part the line ends in "open", and the sensor-row pattern must not take the whole line
  expect(frText('2 doors open')).toBe('2 portes ouvertes');
  expect(frText('Doors closed · motion now')).toBe('Portes fermées · mouvement en cours');
  expect(frText('motion now')).toBe('mouvement en cours');
});

// Strings drawn on French screens that had no entry (#91). Names people gave in Home Assistant are not part of this. The sensor
// battery note, the empty Cameras card and a camera tile date went to the Security move's `was` rows (#227).
test('the Home kWh fragments are French', () => {
  const frText = frTextFor([]);
  expect(frText('Now · 0.0 kWh today · rate unknown')).toBe("Maintenant · 0,0 kWh aujourd'hui · tarif inconnu");
  expect(frText('Idle · 34.5 kWh today')).toBe("Au repos · 34,5 kWh aujourd'hui");
});

// What the legacy panel still says of energy after the Energy move's deletion (#241), written out in full: the Home energy tile's line
// for each tier it names, the water tile, the Climate rooms' draw and the stack's and the live pill's words. The entries these use stay in the map.
test('the energy words the legacy panel still draws are French', () => {
  const frText = frTextFor([]);
  expect(frText('Now · 12.3 kWh today · low rate')).toBe("Maintenant · 12,3 kWh aujourd'hui · tarif bas");
  expect(frText('Now · 12.3 kWh today · medium rate')).toBe("Maintenant · 12,3 kWh aujourd'hui · tarif moyen");
  expect(frText('Now · low rate')).toBe('Maintenant · tarif bas');
  expect(frText('Heating · 3.2 kWh today')).toBe("Chauffe · 3,2 kWh aujourd'hui");
  expect(frText('Water heater')).toBe('Chauffe-eau');
  expect(frText('Heating · 1.2 kW')).toBe('Chauffe · 1,2 kW');
  expect(frText('Heating, 7 days')).toBe('Chauffage, 7 jours');
  expect(frText('Challenge: pre_heat')).toBe('Défi\u00a0: préchauffage');
  expect(frText('at 7¢/kWh')).toBe('à 7 ¢/kWh');
});

// What the legacy panel still says of climate after the Climate move's deletion (#248), written out in full: the Home tile's line, the header's inside and
// outside temperatures, the Status checks' thermostat and heat pump lines and the Lights tile's "All off". The entries these use stay in the map; the Home move (#268) deletes them.
test('the climate words the legacy panel still draws are French', () => {
  const frText = frTextFor([]);
  expect(frText('Climate')).toBe('Climat');
  // the legacy Home tile's line as it was on 52ae68d: "Inside" is left in English (the map has only the lower-case `inside ·`), which the Home tile's move (#268) words in French
  expect(frText('Inside · 2 rooms heating · heat pump offline')).toBe(
    'Inside · 2 pièces chauffent · thermopompe hors ligne',
  );
  expect(frText('Inside · 1 room heating · heat pump offline')).toBe(
    'Inside · 1 pièce chauffe · thermopompe hors ligne',
  );
  expect(frText('20.8° inside · 3.1° outside')).toBe('20,8° à l’intérieur · 3,1° dehors');
  // "Heat pump offline" and "1 thermostat not reporting" were the Status checks' words, which the catalog says since #256; #257 deleted
  // their entries (test/unit/fixtures/moved/live.json records what the layer made of them)
  expect(frText('All off')).toBe('Tout éteindre');
});

// The Home tile's Air line ("1 purifier · Office: CO₂ 1,500, VOC 400") and the stack's air card are still the legacy panel's own
// English, so the layer keeps the entry that says COV, as it did before the Air move's deletion (#234).
test('the Home tile line for a room with poor CO₂ and VOC reads COV, and the stack card keeps its words', () => {
  const frText = frTextFor([]);
  expect(frText('1 purifier · Office: CO₂ 1,500, VOC 400')).toBe('1 purifier · Office\u00a0: CO₂ 1\u202f500, COV 400');
  expect(frText('VOC is high')).toBe('VOC élevé');
  expect(frText('Office air')).toBe('Air\u00a0: Office');
});

// A sensor row ("Front door open", "Garage door offline": `${name} open`, `${name} offline` in the attention list and the
// stack) keeps the form it had, colon included; the Security line must never reach it. FR_DOOR's motion forms and
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

// The scene sub-lines (#79) are now the `was` rows of test/unit/fixtures/moved/media.json, checked by moved-strings.test.ts.
// #79: the idle stack's "Now playing" card was cut with an ellipsis in French; shorter words fit. Expected texts are written out, never built.
test('the idle stack card says "En lecture" and nothing else changed with it', () => {
  const frText = frTextFor([]);
  expect(frText('Now playing')).toBe('En lecture');
  expect(frText('Tap for the player')).toBe('Toucher pour le lecteur');
});

// createFrench(store): the per-panel translator, fed by a store (a fake store is enough). Two panels on one page have
// two layers, and each reads the house's names from its own store: a name one house gave is still translated for the
// other. The translations themselves are covered above, where every layer is built the same way.
test('two createFrench layers over two stores each leave only the names their own house gave', () => {
  const evening = createFrench({hass: fakeHass(houseWithNames(['Doors closed'])), isFrench: true, names: plain});
  const morning = createFrench({hass: fakeHass(houseWithNames(['Rooms'])), isFrench: true, names: plain});
  expect(evening.text('Doors closed')).toBe('Doors closed');
  expect(evening.text('Rooms')).toBe('Pièces');
  expect(morning.text('Rooms')).toBe('Rooms');
  expect(morning.text('Doors closed')).toBe('Portes fermées');
});

test('createFrench does nothing while the store is not French', () => {
  const store = {hass: fakeHass(), isFrench: false, names: plain};
  const fr = createFrench(store);
  expect(fr.text('Doors closed')).toBe('Doors closed');
  const opts = {chart: {}};
  expect(fr.apex(opts)).toBe(opts);
  expect(opts.chart).toStrictEqual({});
  store.isFrench = true;
  expect(fr.text('Doors closed')).toBe('Portes fermées');
  expect(fr.apex({chart: {}}).chart.defaultLocale).toBe('fr');
});

// the unit tests run without a DOM: a text node and an element are the few fields the translator reads
const textNode = data => ({nodeType: 3, data, parentNode: {nodeName: 'P'}});
const element = (attrs, {noTranslate = false} = {}) => ({
  nodeType: 1,
  nodeName: 'BUTTON',
  getAttribute: a => attrs[a] ?? null,
  setAttribute: (a, v) => (attrs[a] = v),
  // the element itself, or an ancestor, marked translate="no"
  closest: sel => (noTranslate && sel === '[translate="no"]' ? {} : null),
});

test('createFrench translates text nodes and attributes, and keeps a name of the house untranslated', () => {
  const fr = createFrench({hass: fakeHass(houseWithNames(['Tap to run'])), isFrench: true, names: plain});
  const t = textNode('Doors closed'),
    name = textNode('Tap to run'),
    attrs = {'aria-label': 'Doors closed', title: 'Tap to run'};
  fr.node(t);
  fr.node(name);
  fr.node(element(attrs));
  fr.tree(t); // a text node as a tree is the node itself
  expect(t.data).toBe('Portes fermées');
  expect(name.data).toBe('Tap to run');
  expect(attrs).toStrictEqual({'aria-label': 'Portes fermées', title: 'Tap to run'});
});

// the config card is drawn in the user's language already and marked translate="no": the layer leaves its text alone, and
// would leave an aria-label or title on it alone too, so a label added to it one day cannot be translated twice
test('createFrench leaves the labels of an element under translate="no" as they are', () => {
  const fr = createFrench({hass: fakeHass(), isFrench: true, names: plain});
  const attrs = {'aria-label': 'Doors closed', title: 'Doors closed'};
  fr.node(element(attrs, {noTranslate: true}));
  expect(attrs).toStrictEqual({'aria-label': 'Doors closed', title: 'Doors closed'});
});

test('createFrench translates a node it met while the store was English once the store turns French', () => {
  const store = {hass: fakeHass(), isFrench: false, names: plain};
  const fr = createFrench(store);
  const t = textNode('Doors closed');
  fr.node(t);
  fr.tree(t);
  expect(t.data).toBe('Doors closed');
  store.isFrench = true;
  fr.node(t);
  expect(t.data).toBe('Portes fermées');
});

// The layer's skip list holds the name Home Assistant gave and the name the panel shows for it (the store's display
// names), so a resolved name is never run through the map, in either language. Real stores, so the resolver is the real one.
describe('the layer leaves a display name alone', () => {
  const house = {
    areas: {living: {area_id: 'living', name: 'Living room'}, salon: {area_id: 'salon', name: 'Salon'}},
    devices: {d1: {id: 'd1', name: 'Hub', name_by_user: 'Rooms'}},
    states: {'light.l1': entity('light.l1', 'on', {friendly_name: 'Doors closed'})},
  };
  const layerIn = (language, names = {}) => {
    const store = createStore({defaultTimeZone: 'UTC', resolve: raw => raw});
    store.setPanelConfig({names});
    store.setHass(fakeHass({...house, locale: {language}}));
    return {store, text: createFrench(store).text};
  };

  test('in French, the name Home Assistant gave and the name the config gives are both left as they are', () => {
    const {text} = layerIn('fr', {'Doors closed': {fr: 'Status'}, d1: {fr: 'Phone'}});
    expect(text('Doors closed')).toBe('Doors closed');
    expect(text('Status')).toBe('Status');
    expect(text('Rooms')).toBe('Rooms');
    expect(text('Phone')).toBe('Phone');
    expect(text('Status checks')).toBe('Vérifications');
  });

  test('in French, the dictionary reading of an English name and the English name are both left as they are', () => {
    const {store, text} = layerIn('fr');
    expect(store.names.name('living')).toBe('Salon');
    expect(text('Salon')).toBe('Salon');
    expect(text('Living room')).toBe('Living room');
  });

  test('in English, nothing is translated, and the dictionary reading of a French name is the name', () => {
    const {store, text} = layerIn('en');
    expect(store.names.name('salon')).toBe('Living room');
    expect(text('Salon')).toBe('Salon');
    expect(text('Doors closed')).toBe('Doors closed');
  });

  test('a name set for a device that has only its own name, or for a thermostat room, is left as it is', () => {
    const store = createStore({defaultTimeZone: 'UTC', resolve: raw => raw});
    store.setPanelConfig({names: {d2: {fr: 'Status'}, Den: {fr: 'Phone'}}});
    store.setHass(
      fakeHass({
        locale: {language: 'fr'},
        devices: {d2: {id: 'd2', name: 'Hub', name_by_user: null}},
        states: {'climate.den': entity('climate.den', 'heat', {friendly_name: 'Thermostat Den'})},
      }),
    );
    const {text} = createFrench(store);
    expect(text('Status')).toBe('Status');
    expect(text('Phone')).toBe('Phone');
    // a name nobody changed is still the layer's to translate
    expect(text('Doors closed')).toBe('Portes fermées');
  });

  test('a name the config no longer gives is translated again, the list following the store', () => {
    const {store, text} = layerIn('fr', {'Doors closed': {fr: 'Status'}});
    expect(text('Status')).toBe('Status');
    store.setPanelConfig({});
    expect(text('Status')).toBe('État');
  });
});
