# 0023: Commands with a compensating action, and one optimistic store per panel

Status: accepted (2026-11-10)

## Context

The legacy panel sends every control's service call with `call`, holds what the person asked for in a bag (`pending`) read by `pend`, and on a failure empties the whole bag: a dead TV also resets the thermostat's held setpoint. Every feature that moves needs the same three things, so they are written once in the kit. Two elements of one panel, the Home card's TV box and the pane's TV box, must agree at every instant, and an element's own controller cannot share a map with another element's.

## Decision

`Command` is the data of Gamma et al.'s **command**: the call, the toast for success (`done`), the optimistic keys it set (`holds`) and one `fallback` call. `CommandRunner` (`src/ui/commands.ts`) is its invoker and `PanelApi` the receiver, with a **compensating action** (Richardson, _Microservices Patterns_). An element makes one, handing it its `OptimisticController` and `t`, and takes the API from `apiContext`; `run(cmd)` sends, toasts, and on a rejection runs the fallback once. On a final failure it releases the command's own `holds` and dispatches a sticky toast worded by the catalog's `common.failed`. It reads no store, formats no string and never touches a key it did not set.

The held values are one `OverlayStore` (`src/ui/overlay-store.ts`), a plain observable class with the pure `overlay` rule (the legacy `pend`, string comparison and twenty seconds kept). The shell makes one per panel and provides it by `optimisticContext`, so two panels stay independent. `OptimisticController` is each element's subscriber: it subscribes in `hostConnected`, unsubscribes in `hostDisconnected`, updates its host on any change, and keeps one timer at the earliest expiry so an unconfirmed value visibly reverts at twenty seconds.

`<hp-switch>` is a controlled component: a tap says what it asks for and its owner sets `checked`, normally from the overlay. The legacy `call`, `pend` and `pending` stay for every control that has not moved, with the same twenty-second rule, until #263.

`common.failed` is English in French too, as the legacy layer leaves it; translating it is its own visible change and needs an approved baseline.

## Consequences

- A fix to the failure path is one fix, and a failed command no longer resets another control's held value.
- The Home card and the pane read one state.
- The runner is an invoker whose header bars the store, so the element hands it `t`.
- The two implementations coexist for a few releases, with the twenty seconds and the string comparison written twice; each copy names its ticket. `<hp-switch>` likewise copies the legacy `.sw` look, which the TV (#217, #218, #219), the light sheet (#262) and the Wallbox and precondition switches (#253) still draw, until #263 deletes the rules.

## Read

`docs/specs/16-media.md`, "Commands and the optimistic overlay"; Gamma et al., _Design Patterns_, Command; Richardson, _Microservices Patterns_, sagas and compensating transactions; ADR 0018.
