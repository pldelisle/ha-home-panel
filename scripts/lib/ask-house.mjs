// The full test house as the Ask feature sees it: its catalog in a language and the formatters of its zone, built the way the panel builds them.
// Pattern: an Object Mother's reader (Fowler, ObjectMother): the house is data in test/houses/, this wraps the panel's own store and
// providers around it, so the recorded-model suite asks a model about the catalog the panel would send, and never about a live house.
// Must not: read a real house, the environment or the network, or read the clock (the instant the suite asks at is a constant).
import {resolveConfig} from '../../src/core/config.ts';
import {registriesOf} from '../../src/core/registry.ts';
import {createStore} from '../../src/core/store.ts';
import {askCatalog} from '../../src/features/ask/catalog.ts';
import {doorMotionSensors} from '../../src/providers/door-motion.ts';
import {personEntities} from '../../src/providers/people.ts';
import {powerNow} from '../../src/providers/power.ts';
import {FULL_CFG} from '../../test/e2e/houses.ts';
import * as full from '../../test/houses/full.mjs';
import {fakeHass} from '../../test/unit/fake-hass.ts';

/** The instant every question is asked at (a Saturday afternoon in the house's zone), so a re-run tells the model the same date. */
export const ASK_NOW = '2026-11-21T20:00:00.000Z';

/** The full house's config with the two energy totals named, which no other test config does: the catalog then offers all four meters. */
const CONFIG = {
  ...FULL_CFG,
  entities: {...FULL_CFG.entities, energy_total: 'sensor.house_energy', water_heater_energy: 'sensor.heater_energy'},
};

/** @type {Map<string, ReturnType<typeof buildHouse>>} */
const built = new Map();

/**
 * `{catalog, fmt}` of the full test house, its sensors named in `language` (`en` or `fr`); built once, as the house is data that does not change.
 * @param {string} language
 */
export function askHouse(language) {
  if (!built.has(language)) built.set(language, buildHouse(language));
  return /** @type {ReturnType<typeof buildHouse>} */ (built.get(language));
}

/**
 * The catalog of the full test house in `language`: what the instructions list and what a reply is parsed against.
 * @param {string} language
 */
export const catalogOf = language => askHouse(language).catalog;

/** @param {string} language */
function buildHouse(language) {
  const hass = {...fakeHass.fromHouse(full), locale: {language}};
  const store = createStore({defaultTimeZone: 'America/Toronto', resolve: resolveConfig});
  store.setHass(hass);
  store.setPanelConfig(CONFIG);
  const registries = registriesOf(hass);
  const reads = {
    power: powerNow(hass.states, store.config),
    states: hass.states,
    registries,
    sensors: doorMotionSensors(hass.states, registries, store.names),
    people: personEntities(hass.states, store.config.people),
  };
  return {catalog: askCatalog(reads, {names: store.names, t: store.t, language}, store.config), fmt: store.fmt};
}
