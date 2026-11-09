// The one fake `hass` every core test shares: the object shape the e2e harness builds, from a short literal, from a test house
// or from a recorded fixture.
// Pattern: a fake at the hass seam (ADR 0005); `next` hands over a new hass the way Home Assistant does; `fromHouse` reads a
// house module (test/houses/) with the reader the harness uses, so a model test and a screenshot see the same house;
// `fromFixture` reads a recorded, anonymised house (test/unit/fixtures/houses/) into the same shape.
// Must not: grow behaviour beyond `calls`, `replies` and `next`, which only record and replay what Home Assistant does.
import {readFileSync} from 'node:fs';
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
  config: PanelHass['config'];
  user: NonNullable<PanelHass['user']>;
  services: NonNullable<PanelHass['services']>;
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
  const config = {...house.config, ...init.config};
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
    user: house.user,
    services: house.services,
    connection: {subscribeMessage: () => Promise.resolve(() => Promise.resolve())},
    ...init,
    config,
  });
  // the replies belong to the house; a test may still override one through `replies`
  for (const type of read.types) hass.replies.set(type, msg => read.ws(msg));
  return hass;
}

fakeHass.fromHouse = fromHouse;

/** What the recorder writes (scripts/record-fixture.mjs): the states and the three registries, keyed as `hass` keys them. */
export type HouseFixture = {
  /** the instant of the recording; a model test passes its own `now`, a fixture works at any instant */
  recordedAt: string;
  source: string;
  states: Record<string, Omit<HassEntity, 'context'> & Partial<Pick<HassEntity, 'context'>>>;
  entities: NonNullable<PanelHass['entities']>;
  devices: NonNullable<PanelHass['devices']>;
  areas: NonNullable<PanelHass['areas']>;
  /** raw `recorder/statistics_during_period` replies, keyed `<period>@<start>` */
  statistics?: Record<string, Record<string, unknown[]>>;
};

const FIXTURES = new URL('./fixtures/houses/', import.meta.url);

/** The recorded fixture `<name>.json` of test/unit/fixtures/houses/, as written. */
export function readFixture(name: string): HouseFixture {
  return JSON.parse(readFileSync(new URL(`${name}.json`, FIXTURES), 'utf8')) as HouseFixture;
}

/**
 * The reply to a statistics message from the recorded replies: those of the message's period (the widest span when the
 * fixture holds more than one), limited to the ids asked for. The span is not checked: the rows are those recorded at
 * `recordedAt`, whatever `start_time` the model computed from its own `now`.
 */
function recordedStatistics(recorded: NonNullable<HouseFixture['statistics']>, msg: Record<string, unknown>) {
  const key = Object.keys(recorded)
    .filter(k => k.startsWith(`${String(msg.period)}@`))
    .sort()[0];
  const ids = new Set(Array.isArray(msg.statistic_ids) ? (msg.statistic_ids as string[]) : []);
  return Object.fromEntries(Object.entries(recorded[key] ?? {}).filter(([id]) => ids.has(id)));
}

/**
 * The fake `hass` of a recorded fixture: its states and registries, and its statistics for `recorder/statistics_during_period`.
 * The shape is the one `fromHouse` builds; what a fixture does not hold (the zone, the user, the services) is the default of
 * `fakeHass` (the zone is America/Toronto, whatever zone the house was recorded in), and `init` overrides any of it.
 */
function fromFixture(name: string, init: Partial<PanelHass> = {}): FakeHass {
  const fixture = readFixture(name);
  const hass = fakeHass({
    states: Object.fromEntries(
      Object.entries(fixture.states).map(([id, s]) => [
        id,
        {...s, context: {id: 'ctx', parent_id: null, user_id: null}},
      ]),
    ),
    entities: fixture.entities,
    devices: fixture.devices,
    areas: fixture.areas,
    connection: {subscribeMessage: () => Promise.resolve(() => Promise.resolve())},
    ...init,
  });
  const {statistics} = fixture;
  if (statistics) hass.replies.set('recorder/statistics_during_period', msg => recordedStatistics(statistics, msg));
  return hass;
}

fakeHass.fromFixture = fromFixture;
