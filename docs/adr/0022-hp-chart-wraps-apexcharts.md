# 0022: `<hp-chart>` wraps ApexCharts, and a feature's detail is its pane's

Status: accepted (2026-11-10)

## Context

The legacy class drew every chart with `base()`, `mk()` and a merge, into ids it looked up in the shared root. ADR 0006 promised a wrapper that hides the library, and the Weather detail (#158) is the first feature to need one. Four forces bear on it. A chart in an element's own root is out of the French rewrite layer's sight, so its axis, tooltip and "no data" words must come from the catalog and the formatters. A chart redrawn at every change flickers, so a change of data should be an update. The kit may not import the legacy set, and the loader lived in `src/charts/`, which is in it. And the detail is also opened from the Home card, in another pane, where a sheet inside a hidden pane would be invisible.

## Decision

`<hp-chart>` (`src/ui/chart.ts`) is the one element that names the library. It takes `options` (the library's shape, no theme) and `height`; the base look comes from the host's computed tokens (`chart-options.ts`, pure). A change of `options` calls `updateOptions`; a change of theme, language or height makes a new instance, since colours and locale are read once; `destroy` runs on disconnect. A failed chunk load is one `ToastEvent` for all the charts that waited on it. Callbacks are built by the feature from `fmt` and `t` (`detailChartOptions`), not the library's English formats; on a French panel the element gives the library the language's month and day names, as the layer did.

The loader moves to the core (`src/core/apex.ts`), which takes `src/charts/` out of the legacy set; the class and the kit share one promise per page.

A descriptor names its `detailSheet`. A tablet shows the detail inline in the pane; a phone opens it in `<hp-sheet>` over the page, and when another tab asks (the Home card) the sheet host shows the pane behind it and returns to the first tab on close. The pane owns the statistics cache and draws the detail only while it is on screen, so a closed or hidden detail holds no chart, radar or request.

## Consequences

- A later feature draws a chart by composing `<hp-chart>` and a pure options function; swapping the library touches one element.
- Opening the detail twice within the hour is one request: the start passed to the cache is hour-aligned.
- A tooltip's day and hour read in the panel's own format (`Mon 4 pm`, `lun. 16 h`), where Apex wrote `Mon 4 PM` and `lun. 16:00`. Only a hover shows it.
- The kit carries the legacy `.tile`, `.inner`, `.two` and `.legend` rules now, so their place in the cascade moved; the baselines of every sheet that draws them check it.
- The sheet host knows a second kind of owner for a sheet and a tab to return to: one more case for it to get right.

## Read

`docs/specs/15-weather.md`, "The elements"; ADR 0006, 0019 and 0021; Lit docs, _Lifecycle_.
