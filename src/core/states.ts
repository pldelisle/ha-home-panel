// Readers over a map of entity states: whether one has a value, its number, its text, one of its attributes.
// Pattern: pure functions over plain data (Bernhardt, functional core), so the store and the providers share one rule for
// what "no value" is: a missing entity, `unavailable` or `unknown`.
// Must not: hold state, read `hass` or the clock, or guess a number from text that is not one.
import type {HassEntities, HassEntity} from './hass.ts';

/** An entity id that may be unset: the config leaves out what the house does not have. */
type MaybeId = string | null | undefined;

/** The entity has a state that means something: not missing, not `unavailable`, not `unknown`. */
export const isAvailable = (s: HassEntity | undefined): s is HassEntity =>
  s !== undefined && s.state !== 'unavailable' && s.state !== 'unknown';

/** The numeric state, or null when unset, missing, unavailable, unknown or not a number. */
export function numberOf(states: HassEntities | undefined, id: MaybeId): number | null {
  const s = id ? states?.[id] : undefined;
  if (!isAvailable(s)) return null;
  const v = parseFloat(s.state);
  return Number.isFinite(v) ? v : null;
}

/** The state text, or null when unset, missing, unavailable or unknown. */
export function textOf(states: HassEntities | undefined, id: MaybeId): string | null {
  const s = id ? states?.[id] : undefined;
  return isAvailable(s) ? s.state : null;
}

/** One attribute of an entity whatever its state is, or undefined when the entity or the attribute is missing. */
export function attributeOf(states: HassEntities | undefined, id: MaybeId, name: string): unknown {
  return id ? states?.[id]?.attributes[name] : undefined;
}

/** A text attribute, or null when it is missing or not text (a number is not read as its digits). */
export function textAttributeOf(states: HassEntities | undefined, id: MaybeId, name: string): string | null {
  const v = attributeOf(states, id, name);
  return typeof v === 'string' ? v : null;
}

/** A numeric attribute, or null when it is missing or not a finite number (a text such as `SW` is not one). */
export function numberAttributeOf(states: HassEntities | undefined, id: MaybeId, name: string): number | null {
  const v = attributeOf(states, id, name);
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
