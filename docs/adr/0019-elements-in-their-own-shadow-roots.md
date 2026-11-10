# 0019: Elements get their own shadow roots and adopt the kit's sheets, and a rule lives in one file

Status: accepted (2026-11-09)

## Context

ADR 0016 keeps one shadow root for the frame and the guest, because the legacy sheet's selectors span the frame and the panes. An element of the new layers is better in a root of its own: its styles cannot leak out, and the French rewrite layer's observer, which watches the shell's root, cannot see inside it (a `MutationObserver` on a root reports nothing from a nested one; checked in Chromium on 2026-11-09), so an element renders French from the catalog.

The cost is that the legacy sheet's rules stop at the boundary. `.app.cp .sheet` has no `.app` to match. A descendant selector cannot cross into a nested root. `@keyframes` named by a rule in a root must be defined in that root: an animation naming outer keyframes did not run. Custom properties do inherit. Copying the rules would leave two versions of each, and writing them in `:host` form would take the glass look from the guest's `.stile` tiles.

## Decision

The kit's rules live in `src/ui/styles/`, one rule in one file. `src/styles.js` joins those files, as written, into the legacy sheet, each at the position its first rule held; a rule that followed it in a later legacy file moves up to it, which the computed-style comparison checked. An element adopts the same text through `forShadow` (`src/ui/styles/host.ts`), which changes only the frame's prefix: `.app.cp` is `:host([compact])`, `.app.gl` is `:host([glass])`, and `narrow` and `txl` follow. That is the one allowed rewrite of a rule. `AppearanceConsumer` reflects `data-theme`, `compact`, `narrow`, `glass` and `large-text` on the host (ADR 0018); another frame state makes `forShadow` throw.

One rule was written again by hand, because a descendant selector cannot cross a root: `.morelist .stile` is `.stile.list`. `tokens.css` is joined into the legacy sheet and adopted by no element, since values arrive by inheritance. `src/styles.js` imports the kit's CSS, the one exception to ADR 0011's legacy rule, written as `KIT_STYLES` in `.dependency-cruiser.cjs`. `test/unit/styles-split.test.mjs` fails when a selector of a new layer is written in a second file, or a kit file is missing from `src/styles.js`.

Elements send events up (`tile-open`, `tab-select`, `sheet-close`) and receive properties down (Lit docs, _Events_). Their words are catalog messages.

## Consequences

- Elements are pixel identical to what they replace: the baselines and a comparison of computed styles before and after show it.
- The legacy sheet carries rules only an element reads (`.stile.list`, `.morelist`) until the guest goes.
- `.app.tabsv.cp` becomes `:host([compact])`, one class lighter. No rule relied on that margin.
- The order in `src/styles.js` is part of the contract. A new frame state needs a host attribute, a line in `host.ts` and one in `AppearanceConsumer`.

## Read

`docs/specs/14-lit-shell.md`, "The UI kit's shared sheets and the one-source rule for CSS"; Lit docs, _Styles_ and _Events_; the CSS Scoping Module (tree-scoped names); `docs/architecture.md`, section 1, the dependency rule.
