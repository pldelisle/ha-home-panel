# 0019: Elements get their own shadow roots and adopt the kit's sheets, and a rule lives in one file

Status: accepted (2026-11-09)

## Context

ADR 0016 keeps one shadow root for the frame and the guest, because the legacy sheet's selectors span the frame and the panes. An element of the new layers is better off in a root of its own. Its styles cannot leak out. The French rewrite layer's observer, which watches the shell's root, cannot see inside it: a `MutationObserver` on a root reports nothing from a nested shadow root (checked in Chromium on 2026-11-09), so an element renders French from the catalog.

The cost is that the legacy sheet's rules stop at the boundary. `.app.cp .sheet` has no `.app` to match. A descendant selector cannot cross into a nested root (`.wrap span` left a span inside one black). `@keyframes` named by a rule in a root must be defined in that root: an animation naming keyframes of the outer sheet did not run. Custom properties do inherit. Copying the rules would leave two versions of each; rewriting them all into `:host` form would take the glass look from the guest's own `.stile` tiles.

## Decision

The kit's rules live in `src/ui/styles/`, one rule in one file. `src/styles.js` joins those files, as written, into the legacy sheet, each in the cascade position its rules held. An element adopts the same text through `forShadow` (`src/ui/styles/host.ts`), which changes only the frame's prefix: `.app.cp` is `:host([compact])`, `.app.gl` is `:host([glass])`, and `narrow` and `txl` follow. That is the one allowed rewrite. `AppearanceConsumer` reflects `data-theme`, `compact`, `narrow`, `glass` and `large-text` on the host, from the context of ADR 0018. A state with no host attribute makes `forShadow` throw.

One rule was written again by hand, because a descendant selector cannot cross a root: `.morelist .stile` is `.stile.list`. `tokens.css` is joined into the legacy sheet and adopted by no element, since values arrive by inheritance. `test/unit/styles-split.test.mjs` fails when a selector of a new layer is written in a second file, or a kit file is missing from `src/styles.js`.

Elements send events up and receive properties down (Lit docs, _Events_): `tile-open`, `tab-select`, `sheet-close`. Their words are catalog messages.

## Consequences

- Elements are pixel identical to what they replace: the baselines and a comparison of every computed style before and after show it.
- The legacy sheet carries rules only an element reads (`.stile.list`, `.morelist`) until the guest goes.
- `.app.tabsv.cp` becomes `:host([compact])`, one class lighter. No rule relied on that margin.
- Moving a rule to another file can reorder the cascade, so the order in `src/styles.js` is part of the contract.
- A new frame state needs a host attribute, a line in `host.ts` and one in `AppearanceConsumer`.

## Read

`docs/specs/14-lit-shell.md`, "The UI kit's shared sheets and the one-source rule for CSS"; Lit docs, _Styles_ and _Events_; the CSS Scoping Module (tree-scoped names).
