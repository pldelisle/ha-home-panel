// The entity store: the current hass, the resolved panel config and the locale, and which ids changed for whom.
// Pattern: functional core (Bernhardt, Boundaries); observer with reference-equality change detection (Home Assistant
// frontend data docs); a deep module whose dependencies are accepted, not created (Ousterhout, A Philosophy of Software Design).
// Must not: touch the DOM, call a hass method, read the clock or Intl, or be imported as a singleton.
import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  EntityRegistryEntry,
  HassEntities,
  HassEntity,
  PanelHass,
} from './hass.ts';
import {panelLocale} from './i18n/locale.ts';
import {createMessages, type Messages} from './i18n/messages.ts';

/** What `setHass` found different from the previous hass. */
export interface HassChange {
  /** Entity ids whose state object is a different reference, added or removed. */
  ids: ReadonlySet<string>;
  /** The entities, devices or areas registry is a different reference. */
  registries: boolean;
  /** The language or the time zone changed. */
  locale: boolean;
  /** The user object is a different reference. */
  user: boolean;
}

/** `TConfig` is what the injected resolver returns (the resolved panel config); spec 13 gives it its type. */
export interface PanelStore<TConfig = unknown> {
  readonly hass: PanelHass | null;
  readonly config: TConfig;
  /** +1 on every config change; the stale-reply guard of the API client. */
  readonly generation: number;
  readonly timeZone: string;
  readonly language: string;
  readonly isFrench: boolean;
  readonly isAdmin: boolean;
  readonly userName: string;
  /** The panel's own wording in the user's language, from the message catalogs; rebuilt when the locale changes. */
  readonly t: Messages['t'];
  /** Notifies subscribers synchronously, then returns what changed. */
  setHass(h: PanelHass): HassChange;
  /** True when the config changed (JSON-equal configs do not). */
  setPanelConfig(raw: unknown): boolean;
  state(id: string | null | undefined): HassEntity | undefined;
  /** The numeric state, or null when unavailable, unknown or not a number. */
  num(id: string | null | undefined): number | null;
  attr(id: string | null | undefined, name: string): unknown;
  /** `num`, with watts converted to kilowatts. */
  kw(id: string | null | undefined): number | null;
  entity(id: string): EntityRegistryEntry | undefined;
  device(id: string): DeviceRegistryEntry | undefined;
  area(id: string): AreaRegistryEntry | undefined;
  /** The entity's area, else its device's area, else ''. */
  areaOf(entityId: string): string;
  /** `'*'` is told on every setHass; a list of ids only when one of them changed, or a registry, locale or user did. */
  subscribe(ids: readonly string[] | '*', cb: (change: HassChange) => void): () => void;
}

export interface StoreOptions<TConfig> {
  /** The zone used until a hass brings its own; the element passes the browser's. */
  defaultTimeZone: string;
  /** The panel config and the house's states in, the resolved config out (the element passes resolveConfig). */
  resolve: (raw: unknown, states: HassEntities) => TConfig;
}

interface Subscriber {
  cb: (change: HassChange) => void;
}

const isAvailable = (s: HassEntity | undefined): s is HassEntity =>
  s !== undefined && s.state !== 'unavailable' && s.state !== 'unknown';

export function createStore<TConfig>(opts: StoreOptions<TConfig>): PanelStore<TConfig> {
  let hass: PanelHass | null = null;
  let raw: unknown = {};
  let configKey: string | null = null;
  let config = opts.resolve(raw, {});
  let generation = 0;

  // t reads only the language and the tag; the defaults panelLocale asks for matter to the formatters, not here
  let messageTag = 'en';
  let messages = createMessages({language: 'en', tag: messageTag});

  const byId = new Map<string, Set<Subscriber>>();
  const keyed = new Set<Subscriber>(); // every subscriber that listed ids
  const wildcard = new Set<Subscriber>();

  const timeZoneOf = (h: PanelHass | null) => h?.config.time_zone || opts.defaultTimeZone;
  const languageOf = (h: PanelHass | null) => h?.locale?.language ?? h?.language ?? 'en';

  const state = (id: string | null | undefined) => (id ? hass?.states[id] : undefined);
  const num = (id: string | null | undefined) => {
    const s = state(id);
    if (!isAvailable(s)) return null;
    const v = parseFloat(s.state);
    return Number.isFinite(v) ? v : null;
  };
  const attr = (id: string | null | undefined, name: string): unknown => state(id)?.attributes[name];

  const entity = (id: string) => hass?.entities?.[id];
  const device = (id: string) => hass?.devices?.[id];

  function notify(change: HassChange): void {
    const told = new Set<Subscriber>(wildcard);
    if (change.registries || change.locale || change.user) {
      for (const sub of keyed) told.add(sub);
    } else {
      for (const id of change.ids) for (const sub of byId.get(id) ?? []) told.add(sub);
    }
    // a copy, so a subscriber added or removed by a callback is first affected on the next notification
    for (const sub of [...told]) sub.cb(change);
  }

  return {
    get hass() {
      return hass;
    },
    get config() {
      return config;
    },
    get generation() {
      return generation;
    },
    get timeZone() {
      return timeZoneOf(hass);
    },
    get language() {
      return languageOf(hass);
    },
    get isFrench() {
      return /^fr\b/i.test(languageOf(hass));
    },
    get isAdmin() {
      return !!hass?.user?.is_admin;
    },
    get userName() {
      return hass?.user?.name ?? '';
    },
    // one function for the life of the store, so `const {t} = store` keeps working after a language change
    t: (key, values) => messages.t(key, values),

    setHass(next) {
      const prev = hass;
      const ids = new Set<string>();
      for (const id in next.states) if (next.states[id] !== prev?.states[id]) ids.add(id);
      if (prev) for (const id in prev.states) if (!(id in next.states)) ids.add(id);
      const change: HassChange = {
        ids,
        registries: next.entities !== prev?.entities || next.devices !== prev?.devices || next.areas !== prev?.areas,
        locale: languageOf(next) !== languageOf(prev) || timeZoneOf(next) !== timeZoneOf(prev),
        user: next.user !== prev?.user,
      };
      hass = next;
      const spec = panelLocale(next, {timeZone: timeZoneOf(next), browserLocale: 'en'});
      if (spec.tag !== messageTag) {
        messageTag = spec.tag;
        messages = createMessages(spec);
      }
      // the config was resolved against no states until now (discovery needs them): resolve it again, same generation
      if (!prev) config = opts.resolve(raw, next.states);
      notify(change);
      return change;
    },

    setPanelConfig(value) {
      const key = JSON.stringify(value ?? {});
      if (key === configKey) return false;
      configKey = key;
      raw = value ?? {};
      config = opts.resolve(raw, hass?.states ?? {});
      generation++;
      return true;
    },

    state,
    num,
    attr,
    kw(id) {
      const v = num(id);
      if (v === null) return null;
      return attr(id, 'unit_of_measurement') === 'W' ? v / 1000 : v;
    },
    entity,
    device,
    area: id => hass?.areas?.[id],
    areaOf(entityId) {
      const e = entity(entityId);
      return e?.area_id || (e?.device_id ? device(e.device_id)?.area_id : undefined) || '';
    },

    subscribe(ids, cb) {
      const sub: Subscriber = {cb};
      if (ids === '*') {
        wildcard.add(sub);
        return () => void wildcard.delete(sub);
      }
      keyed.add(sub);
      for (const id of ids) {
        const set = byId.get(id) ?? new Set();
        set.add(sub);
        byId.set(id, set);
      }
      return () => {
        keyed.delete(sub);
        for (const id of ids) {
          const set = byId.get(id);
          set?.delete(sub);
          if (set?.size === 0) byId.delete(id);
        }
      };
    },
  };
}
