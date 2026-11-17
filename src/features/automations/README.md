# Automations

What the Automations tab reads and computes ([spec 25](../../../docs/specs/25-automations.md)): which automations exist and which of their stored runs to show, today's runs and the ones still to come, and the words of each trigger, condition and action of a flow. This folder holds the pure rules (#271), the flow's graph and Mermaid definition (#272), and the tab's elements, its loader and the Mermaid mount (#273), which replaced the legacy panel's `src/auto.js`.

## The folder

```
src/providers/
  automations.ts           automationsOf(states, names); upcomingRuns(configs, automations, now, sun, fmt); sunNext(states); minutesOfDay(t, fmt); asList; triggerKind
src/features/automations/
  README.md
  traces.ts                isNoise(summary, config), noiseOf(configs), picks(list, selection, noise), fingerprint(automations), todayRuns(list, midnight, noise), elapsedText(startMs, now, t)
  sentences.ts             triggerText, conditionText, actionText, nameOf, durationText, cut, shortAlias (the names, states, templates and the domain and service key maps stay inside)
  graph.ts                 automationGraph(config, trace, summary, deps): the nodes keyed by the trace's paths, the edges, the run's sentence
  mermaid-def.ts           toMermaid(graph, tokens, compact); safeText and its four escapes (#97); mixHex
  timeline-layout.ts       timelineLayout(dots, widthPx, now, deps): the groups with their place, class, label row and description; dotClass
  index.ts                 automationsFeature
  ids.ts                   automationIds(store): every automation.* and the sun
  loader.ts                TracesLoader: the runs every 20 s at most, the configs every 10 min, the traces of the picked runs; pickedRuns
  model.ts                 automationsModel(inputs, data, selection, deps): the line, the Today card, the flow cards, the chips; automationsBrief
  flow-mount.ts            mountFlow(box, def, deps): Mermaid loaded, initialized per theme, rendered once per definition, decorated
  events.ts                SelectRunEvent, CloseSelectionEvent
  automations-pane.ts      <hp-automations-pane>
  run-timeline.ts          <hp-run-timeline>
  flow-card.ts             <hp-flow-card>
  automation-chips.ts      <hp-automation-chips>: the list of every automation
  styles.css               the feature's rules, adopted by the four elements
test/unit/
  providers/automations.test.ts
  features/automations/{traces,sentences,timeline-layout,graph,mermaid-def}.test.ts
  fixtures/traces/*.json    automation traces in the recorder's --traces format
  fixtures/moved/automations.json   the French of each message against the rewrite layer
```

## The rules it keeps

- A run is noise when its automation's every trigger is a `time_pattern`, or when a time-pattern run stopped at its condition: the tab leaves it out of today's line and the cards, but draws it when it is picked.
- The sentences say what Home Assistant's config says, never more: a name is the resolver's, a state the panel has no word for is Home Assistant's own, with underscores as spaces (a door's or a motion sensor's as Home Assistant writes it).
- A config's clock time is read as hours and minutes cut from Home Assistant's text (`18:00:00` is `6:00 pm` in English, `18 h` in French), written by `fmt.clock`, so no zone moves it. Every other time the tab shows is `fmt.time` (`fmt.timeSeconds` for a flow step, `fmt.hourOfDay` for the line's marks).
- A label in the flow is drawn as typed: `safeText` escapes it (`escapeLabel`, then `protectEntities`, `protectPercent`, `splitDollars`, in that order), and every node and edge line ends in its own `;`, the one Mermaid's entity pre-pass may eat (#97).
