// Types for the two pure modules (config.js, stack.js). They are checked by `npm run typecheck` (tsc --checkJs, strict)
// and reached from those files with /** @typedef {import('./types.d.ts').X} X */, because the files are still scripts
// spliced into the bundle (build.mjs), not modules. This file is never built or shipped.
// PanelConfig is the `config:` block as a person writes it; ResolvedConfig is what resolveConfig() returns today.
// Both describe the code as it is, not as it should be: the phase-2 schema starts from them.

/** One entity as Home Assistant's websocket hands it over (hass.states[entity_id]). */
export interface HassState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
  last_changed: string;
  last_updated: string;
}
export type HassStates = Record<string, HassState>;

// ---------- input: the `config:` block under panel_custom (examples/configuration.yaml) ----------

/** A room: the thermostat's entity id, or an object that also names the room and its sensors. */
export type RoomInput =
  | string
  | {
      climate: string;
      name?: string;
      icon?: string;
      key?: string;
      temperature?: string;
      target?: string;
      power?: string;
    };
/**
 * Two light cards (an area id or a light entity each) that move together,
 * with an optional input_boolean to link and unlink them.
 */
export type LightLinkInput = [string, string] | {lights: [string, string]; switch?: string};
/** `at` is 'HH:MM'; `lead` is the minutes before `at` that the card shows (30 by default). */
export interface ReminderInput {
  at: string;
  title?: string;
  text?: string;
  lead?: number;
}
/** Every key is optional. The scalar-or-list keys take one value or a list. */
export interface PanelConfig {
  people?: string | string[];
  house_image?: string | {day?: string; night?: string};
  car?: {name?: string; color?: string; battery_kwh?: number};
  /**
   * The snake_case names (ENTITY_ALIAS) or the camelCase keys (EntityKey) to an entity id;
   * empty or null clears the default.
   */
  entities?: Record<string, string | null>;
  rooms?: RoomInput | RoomInput[];
  scenes?: string | string[];
  modes?: string | string[];
  adaptive_lighting_areas?: Record<string, string>;
  split_light_areas?: string | string[];
  light_links?: LightLinkInput | LightLinkInput[];
  idle_stack?: {enabled?: boolean; sunrise_lights_off?: boolean; reminders?: ReminderInput | ReminderInput[]};
}

// ---------- output: what resolveConfig() returns ----------

// TODO(#33): once config.js is a module, derive this from DEFAULT_ENTITIES with keyof typeof; config.js types
// DEFAULT_ENTITIES as EntityMap in the meantime, so a key added to one and not the other fails the check.
/** The keys of DEFAULT_ENTITIES: the entities each card reads. */
export type EntityKey =
  | 'weather'
  | 'cond'
  | 'outT'
  | 'hi'
  | 'lo'
  | 'nhi'
  | 'nlo'
  | 'wind'
  | 'windDir'
  | 'hum'
  | 'uv'
  | 'aqhi'
  | 'warnings'
  | 'dew'
  | 'pres'
  | 'tend'
  | 'gust'
  | 'chill'
  | 'humidex'
  | 'vis'
  | 'pop'
  | 'summary'
  | 'obs'
  | 'bearing'
  | 'watches'
  | 'advisories'
  | 'statements'
  | 'sun'
  | 'setting'
  | 'rising'
  | 'dawn'
  | 'grid'
  | 'energy'
  | 'whP'
  | 'whT'
  | 'whE'
  | 'evP'
  | 'wbStatus'
  | 'wbAmps'
  | 'wbPause'
  | 'wbLock'
  | 'wbPrice'
  | 'rate'
  | 'rateLow'
  | 'rateMed'
  | 'rateReward'
  | 'defi'
  | 'rewards'
  | 'gateway'
  | 'hq'
  | 'hqPeak'
  | 'hqUpcoming'
  | 'hp'
  | 'away';
export type EntityMap = Record<EntityKey, string | null>;
/** The icons a room can have (ROOM_ICONS in config.js). */
export type RoomIcon = 'sofa' | 'door' | 'desk' | 'bed' | 'bath' | 'drop' | 'car' | 'house' | 'therm';
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
  /** Two entries (resolveConfig drops the pairs of another length); the type cannot say so. */
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
  stack: {on: boolean; sunriseOff: boolean; reminders: Reminder[]};
}

// ---------- smart stack (stack.js) ----------

/**
 * The card pickStack() chooses among. `tone` 'red' pins it, 'amber' puts it first;
 * a card without a tone is neutral.
 */
export interface StackCard {
  k: string;
  tone: 'red' | 'amber' | null;
  filler: boolean;
  /** The card's markup, built by scard() in the main class. */
  html: string;
}
