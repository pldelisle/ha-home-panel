# 0024: The guest may place a feature element by its tag on the Home pane; the hidden Home TV card is deleted, not moved

Status: accepted (2026-11-11)

## Context

The shell takes over the Home pane last (ADR 0017, spec 24); until then the guest writes its markup. Media's scenes row (`#hscenes`) lives only there, and cannot stay in the legacy panel as Weather's `#hwx` did: its tiles act, and what a tap holds is in the panel's `OverlayStore` (ADR 0023), which the legacy panel cannot read. ADR 0016's rule (the guest writes nothing it does not own) needs a written exception.

Spec 16 planned a second use, `<hp-tv-card>` for the Home TV card (`#tv`). That card sits in `.cols`, which `setView()` has hidden for good since Tabs became the only view (1.16.0): no screen shows it, nothing moves it into a pane, and #218 deleted its command and listener.

## Decision

The **Home-card bridge**: the guest MAY write a feature element's tag into one of its containers, with no attribute but a static `id`, once per draw in `build()` and never in a redraw, so the element keeps what it holds. It MUST NOT set a property on the element, read inside it, or write anything else into the container. The element takes the store, the API client, the appearance and the optimistic store from context, through the shell's providers; the shell imports the feature's `index.ts`, so the element is defined before the guest draws.

The one event the guest hears is `hp-empty` (`EmptyEvent`, `{empty}`), for a container the legacy panel hid when it had nothing: its listener toggles `hidden`. `<hp-scene-tiles>` dispatches it because `renderScenes` hid `#hscenes` in a house with no scene and no mode. Toasts go to the shell, as from every element.

There is one use, `<hp-scene-tiles>` in `#hscenes`, listed in `src/shell/guest.ts`'s header and in the programme spec. The Home move (#268) deletes it, with the listener and the event, when its pane composes the element.

The hidden TV card is **deleted, not moved**: `#tv`, `renderTV`, `tvBox`, the `.tvbox` and `.tvctl` rules, the model's card-only fields and the French entries only it said. Spec 16's user story 6 is withdrawn.

## Consequences

- A feature's element sits on Home before Home moves, as a listed exception.
- The French observer sees nothing inside the element: every word is a catalog message.
- A `set('hscenes', …)` copied from `renderScenes` would recreate the element and lose its held state; only review enforces the rule.
- The row does not idle while Home is hidden: it draws again on the media ids and once a minute, where `renderScenes` returned off the Home tab. The cost is small; the Home move (spec 24) ends it when the pane gains `active`.
- ADR 0023's "the Home card and the pane read one state" has no second box left.

## Read

`docs/specs/16-media.md`, "The Home-card bridge"; ADR 0016; ADR 0017; Fowler, _Strangler Fig Application_.
