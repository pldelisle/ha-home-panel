// The Air commands: what a tap on the purifier asks Home Assistant for, as `Command` data, and the typed names of the values it holds.
// Pattern: Command (Gamma et al.) built by pure functions; the kit's `CommandRunner` sends them, an element holds the value each
// `holds` key names in the panel's overlay store (ADR 0023). The rules are the legacy `airControl`'s, deleted in #234.
// The callers are `<hp-air-room>`: the mode radios send `setMode`, the debounced stepper `setSpeed`.
// Must not: send anything, read the store or the clock, or word a string (`done` is a catalog key, the runner words it).
import type {Command} from '../../ui/commands.ts';
import {overlayKey} from '../../ui/overlay-store.ts';

/** The overlay keys, one function per held value: a typo is a compile error, and the mode and the speed never share a key. */
export const K = {
  /** A purifier's mode: `Automagic` or `Manual`. */
  mode: overlayKey('mode'),
  /** A purifier's fan speed, in percent. */
  pct: overlayKey('pct'),
} as const;

/** The two modes Mila's purifier offers, as Home Assistant names its presets. */
export type Mode = 'Automagic' | 'Manual';

/** The slowest speed a tap sets: the legacy stepper never went under ten, and neither does a step from ten. */
export const MIN_PCT = 10;
export const MAX_PCT = 100;
/** The speed moves in steps of ten: the stepper's tap size. */
export const PCT_STEP = 10;

/** A speed as the purifier takes it: in steps of ten, from ten to a hundred. */
const speedOf = (pct: number): number => Math.min(MAX_PCT, Math.max(MIN_PCT, Math.round(pct / PCT_STEP) * PCT_STEP));

/** Sets the preset; the mode shows at once from the held value. */
export const setMode = (fan: string, mode: Mode, name: string): Command => ({
  domain: 'fan',
  service: 'set_preset_mode',
  data: {entity_id: fan, preset_mode: mode},
  holds: [K.mode(fan)],
  done: {key: 'air.modeSet', values: {name, mode}},
});

/** Sets the fan speed at `speedOf(pct)`; the element debounces it, so a burst of taps is one call. */
export function setSpeed(fan: string, pct: number, name: string): Command {
  const percentage = speedOf(pct);
  return {
    domain: 'fan',
    service: 'set_percentage',
    data: {entity_id: fan, percentage},
    holds: [K.pct(fan)],
    done: {key: 'air.fanSet', values: {name, pct: percentage}},
  };
}
