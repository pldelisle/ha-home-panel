// Who is home: the configured people, each home or away and since when, and the iCloud trackers behind them that stopped updating.
// Pattern: an adapter below the features (ADR 0025): the header's chips, the Home card and the smart stack read one answer; the
// rules copy the legacy `presence()` and the stack's "presence not updating" reading, which #266 deletes with the legacy stack.
// Must not: word anything a person reads (the people model does), read the DOM or `hass` itself, or reorder the config's people.
import {fold} from '../core/fold.ts';
import type {HassEntities, Registries} from '../core/hass.ts';
import {isHidden} from '../core/registry.ts';
import {isAvailable, textAttributeOf} from '../core/states.ts';

/** One configured person, as the trackers say. */
export interface Person {
  /** The name as the config gives it. */
  name: string;
  home: boolean;
  /** When an away person left (the entity's `last_changed`, ISO); null while home or when no tracker says. */
  since: string | null;
}

/** An iCloud tracker behind a person entity that has not reported for three hours. */
export interface FrozenTracker {
  /** `device_tracker.*`. */
  id: string;
  /** Its `last_updated`, ISO. */
  updated: string;
}

/** Three hours, in minutes, rounded as the legacy stack rounded: a tracker 179.5 minutes old is frozen. */
const FROZEN_MINUTES = 180;

/** Only these devices go where their owner goes: an iPad or a laptop stays home and would keep its owner home. */
const CARRIED = /iphone|watch/i;

const firstWord = (text: string): string => fold(text).split(/\s+/)[0] ?? '';

/** The configured name whose fold is the first word of `text`, or undefined. */
const whoIs = (text: string, people: string[]): string | undefined =>
  people.find(name => firstWord(text) === fold(name));

/** "Alex's iPhone" and "iPhone de Alex" (or "d'Alex") as `[owner, device]`, or null for any other name. */
function ownerAndDevice(name: string): [string, string] | null {
  const possessive = name.match(/^(.+?)[’']s\s+(.+)$/);
  if (possessive) return [possessive[1], possessive[2]];
  const french = name.match(/^(.+?)\s+(?:de|d[’'])\s*(.+)$/);
  return french ? [french[2], french[1]] : null;
}

/**
 * The configured people in the config's order, each home or away. A `person.*` whose name's first word is a configured name wins
 * (it follows the trackers chosen in Home Assistant's People settings); when no person entity matches, each owner's visible
 * iPhones and watches decide: home when any is home, else away since the last of them that left. Case and accents never decide.
 */
export function presence(states: HassEntities, registries: Registries, people: string[]): Person[] {
  const by = new Map<string, Person>();
  for (const id of Object.keys(states)) {
    if (!id.startsWith('person.')) continue;
    const who = whoIs(textAttributeOf(states, id, 'friendly_name') ?? '', people);
    const s = states[id];
    if (who && isAvailable(s))
      by.set(who, {name: who, home: s.state === 'home', since: s.state === 'home' ? null : s.last_changed});
  }
  if (!by.size)
    for (const id of Object.keys(states)) {
      if (!id.startsWith('device_tracker.') || isHidden(id, registries)) continue;
      const parts = ownerAndDevice(textAttributeOf(states, id, 'friendly_name') ?? '');
      if (!parts || !CARRIED.test(parts[1])) continue;
      const who = whoIs(parts[0], people);
      const s = states[id];
      if (!who || !isAvailable(s)) continue;
      const person = by.get(who) ?? {name: who, home: false, since: null};
      by.set(who, person);
      if (s.state === 'home') person.home = true;
      else if (!person.home) person.since = s.last_changed;
    }
  return people.flatMap(name => by.get(name) ?? []);
}

/**
 * Every entity `presence` may read for the configured people: their person entities and their owners' visible iPhones and watches,
 * whichever decides today, because a person entity that appears or goes changes which one does.
 */
export function presenceIds(states: HassEntities, registries: Registries, people: string[]): string[] {
  return Object.keys(states).filter(id => {
    const name = textAttributeOf(states, id, 'friendly_name') ?? '';
    if (id.startsWith('person.')) return !!whoIs(name, people);
    if (!id.startsWith('device_tracker.') || isHidden(id, registries)) return false;
    const parts = ownerAndDevice(name);
    return !!parts && CARRIED.test(parts[1]) && !!whoIs(parts[0], people);
  });
}

/**
 * The iCloud trackers a person entity follows (its `source`) that are available and last reported three hours or more before
 * `now`, in the person entities' order: who's home and Away may be wrong while they are frozen.
 */
export function frozenPresence(states: HassEntities, registries: Registries, now: number): FrozenTracker[] {
  return Object.keys(states)
    .filter(id => id.startsWith('person.'))
    .map(id => textAttributeOf(states, id, 'source'))
    .filter((id): id is string => !!id)
    .filter(id => registries.entities?.[id]?.platform === 'icloud' && isAvailable(states[id]))
    .filter(id => Math.round((now - Date.parse(states[id].last_updated)) / 60_000) >= FROZEN_MINUTES)
    .map(id => ({id, updated: states[id].last_updated}));
}
