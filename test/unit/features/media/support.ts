// What the Media tests share: a store over a house, which gives the name resolver and the catalog the way the panel does, the
// recorded house when it exists, and a house made of literal players for the rules the test house does not exercise.
// Pattern: a test helper at the hass seam (ADR 0005); the store is the real one, so a name is resolved as on the tablet.
// Must not: hold an expectation, or reach into a rule.
import {existsSync} from 'node:fs';
import {resolveConfig} from '../../../../src/core/config.ts';
import type {DeviceRegistryEntry, EntityRegistryEntry, Registries} from '../../../../src/core/hass.ts';
import {createStore, type PanelStore} from '../../../../src/core/store.ts';
import * as full from '../../../houses/full.mjs';
import {entity, fakeHass, type FakeHass} from '../../fake-hass.ts';

export const fullHouse = fakeHass.fromHouse(full);
export const fullHouseInFrench = fakeHass.fromHouse(full, {locale: {language: 'fr'}});

/** The owner's recorded house exists only on the owner's machine (#170); a test of it is skipped with a message otherwise. */
export const recorded = existsSync(new URL('../../fixtures/houses/main.json', import.meta.url));

/** The store a hass is handed to, as the shell does. */
export function storeOf(hass: FakeHass, config: unknown = {}): PanelStore {
  const store = createStore({defaultTimeZone: 'America/Toronto', resolve: resolveConfig});
  store.setHass(hass);
  store.setPanelConfig(config);
  return store;
}

/** What a rule is given besides the states: the registries, the names and the catalog of a store over this hass. */
export function readingOf(hass: FakeHass) {
  const store = storeOf(hass);
  const registries: Registries = {entities: hass.entities, devices: hass.devices, areas: hass.areas};
  return {states: hass.states, registries, deps: {names: store.names, t: store.t}, store};
}

/** One player, with the registry rows that place it: `[id, state, attributes, entity row, device row]`. */
export type Player = [
  id: string,
  state: string,
  attributes?: Record<string, unknown>,
  row?: Partial<EntityRegistryEntry>,
  device?: Partial<DeviceRegistryEntry>,
];

type State = ReturnType<typeof entity>;

/** A house of literal players, in the order given, with other states beside them and `areas` as `{id: name}`. */
export function houseOf(players: Player[], others: State[] = [], areas: Record<string, string> = {}): FakeHass {
  const entities: Record<string, EntityRegistryEntry> = {};
  const devices: Record<string, DeviceRegistryEntry> = {};
  const states: Record<string, State> = {};
  for (const [id, state, attributes = {}, row, device] of players) {
    states[id] = entity(id, state, attributes);
    entities[id] = {entity_id: id, ...row};
    if (device) devices[device.id as string] = device as DeviceRegistryEntry;
  }
  for (const other of others) states[other.entity_id] = other;
  return fakeHass({
    states,
    entities,
    devices,
    areas: Object.fromEntries(Object.entries(areas).map(([area_id, name]) => [area_id, {area_id, name}])),
  });
}
