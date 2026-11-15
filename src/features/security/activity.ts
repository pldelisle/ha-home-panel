// activeOf and newlyActive: which sensors are on, and which of them turned on between two readings (the Home card's glow).
// Pattern: a pure rule over two snapshots (Bernhardt, functional core), the legacy `secWatch`'s test; the element holds the
// previous snapshot as its own state and does the timing, so the rule has no clock and no memory.
// Must not: read the clock, the DOM or the store, or count a sensor the previous reading did not know.
import type {SensorInputs} from '../../providers/door-motion.ts';

/** A reading of the sensors: each id, on or not. */
export type ActiveSnapshot = Readonly<Record<string, boolean>>;

/** The snapshot of these sensors, the element's `next`. */
export function activeOf(sensors: readonly SensorInputs[]): ActiveSnapshot {
  return Object.fromEntries(sensors.map(sensor => [sensor.id, sensor.on]));
}

/** The ids that are on now and were off before; an id the previous reading did not have (or the first reading) does not count. */
export function newlyActive(prev: ActiveSnapshot, next: ActiveSnapshot): string[] {
  return Object.keys(next).filter(id => next[id] && prev[id] === false);
}
