# 0017: A registry of feature descriptors draws the frame, and what mixes features is composed at the root

Status: accepted (2026-11-09)

## Context

The rail, the phone's bar, the More list and the pane headings were written in several lists of the old class (`TABS`, `PHONE_TABS`, `TAB_COLOR`, `renderTabs`, `gateTabs`), so adding a subject meant editing each. Phase 3 moves one subject at a time into a folder of its own, so one place must list the subjects and draw the frame while the guest still draws most panes. Home and the idle screen show cards of several subjects, and under ADR 0011 a feature never imports another.

## Decision

`src/shell/features.ts` is a registry (Fowler, _Patterns of Enterprise Application Architecture_) of plug-ins: ten `FeatureDescriptor`s in rail order, each with a key, a title and short title as message keys, an icon, a colour token, whether it sits on the phone's bar, an optional `available` and `summary`, and a `pane()` that returns a template. The shell draws the rail, the bar and one `<section>` per descriptor. A subject the guest still draws is built by `legacyFeature(key, parts)`: the pane header and the host containers the guest fills, as markup Lit parses once and never touches. A move replaces that line with the feature's descriptor.

The shell owns `tab`, `compact` and which tabs the house shows. The guest answers about the house through `availability()`; a tab the house hides gives way to Home. A pane's element is told through an `active` property whether it is shown, and pauses its `StoreController` when it is not.

Home and the idle screen are not features but shell modules that import feature cards and lay them out. The rule: compose at the root; a reading two features share goes down into a provider; a drawing they share goes down into the kit.

The descriptor's type lives in `src/shell/feature.ts`, apart from the registry, because the registry imports `legacy-feature.ts`, which needs the type, and a cycle fails `npm run lint`. The contexts of ADR 0018 moved from `src/shell/contexts.ts` to `src/ui/contexts.ts`, because the kit's `StoreController` consumes them and the kit may not import the shell.

## Consequences

- Adding a subject is one folder and one line.
- A descriptor reads the guest through an `env` argument, since the registry is shared by every panel and the guest belongs to one.
- The first feature move must put `FeatureDescriptor` in the kit, since a feature may not import the shell.
- Composition at the root puts Home's layout in the shell, the layer that may import everything; a feature never imports a neighbour.
- When the guest rebuilds (a new language or config) it asks the shell to render the frame again at once, so it finds new elements, as it did when it wrote them itself. Lit has no public synchronous render, so the shell calls `performUpdate()`.

## Read

`docs/specs/14-lit-shell.md`, "The registry and the frame"; Fowler, _Patterns of Enterprise Application Architecture_.
