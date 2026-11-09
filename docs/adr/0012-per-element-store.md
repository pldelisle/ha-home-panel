# 0012: A per-element store with reference-equality change detection

Status: accepted (2026-11-09)

## Context

Everything one panel knows about its house lives in variables at module scope: the entity map, the rooms, the config, the `hass` object and the time zone. Two `<home-panel>` elements on one page overwrite each other, any function can change any of it, and every new `hass` object, which Home Assistant hands over on each state change in the house, redraws everything once a second whether or not anything it reads changed. Phase 3 needs something to subscribe to, and the rule "a thermostat change doesn't redraw the car" needs a way to say which entity ids changed. The alternatives were a module-level store (the globals again, with a nicer name), a deep comparison of every state (cost grows with the house), and handing the new `hass` to every card and letting each decide, which is what Home Assistant's own dashboard does.

## Decision

Each element creates its own store with `createStore({defaultTimeZone, resolve})`; nothing imports a store as a singleton and nothing at module scope in `src/core/` is mutable. The store holds the current `hass` and the resolved panel config, and exposes states, registries, user, time zone and language. `setHass` finds the changed entity ids by reference, the rule Home Assistant's frontend documents: a state object that is not the same reference as before (or is new) is in `ids`, and so is an id that is gone; one pass over the new states and one over the old, no deep comparison. Registries, locale and user are compared by reference or by value. Subscribers are indexed by entity id, with one set for the wildcard `'*'`, so notification costs the number of changed ids and their readers, not the number of subscribers. Notification is synchronous; a subscriber added or removed during a notification takes effect on the next one; throttling and scheduling stay the subscriber's business. The resolver of the panel config is injected, so the core does not import legacy code; the config is compared by its JSON text, `generation` is bumped on a change, and the first `hass` resolves it again against real states without a new generation. `PanelHass` types the subset of the frontend `hass` the panel uses, as an anti-corruption layer. The per-browser settings are a separate module behind a `Storage`-like parameter, with the `localStorage` keys and values unchanged. A shared fake `hass` serves every core test.

## Consequences

- A test hands the store `hass` objects shaped as Home Assistant hands them and asserts what a subscriber sees; it needs no browser, no mock socket and no private field. The core is at 100 percent statements in Vitest, enforced by a threshold.
- Two panels on one page can show two houses once the legacy globals are removed in the next two steps (migrate, contract).
- The measured cost, from `npm run bench` on one development machine (an arm64 laptop, Node 26, 5,000 entities, one changed state): about 1,400 `setHass` calls per second, 0.7 ms each, with 50 subscribers of 10 ids each, and the same without any subscriber. The walk over the states is the whole cost; the index adds nothing measurable, and what it buys is in the callbacks that are not called (one of the 50 subscribers is told, not all of them). A house of 5,000 entities is more than a household has. These numbers are a record, not a budget.
- The index has a price: a subscriber whose ids change must unsubscribe and resubscribe, because the sets are keyed by the ids it gave. A subscriber to `'*'` pays nothing for this but is told on every `hass`, which is what the legacy class needs to keep its timing.
- Change detection trusts Home Assistant's rule: a state object mutated in place is not seen. The harness and the fake `hass` produce new objects for new states, as Home Assistant does.
- A state that is rebuilt with equal content counts as changed. That is a redraw too many, never one too few.
- Derived data (a room's temperature, a total power) is not cached by the store. Memoised selectors over it are the next step, in the models layer of phase 3.
- Singletons are ruled out: a store is made by the element and handed to what needs it, which means one more argument in some signatures.
- The store is generic over the resolved config until spec 13 gives the config its type in the core. `src/core/index.ts` re-exports the core so that the orphan rule of ADR 0011 holds until the first importer lands; it goes when the importers do.

## Read

`docs/specs/10-entity-store.md`, "The store" and "Parallel Change: expand, migrate, contract".
