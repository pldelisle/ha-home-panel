# 0029: `<hp-chart>` draws a new chart when its shape changes, and only into a place that has a width

Status: accepted (2026-11-15)

## Context

ADR 0027 keeps ApexCharts behind `<hp-chart>`: the options are plain data, and the element owns the instance, updating it with `updateOptions` when `options` changes and making a new one only for the theme, the language or the height. Energy's detail (#240) showed two cases that rule did not cover.

- **A chart that changes in kind.** The main chart is bars on a time axis for Today and Week and bars on categories for Month and Year. The library merges new options into the ones it holds, so a key one kind sets and the next does not (the axis' type, its label formatter) stays: Month, after Today, kept the datetime axis and drew empty labels. The legacy panel made a new chart at each range and never saw this; Weather and Air never change kind.
- **A chart made where nothing has a width.** A pane or a sheet not shown yet has a zero-width place, and the library wrote `NaN` into the bars (a console error, found by `chunks.spec.ts` after a language change).

## Decision

**`<hp-chart>` has a public `shape` property: a string naming the kind of chart the options describe.** A change of `shape` draws a new instance, as a change of theme, language or height does; any other change of `options` stays an `updateOptions`. An owner whose options change only in data leaves `shape` empty and is unchanged. Energy passes the range.

**The first draw waits for a width.** If the chart's place has none when it would draw, `<hp-chart>` observes it with a `ResizeObserver` and draws, once, when it has one; a new update, a disconnect or a dispose cancels the wait. No owner has to know when its pane is shown.

Both rules live in the element: options stay plain data and never carry an instance, so the swap of ADR 0027 is still one module.

## Consequences

- A range tap on Energy makes a new chart, with the library's draw animation, as the legacy panel's did; it asks the recorder for nothing.
- A chart in a closed sheet or a hidden pane costs no draw until it is shown, which also spares the work.
- Resizing the window under a mounted chart still throws `NaN` as the pane leaves (#333); this ADR does not fix it.
- The harness proves both rules (`energy.spec.ts`, `chunks.spec.ts`); no Lit element is mounted in Node (ADR 0005).

## Read

ADR 0022; ADR 0027; `docs/specs/19-energy.md`, "As built in #240"; Lit docs, Reactive properties.
