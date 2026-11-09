// The panel's configuration: one schema that types it and parses it, a checker that lists what is wrong with it, and
// the resolver that turns what is understood, plus what the house's entities say, into the settings the panel runs with.
// Pattern: parse, don't validate (King, 2019), so `PanelConfig` is inferred from the struct and cannot disagree with the
// parser; tolerant reader (Fowler): a bad leaf, element or key is dropped and reported, never thrown; superstruct, as Home
// Assistant's frontend validates card configs. Must not: throw, coerce a type, check that a configured entity exists, read
// the clock, or touch the DOM or `hass` (it reads the house's `states` it is handed, to find what the config leaves out).
import {
  array,
  boolean,
  define,
  enums,
  nullable,
  number,
  object,
  optional,
  pattern,
  record,
  string,
  Struct,
  unknown,
  validate,
  type Failure,
  type Infer,
} from 'superstruct';
import {DEFAULT_ENTITIES, EC_SUFFIX, ENTITY_ALIAS, ENTITY_KEYS, type EntityKey, type EntityMap} from './entities.ts';
import type {MessageKey} from './i18n/en.ts';
import {editDistance} from './levenshtein.ts';
import {guessIcon, ROOM_ICONS, type RoomIcon} from './room-icons.ts';

// the tables the schema and the resolver read live beside this module; the core's config surface stays one import
export {DEFAULT_ENTITIES, ENTITY_ALIAS, type EntityKey, type EntityMap} from './entities.ts';
export {guessIcon, ROOM_ICONS, type RoomIcon} from './room-icons.ts';

// ---------- the schema: examples/configuration.yaml, in full ----------

const isObject = (v: unknown): v is Record<string | number, unknown> => typeof v === 'object' && v !== null;
const isRecord = (v: unknown): v is Record<string, unknown> => isObject(v) && !Array.isArray(v);

// `any` is how superstruct itself types "a struct of anything"; Struct<T> is invariant in T, so no narrower type holds them
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyStruct = Struct<any, any>;
type Picker = (value: unknown) => AnyStruct;

/**
 * One of two structs, chosen by what the value is. superstruct's `union` tries every struct and reports all of their
 * failures, which says nothing about the one the person meant; here a failure belongs to the shape the value had.
 */
function either<A, B>(isFirst: (value: unknown) => boolean, first: Struct<A, unknown>, second: Struct<B, unknown>) {
  const pick: Picker = value => (isFirst(value) ? first : second);
  return new Struct<A | B, Picker>({
    type: 'either',
    schema: pick,
    // the failures of the struct that was picked, with the place of this value put in front of their own path
    validator: (value, ctx) => {
      const [error] = pick(value).validate(value);
      return (error?.failures() ?? []).map(failure => ({
        ...failure,
        path: [...(ctx.path as Place), ...(failure.path as Place)],
        branch: [...(ctx.branch as unknown[]), ...(failure.branch as unknown[]).slice(1)],
      }));
    },
  });
}

/** What is not a block of settings fails with this one name, the same wherever a block is expected. */
const notABlock = define<never>('object', () => false);

/** A block of settings: a plain object (a list is not one) with the keys of the schema and no other. */
const block = <S extends Parameters<typeof object>[0]>(schema: S) => either(isRecord, object(schema), notABlock);

/** Any keys, each with the same kind of value (an entity map, the names). */
const dictionary = <T>(value: Struct<T, unknown>) => either(isRecord, record(string(), value), notABlock);

/** One value or a list of them: the scalar-or-list keys of the config share this. */
const oneOrList = <T>(value: Struct<T, unknown>) => either(Array.isArray, array(value), value);

/** Two cards: exactly two texts. */
const pair = define<[string, string]>(
  'pair',
  value => Array.isArray(value) && value.length === 2 && value.every(v => typeof v === 'string'),
);

// a room: its thermostat's entity id, or a block that also names the room and its sensors
const room = either(
  isRecord,
  block({
    climate: string(),
    name: optional(string()),
    icon: optional(enums(ROOM_ICONS)),
    key: optional(string()),
    temperature: optional(string()),
    target: optional(string()),
    power: optional(string()),
  }),
  string(),
);

// two cards (an area id or a light entity each) that move together, with an optional input_boolean to link and unlink them
const lightLink = either(isRecord, block({lights: pair, switch: optional(string())}), pair);

// `at` is a time of day, 8:00 or 20:00: the resolver has always read both, and read it trimmed
const reminder = block({
  at: pattern(string(), /^\s*\d{1,2}:\d{2}\s*$/),
  title: optional(string()),
  text: optional(string()),
  lead: optional(number()),
});

/** The `config:` block under `panel_custom:`, as a person writes it; every key is optional. */
export const panelConfig = block({
  people: optional(oneOrList(string())),
  house_image: optional(either(isRecord, block({day: optional(string()), night: optional(string())}), string())),
  car: optional(block({name: optional(string()), color: optional(string()), battery_kwh: optional(number())})),
  // the snake_case names (ENTITY_ALIAS) or the camelCase keys (DEFAULT_ENTITIES) to an entity id; empty or null clears
  // the default. Which keys are valid is checked beside the schema, against those two lists
  entities: optional(dictionary(nullable(string()))),
  rooms: optional(oneOrList(room)),
  scenes: optional(oneOrList(string())),
  modes: optional(oneOrList(string())),
  adaptive_lighting_areas: optional(dictionary(string())),
  split_light_areas: optional(oneOrList(string())),
  light_links: optional(oneOrList(lightLink)),
  idle_stack: optional(
    block({
      enabled: optional(boolean()),
      sunrise_lights_off: optional(boolean()),
      reminders: optional(oneOrList(reminder)),
    }),
  ),
  // a name per language, for the name Home Assistant gives (the exact name), an entity id, an area id or a device id
  names: optional(dictionary(dictionary(string()))),
  // Home Assistant adds this to every custom panel's config; it is not ours to check
  _panel_custom: optional(dictionary(unknown())),
});

export type PanelConfig = Infer<typeof panelConfig>;

// ---------- output: what resolveConfig() returns ----------

export interface RoomSpec {
  /** The room's key: the config's `key`, else the thermostat's name without climate. and thermostat_. */
  k: string;
  /** The config's `name`; null when the card takes the thermostat's own name. */
  n: string | null;
  /** The config's icon when it is in ROOM_ICONS, else guessIcon() of the room's name. */
  icon: RoomIcon;
  climate: string;
  temp: string;
  target: string;
  power: string;
}
export interface LightLink {
  /** Two entries (a pair is the only shape that gets here); the type cannot say so. */
  keys: string[];
  /** The input_boolean that links and unlinks the pair; null = always linked. */
  sw: string | null;
}
export interface Reminder {
  at: string;
  title: string;
  text: string;
  lead: number;
}
export interface ResolvedConfig {
  entities: EntityMap;
  rooms: RoomSpec[];
  people: string[];
  scenes: string[];
  modes: string[];
  lightLinks: LightLink[];
  splitLightAreas: string[];
  alAreas: Record<string, string>;
  /** null when there is no house picture. Both are set when it is not null (one falls back to the other). */
  house: {day: string | null; night: string | null} | null;
  car: {name: string | null; color: string | null; battery_kwh: number | null};
  /** The `names:` block as written, or an empty record; the store's name resolver reads it. */
  names: Record<string, Record<string, string>>;
  stack: {on: boolean; sunriseOff: boolean; reminders: Reminder[]};
}
/** What resolveConfig reads of hass.states: each entity's attributes (the friendly name). */
export type ConfigStates = Record<string, {attributes: Record<string, unknown>}>;

// ---------- the checker: what is wrong, as values ----------

/** One thing the panel could not use: where it is, which catalog message says it, and that message's values. */
export interface ConfigProblem {
  /** The place in the YAML: `rooms[1].icon`, `entities.grid_powr`, `idle_stack.reminders[0].at`. */
  path: string;
  key: MessageKey;
  values: Record<string, string | number>;
}
/** Where a value sits in the config, as superstruct reports it: the keys and list indices down to it. */
type Place = readonly (string | number)[];
/** A problem and the place resolveConfig drops to get rid of it. */
interface ProblemAt {
  at: Place;
  problem: ConfigProblem;
}

/** A place as the card shows it: `rooms[1].icon`. */
const pathOf = (at: Place): string =>
  at.reduce<string>((s, k) => (typeof k === 'number' ? `${s}[${k}]` : s ? `${s}.${k}` : k), '');
const problemAt = (at: Place, key: MessageKey, values: Record<string, string | number> = {}): ProblemAt => ({
  at,
  problem: {path: pathOf(at), key, values: {path: pathOf(at), ...values}},
});

// plain words for what a value is and what was expected, never type names: the values of a problem hold one of these
// words and the message (`config.wrongType`) chooses its wording in each language with an ICU select
type Word = 'text' | 'number' | 'yesno' | 'list' | 'block' | 'nothing' | 'other';
const WORD_OF_TYPE: Partial<Record<string, Word>> = {
  string: 'text',
  number: 'number',
  boolean: 'yesno',
  object: 'block',
};
const kindOf = (v: unknown): Word =>
  v === null || v === undefined ? 'nothing' : Array.isArray(v) ? 'list' : (WORD_OF_TYPE[typeof v] ?? 'other');

/**
 * Whether `candidate` is a plausible spelling meant by `key`, `distance` edits away: two at most, and no more than a third
 * of the longer word (one at least), so a short key is not matched to every other short key (`foo` is two edits from `lo`
 * and `low`, `temp` from `tend`, `ac` from `hi`) while `peoples`, `climat` and `grid_powr` are one edit from theirs.
 */
const plausible = (key: string, candidate: string, distance: number): boolean =>
  distance <= Math.max(1, Math.min(2, Math.floor(Math.max(key.length, candidate.length) / 3)));

/** The plausible spelling among `candidates`, the nearest first, as `git` and `npm` suggest a command. */
function nearest(key: string, candidates: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = 3;
  for (const candidate of candidates) {
    const distance = editDistance(key, candidate);
    if (distance < bestDistance && plausible(key, candidate, distance)) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** The struct a value has: an `either` picks by the value that is there. */
function shapeOf(struct: AnyStruct, value: unknown): AnyStruct {
  let shape = struct;
  while (shape.type === 'either') shape = (shape.schema as Picker)(value);
  return shape;
}

/** The keys a block accepts where an unknown key was found: walk the schema down the failure's branch. */
function keysOfBlock(failure: Failure): string[] {
  const path = failure.path as Place;
  const branch = failure.branch as unknown[];
  let struct: AnyStruct = panelConfig;
  for (let depth = 0; depth < path.length - 1; depth++) {
    const shape = shapeOf(struct, branch[depth]);
    struct =
      shape.type === 'array' ? (shape.schema as AnyStruct) : (shape.schema as Record<string, AnyStruct>)[path[depth]];
  }
  // _panel_custom is accepted, not suggested: panel_custom is a typo of nothing we wrote
  return Object.keys(shapeOf(struct, branch[path.length - 1]).schema as object).filter(key => key !== '_panel_custom');
}

const unknownKey = (at: Place, candidates: readonly string[], plain: MessageKey = 'config.unknownKey'): ProblemAt => {
  const hint = nearest(String(at[at.length - 1]), candidates);
  return hint ? problemAt(at, 'config.unknownKeyHint', {hint}) : problemAt(at, plain);
};

function problemOf(failure: Failure): ProblemAt {
  const at = failure.path as Place;
  const value: unknown = failure.value;
  if (failure.type === 'never') return unknownKey(at, keysOfBlock(failure));
  // a required key of a block that is not there (an undefined value was dropped before the check); a list element that is
  // undefined is a wrong type of its own
  const branch = failure.branch as unknown[];
  if (value === undefined && isRecord(branch[branch.length - 2]))
    return problemAt(at.slice(0, -1), 'config.missingKey', {missing: String(at[at.length - 1])});
  if (failure.refinement === 'pattern') return problemAt(at, 'config.notATime', {got: String(value)});
  if (failure.type === 'enums' && (typeof value === 'string' || typeof value === 'number'))
    return problemAt(at, 'config.notOneOf', {got: String(value), options: ROOM_ICONS.join(', ')});
  if (failure.type === 'enums') return problemAt(at, 'config.wrongType', {expected: 'text', got: kindOf(value)});
  if (failure.type === 'pair') return problemAt(at, 'config.notAPair');
  return problemAt(at, 'config.wrongType', {expected: WORD_OF_TYPE[failure.type] ?? 'other', got: kindOf(value)});
}

/** Every problem of a block of settings, each with the place to drop. */
function findProblems(raw: Record<string, unknown>): ProblemAt[] {
  const [error] = validate(raw, panelConfig);
  const problems = (error?.failures() ?? []).map(problemOf);
  // the entity keys are a list of names, not a schema: both spellings are accepted, nothing else
  if (isRecord(raw.entities))
    for (const key of Object.keys(raw.entities))
      if (!ENTITY_KEYS.includes(key)) problems.push(unknownKey(['entities', key], ENTITY_KEYS, 'config.unknownEntity'));
  return problems;
}

/**
 * What is wrong with `raw`, the `config:` block under `panel_custom:`: unknown settings (with the spelling meant, when it
 * is near), values of the wrong type, an icon outside the list, a link without two cards, a time that is not HH:MM, a
 * required setting that is missing. A value that is not a block of settings counts as empty. Never throws.
 */
export function checkConfig(raw: unknown): ConfigProblem[] {
  return isRecord(raw) ? findProblems(defined(raw) as Record<string, unknown>).map(f => f.problem) : [];
}

// ---------- pruning: the tolerant reader ----------

/**
 * A copy without the settings whose value is `undefined`: a setting that is not there. YAML has no undefined (an empty
 * value is null, which clears an entity); a script that builds a config can leave one, and it must not cost the block.
 */
const defined = (node: unknown): unknown =>
  Array.isArray(node)
    ? node.map(defined)
    : isRecord(node)
      ? Object.fromEntries(
          Object.entries(node)
            .filter(([, v]) => v !== undefined)
            .map(([k, v]) => [k, defined(v)]),
        )
      : node;

/** A copy without the holes `delete` leaves in a list. Anything that is not a list or a block is kept as it is. */
const withoutHoles = (node: unknown): unknown =>
  Array.isArray(node)
    ? node.filter(() => true).map(withoutHoles)
    : isRecord(node)
      ? Object.fromEntries(Object.entries(node).map(([k, v]) => [k, withoutHoles(v)]))
      : node;

const valueAt = (node: unknown, key: string | number): unknown => (isObject(node) ? node[key] : undefined);

/**
 * `raw` without what `checkConfig` reports: a bad leaf, a bad list element, an unknown key. Dropping a leaf can leave its
 * block without a required key, which the next round drops in turn; three rounds are more than any config needs.
 */
function prune(raw: Record<string, unknown>): PanelConfig {
  let data = defined(raw);
  for (let round = 0; round < 3; round++) {
    const problems = findProblems(data as Record<string, unknown>);
    if (problems.length === 0) break;
    for (const {at} of problems) {
      const parent = at.slice(0, -1).reduce(valueAt, data);
      if (isObject(parent)) delete parent[at[at.length - 1]];
    }
    data = withoutHoles(data);
  }
  // what the schema accepts is a PanelConfig; the compiler cannot follow a prune that far
  return data as PanelConfig;
}

// ---------- the resolver ----------

// a room: its thermostat, and the sensors that hold its temperature, setpoint and heating power history
// (by default the thermostat's own name plus _temperature / _target_temperature / _power, which is how Hilo names them)
function roomSpec(r: Infer<typeof room>, states: ConfigStates): RoomSpec {
  const settings: Partial<Exclude<typeof r, string>> & {climate: string} = typeof r === 'string' ? {climate: r} : r;
  const thermostat = settings.climate.replace(/^climate\./, '');
  const friendlyName = states[settings.climate]?.attributes?.friendly_name;
  const name = settings.name ?? null;
  return {
    k: settings.key || thermostat.replace(/^thermostat_/, ''),
    n: name,
    icon: settings.icon ?? guessIcon(name || friendlyName || thermostat),
    climate: settings.climate,
    temp: settings.temperature || `sensor.${thermostat}_temperature`,
    target: settings.target || `sensor.${thermostat}_target_temperature`,
    power: settings.power || `sensor.${thermostat}_power`,
  };
}

const asList = <T>(v: T | T[] | undefined): T[] => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
// a person's first name from the friendly name discovery found: String() of it, as the old resolver read it
const firstWord = (s: unknown): string => {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string -- the old resolver's coercion, kept: discovery keeps every rule
  const name = String(s || '');
  return name.trim().split(/\s+/)[0];
};

/**
 * panel.config and the house's states → the settings the panel runs with. It runs on the config without what
 * `checkConfig` reports, so a bad setting takes its default and the rest applies.
 * @param raw panel.config: a value that is not a block of settings counts as empty
 * @param states hass.states
 */
export function resolveConfig(raw: unknown, states?: ConfigStates | null): ResolvedConfig {
  const cfg = prune(isRecord(raw) ? raw : {});
  const all: ConfigStates = states ?? {};
  const ids = Object.keys(all),
    has = (id: string) => !!all[id];
  const entities: EntityMap = {...DEFAULT_ENTITIES};
  const given: Record<string, string | null> = {};
  for (const [k, v] of Object.entries(cfg.entities ?? {})) {
    const key = ENTITY_ALIAS[k] || k;
    if (key in entities) given[key] = v || null;
  }
  // weather: the configured entity, else the first weather entity (forecast entities first)
  entities.weather =
    given.weather !== undefined
      ? given.weather
      : ids.find(i => /^weather\..+_forecast$/.test(i)) || ids.find(i => i.startsWith('weather.')) || null;
  const town = entities.weather && (entities.weather.match(/^weather\.(.+?)(?:_forecast)?$/) || [])[1];
  if (town)
    for (const [k, suf] of Object.entries(EC_SUFFIX) as [EntityKey, string][]) {
      const id = `sensor.${town}_${suf}`;
      if (has(id)) entities[k] = id;
    }
  // Hilo's gateway sensor is sensor.hilo_gateway, or _2 after the integration was added twice
  // (it still holds the default here: the config's own value, which may clear it, is applied just below)
  if (!has(DEFAULT_ENTITIES.gateway))
    entities.gateway = ids.find(i => /^sensor\.hilo_gateway(_\d+)?$/.test(i)) || entities.gateway;
  Object.assign(entities, given);
  // rooms: the configured list, else every thermostat except the heat pump
  const rooms = (cfg.rooms ? asList(cfg.rooms) : ids.filter(i => i.startsWith('climate.') && i !== entities.hp).sort())
    .filter(Boolean)
    .map(r => roomSpec(r, all));
  // people shown in who's home: the configured first names, else each person entity's first name
  const people = cfg.people
    ? asList(cfg.people)
    : ids
        .filter(i => i.startsWith('person.'))
        .map(i => firstWord(all[i].attributes?.friendly_name))
        .filter(Boolean);
  const image = cfg.house_image;
  const house =
    typeof image === 'string'
      ? {day: image, night: image}
      : image
        ? {day: image.day || image.night || null, night: image.night || image.day || null}
        : null;
  const kwh = cfg.car?.battery_kwh ?? 0;
  return {
    entities,
    rooms,
    people,
    scenes: asList(cfg.scenes), // scene order; scenes not listed follow alphabetically
    modes: asList(cfg.modes), // input_booleans shown as on/off routine tiles beside the scenes
    // pairs of light cards that can move together: [a, b] or {lights: [a, b], switch: input_boolean.x}; a card is an area id or a light entity
    lightLinks: asList(cfg.light_links).map(l =>
      Array.isArray(l) ? {keys: l, sw: null} : {keys: l.lights, sw: l.switch || null},
    ),
    splitLightAreas: asList(cfg.split_light_areas), // HA areas whose light groups each get their own tile
    alAreas: {...cfg.adaptive_lighting_areas},
    house: house && house.day ? house : null,
    // a name (or an id) to one name per language; the name resolver in the core reads it
    names: cfg.names ?? {},
    car: {
      name: cfg.car?.name || null,
      color: cfg.car?.color || null,
      battery_kwh: kwh > 0 ? kwh : null,
    },
    // the idle clock's smart stack: off turns it off; sunrise_lights_off names the sunrise card for a house whose lights go off at sunrise;
    // reminders are {at: 'HH:MM', title, text, lead (minutes before, 30 by default)}
    stack: {
      on: cfg.idle_stack?.enabled !== false,
      sunriseOff: cfg.idle_stack?.sunrise_lights_off === true,
      reminders: asList(cfg.idle_stack?.reminders).map(r => ({
        at: r.at.trim(),
        title: r.title || 'Reminder',
        text: r.text || '',
        lead: r.lead || 30,
      })),
    },
  };
}
