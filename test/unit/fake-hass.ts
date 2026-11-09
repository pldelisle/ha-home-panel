// The one fake `hass` every core test shares: the object shape the e2e harness builds, from a short literal or from a test house.
// Pattern: a fake at the hass seam (ADR 0005); `next` hands over a new hass the way Home Assistant does; `fromHouse` reads a
// house module (test/houses/) with the reader the harness uses, so a model test and a screenshot see the same house.
// Must not: grow behaviour beyond `calls`, `replies` and `next`, which only record and replay what Home Assistant does.
import type {HassEntity, PanelHass} from '../../src/core/hass.ts';
import {REFERENCE_MS} from '../houses/clock.mjs';
import {readHouse} from '../houses/read.mjs';

/** What `callWS` answers for one message type; a test overrides it, and may return a promise to hold the reply back. */
export type WsReply = (msg: {type: string} & Record<string, unknown>) => unknown;

export type FakeHass = PanelHass & {
  calls: {service: unknown[]; ws: unknown[]};
  /** The `callWS` router, keyed by message type; set an entry to change a reply, delete one to get `{}`. */
  replies: Map<string, WsReply>;
  next(patch: Record<string, Partial<HassEntity>>): FakeHass;
};

/** The reply Home Assistant gives each message the API client sends, in the wire's own shape. */
function defaultReplies(): Map<string, WsReply> {
  return new Map<string, WsReply>([
    ['recorder/statistics_during_period', () => ({})],
    ['history/history_during_period', () => ({})],
    ['frontend/get_system_data', () => ({value: null})],
    ['frontend/set_system_data', () => null],
    ['trace/list', () => []],
    ['trace/get', () => ({})],
    ['automation/config', () => ({config: {}})],
    ['lovelace/resources', () => []],
  ]);
}

/** A state object as Home Assistant hands it over; the dates are fixed so two builds are equal. */
export function entity(id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity {
  return {
    entity_id: id,
    state,
    attributes,
    last_changed: '2026-01-01T00:00:00+00:00',
    last_updated: '2026-01-01T00:00:00+00:00',
    context: {id: 'ctx', parent_id: null, user_id: null},
  };
}

/** A new hass the way Home Assistant makes one: new objects for the patched states, the same references for the rest. */
function build(base: PanelHass, calls: FakeHass['calls'], replies: FakeHass['replies']): FakeHass {
  return {
    ...base,
    calls,
    replies,
    next(patch) {
      const states = {...base.states};
      for (const [id, change] of Object.entries(patch)) {
        const prev = states[id] ?? entity(id, '');
        states[id] = {...prev, ...change, attributes: {...prev.attributes, ...change.attributes}};
      }
      return build({...base, states}, calls, replies);
    },
  };
}

export function fakeHass(init: Partial<PanelHass> = {}): FakeHass {
  const calls: FakeHass['calls'] = {service: [], ws: []};
  const replies = defaultReplies();
  return build(
    {
      states: {},
      config: {time_zone: 'America/Toronto', latitude: 43.65, longitude: -79.38, country: 'CA'},
      user: {name: 'Alex Example', is_admin: true},
      locale: {language: 'en'},
      callService: (domain, service, data) => {
        calls.service.push({domain, service, data});
        return Promise.resolve();
      },
      callWS: <T>(msg: {type: string} & Record<string, unknown>) => {
        calls.ws.push(msg);
        const reply = replies.get(msg.type);
        return Promise.resolve((reply ? reply(msg) : {}) as T);
      },
      ...init,
    },
    calls,
    replies,
  );
}

/** What a house module exports: plain data, with times as markers (test/houses/clock.mjs). */
export type HouseModule = {
  states: object;
  entities: object;
  devices: object;
  areas: object;
  automations: Array<{entity_id: string; config: {id: string; alias?: string; mode?: string}; noRun?: boolean}>;
};

export type FromHouseOptions = {
  /** the instant the house is read at (default: the reference instant of test/houses/clock.mjs) */
  now?: number;
  /** the areas, and the thermostats named after them, carry the French names (the harness's `french_areas=1`) */
  frenchAreas?: boolean;
  /** replaces the house's automations, as the e2e fixture's `automations` option does */
  automations?: HouseModule['automations'];
} & Partial<PanelHass>;

/**
 * The fake `hass` of a house module: its states, registries and zone, and the registry and recorder replies the harness
 * gives (traces, automation configs, statistics, history, Lovelace resources), read at `now` with wall-clock times in
 * the house's own time zone, so the result does not depend on the machine running the test.
 */
function fromHouse(house: HouseModule, opts: FromHouseOptions = {}): FakeHass {
  const {now = REFERENCE_MS, frenchAreas, automations, ...init} = opts;
  const base = fakeHass();
  const config = {...base.config, ...init.config};
  const read = readHouse(house, {now, timeZone: config.time_zone, frenchAreas, automations});
  const hass = fakeHass({
    states: Object.fromEntries(
      Object.entries(read.states as Record<string, Omit<HassEntity, 'context'>>).map(([id, s]) => [
        id,
        {...s, context: {id: 'ctx', parent_id: null, user_id: null}},
      ]),
    ),
    entities: read.entities as PanelHass['entities'],
    devices: read.devices as PanelHass['devices'],
    areas: read.areas as PanelHass['areas'],
    services: {adaptive_lighting: {}},
    connection: {subscribeMessage: () => Promise.resolve(() => Promise.resolve())},
    ...init,
    config,
  });
  // the replies belong to the house; a test may still override one through `replies`
  for (const type of read.types) hass.replies.set(type, msg => read.ws(msg));
  return hass;
}

fakeHass.fromHouse = fromHouse;
