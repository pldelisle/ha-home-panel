# 0027: ApexCharts stays at 3.45.2 behind `<hp-chart>` through phase 3

Status: accepted (2026-11-15)

## Context

ADR 0006 froze ApexCharts and promised a wrapper that hides it; issue #84 deferred the question of a change until that wrapper existed. `<hp-chart>` has existed since spec 15 (ADR 0022), and Weather and Air already draw through it. The evidence of #84 and #36 stands:

- 3.45.2 (2024-01-21) is MIT, and the only advisory ever filed against `apexcharts`, GHSA-w46j-8hm6-h8mm (XSS), was fixed in 3.24.0.
- 3.54.1 (the last 3.x) and 5.0.0 (the last MIT release) are dead ends: no further MIT release follows, so a move trades one frozen version for another with no path forward.
- From 5.1.0 the licence is ApexCharts' own, a commercial question the owner has not taken.
- Charts appear in about 30 of the 81 baselines, and #36 found that even a patch release redraws them.

Phase 3 is pixel-identical by contract; a library change is the opposite.

## Decision

The panel stays on ApexCharts `3.45.2`, exact, behind `<hp-chart>`, through phase 3. It is revisited at the phase-3 gate (#188), and at once if an advisory appears against 3.45.2. Renovate's two rules stay: majors are disabled, and `allowedVersions` holds `3.45.2`; `dist.test.mjs` still asserts the version.

So that a later swap is one module, `<hp-chart>` keeps three things stable:

- **Options are plain data.** Pure functions build them (`detailChartOptions` in Weather's `history.ts`, `airChartOptions` and `outdoorChartOptions` in Air's, the kit's `chart-options.ts`, and Energy's `charts.ts` when it lands), and no feature builds, holds or calls an ApexCharts instance.
- **Callbacks take `fmt` and `t`.** Every formatter and word is built from the panel's formatters and catalog, never the library's own formats. There is no exception since #386: a time axis's ticks and a tooltip's date heading are written by the panel's `fmt` (`houseAxis` and `tooltipDate` in `chart-options.ts`), in English and in French alike, never from the library's pattern strings.
- **The element owns the instance.** For every feature it alone creates, updates and destroys it; the legacy panel's own charts (`loadApex` in `src/home-panel.js`) keep theirs until they move, and `core/apex.ts` is the only door to the library for both.

## Consequences

- The licence stays MIT, no baseline moves, and Energy's charts (spec 19) are drawn on the same terms as Weather's.
- ApexCharts fixes and features after 3.45.2 are not received; that costs nothing known while no advisory exists.
- A later change is a decision of its own: a licence review, about thirty baselines re-recorded (0004), a changeset and a visual check, in a new record that supersedes this one.
- The three rules are only a convention until a feature breaks one; a review catches it.

## Read

Issues #84 and #36; `docs/specs/19-energy.md`, "ApexCharts"; ADR 0006 and 0022.
