// askSuggestions: up to three questions from the house's own catalog, each with the plan it stands for, in the panel's language with the house's display names. Built from the
// full and the bare test houses, then from a catalog of temperatures alone, and in French, where a name needs no article or elision because the name leads the line.
import {describe, expect, test} from 'vitest';
import {askCatalog, type Catalog, type CatalogEntry} from '../../../../src/features/ask/catalog.ts';
import {askSuggestions} from '../../../../src/features/ask/suggestions.ts';
import {registriesOf} from '../../../../src/core/registry.ts';
import {doorMotionSensors} from '../../../../src/providers/door-motion.ts';
import {personEntities} from '../../../../src/providers/people.ts';
import {powerNow} from '../../../../src/providers/power.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import * as bare from '../../../houses/bare.mjs';
import {fakeHass, type FakeHass} from '../../fake-hass.ts';
import {fullHouse, storeOf} from '../media/support.ts';

const catalogOf = (hass: FakeHass, language: 'en' | 'fr', panelConfig: unknown = {}) => {
  const store = storeOf({...hass, locale: {language}}, panelConfig);
  const registries = registriesOf(hass);
  const catalog = askCatalog(
    {
      power: powerNow(hass.states, store.config),
      states: hass.states,
      registries,
      sensors: doorMotionSensors(hass.states, registries, store.names),
      people: personEntities(hass.states, store.config.people),
    },
    {names: store.names, t: store.t, language},
    store.config,
  );
  return {catalog, t: store.t};
};

/** A catalog of literal entries, for the houses a test house cannot be. */
const catalogOfEntries = (entries: CatalogEntry[]): Catalog => ({entries, entityOf: new Map(), omitted: 0});
const room = (key: string, name: string): CatalogEntry => ({key, name, kind: 'measure', unit: '°'});

describe('the full test house', () => {
  test('suggests the first door, the first room temperature and the first meter, in catalog order, each with the plan it stands for', () => {
    const {catalog, t} = catalogOf(fullHouse, 'en', FULL_CFG);
    expect(askSuggestions(catalog, t)).toEqual([
      {
        text: 'Front door: opened this week?',
        plan: {form: 'moments', sensor: 'door.living_room', period: 'this_week', test: {on: true}, longerThanMin: null},
      },
      {
        text: 'Bedroom: how warm was it yesterday?',
        plan: {form: 'series', sensor: 'temp.bedroom', period: 'yesterday'},
      },
      {
        text: 'Car charging energy: how much last week?',
        plan: {form: 'total', sensor: 'energy.car', period: 'last_week'},
      },
    ]);
  });

  test('is worded in French, with the names the house shows in French and no article to agree', () => {
    const {catalog, t} = catalogOf(fullHouse, 'fr', FULL_CFG);
    expect(askSuggestions(catalog, t).map(({text}) => text)).toEqual([
      'Front door : quelles ouvertures cette semaine ?',
      'Chambre : quelle température hier ?',
      'Énergie de recharge de la voiture : combien consommé la semaine dernière ?',
    ]);
  });

  test('a motion sensor and a person are not a door', () => {
    const {catalog, t} = catalogOf(fullHouse, 'en', FULL_CFG);
    const doorless = {...catalog, entries: catalog.entries.filter(entry => !entry.key.startsWith('door.'))};
    expect(askSuggestions(doorless, t).map(({plan}) => plan.sensor)).toEqual(['temp.bedroom', 'energy.car']);
  });

  test('every plan names a sensor of the catalog, so it is one the loader can run', () => {
    const {catalog, t} = catalogOf(fullHouse, 'en', FULL_CFG);
    for (const {plan} of askSuggestions(catalog, t))
      expect(catalog.entries.map(entry => entry.key)).toContain(plan.sensor);
  });
});

describe('the same catalog', () => {
  test('is built once for a `t`, and again for another', () => {
    const {catalog, t} = catalogOf(fullHouse, 'en', FULL_CFG);
    const first = askSuggestions(catalog, t);
    expect(askSuggestions(catalog, t)).toBe(first);
    const french = catalogOf(fullHouse, 'fr', FULL_CFG).t;
    expect(askSuggestions(catalog, french)).not.toBe(first);
  });
});

describe('the bare test house', () => {
  test('has nothing to suggest, so the sheet is the bare field', () => {
    const {catalog, t} = catalogOf(fakeHass.fromHouse(bare), 'en');
    expect(askSuggestions(catalog, t)).toEqual([]);
  });
});

describe('a house with only temperatures', () => {
  test('suggests the first room alone, and the first of two is the one in catalog order', () => {
    const {t} = catalogOf(fullHouse, 'en', FULL_CFG);
    const only = catalogOfEntries([room('temp.den', 'Den'), room('temp.attic', 'Attic')]);
    expect(askSuggestions(only, t)).toEqual([
      {text: 'Den: how warm was it yesterday?', plan: {form: 'series', sensor: 'temp.den', period: 'yesterday'}},
    ]);
  });

  test('a power reading is a measure but not a room temperature', () => {
    const {t} = catalogOf(fullHouse, 'en', FULL_CFG);
    const grid: CatalogEntry = {key: 'power.grid', name: 'Grid', kind: 'measure', unit: 'W'};
    expect(askSuggestions(catalogOfEntries([grid]), t)).toEqual([]);
  });
});
