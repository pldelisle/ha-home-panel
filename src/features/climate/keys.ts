// The Climate overlay keys: one function per held value, so the model reads a held setpoint, mode or fan under the same typed name the commands hold it by.
// Pattern: typed keys over the optimistic overlay (ADR 0023), as Air's `K`; a key is the entity's id and a suffix no other kind shares.
// The model (model.ts) reads these, and the commands (commands.ts) name the same ones in their `holds`.
// Must not: hold a value, read the store or the clock, or name an entity id (the caller gives it).
import {overlayKey} from '../../core/overlay-key.ts';

export const K = {
  /** A room's setpoint, by its thermostat's id. */
  sp: overlayKey('sp'),
  /** The heat pump's settings, by its id. */
  hp: {
    mode: overlayKey('hp-mode'),
    sp: overlayKey('hp-sp'),
    fan: overlayKey('hp-fan'),
    preset: overlayKey('hp-preset'),
    swing: overlayKey('hp-swing'),
    swingHorizontal: overlayKey('hp-swing-h'),
  },
} as const;
