# 0034: The guest is gone: the shell draws the whole panel, and the legacy sheet becomes the frame's

Status: accepted (2026-11-17)

## Context

ADR 0016 made the legacy class the shell's guest: the old code kept drawing what had not moved, behind an interface that only shrank. Phase 3 moved the subjects one at a time (Weather, Media, Security, Air, Energy, Climate, Car, Live, Lights, Home, Automations, the idle clock). After the idle clock (#276) and Automations (#273), the guest drew nothing a household sees. It still did five jobs nobody had moved: it declared the fonts, turned the Mercury drop on (the `mc` class and its SVG filter), set `lang` on the frame, ran the French rewrite layer over the root, and worded the More sheet's lines under Energy and Security. Its sheet (`src/styles.js` joining `src/css/`) still held the frame's rules: the rail, the panes, the overlays, the glass and the motion.

`src/home-panel.js`, in lines: 8368 before the shell (#197), 8333 with it; 8320 at v2.13.0, 8344 at v2.14.0, 7049 at v2.14.1 and 6668 at v2.14.2. After each move on `main`: Weather 7049 (#213), Media 6668 (#311), Security 6278 (#318), Air 5791 (#326), Energy 5176 (#334), Climate 4011 (#341), Car 3201 (#356), Live 2743 (#360), Lights 1831 (#362), the stack 1233 (#364), Home 854 (#366), the header 562 (#367), the idle clock 392 (#370), Automations 353 (#273), and 0 here.

## Decision

The guest, its interface, its registration and its container are deleted (`src/home-panel.js`, `src/legacy/`, `src/types.d.ts`, `src/shell/guest.ts`, the sheet host's legacy half, `tsconfig.legacy.json`, `test/unit/methods.test.mjs`). The shell does the five jobs itself: `ensureFonts` (now `src/ui/fonts.ts`) when the frame first renders, `mc` from the appearance with the filter drawn once from `src/ui/lens.ts`, `lang` from the store's language, and the two More words as the Energy and Security descriptors' `summary` over catalog keys. The French layer is not run: every word on screen is a catalog key, so `src/i18n/fr.js` leaves the bundle and stays in the repository as phase 4's input, read by the equivalence tests.

The legacy sheet is not taken apart rule by rule. Its files move to `src/shell/frame/` and `src/styles.js` becomes `src/shell/frame-styles.ts`, in the same order: they are the frame's rules now, adopted by `<home-panel>` alone, and the one-rule-one-file test treats them as the frame's.

A new config or language still draws the frame anew (a fresh keyed wrap, the sheets and popups closed, the idle timer armed), in the order the properties were set, so the harness still draws twice and Home Assistant once (ADR 0016's replay). The filter now survives that redraw, which fixes #198.

## Consequences

- The legacy footprint is 0 modules; the lint prints it until the gate (#188) deletes the legacy set and the line. Nothing writes `innerHTML`.
- The entry is 796 158 bytes (237 073 gzipped) against 834 354 (251 280) before this change, mostly the French map leaving. At v2.13.0, before the shell, it was 516 011 (152 239): phase 3 bought typed elements, catalogs, Lit and the formatters with about 280 kB.
- The Mercury drop shows in the harness as it does in Home Assistant, so the 25 full-config baselines that recorded the glass without its filter must be re-recorded (the visual check is red until then).
- The frame's sheet still holds rules only one element or pane reads, and copies some elements keep of them; moving each to its owner is phase 4's tidying, not a step of this one.
- What the strangler fig cost: the guest interface and its replay, the Home-card bridge (ADR 0024, 0026, 0031), the legacy-to-providers allowance (ADR 0025), a known copy of each legacy rule an element needed, and the double draw the harness recorded. What it bought: `main` released after every move, and baselines that held each step to the pixel.

## Read

Fowler, _Strangler Fig Application_; ADR 0016; `docs/specs/26-idle-clock.md`, pull request 2.
