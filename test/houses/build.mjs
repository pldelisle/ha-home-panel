// How a test house is written down: a builder that collects states and registry rows into plain objects.
// Pattern: builder (Gamma et al.), kept to the one job of shaping data; what comes out is a plain object any reader can walk.
// Must not: resolve a time marker, read a clock, or touch the DOM; a house module imports this, clock.mjs and, for the full house, the bare house it extends; nothing else.
import {fromNow} from './clock.mjs';

/** One state as Home Assistant hands it over; the two dates are markers, resolved by whoever reads the house. */
export function stateOf(id, state, attributes = {}) {
  return {
    entity_id: id,
    // a marker stays a marker: a state that is itself a time ("sensor.sun_next_setting") is resolved by the reader
    state: state !== null && typeof state === 'object' ? state : String(state),
    attributes: {friendly_name: id.split('.')[1].replaceAll('_', ' '), ...attributes},
    last_changed: fromNow(-3600e3),
    last_updated: fromNow(-60e3),
  };
}

/**
 * A builder over `seed` (another house's data is copied, never shared): `add` puts a state in, with its entity registry row
 * and device row when given; `data` is the four plain objects a house exports.
 */
export function builder(seed = {}) {
  const data = {
    states: {...seed.states},
    entities: {...seed.entities},
    devices: {...seed.devices},
    areas: structuredClone(seed.areas ?? {}),
  };
  return {
    data,
    add(id, state, attributes = {}, reg = null, dev = null) {
      data.states[id] = stateOf(id, state, attributes);
      if (reg) data.entities[id] = {entity_id: id, ...reg};
      if (dev) data.devices[dev.id] = dev;
    },
  };
}
