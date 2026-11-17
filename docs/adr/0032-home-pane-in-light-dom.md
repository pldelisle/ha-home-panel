# 0032: The Home pane and its configuration card draw in the shell's light DOM

Status: accepted (2026-11-17)

## Context

ADR 0019 gives every element its own shadow root. The Home pane (#268) is the shell's composition of the features' cards, and it lays them out as items of the `.pane-home` grid that the shell's frame draws, with the phone reordering them (`order: -2` and `-1`). A shadow root around them would take them out of that grid unless every rule moved behind `:host` and `::slotted`, and `config-error.spec.ts`, which the ticket keeps unchanged, finds the configuration card and the Home card with `querySelector` inside `#pane-home`, which does not cross a shadow root. The configuration card is one `aside`, styled by rules the legacy sheet held.

## Decision

**`<hp-home-pane>` and `<hp-config-card>` render into their own host (`createRenderRoot() { return this; }`)**, inside the shell's root. The pane's host is `display: contents`, so its header and its parts stay items of the `.pane-home` grid, as the legacy hosts were. Their rules are one non-element stylesheet, `src/shell/home-pane.css`, which the shell adopts after the legacy sheet (`static styles`); the dependency rule keeps the legacy `src/styles.js` from importing it. Every other element of the pane (the weather card, the tiles, Who's home, the stack, the Security card, the scenes) keeps its shadow root and its `*.element.css`. Nothing else may draw in light DOM without a record of its own.

## Consequences

- The pane's ids (`#hwx`, `#htiles`, `#hsec`, `#hscenes`, `#hstk`, `#cfgerr`) and the guest's `#hsub` are where they were, and the end-to-end specs that name them are unchanged.
- The French rewrite layer sees the pane's light DOM; it holds only elements and the catalog's French, and the configuration card keeps `translate="no"`.
- A rule of home-pane.css shares the shell's root with the legacy sheet, so the one-rule-one-file check guards it against a second copy there.
- The light DOM leaves with the shell's own root rules when the guest goes (#277); a later record may move the pane behind a shadow root then.

## Read

ADR 0017; ADR 0019; ADR 0024; ADR 0031; `docs/specs/24-home.md`, "As built in #268".
