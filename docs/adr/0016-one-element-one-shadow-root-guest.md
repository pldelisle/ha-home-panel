# 0016: One element, one shadow root, and the legacy class as its guest

Status: accepted (2026-11-09)

## Context

Phase 3 moves the panel one feature at a time into Lit elements. Something that is neither the old class nor a feature must own the services, receive `hass` and give features a place to mount, while the old class draws the rest pixel for pixel. Until now the old class was the element, with its own root and services. The host could be an element inside an element, each with a root, or one element with one root. The stylesheet's selectors span the frame and the panes, the class looks up ids across the whole frame, and the French layer observes one root, so two roots would mean two copies of the sheet, a bridge for every id and two observers.

## Decision

`<home-panel>` is a `LitElement` in `src/shell/home-panel.ts`: the composition root (Seemann) and a humble object (Meszaros), with one shadow root. The old class becomes `LegacyPanel`, the guest: not an element, but an implementation of the `GuestRenderer` interface of `src/shell/guest.ts`, which only shrinks. It draws into `<div class="guest" style="display:contents">`, which has no box. Both sides keep one rule: **Lit binds nothing inside a guest container, and the guest writes nothing outside its containers.**

The shell never imports legacy code (ADR 0011). `src/main.js` calls `registerGuest(() => new LegacyPanel(), CSS)` before it defines the element, and the stylesheet travels with the guest because `src/styles.js` is legacy too. The shell adopts it once for every instance, instead of a `<style>` tag in each root.

The shell feeds the store and tells the guest in `updated`, replaying the changed properties in the order they were set, which Lit keeps. Home Assistant sets `panel` first, so the guest draws once with the config; the harness sets `hass` first, so it draws twice, once without the config. Each environment draws as the element did. The constructor seeds the store with the empty config, so a panel with no config is no change. The guest redraws only when `store.generation` advanced.

The harness baselines therefore record a double draw the real panel never does. A second draw wipes the Mercury-drop filter (`#glass-distortion`) that the guest appends to its container, so the baselines show the glass without it and a real Chromium tablet shows it. Fixing that changes pixels and is its own pull request with an approved baseline (#198).

## Consequences

- Selectors, id lookups and the observer keep working, because there is still one root.
- When the last move lands, the interface, the registration, the container and `src/shell/guest.ts` are deleted together.
- "Write only into your container" is held by convention and review, not by the platform.
- `registerGuest` is the shell's one piece of module state, and the element must be defined after it is called.

## Read

`docs/specs/14-lit-shell.md`, "The shape: one element, one shadow root, two renderers"; Fowler, _Strangler Fig Application_; Seemann, _Dependency Injection Principles, Practices, and Patterns_.
