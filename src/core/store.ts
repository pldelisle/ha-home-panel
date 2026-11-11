// The entity store: the current hass, the resolved panel config and the locale, and which ids changed for whom.
// Pattern: functional core (Bernhardt, Boundaries); observer with reference-equality change detection (Home Assistant
// frontend data docs); a deep module whose dependencies are accepted, not created (Ousterhout, A Philosophy of Software Design).
// Must not: touch the DOM, call a hass method, read the clock, or be imported as a singleton; the only `Intl` it reaches
// is through the message compiler it builds for the locale.
import {checkConfig, type ConfigProblem, type ResolvedConfig} from './config.ts';
import type {
  AreaRegistryEntry,
  DeviceRegistryEntry,
  EntityRegistryEntry,
  HassEntities,
  HassEntity,
  PanelHass,
} from './hass.ts';
import {createFormatters, type Formatters} from './i18n/format.ts';
import {panelLocale, type PanelLocaleSpec} from './i18n/locale.ts';
import {createMessages, type Messages} from './i18n/messages.ts';
import {createNames, type Names} from './i18n/names.ts';
import {areaOf} from './registry.ts';
import {attributeOf, numberOf} from './states.ts';

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

export interface PanelStore {
  readonly hass: PanelHass | null;
  /** The resolved panel config: what the injected resolver made of the config and the house's states. */
  readonly config: ResolvedConfig;
  /** What is wrong with the config as written (spec 13); empty when it is clean. The config above ignores all of it. */
  readonly configProblems: ConfigProblem[];
  /** +1 on every config change; the stale-reply guard of the API client. */
  readonly generation: number;
  readonly timeZone: string;
  readonly language: string;
  readonly isFrench: boolean;
  readonly isAdmin: boolean;
  readonly userName: string;
  /** The panel's own wording in the user's language, from the message catalogs; rebuilt on a `locale` change. */
  readonly t: Messages['t'];
  /**
   * The dates, times and numbers in the user's language and formats, the same object until the profile's locale changes.
   * Temporary twin of the guest's own sets (`refreshFormatters`), which go with it (#188).
   */
  readonly fmt: Formatters;
  /** Every name the panel shows, in the user's language: the config's `names:`, the room dictionary, then Home Assistant's. */
  readonly names: Names;
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

export interface StoreOptions {
  /** The zone used until a hass brings its own; the element passes the browser's. */
  defaultTimeZone: string;
  /** The browser's own locale and 12-hour preference, which the formats fall back to; the element passes them. */
  browserLocale?: string;
  browserHour12?: boolean;
  /** The panel config and the house's states in, the resolved config out (the element passes resolveConfig). */
  resolve: (raw: unknown, states: HassEntities) => ResolvedConfig;
}

interface Subscriber {
  cb: (change: HassChange) => void;
}

export function createStore(opts: StoreOptions): PanelStore {
  let hass: PanelHass | null = null;
  let raw: unknown = {};
  let configKey: string | null = null;
  let config = opts.resolve(raw, {});
  let configProblems = checkConfig(raw);
  let generation = 0;

  // t reads only the language and the tag; the defaults panelLocale asks for matter to the formatters, not here
  let messages = createMessages({language: 'en', tag: 'en'});

  const byId = new Map<string, Set<Subscriber>>();
  const keyed = new Set<Subscriber>(); // every subscriber that listed ids
  const wildcard = new Set<Subscriber>();

  const timeZoneOf = (h: PanelHass | null) => h?.config.time_zone || opts.defaultTimeZone;
  const languageOf = (h: PanelHass | null) => h?.locale?.language ?? h?.language ?? 'en';

  // what the last hass said, kept here because a host may change the language on the hass object it already handed over,
  // and then `prev` is that same object and shows no difference
  let seenLanguage = languageOf(null);
  let seenTimeZone = timeZoneOf(null);

  // names read the current hass when asked, so a renamed light or area shows at once and only the language or the
  // config rebuilds them
  const live = {
    get states() {
      return hass?.states ?? {};
    },
    get areas() {
      return hass?.areas;
    },
    get devices() {
      return hass?.devices;
    },
  };
  const buildNames = () => createNames(config, languageOf(hass), live);
  let names = buildNames();

  // the formatters follow the locale by value, as a host may change the language on the hass object it already handed over
  let spec: PanelLocaleSpec | null = null;
  let specKey = '';
  let formatters: Formatters | null = null;
  const formats = (): Formatters => {
    const next = panelLocale(hass ?? ({config: {}} as PanelHass), {
      timeZone: timeZoneOf(hass),
      browserLocale: opts.browserLocale ?? 'en',
      browserHour12: opts.browserHour12,
    });
    const key = JSON.stringify(next);
    if (!formatters || key !== specKey) {
      spec = next;
      specKey = key;
      formatters = createFormatters(spec);
    }
    return formatters;
  };

  const state = (id: string | null | undefined) => (id ? hass?.states[id] : undefined);
  const num = (id: string | null | undefined) => numberOf(hass?.states, id);
  const attr = (id: string | null | undefined, name: string): unknown => attributeOf(hass?.states, id, name);

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
    get configProblems() {
      return configProblems;
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
    get fmt() {
      return formats();
    },
    get names() {
      return names;
    },

    setHass(next) {
      const prev = hass;
      const ids = new Set<string>();
      for (const id in next.states) if (next.states[id] !== prev?.states[id]) ids.add(id);
      if (prev) for (const id in prev.states) if (!(id in next.states)) ids.add(id);
      const change: HassChange = {
        ids,
        registries: next.entities !== prev?.entities || next.devices !== prev?.devices || next.areas !== prev?.areas,
        locale: languageOf(next) !== seenLanguage || timeZoneOf(next) !== seenTimeZone,
        user: next.user !== prev?.user,
      };
      hass = next;
      seenLanguage = languageOf(next);
      seenTimeZone = timeZoneOf(next);
      // the config was resolved against no states until now (discovery needs them): resolve it again, same generation
      if (!prev) config = opts.resolve(raw, next.states);
      // the messages and the names are built from the first hass, then rebuilt on the locale change the subscribers are
      // told of; the names are also rebuilt when the config changes (setConfig), the messages are not
      if (!prev || change.locale) {
        messages = createMessages(panelLocale(next, {timeZone: seenTimeZone, browserLocale: 'en'}));
        names = buildNames();
      }
      notify(change);
      return change;
    },

    setPanelConfig(value) {
      const key = JSON.stringify(value ?? {});
      if (key === configKey) return false;
      configKey = key;
      raw = value ?? {};
      config = opts.resolve(raw, hass?.states ?? {});
      configProblems = checkConfig(raw);
      names = buildNames();
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
    areaOf: entityId => areaOf(entityId, hass ?? {}),

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
