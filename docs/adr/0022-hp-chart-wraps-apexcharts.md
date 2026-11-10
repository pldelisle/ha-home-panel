# 0022: `<hp-chart>` wraps ApexCharts, and a feature's detail is its pane's

Status: accepted (2026-11-10)

## Context

The legacy class drew every chart with `base()`, `mk()` and a merge, into ids it looked up in the shared root. ADR 0006 promised a wrapper that hides the library, and the Weather detail (#158) is the first feature to need one. A chart in an element's own root is out of the French rewrite layer's sight, so its words must come from the catalog and the formatters. The kit may not import the legacy set, and the loader lived in `src/charts/`, which is in it. And the detail is also opened from the Home card, in another pane, where a sheet inside a hidden pane would be invisible.

## Decision

`<hp-chart>` (`src/ui/chart.ts`) is the one element that names the library. It takes `options` (the library's shape, no theme) and `height`; the base look comes from the host's computed tokens (`chart-options.ts`, pure). A change of `options` calls `updateOptions`; a change of theme, language or height makes a new instance, since colours and locale are read once; `destroy` runs on disconnect. A failed chunk load is one `ToastEvent` for all the charts that waited on it: a one-microtask latch, the kit's second piece of module state after the loader's promise (spec 10 allows both). Callbacks are built by the feature from `fmt` and `t` (`detailChartOptions`), not the library's English formats; on a French panel the element gives the library the language's month and day names, as the layer did.

The loader moves to the core (`src/core/apex.ts`), which takes `src/charts/` out of the legacy set.

A descriptor names its `detailSheet`. A tablet shows the detail inline in the pane; a phone opens it in `<hp-sheet>` over the screen. When another tab asks (the Home card), the shell keeps that pane in the page without a box of its own, so only its fixed sheet shows: the active tab is neither changed nor saved, and Escape, Close and focus return go through the sheet host. The pane owns the statistics cache and draws the detail only while it is on screen.

## Consequences

- A later feature composes `<hp-chart>` and a pure options function; swapping the library touches one element.
- Opening the detail again within fifteen minutes (the cache's time to live) is one request. The start passed to the cache is hour-aligned, which only makes the hit possible.
- A tooltip's day and hour read in the panel's own format (`Mon 4 pm`, `lun. 16 h`), where Apex wrote `Mon 4 PM` and `lun. 16:00`. A hover shows it, and so does the 24-hour chart's axis in every house with an hourly forecast.
- The kit carries the legacy `.tile`, `.inner`, `.two` and `.legend` rules now.
- The shell has a pane in the page behind a sheet: one more case for it to get right.

## Read

`docs/specs/15-weather.md`, "The elements"; ADR 0006, 0019 and 0021; Lit docs, _Lifecycle_.
