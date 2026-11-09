// The display-name resolver: every name the panel shows passes through name(key), which answers in the panel's language.
// Pattern: Chain of Responsibility (Gamma et al., Design Patterns, 1994): the first link that has an answer wins (the
// house's `names:` block, the built-in room dictionary, then the name as Home Assistant gives it); names are data, never
// message keys. Home Assistant's own aliases are not used: they carry no language tag, so they cannot say which is English.
// Must not: translate part of a name (`Lampe du salon` needs an override), read the DOM or a global locale, or cache a hass.
import type {PanelHass} from '../hass.ts';
import {ROOM_NAMES} from './room-names.ts';

/** The config's `names:` block: a name, an entity id, an area id or a device id, each with one name per language. */
export type NamesConfig = Record<string, Partial<Record<string, string>>>;

/** What the resolver reads of the hass, so the store can hand it a view that is always the current one. */
export type NamesHass = Pick<PanelHass, 'states' | 'areas' | 'devices'>;

export interface Names {
  /** `key` is an entity id, an area id or a device id; anything else is taken to be a name and resolved as one. */
  readonly name: (key: string) => string;
}

/** Case, accents and runs of spaces do not matter to a match. */
const normalise = (s: string): string =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

const toFrench = new Map(ROOM_NAMES.map(([en, fr]) => [normalise(en), fr]));
const toEnglish = new Map(ROOM_NAMES.map(([en, fr]) => [normalise(fr), en]));

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** A key is an id or a name someone typed: `constructor` must not find a member of Object.prototype. */
const own = <T>(record: Record<string, T> | undefined, key: string): T | undefined =>
  record && Object.hasOwn(record, key) ? record[key] : undefined;

/** The name Home Assistant gives the key: an entity's friendly name, an area's name, a device's own name; else the key. */
function haName(key: string, hass: NamesHass | null): string {
  const device = own(hass?.devices, key);
  return (
    text(own(hass?.states, key)?.attributes.friendly_name) ||
    text(own(hass?.areas, key)?.name) ||
    text(device?.name_by_user) ||
    text(device?.name) ||
    key
  );
}

export function createNames(config: {names?: NamesConfig}, language: string, hass: NamesHass | null): Names {
  const lang = language.split('-')[0].toLowerCase();
  const dictionary = lang === 'fr' ? toFrench : lang === 'en' ? toEnglish : null;
  const names = config.names ?? {};
  const override = (key: string): string => {
    const entry: unknown = own(names, key);
    return typeof entry === 'object' && entry !== null ? text((entry as Record<string, unknown>)[lang]).trim() : '';
  };
  return {
    name: key => {
      const given = haName(key, hass);
      return override(key) || override(given) || dictionary?.get(normalise(given)) || given;
    },
  };
}
