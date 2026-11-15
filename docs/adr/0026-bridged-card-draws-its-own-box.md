# 0026: A card placed through the Home-card bridge draws its own box, and asks for a tab by an event

Status: accepted (2026-11-15)

## Context

ADR 0024 let the guest place `<hp-scene-tiles>` in `#hscenes`, a container that carries no box: each tile is an item of the guest's grid. The Security card is the second use and differs twice. Its container `#hsec` was a `.card` that drew the box (padding, glass, shadow) and the attention glow, so a shadow root cannot style it; and its header opens another tab, which the guest used to do from its click listener on `[data-pane]`, a listener that cannot see into the card. ADR 0024 says there is one use and that the guest hears one event.

## Decision

**A card placed through the bridge draws its own box on an inner element, and its container takes none**: `#hsec` has no `.card` and is `display: contents`, so the card's box is the item of the guest's grid, as the legacy card was. The glass sits on the inner box and not on the host, because a backdrop filter's lens is looked up from the root of the element that has it (the camera card's rule, #224).

**A card asks the shell for a tab with `tab-select`** (`{key}`, bubbling and composed), the event the More sheet sends. The shell's frame, `.app`, hears it for the sheet and for any card, and closes the More sheet if it is open before it shows the tab. The guest hears nothing new: `hp-empty` stays the one event it listens for, and a card that never hides, as this one, does not send it.

ADR 0024's rest stands: the tag is written once a draw, with no property, and the Home move (#268) deletes every use. The bridge's uses are listed in `src/shell/guest.ts`'s header.

## Consequences

- A second card can follow (Air, Energy) with its container emptied of its box the same way, and a card header that switches tabs needs no guest code.
- The card copies the rules it drew from the legacy sheet (`.card` as `.seccard`, `.go` as `.chev`, `.hint` as `.nosens`, `.lbl`, `.sic`), each named in its file; the Home move deletes the copies.
- The shell's frame listens for `tab-select` from anywhere inside it, so a future element that sends it is heard without a registration.
- A change to the legacy `.card` look no longer reaches this card: the two are the same pixels by the baselines, not by one rule.

## Read

`docs/specs/17-security.md`, "The Home card"; ADR 0024; ADR 0019; Lit docs, Events.
