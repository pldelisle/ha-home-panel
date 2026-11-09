# 0014: One typed API client is the only caller of Home Assistant's WebSocket

Status: accepted (2026-11-09)

## Context

The panel built WebSocket messages by hand at fourteen sites in the class and the Automations module, and read each reply by guessing its shape (`y.lu || y.lc`, `r.value`, `(rs || []).find`). A field renamed in a Home Assistant release was `undefined` on the tablet and nothing in the build knew. A reply that arrived after the panel's config changed was dropped in two different ways (a config key compared in `loadHistory`, a `Symbol` in the sensor sheet) and not at all by the two history caches. The harness mirrored every message in a chain of ternaries with no type saying what a reply looks like. In the reading list's words, there was no port: `hass.callWS` was reached from everywhere, so Home Assistant's wire format was the panel's format. The alternatives were typed helper functions beside each feature (the wire spread over the features, one lint rule per helper), a wrapper that also caches and retries (policy callers would then have to configure), and a library that owns the socket (the panel receives `hass` from the frontend; it does not open a connection).

## Decision

One module, `src/core/api.ts`, is the panel's port to Home Assistant (Cockburn) and its gateway (Fowler): a method per message the panel sends, with a typed reply, and nothing else in `src/` calls `callWS`, `callService`, `subscribeMessage` or `subscribeEvents`. An ESLint `no-restricted-syntax` rule fails the build if it does. `hass` is the production adapter at the port and the fake `hass` of the unit tests and the harness is the second, which is what makes the seam real.

## Consequences

The rest of the client's shape follows from its being the one door.

- Because the wire is read in one place, it is read there into the panel's own types, an anti-corruption layer (Evans): in `src/core/ha.ts`, seconds and ISO strings become milliseconds and the minimal and the full history shapes become one `HistoryPoint`, so no caller parses a wire shape. Field names stay the wire's where the panel reads them as they are (`item_id`, `run_id`, `light_order`, `precipitation_probability`): the types say what the panel reads, they do not rename it. A change in Home Assistant's message is fixed in one place, and a wrong field name is a type error.
- Because every read passes through it, one rule replaces the four ad-hoc stale guards: a read carries the store's config generation and rejects with a typed `StaleReply`, an `Error` subclass holding both generations, when the config changed before the reply arrived (a read whose answer does not depend on the config, the system data, opts out with `{stale: false}`); writes and subscriptions never do, because a save is a save and the class tears its subscriptions down itself. A dropped reply is distinguishable from a network error and from "no reply": the illegal state "an old reply was used" cannot be written by forgetting a check. The price is that a caller must decide what to do with a `StaleReply`; one that does not care keeps working with `.catch(() => ({}))`, and one that does must not swallow it by accident.
- A test asserts the message that left and the value that came back, with the fake `hass`, and needs no browser or mock socket.
- Every call site loses the freedom to send a message the client has no method for; a new message means a new method, a type and a test. The client is one file of about two hundred lines and splits by domain when it grows.
- The client reads what the panel reads, not Home Assistant's whole schema; a field the panel starts to read is added to the type and to the reader together.
- The door does no caching, no retrying and no batching: those are policies for the models and the shell of phase 3, and a deep module hides complexity its callers need without taking on policy they would then have to configure. The class's own caches and the ten-minute rule stay where they are until the Climate and Weather moves put them in models.
- The method that calls a service is named `runService`, not `callService`, so the textual grep and the lint rule can both say "no `callService(` outside the client".
- Types are imported from `home-assistant-js-websocket` with `import type` only, so none of its code ships and `LICENSES.md` is unchanged.
- A future `Unavailable` (Home Assistant disconnected) would be a sibling of `StaleReply`, not a `null`.

## Read

`docs/specs/12-api-client.md`, "The client" and "The lint rule".
