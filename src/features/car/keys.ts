// The Car overlay keys: one function per held value, so the controls' view reads a held current, switch or lock under the same typed name the commands hold it by.
// Pattern: typed keys over the optimistic overlay (ADR 0023), as Climate's `K`; a key is the entity's id and a suffix no other kind shares. The charging switch's key is the provider's
// (`pauseHold`), since the live pill's "Pause charging" holds it too.
// Must not: hold a value, read the store or the clock, or name an entity id (the caller gives it).
import {overlayKey} from '../../core/overlay-key.ts';

export const K = {
  /** The Wallbox's current limit, by its `number` entity's id. */
  amps: overlayKey('amps'),
  /** The charger's lock, by its id. */
  chargerLock: overlayKey('charger-lock'),
  /** The car's door lock, by its id. */
  doorLock: overlayKey('door-lock'),
  /** The remote start's switch (the ignition), by its id. */
  ignition: overlayKey('ignition'),
  /** One of the three heaters' switches, by its id. */
  heater: overlayKey('heater'),
  /** The departure times' switch, by its id. */
  dep: overlayKey('dep'),
} as const;
