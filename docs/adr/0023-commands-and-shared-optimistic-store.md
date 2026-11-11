# 0023: Commands with a compensating action, and one optimistic store per panel

Status: accepted (2026-11-10)

## Context

The legacy panel sends every control's service call with `call`, holds what the person asked for in a bag (`pending`) read by `pend`, and on a failure empties the whole bag: a dead TV also resets the thermostat's held setpoint. Every feature that moves out of the class needs the same three things, so they are written once in the kit. Two elements of one panel, the Home card's TV box and the pane's TV box, must agree at every instant, and an element's own controller cannot share a map with another element's.

## Decision

`runCommand` (`src/ui/commands.ts`) is the **command** of Gamma et al. with a **compensating action** (Richardson, _Microservices Patterns_). A `Command` is data: the call, the toast for success (`done`), the optimistic keys it set (`holds`) and one `fallback` call. It sends, toasts, and on a rejection runs the fallback once; on a final failure it releases its own `holds` and dispatches a sticky toast worded by the catalog's `common.failed`. It reads no store, formats no string (the caller hands over `t`) and never touches a key it did not set.

The held values are one `OverlayStore` (`src/ui/overlay-store.ts`), a plain observable class with the pure `overlay` rule: the legacy `pend`, string comparison kept, twenty seconds. The shell makes one per panel and provides it by `optimisticContext`, so two panels stay independent. `OptimisticController` is each element's subscriber: it subscribes in `hostConnected`, unsubscribes in `hostDisconnected`, updates its host on any change, and keeps one timer at the earliest expiry so an unconfirmed value visibly reverts at twenty seconds.

`<hp-switch>` is the first element of the layer. It is a controlled component: a tap says what it asks for and its owner sets `checked`, normally from the overlay.

The legacy `call`, `pend` and `pending` stay for every control that has not moved; both implementations use the same twenty-second rule until the last user moves (#263).

## Consequences

- A fix to the failure path is one fix, and a failed command no longer resets another control's held value.
- The Home card and the pane read one state, which was the reason the legacy bag could not simply be a controller's map.
- A test needs no DOM: a fake host, a fake clock and a store.
- `runCommand` takes `t` as an argument, one more parameter than the spec first wrote, because the kit may not read the panel's store.
- The two implementations coexist for a few releases, with the twenty seconds and the string comparison written twice; each copy names the ticket that deletes it. `<hp-switch>` likewise copies the legacy `.sw` look until the last `.sw` button goes.

## Read

`docs/specs/16-media.md`, "Commands and the optimistic overlay"; Gamma et al., _Design Patterns_, Command; Richardson, _Microservices Patterns_, sagas and compensating transactions; ADR 0018.
