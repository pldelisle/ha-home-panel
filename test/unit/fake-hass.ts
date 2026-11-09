// The one fake `hass` every core test shares: the object shape the e2e harness builds, from a short literal.
// Pattern: a fake at the hass seam (ADR 0005); `next` hands over a new hass the way Home Assistant does.
// Must not: grow behaviour beyond `calls` and `next`, which only record and replay what Home Assistant does; the API
// ticket extends callWS here.
import type {HassEntity, PanelHass} from '../../src/core/hass.ts';

export type FakeHass = PanelHass & {
  calls: {service: unknown[]; ws: unknown[]};
  next(patch: Record<string, Partial<HassEntity>>): FakeHass;
};

/** A state object as Home Assistant hands it over; the dates are fixed so two builds are equal. */
export function entity(id: string, state: string, attributes: Record<string, unknown> = {}): HassEntity {
  return {
    entity_id: id,
    state,
    attributes,
    last_changed: '2026-01-01T00:00:00+00:00',
    last_updated: '2026-01-01T00:00:00+00:00',
    context: {id: 'ctx', parent_id: null, user_id: null},
  };
}

/** A new hass the way Home Assistant makes one: new objects for the patched states, the same references for the rest. */
function build(base: PanelHass, calls: FakeHass['calls']): FakeHass {
  return {
    ...base,
    calls,
    next(patch) {
      const states = {...base.states};
      for (const [id, change] of Object.entries(patch)) {
        const prev = states[id] ?? entity(id, '');
        states[id] = {...prev, ...change, attributes: {...prev.attributes, ...change.attributes}};
      }
      return build({...base, states}, calls);
    },
  };
}

export function fakeHass(init: Partial<PanelHass> = {}): FakeHass {
  const calls: FakeHass['calls'] = {service: [], ws: []};
  return build(
    {
      states: {},
      config: {time_zone: 'America/Toronto', latitude: 43.65, longitude: -79.38, country: 'CA'},
      user: {name: 'Alex Example', is_admin: true},
      locale: {language: 'en'},
      callService: (domain, service, data) => {
        calls.service.push({domain, service, data});
        return Promise.resolve();
      },
      callWS: <T>(msg: {type: string}) => {
        calls.ws.push(msg);
        return Promise.resolve({} as T);
      },
      ...init,
    },
    calls,
  );
}
