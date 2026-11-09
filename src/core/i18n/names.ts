// The display-name resolver: every name the panel shows passes through name(key), which answers in the panel's language.
// Pattern: Chain of Responsibility (Gamma et al., Design Patterns, 1994): the first link that has an answer wins (the
// house's `names:` block, the built-in room dictionary, then the name as Home Assistant gives it); names are data, never
// message keys. Home Assistant's own aliases are not used: they carry no language tag, so they cannot say which is English.
// Must not: translate part of a name (`Lampe du salon` needs an override), read the DOM or a global locale, or cache a hass.
import type {PanelConfig} from '../config.ts';
import type {PanelHass} from '../hass.ts';
import {ROOM_NAMES} from './room-names.ts';

/** The config's `names:` block, as its schema types it: a name, an entity id, an area id or a device id, each with one name per language. */
export type NamesConfig = NonNullable<PanelConfig['names']>;

/** What the resolver reads of the hass, so the store can hand it a view that is always the current one. */
export type NamesHass = Pick<PanelHass, 'states' | 'areas' | 'devices'>;

export interface Names {
  /**
   * `key` is an entity id, an area id or a device id; anything else is taken to be a name and resolved as one. With a
   * `fallback`, `key` is an id, and when Home Assistant has no name for it and the `names:` block no override, the fallback
   * is the answer (a placeholder such as `Scene`, where the id itself must not show).
   */
  readonly name: (key: string, fallback?: string) => string;
}

/** Case, accents and runs of spaces do not matter to a match. */
const normalise = (s: string): string =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

const toFrench = new Map(ROOM_NAMES.map(([en, fr]) => [normalise(en), fr]));
const toEnglish = new Map(ROOM_NAMES.map(([en, fr]) => [normalise(fr), en]));

/** A Home Assistant attribute is untyped: a string is a name, anything else (a number, a null) is no name. */
const stringOrEmpty = (v: unknown): string => (typeof v === 'string' ? v : '');

/** A key is an id or a name someone typed: `constructor` must not find a member of Object.prototype. */
const own = <T>(record: Record<string, T> | undefined, key: string): T | undefined =>
  record && Object.hasOwn(record, key) ? record[key] : undefined;

/** The name Home Assistant gives the key: an entity's friendly name, an area's name, a device's own name; else none. */
function haName(key: string, hass: NamesHass | null): string | undefined {
  const device = own(hass?.devices, key);
  return (
    stringOrEmpty(own(hass?.states, key)?.attributes.friendly_name) ||
    stringOrEmpty(own(hass?.areas, key)?.name) ||
    stringOrEmpty(device?.name_by_user) ||
    stringOrEmpty(device?.name) ||
    undefined
  );
}

export function createNames(config: {names?: NamesConfig}, language: string, hass: NamesHass | null): Names {
  const lang = language.split('-')[0].toLowerCase();
  const dictionary = lang === 'fr' ? toFrench : lang === 'en' ? toEnglish : null;
  const names = config.names ?? {};
  const override = (key: string): string => {
    const entry: unknown = own(names, key);
    return typeof entry === 'object' && entry !== null
      ? stringOrEmpty((entry as Record<string, unknown>)[lang]).trim()
      : '';
  };
  return {
    name: (key, fallback) => {
      const ha = haName(key, hass);
      // an id Home Assistant has no name for: the caller's placeholder, unless the house named the id itself
      if (ha === undefined && fallback !== undefined) return override(key) || fallback;
      const given = ha ?? key;
      return override(key) || override(given) || dictionary?.get(normalise(given)) || given;
    },
  };
}
