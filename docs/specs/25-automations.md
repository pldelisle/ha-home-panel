# Spec 25: Automations, the tenth move: traces and configs through the API client, a pure graph, Mermaid behind a mount module, and the first whole file to leave the legacy set

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 3.
Depends on: [15 Weather](15-weather.md) (the recipe, `<hp-range-tabs>` is not needed; `<hp-chart>` is not either), [17 Security](17-security.md) (the mount-module shape for a third-party element), [24 Home](24-home.md) (the Home pane's "Coming up" list reads `upcomingRuns` from this feature's provider-level module, so it lands before the Home move is complete; see the folder). Blocks: 26 Idle clock.
Ships as: three pull requests, each a patch release, each pixel-identical. ADR 0026 (Mermaid 12, closing #82) lands with the third.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

Automations is the one feature that already lives in its own file, `src/auto.js` (1,172 lines), mixed into the class as `autoMethods` (`Object.assign(HomePanel.prototype, autoMethods)` in `src/home-panel.js`). It reads nothing from the house but the `automation.*` states and everything else from Home Assistant's own records through the API client (spec 12): `traceList('automation')`, `traceGet(domain, item, run)`, `automationConfig(entity)`. In it:

- **Loading** (`auLoad`, ~712): the trace list every twenty seconds at most, each automation's config every ten minutes, the traces the cards need; `auSig` (a state fingerprint that schedules a reload 1.5 s after a change), `auBusy`, `auErr`, `auAt`, `auCfgAt`.
- **Rules**: `auAutos` (the automations from the states), `auNoise` (time-pattern re-checks that found nothing to do are hidden), `auPicks` (the four cards: selected, running now, last decision, last completed), `auUpcoming` (today's remaining `time` and `sun` triggers), `auMins`, `auElapsed`.
- **The graph** (`auGraph`, ~378, 240 lines): the automation's config and its trace folded into nodes and edges with a class per node (hit, off, no, run, stop) and a time under each step; `auMermaid` (~620): the Mermaid definition with the `classDef`s from the tokens and the escaping rules that keep Home Assistant's text from being read as entities, directives or formulas (the `;` pre-pass bug of #97); `auTrig`, `auCond`, `auAct` (a sentence per trigger, condition and action from `AU_DOMAIN` and `AU_VERB`), `auName`, `auKind`, `auState`, `auTemplate`.
- **Drawing** (`renderAuto`, ~817, 200 lines): the sub-line, the Today timeline (one dot per run, grouped when close, two label rows, the scheduled ones hollow, the now line, the hour marks), the three tiles, the flow cards (selected with its run picker, running now, last decision, last completed) each with a pill, a legend and a graph box, the "Every automation" chips; `auDraw` (~1029: Mermaid loaded lazily, `initialize` once per theme with `handDrawnSeed: 1` for repeatable outlines, `render` per definition with a cache, the SVG into the box); `auDecorate` (~1100: the SVG sized to the box or scrollable, arrowheads in the edge's colour from the `linkStyle` lines, the `au-*` classes); the `data-au`, `data-run` and `.close` listeners in `wire()`.
- Deferred here: **#82**, Mermaid 12 (a 79,050-pixel change per Automations baseline with the compatibility switches, a redesign under its defaults).

`automations.spec.ts` (two cases about labels drawn as typed) and the `auto-tablet-*` and `bare-auto-*` baselines are the proof; `auGraph`'s folding and the escaping have no unit test, which is where the bugs of #97 were.

## Solution

Move Automations into `src/features/automations/`, in three pull requests:

1. **The rules and the graph, pure.** `traces.ts` (the list, the noise rule, the picks, the upcoming runs, the fingerprint), `graph.ts` (`automationGraph(config, trace, summary, deps)` → nodes and edges with classes and times), `sentences.ts` (the trigger, condition and action phrases through keys), `mermaid-def.ts` (`toMermaid(graph, tokens)` with the escaping rules, each a named function with a test from #97's cases); `src/providers/automations.ts` exports `upcomingRuns(configs, automations, now, fmt)` for the Home pane's "Coming up" list (the one read another composition needs). `src/auto.js` keeps drawing from the new modules (it imports the feature's pure files: legacy importing a feature's pure module is a second, temporary allowance recorded in the pull request, deleted in pull request 2).
2. **The elements.** `<hp-automations-pane>`, `<hp-run-timeline>` (the Today card from a pure layout), `<hp-flow-card>` with `mountFlow(box, def, theme)` (the Mermaid mount module: load, initialize per theme, render with a cache, decorate), `<hp-automation-chips>`; the loader as a reactive controller through the API client with the twenty-second and ten-minute rules; `src/auto.js` is deleted and leaves the legacy set, the first whole file to go: the footprint drops.
3. **Mermaid 12 (ADR 0026).** The library moves to 12.x behind `mountFlow` with `layout: 'dagre', look: 'classic'` and the panel's `classDef`s restyled to today's look as far as the options allow; the four `auto-tablet-*` baselines are re-recorded as an **approved visual change** in this pull request, with the before-and-after images in the description; the `katex` override and the Renovate rules go; `chunks.spec.ts` asserts no `elk-*` chunk is fetched.

Pull requests 1 and 2 leave every baseline identical; pull request 3 changes the four Automations baselines deliberately, as #82 planned.

## User Stories

1. As a household member, I want the Automations tab, its timeline, its flow cards and its chips to look and work exactly as before through the first two releases, so that the move is invisible.
2. As a household member, I want the flows in the third release to keep their colours and reading order (the path taken green, the step waited on amber, a failed check red, the rest dashed), with a look the owner approved, so that a library bump is not a surprise.
3. As an admin, I want the tab to say when Home Assistant refused the traces (a non-admin account), as today.
4. As a French-speaking user, I want every Automations string in French from the first paint, including the sentences the graph writes, so that the catalog is as good as the rewrite layer was.
5. As a maintainer, I want the config-and-trace folding as a pure function tested with recorded traces (a run, a stopped run, a running one, a choose, a wait, a repeat), so that the hardest rule in the panel is pinned before Mermaid changes.
6. As a maintainer, I want the Mermaid escaping as named functions with the #97 cases as tests, so that "drawn as typed" is a unit fact and the two Playwright cases become checks of the mount.
7. As a maintainer, I want Mermaid behind a mount module that knows only "load, initialize, render, decorate", so that the version change of the third release touches one file and the baselines.
8. As a maintainer, I want `src/auto.js` deleted and the footprint printed by `npm run lint` to drop by one, so that the number says what it says.
9. As a maintainer, I want the Home pane's "Coming up" to read the upcoming runs from a module below the features, so that the dependency rule holds when Home composes.
10. As a learner, I want ADR 0026 to record the Mermaid decision with its measurements and the reason it was not done earlier, so that the next library question follows the same path.

## Implementation Decisions

### The folder

```
src/providers/
  automations.ts           automationsOf(states, names): Automation[]; upcomingRuns(configs, automations, now, sun): Upcoming[] (the Home pane's reader)
src/features/automations/
  README.md
  index.ts                 automationsFeature
  ids.ts                   automationIds(store): every automation.*, sun.sun and the two sun sensors
  traces.ts                isNoise(summary, config), picks(list, selection), fingerprint(automations), todayRuns(list, midnight, noise)
  graph.ts                 automationGraph(config, trace, summary, deps): Graph {nodes, edges, sentence}
  sentences.ts             triggerText, conditionText, actionText, kindOf, nameOf (AU_DOMAIN, AU_VERB as key maps)
  mermaid-def.ts           toMermaid(graph, tokens): string; escapeLabel, protectEntities, protectPercent, splitDollars (the #97 rules)
  timeline-layout.ts       timelineLayout(dots, widthPx, now): groups with x, rows, classes, descriptions
  model.ts                 automationsModel(inputs, data, selection, deps): AutomationsViewModel
  loader.ts                TracesLoader: traceList every 20 s at most, configs every 10 min, traces for the picks; the fingerprint reload
  flow-mount.ts            mountFlow(box, def, theme, deps): {destroy()} (load, initialize per theme, render cached, decorate)
  automations-pane.ts      <hp-automations-pane>
  run-timeline.ts          <hp-run-timeline>
  flow-card.ts             <hp-flow-card>
  automation-chips.ts      <hp-automation-chips>
  styles.css
test/unit/
  providers/automations.test.ts
  features/automations/{traces,graph,sentences,mermaid-def,timeline-layout,model}.test.ts
  fixtures/traces/*.json    recorded traces (anonymised: aliases and entity ids through the mapping)
test/e2e/automations.spec.ts (extended)
```

### The data layer

- `src/providers/automations.ts`: `automationsOf(states, names)` is `auAutos` (entity, item id, display name, on, last triggered, current runs); `upcomingRuns(configs, automations, now, sun: {nextRising, nextSetting}, fmt)` is `auUpcoming` (today's remaining `time` triggers and `sun` triggers, sorted). It sits in the providers because the Home pane (spec 24) reads it for "Coming up" and the class reads it for `upcoming()` until then.
- `traces.ts`: `isNoise(summary, config)` (every trigger a `time_pattern`, or a time-pattern trigger that found nothing to do), `picks(list, selection)` (the selected run or the automation's latest, the running one, the last decision, the last completed, with noise removed), `fingerprint(automations)`, `todayRuns(list, midnight, isNoise)`, `elapsedText(startMs, now)` (`m:ss` or `h mm`).
- `TracesLoader` (`loader.ts`), a reactive controller on the pane: `load(force)` runs at most every twenty seconds unless forced; `api.traceList('automation')` (a `StaleReply` drops the load; another error sets `error` and keeps the old list); the configs through `api.automationConfig` for the automations without one or every ten minutes; the traces for the four picks through `api.traceGet` (a stored trace of a finished run is not fetched again); the fingerprint of the states schedules a forced load 1.5 s after a change (through the `StoreController`'s `onChange`). The pane shows the loading line until the first list.

### The graph and the definition

```ts
export interface Graph {
  nodes: {id: string; label: string; sub: string | null; shape: 'round' | 'stadium' | 'diamond' | 'hex'; cls: 'hit' | 'off' | 'no' | 'run' | 'stop' | 'stopn'}[];
  edges: {from: string; to: string; label: string | null; cls: 'on' | 'run' | 'stop' | 'off'}[];
  sentence: string | null; // "Ran at 7:02:15 when the front door opened; turned on the hall light."
}
export function automationGraph(config: AutomationConfig, trace: Trace | null, summary: TraceSummary | null, deps: {t: Translate; fmt: Formatters; names: Names}): Graph;
export function toMermaid(graph: Graph, tokens: FlowTokens): string;
```

- `automationGraph` is `auGraph`'s folding: triggers, conditions, actions (sequence, choose with its options and default, if/then/else, repeat, wait, parallel, delay, service calls) into nodes keyed by the trace's paths (`trigger/0`, `condition/1`, `action/2/choose/0/sequence/1`), each node's class from the trace (visited, result false, the last step of a running run, the stop), the time under a visited step through `fmt.timeWithSeconds`; the sentence through `sentences.ts`. Tested against recorded traces in `test/unit/fixtures/traces/` (the recorder of spec 14 F gains `--traces <automation ids>` to export `trace/list` and `trace/get` replies anonymised with the mapping).
- `toMermaid` writes the `flowchart` definition as `auMermaid` does: the `classDef`s from the tokens (`FlowTokens {ok, crit, warn, card, ring, fg, fg3, line}`), each node and edge line ending in its own `;`, the `linkStyle` lines per edge class. The escaping is four named functions: `escapeLabel` (no `"`), `protectEntities` (a `#` that could start an entity becomes `#35;`), `protectPercent` (every `%` becomes `#37;`), `splitDollars` (each `$` in its own `<span>`); each has the #97 cases as tests ("drawn as it was typed", "in every shape, edge and line kind"), and the module header carries the explanation that `auMermaid`'s comment carries today.
- `flow-mount.ts`: `mountFlow(box, def, theme, deps)` loads Mermaid lazily (`loadMermaid` with the module-level promise spec 10 allows), calls `initialize` once per theme key (the font, card and foreground tokens; `handDrawnSeed: 1`, `securityLevel: 'strict'`, `theme: 'base'`, the `themeVariables` and `flowchart` options as today), renders through a definition-keyed cache, writes the SVG, then decorates (the width rule: fit when under 1.3 times the host, else scrollable at 88 percent with the `wide` and `end` classes and the scroll to the waited step; the arrowhead markers per edge class from the `linkStyle` lines; the `au-*` classes); returns `destroy()` that clears the box. The failure line when the chunk does not load is the catalog's.

### The model and the elements

- `automationsModel(inputs, data, selection, deps)` → `{sub, loading, error, today: {timeline: TimelineGeometry; tiles: StatTileView[3]}, cards: FlowCardView[], chips: ChipView[]}` with the sub-line ("2 running · 14 runs today · 31 enabled · 2 off"), the Today card (from `timelineLayout(dots, width, now)`: the grouping by proximity, the two label rows, the `now` line, the hour marks, the class per dot and its description), the three tiles (Ran today, Next, Then), the four flow cards (title, sentence, pill with its kind and time, the run picker chips for the selected one, the legend, the Mermaid definition), and the chips (latest first, `off` greyed, the selected marked).
- `<hp-automations-pane>`: `active`; `StoreController({ids: s => automationIds(s), onChange: fingerprint reload})`; `TracesLoader`; `<hp-pane-header icon="flow" color="var(--c-heat)">`; the loading line, the error card, or `<hp-run-timeline>`, the `<hp-flow-card>`s (`repeat` by run id or `none:<item>`), `<hp-automation-chips>`; the selection (`auSel`: item and run) is element state; a chip or a dot sets it, the card's close clears it.
- `<hp-run-timeline>`: the `.autl` axis, past, now line and hour marks, the `button.aud` dots with their `.aul` labels (`repeat` by group), the tiles; a dot dispatches `select-run` or `select-automation`; the width for the layout comes from a `ResizeObserver` on the host (a `ResizeController` in the kit, `src/ui/controllers/resize.ts`, one observer per host; its second user is `<hp-chart>`'s responsive redraw, which adopts it in the same pull request).
- `<hp-flow-card>`: the head (title, sentence), the pill (the running one counts up through `TickController`), the run picker, the legend, the graph box; `mountFlow` on first update and when the definition or the theme changes (`AppearanceConsumer`); `destroy()` on disconnect. The running pill's text updates without redrawing the graph because the definition did not change, which is the cache's job.
- The class's `renderAuto` and `auDraw` (pull request 1) import `automationGraph`, `toMermaid` and `timelineLayout` from the feature and keep drawing with `innerHTML`; pull request 2 deletes `src/auto.js` and the `Object.assign` line.

### Mermaid 12 (ADR 0026, pull request 3)

- `mermaid` 12.x exact in `package.json`; `mountFlow`'s `initialize` gains `layout: 'dagre'` and `look: 'classic'` (the least-change starting point #82 measured); the `katex` override of #75 and both Renovate rules for Mermaid are removed; `npm run licenses`; `chunks.spec.ts` asserts no `elk-*` chunk is requested when a flow draws.
- The `classDef`s are adjusted so the node fills, strokes and the edge styles match today's as closely as 12's `classic` look allows (its thicker outlines and wider stadium shapes remain); the four `auto-tablet-*` baselines and `bare-auto-tablet-light-en` are re-recorded in this pull request as an approved visual change under ADR 0003, with the before-and-after images in the description for the owner's approval before merge.
- ADR 0026 records: the decision (12.x, classic look, dagre layout), the measurements of #82, why it waited for the feature's move (one rewrite of the flow's styling, not two), the cost (a one-time baseline change on one tab), and the condition to revisit (`look: 'neo'` or a deliberate redesign, in its own pull request). #82 is closed by the pull request.

### Styles and strings

- `src/features/automations/styles.css` receives `.autoday`, `.autl` and its parts, `.aud` and its states, `.aul`, `.aupick`, `.auchips`, `.auchip`, `.aulegend`, `.augraph` and its states and scrollbar rules, `.auwide`, `.auhr`, `.auc`, `.ausel` (`tabs.css` ~968 to 1250, `glass.css` 399, `motion.css` 57), the `.pill.ok/.run/.no` variants used by the flow cards (the climate pill of spec 20 is `.pill.on/.bad`; both are kit candidates: `src/ui/styles/pill.css` takes `.pill` and its tones with two users now).
- About seventy `automations.*` keys (the sub-line words with ICU plurals, the Today card's title and caption, the legend, `ranToday`, `next`, `then`, `noneScheduled`, `everyAutomation`, `latestFirst`, the card kinds (`selected`, `runningNow`, `lastDecision`, `lastCompleted`), the pill words (`noRunStored`, `running`, `stopped`, `error`, `done`), the shape-only sentence, the no-runs line, the trace-refused line, the chunk-failed line, `AU_DOMAIN` and `AU_VERB` as `automations.domain.*` and `automations.verb.*`, `checkedDidNothing`, `scheduled`, `ran`), French from the map's entries (`src/i18n/fr.js` ~912 to 1000), listed in `test/unit/fixtures/moved/automations.json`.

### Deletion and grep gates

Pull request 1: `src/auto.js` loses `auGraph`, `auMermaid`, `auTrig`, `auCond`, `auAct`, `auName`, `auKind`, `auState`, `auTemplate`, `auMix`, `auArr`, `auTxt`, `auCut`, `auDur`, `auMins`, `auShortAlias`, `AU_DOMAIN`, `AU_VERB`, `auUpcoming`, `auAutos`, `auNoise`, `auPicks` in favour of imports. Pull request 2: `src/auto.js` deleted; `scripts/legacy-set.cjs` loses `auto\\.js`; the `Object.assign(HomePanel.prototype, autoMethods)` line, the `#auhost`/`#ausub` listeners and the `'renderAuto'` entry of `renderTabs` go; the class's `upcoming()` reads `upcomingRuns` from the provider.

Gates (after pull request 2): `ls src/auto.js` fails; `grep -n 'autoMethods\|renderAuto\|auLoad\|auhost' src/home-panel.js` is empty; `grep -nE '\.(autoday|autl|aud|aul|aupick|auchips|auchip|aulegend|augraph|auwide|auhr|auc|ausel)\b' src/css/*.css` is empty; `npm run lint` prints a footprint one lower than before; the French map lost the listed entries.

### Performance, by construction

- The pane subscribes to the `automation.*` entities and the sun; a thermostat change gives zero mutations and schedules no reload.
- The trace list loads at most every twenty seconds and only while the pane is shown (the controller pauses with `active`); the class polled on every `renderTabs`.
- A flow renders once per definition and theme; the running pill ticks without touching the SVG; a definition change swaps the SVG, not the card.

## Acceptance Criteria

Pull request 1, the rules and the graph:

1. `src/providers/automations.ts`, `src/features/automations/{README.md,traces.ts,graph.ts,sentences.ts,mermaid-def.ts,timeline-layout.ts}` exist with headers; `src/auto.js` imports them and draws as before; the fixture recorder gains `--traces`; `test/unit/fixtures/traces/` holds at least six anonymised traces (a plain run, a stopped condition, a running wait, a choose, a repeat, an error).
2. Vitest: `automationsOf`, `upcomingRuns` (time and sun triggers, past ones dropped), `isNoise`, `picks` (each of the four with and without a selection), `fingerprint`, `todayRuns`, `elapsedText`; `automationGraph` against every fixture (node classes, the time subs, the sentence); `toMermaid` (the `;` rule, the four escaping functions with #97's inputs, the `linkStyle` lines); `timelineLayout` (grouping, the two rows, the clamps); 100 percent statements.
3. Every baseline identical; `automations.spec.ts` green; `npm run check`, `npm test -- --coverage`, `npm run lint` green (the temporary legacy-to-feature import allowed by one rule naming `src/features/automations/{graph,mermaid-def,traces,sentences,timeline-layout}.ts`, with the comment that pull request 2 removes it); changeset (patch): "Internal tidying of the Automations tab. Nothing visible changes."

Pull request 2, the elements and the file's deletion:

4. `<hp-automations-pane>`, `<hp-run-timeline>`, `<hp-flow-card>`, `<hp-automation-chips>`, `loader.ts`, `flow-mount.ts`, `model.ts`, `src/ui/controllers/resize.ts` exist; `src/auto.js` is gone and the legacy set no longer names it; the footprint printed by `npm run lint` dropped by one; `FEATURES` has `automationsFeature`.
5. Playwright: `automations.spec.ts`'s two cases pass against the elements; the tab shows the sub-line and the Today dots from the fixture's traces; a chip selects an automation and its card appears with its flow; the trace list is requested once on open and not again within twenty seconds (`window.house.reads`); the Mermaid chunk loads only when the tab opens (`chunks.spec.ts`); a light change gives zero mutations in `hp-automations-pane`'s root; axe clean.
6. Every baseline identical (`auto-*`, `bare-auto-*`, `home-*`); the French equivalence test passes for `test/unit/fixtures/moved/automations.json`; the styles-split test passes; changeset (patch): "The Automations tab is redrawn with the same look. Nothing visible changes."

Pull request 3, Mermaid 12:

7. `mermaid` 12.x exact; `mountFlow` initializes with `layout: 'dagre'`, `look: 'classic'`; the `katex` override and the Mermaid Renovate rules are gone; `chunks.spec.ts` asserts no `elk-*` chunk is fetched; `LICENSES.md` updated; `automations.spec.ts` green.
8. The four `auto-tablet-*` baselines and `bare-auto-tablet-light-en` re-recorded; every other baseline identical; the pull request shows before and after; ADR 0026 accepted; #82 closed; changeset (minor, household voice): "The Automations tab's flow charts are drawn with a newer drawing library: the shapes have slightly thicker outlines and wider rounded boxes; the colours and the reading order are the same."

## Testing Decisions

The seams are the two of ADR 0005. New in kind: recorded **traces** as fixtures (the recorder's `--traces` flag; the first fixtures that are not states), and `chunks.spec.ts` asserting a chunk's absence. The graph, the definition and the timeline layout are the pure seam and carry the weight; the mount is proven by the baselines and the two drawn-as-typed cases. Prior art: `automations.spec.ts` for the labels, #97 for the escaping cases, #82 for the Mermaid measurements.

## Out of Scope

- A redesign of the flow's look beyond what `classic` gives (a later pull request with the owner's approval; the ADR names it).
- Editing or running automations from the panel.
- Traces for scripts; only `automation` traces are listed, as today.

## Notes

- **Why the pure modules move first and the elements second.** `auGraph` and `auMermaid` are the riskiest code in the panel (the #97 bugs lived there); pinning them with fixture tests while the legacy drawing still runs separates "is the folding right" from "is the element right".
- **Why `upcomingRuns` is a provider module.** The Home pane's "Coming up" reads it (spec 24) and the class's `upcoming()` does until then; a feature cannot be imported by the shell's Home composition, so the read goes down.
- **Why Mermaid 12 waits for pull request 3.** The move must be pixel-identical to be reviewable against the baselines; the library change must be a visible change with the owner's approval. Doing both in one pull request would make the baselines prove nothing about the move.
- **Why `ResizeController` is in the kit.** The timeline needs its width for the grouping and `<hp-chart>` needs it for the responsive redraw; one observer per host, two users.
- **Reading**: Mermaid docs, _Flowcharts_ (`look`, `layout`, `handDrawnSeed`, `securityLevel`), the 12.0 release notes; Home Assistant developer docs, _Automation trace_ (`trace/list`, `trace/get`, the path keys); #82 and #97 for the measurements and the escaping history.
