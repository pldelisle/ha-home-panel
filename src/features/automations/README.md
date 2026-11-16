# Automations

What the Automations tab reads and computes ([spec 25](../../../docs/specs/25-automations.md)): which automations exist and which of their stored runs to show, today's runs and the ones still to come, and the words of each trigger, condition and action of a flow. This folder holds the pure rules of the second move (#271); the legacy panel's `src/auto.js` draws from them until the elements of #273 replace it. The graph and its Mermaid definition come in #272.

## The folder

```
src/providers/
  automations.ts           automationsOf(states, names); upcomingRuns(configs, automations, now, sun, fmt); sunNext(states); minutesOfDay(t, fmt); asList; triggerKind
src/features/automations/
  README.md
  traces.ts                isNoise(summary, config), noiseOf(configs), picks(list, selection, noise), fingerprint(automations), todayRuns(list, midnight, noise), elapsedText(startMs, now, t)
  sentences.ts             triggerText, conditionText, actionText, nameOf, durationText, cut, shortAlias (the names, states, templates and the domain and service key maps stay inside)
  timeline-layout.ts       timelineLayout(dots, widthPx, now, deps): the groups with their place, class, label row and description; dotClass
test/unit/
  providers/automations.test.ts
  features/automations/{traces,sentences,timeline-layout}.test.ts
  fixtures/traces/*.json    automation traces in the recorder's --traces format
  fixtures/moved/automations.json   the French of each message against the rewrite layer
```

## The rules it keeps

- A run is noise when its automation's every trigger is a `time_pattern`, or when a time-pattern run stopped at its condition: the tab leaves it out of today's line and the cards, but draws it when it is picked.
- The sentences say what Home Assistant's config says, never more: a name is the resolver's, a state the panel has no word for is Home Assistant's own, with underscores as spaces (a door's or a motion sensor's as Home Assistant writes it).
- A config's clock time is read as hours and minutes cut from Home Assistant's text (`18:00:00` is `18:00`), the 24-hour form `time24` writes in every language, so no zone moves it.
