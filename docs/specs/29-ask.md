# Spec 29: Ask the history. A question in words, a plan from Home Assistant's AI Task entity, and an answer the panel computes: a chart, a list of moments or a total

Parent: none; idea 46 of [ideas-what-apple-would-do.md](../ideas-what-apple-would-do.md). Issue: #533.
Depends on: nothing open; it reads through the API client, the statistics cache (ADR 0028), the providers (ADR 0025), the sheet host (ADR 0021) and `<hp-chart>` (ADR 0022), all of which exist.
Blocks: nothing.
Ships as: eleven pull requests, the tickets #534 to #544, which slice "The moves".

## Parent

Idea 46 of `docs/ideas-what-apple-would-do.md` ("Ask the history, numbers stay home"). It follows no open spec and blocks none: it reads through the API client (spec 12), the statistics cache (ADR 0028), the providers (ADR 0025), the sheet host (ADR 0021) and `<hp-chart>` (ADR 0022), all of which exist. One new ADR: "The model plans, the panel computes". To be committed as `docs/specs/29-ask.md` by a docs-only PR and sliced with `/mattpocock-skills:to-tickets`.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

**The household.** The panel answers "what is happening now" on every tab, and "what happened" only where a chart was drawn in advance. "Was the patio door left open this week?", "when did the car finish charging?" and "how warm was the office yesterday afternoon?" each have an answer in the recorder, and no tab for it. Finding it means opening Home Assistant's history, picking an entity by its id and reading a raw graph, which only the owner does.

**The owner.** A language model can turn a sentence into a query, but the owner will not send the house's readings to one, and a small local model that does arithmetic over a week of readings gets it wrong with confidence. The model also has to be replaceable: a local server today, another one later, with no panel release in between.

**The maintainer.** A model's reply is the least trustworthy input the panel has ever read. It must enter as data that is parsed once into a closed type, never as text the panel shows or as an instruction the panel follows.

## Solution

A button in the header, on every tab, opens the **Ask sheet**: a text field, three suggested questions and, after a question, one answer.

1. The household member types a question in English or French and sends it.
2. The panel sends Home Assistant's AI Task entity the question, today's date and weekday, and the **sensor catalog**: the names and kinds of the sensors the panel already shows. It sends no state, no reading and no entity id.
3. The model returns a **plan**: which sensor, which period, and which of three questions to put to it. It writes no sentence and computes nothing.
4. The panel fetches that sensor's history through the statistics cache, evaluates the plan with pure functions and draws the **answer** in the panel's language:
   - **A series**: a chart over the period with its low, high and mean ("Office · yesterday · 18.2° to 21.4°").
   - **Moments**: a list of spans with their start, end and length, the count and the total ("Patio door open more than 10 min · this week · 2 times, 37 min").
   - **A total**: one figure with a bar per day ("Car charging · last week · 42 kWh").
5. Under the answer, one line says what the panel understood ("Patio door · open longer than 10 min · this week"), so a wrong plan is visible as a wrong plan and not as a wrong fact.

When the model cannot map the question to the catalog, the sheet says so and shows the suggested questions again. The sheet controls nothing, stores nothing and remembers no previous question.

The house's admin enables it with an `ask` block in the panel's config that names the AI Task entity. Without the block the header has no button and no code of the feature loads.

## User Stories

1. As a household member, I want a button in the header on every tab, so that I can ask from wherever I am.
2. As a household member, I want to type a question in my own words, so that I do not need to know an entity's name.
3. As a household member, I want three suggested questions built from my own house's sensors, so that I see what can be asked.
4. As a household member, I want tapping a suggestion to ask it at once, so that the first use takes one tap.
5. As a household member, I want a chart when I ask how something varied, so that I see the shape and not a table.
6. As a household member, I want the chart's low, high and mean written above it, so that I get the answer without reading the axis.
7. As a household member, I want a list of moments when I ask when or how often something happened, so that each one has a start, an end and a length.
8. As a household member, I want the count and the total duration above the list, so that "twice, 37 minutes" is the first thing I read.
9. As a household member, I want a single figure when I ask how much, so that "42 kWh" is the answer.
10. As a household member, I want a bar per day under a total, so that I see which day made it.
11. As a household member, I want one line saying which sensor, test and period the panel understood, so that I can tell a misunderstanding from a fact.
12. As a household member, I want "no moments this week" stated plainly when nothing matched, so that an empty answer is an answer.
13. As a household member, I want to be told when the question is about something the panel has no sensor for, so that I do not wait for nothing.
14. As a household member, I want a progress state while the model works, so that a few seconds on a local model do not look like a freeze.
15. As a household member, I want to cancel a question that takes too long, so that I can ask another.
16. As a household member, I want the question to give up after thirty seconds with a plain message, so that the sheet never spins forever.
17. As a household member, I want to be told when the history does not go back as far as I asked, with the answer for the part that exists, so that I am not shown a silent partial result.
18. As a household member, I want "yesterday", "this week" and "last month" to mean my house's calendar days in my house's time zone, so that the period is the one I meant.
19. As a household member, I want to ask again from the same sheet, so that the next question replaces the answer.
20. As a household member, I want the sheet to open empty every time, so that the next person at the tablet does not read my question.
21. As a household member, I want the sheet to close with Escape, the close button and a tap outside, as every other sheet does.
22. As a French-speaking user, I want to ask in French and read the answer, the summary line and every label in French, so that the sheet is as good as the rest.
23. As a French-speaking user, I want the suggested questions in French with my house's display names, so that they read naturally.
24. As a keyboard user, I want focus in the field when the sheet opens and Enter to send, so that I never reach for the pointer.
25. As a screen-reader user, I want the answer announced when it arrives, so that I know the wait is over.
26. As a screen-reader user, I want the chart's summary as text, so that the answer does not depend on seeing the chart.
27. As a phone user, I want the sheet to cover the screen and the field to stay above the keyboard, so that I can see what I type.
28. As the owner, I want only the question, the date and the sensor names to leave the panel, so that no reading of my house reaches the model.
29. As the owner, I want every number in an answer computed by the panel from the recorder, so that a model can never state a wrong figure.
30. As the owner, I want the panel to talk to Home Assistant's AI Task entity and nothing else, so that changing the model is a Home Assistant setting.
31. As the owner, I want the sheet to be read-only, so that no question can switch, set or schedule anything.
32. As the owner, I want a model's reply that names an unknown sensor, an unknown period or an unknown test to be refused, so that a hallucinated plan is never run.
33. As the owner, I want the model's text never shown on the panel, so that nothing it writes can mislead or inject.
34. As the owner, I want a set of real questions replayed against my model outside CI with a score, so that I know whether a model is good enough before the household uses it.
35. As the owner, I want that score per language, so that I see whether French questions are understood as well as English ones.
36. As an adopter, I want no button when my config has no `ask` block, so that the panel fits a house with no model.
37. As an adopter, I want a clear config error when the `ask` block names an entity that is not an AI Task entity, so that I fix it in the config and not by guessing.
38. As an adopter, I want the catalog built from the entities my config already resolves, so that I list nothing twice.
39. As an adopter, I want to leave a sensor out of the catalog by name, so that a sensor I consider private is never offered to the model.
40. As a maintainer, I want the model's reply parsed once into a closed type, so that no code downstream checks it again.
41. As a maintainer, I want the plan's evaluation as pure functions over history rows, so that every answer is tested without a model or a browser.
42. As a maintainer, I want the model's real replies kept as fixtures that CI parses, so that a change to the parser is tested against what a model actually returns.
43. As a maintainer, I want the feature's code in its own lazy chunk, so that a house without `ask` and a session that never asks pay nothing.
44. As a maintainer, I want every existing baseline unchanged, because the full test house has no `ask` block, so that this spec's visual change is only its own new baselines.

## Implementation Decisions

### The decision this spec records (new ADR)

**The model plans, the panel computes.** The model's only output is a plan in a closed vocabulary. The panel resolves the plan's period to dates, fetches the history itself, computes every figure and writes every sentence from its catalogs. The consequences the ADR states:

- No reading leaves the panel, so the exposure is the catalog's names.
- A small local model is enough, since the task is classification into a few enumerations, not reasoning over data.
- The answer's language is the panel's, not the model's, so French costs nothing.
- The price: a question outside the vocabulary has no answer, and the vocabulary grows by a spec, not by a prompt.

The alternatives the ADR rejects: an agent with history tools (values leave the house, and research finds time arithmetic is where agents fail), the panel calling the model's HTTP API directly (a key, CORS and mixed content on the tablet, and the model's address in the panel's config), and MCP (it gives a model tools; it is not how a client calls one).

### The port: one new method on the API client

- The API client gains `generateData(entityId, instructions, structure, options)`: it calls the `ai_task.generate_data` service and returns the response's `data` as `unknown`. The existing `runService` returns nothing and stays as it is; this is the client's first service call that reads a response.
- It carries the store's config generation and rejects with `StaleReply` as every read does (ADR 0014). It takes an `AbortSignal`; an aborted or timed-out call rejects with a typed `Cancelled`, a sibling of `StaleReply`.
- The client does not retry and does not cache. One question is one call.
- `structure` is Home Assistant's flat description of the fields it wants back (a name, a selector and a description each). That is why the plan below is flat: one level, every field an enumeration, a number or a short string.

### The sensor catalog

- A pure function builds the catalog from the providers' reads, never from a feature: the doors and motion sensors (`door-motion`), the room temperatures (`home-temperatures`), the power meters and the water heater (`power`), the car's charge and the Wallbox (`fordpass`, `wallbox`), the heat pump (`heat-pump`) and who's home (`people`). A provider absent from the house contributes nothing.
- An entry is `{key, name, kind, unit}`:
  - `key` is a short stable handle (`door.patio`, `temp.office`), not the entity id. The panel keeps the map from key to entity; the model never sees an id.
  - `name` is the display name in the panel's language.
  - `kind` is one of `binary` (open/closed, on/off, home/away), `measure` (a temperature, a power, a percentage) or `meter` (an energy total that only grows).
- The `ask.exclude` list in the config removes entries by entity id. The catalog is capped at 60 entries; over the cap, the config check warns and the first 60 in provider order are kept.
- People are in the catalog as `binary` (home or away). The owner can exclude them; no location is ever an entry.

### The plan

The reply is parsed once (ADR 0015, parse, don't validate) from `unknown` into:

```ts
type Period =
  | 'today' | 'yesterday' | 'last_24h'
  | 'this_week' | 'last_week' | 'last_7_days'
  | 'this_month' | 'last_month' | 'last_30_days';

type Plan =
  | {form: 'series'; sensor: CatalogKey; period: Period}
  | {form: 'moments'; sensor: CatalogKey; period: Period; test: Test; longerThanMin: number | null}
  | {form: 'total'; sensor: CatalogKey; period: Period}
  | {form: 'unsupported'};

type Test =
  | {on: boolean}                                  // binary: open/on/home, or its opposite
  | {above: number} | {below: number};             // measure
```

- The parser returns `Plan | PlanError`, where `PlanError` names the first field that failed (`unknown_sensor`, `unknown_period`, `bad_test`, `form_kind_mismatch`, `not_an_object`). A `PlanError` is shown as "unsupported"; its reason goes to the console once, never to the screen.
- Combinations that make no sense are parse errors, not runtime branches: `total` requires a `meter`, a binary sensor's `moments` requires `{on}`, a measure's requires `above` or `below`, `series` refuses a `binary`.
- The model is asked for `unsupported` when nothing fits, and the instructions say so. An empty or malformed reply is the same answer.
- The period is a closed word, never a date: the panel resolves it to a start and an end in the house's time zone, with the week's first day from the locale. Windows start on a stable hour so the statistics cache can answer a repeat (ADR 0028).

### The instructions

- One pure function builds the prompt from the question, the date, the weekday, the catalog and the panel's language. It is fixed text plus those values; the text is English whatever the panel's language, and says the question may be in English or French.
- The question is passed as data, quoted and capped at 200 characters. Nothing in the instructions tells the model that it can act; the structure has no field through which it could.
- The instructions are versioned by a constant recorded with every fixture of the recorded-model suite, so a recording made with old instructions is known to be old.

### The evaluation

Pure functions over the cache's rows, one per form:

- `series`: 5-minute statistics for a period of a day or less, hourly up to a week, daily beyond. Result: the points, the low, the high and the mean.
- `moments`: state history for a `binary`, 5-minute statistics for a `measure`. Result: the spans that satisfy the test and last at least `longerThanMin`, their count and total. A span open at the period's end is marked "still".
- `total`: the meter's change over the period from the statistics' sums, and the change per day.
- Each result carries `coverage`: the part of the period the recorder had rows for. Under full coverage the answer says from when the history exists. Home Assistant keeps state history for a limited number of days (ten by default), so a `binary` question over a month is the usual case, not an error.
- No rows at all is the result `empty`, distinct from "no moments matched".

### The model of the sheet

A reducer over one discriminated state, so no impossible combination can be written:

```ts
type AskState =
  | {at: 'idle'}
  | {at: 'planning'; question: string}
  | {at: 'fetching'; question: string; plan: Plan}
  | {at: 'answered'; question: string; plan: Plan; answer: Answer}
  | {at: 'failed'; question: string; reason: 'unsupported' | 'timeout' | 'unavailable' | 'empty'};
```

- A new question from any state cancels the one in flight. A reply for a cancelled or stale question is dropped.
- The timeout is thirty seconds for the plan. The history fetch has the cache's own failure and retry rules.
- `unavailable` covers the AI Task entity being unavailable or the service call failing.

### The elements

- A new feature folder, `ask`, with the catalog, the plan, the instructions, the evaluation and the model as pure modules, and two humble elements: `<hp-ask-sheet>` (the field, the suggestions, the states) and `<hp-ask-answer>` (the three forms). The chart is `<hp-chart>`; the feature does not import ApexCharts (ADR 0027).
- It is not one of the registry's subjects: it has no tab and no pane. Like the live pill, it is a header feature the shell composes.
- The header gains one button after the chips, drawn only when the config has an `ask` block. It sends an event up; the shell opens the sheet through the sheet host (ADR 0021) and the header decides nothing, as now.
- The feature's index is imported dynamically on the first open, so its code is a chunk of its own.
- The suggested questions are rule-based, from the catalog: the first door ("Was {door} left open this week?"), the first room temperature ("How warm was {room} yesterday?") and the first meter ("How much did {meter} use last week?"). Each is a catalog message with a display name; a house lacking one kind gets fewer suggestions.
- The answer is in an `aria-live="polite"` region. The summary line and the understood line are text, so the chart is never the only carrier.

### The config

- `ask: {entity: 'ai_task.<name>', exclude?: string[], cheat_sheet?: string}`. The schema refuses an `entity` outside the `ai_task` domain with a message in the config card. `cheat_sheet` is the owner's own page about what to ask, and must start with `https://` (`config.askCheatSheetNotHttps` otherwise, in both languages); it is a setting because the repository holds no URL. `ResolvedConfig.ask.cheatSheet` is that address, or null.
- With a `cheat_sheet`, the sheet's header draws a Cheat sheet icon link in `<hp-sheet>`'s `actions` slot, left of Close: `target="_blank"` and `rel="noopener noreferrer"`, named "Cheat sheet" ("Aide-mémoire") with the same words as its tooltip, with Close's size (44px at least), hit area and focus ring. Without it there is no icon. An entity that does not exist in the house is a config check's warning, and the button is not drawn.
- The full test house and the bare test house have no `ask` block. The states that need one set it through the harness, as the other spec-specific states do.

### Strings

About forty message keys under `ask.*`, in both catalogs: the button's name, the Cheat sheet link's name, the field's placeholder, the three suggestions, the five states, the three answer forms' summaries with plurals, the nine periods, the tests ("open longer than {n} min", "above {v}"), the coverage note and the config errors.

### Performance, by construction

- Nothing is fetched, subscribed or loaded until the sheet opens. The sheet subscribes to no entity: an answer is a snapshot of the recorder.
- One question is one model call and one history window, deduplicated by the statistics cache.
- The series is thinned by the period's statistic size, never drawn from raw state history.

### The moves

1. **The pure half.** The catalog, the plan and its parser, the instructions, the period resolver, the three evaluations and the reducer, each with its test; the `ask` config schema; the strings. No element, no baseline.
2. **The port.** `generateData` on the API client with `Cancelled`, tested against the fake `hass`; the harness answers the service with a canned plan per question.
3. **The sheet.** The two elements, the header's button, the sheet host's entry, the lazy chunk, the behaviour tests and the new baselines.
4. **The recorded-model suite.** The question set, the recording command, the fixtures and the CI test that parses them.
5. **The live house (owner).** The AI Task entity backed by the local model in Home Assistant, the `ask` block in the live config, and a first recording.

## Testing Decisions

A good test here states what a household member sees for a question, or what a pure function returns for literal inputs. No test reads the reducer's private state through an element, mocks the socket or asserts the prompt's wording.

**The two existing seams (ADR 0005), and no new one.**

- **Pure functions, in Vitest.**
  - The plan parser: a table of replies, valid and invalid, each with its expected `Plan` or `PlanError`, including every form-and-kind mismatch and replies with extra fields, wrong types and text around the object.
  - The period resolver: each of the nine periods on fixed clocks, across a daylight-saving change, a month's end and a week's start in both locales.
  - The evaluations: literal rows in, the answer out. Spans that straddle the period's edges, a span still open, a threshold exactly met, an unavailable gap, partial coverage and no rows.
  - The catalog: built from the full and the bare test houses; the exclusion list; the cap.
  - The reducer: each transition, and a late reply after a cancel.
  - Prior art: the smart stack's rules and the automations' sentences, tested the same way.
- **The `hass` boundary.**
  - Vitest with the fake `hass`: `generateData` sends the service call the port promises and returns its `data`; a stale generation rejects with `StaleReply`; an abort rejects with `Cancelled`. Prior art: the API client's tests.
  - Playwright against the harness, whose `hass` answers `ai_task.generate_data` with a canned plan chosen by the question: one behaviour test per answer form, per failure reason, for cancel, for the keyboard path and for the absent button without `ask`. One test asserts that the service call's payload contains no state value and no entity id of the house. Axe runs on the open sheet in each state.
  - Baselines: the sheet idle, a series, moments, a total and unsupported, on tablet and phone, light and dark, English and French, under both designs where the sheet differs. Every existing baseline stays unchanged.

**The recorded-model suite (the owner's choice).** It adds fixtures at the pure-function seam, not a third seam.

- A question set of about forty questions in English and French, each with the plan a correct model returns, written against the full test house's catalog. It names no real town, person or device.
- A command, run by hand outside CI, sends each question through a real Home Assistant's AI Task entity with the full test house's catalog and writes each raw reply to a fixture, with the instructions' version and the model's name. It prints a score per language and per form, and the list of misses.
- In CI, a Vitest test parses every recorded reply and compares it with the expected plan. A reply recorded as a known miss is asserted to parse to `unsupported` or a `PlanError`, never to a wrong valid plan left unremarked; the misses are listed in the fixture file's header.
- CI never calls a model. A recording whose instructions' version is older than the code's fails the test with the command to re-record.

## Out of Scope

- Follow-up questions and any memory of a previous question (idea 24).
- Voice input and spoken answers.
- Long-press on a card to ask about it (idea 25), "Explain this chart" (37), anomaly notes (35) and the morning brief (27): each is a later spec on this spec's port.
- Questions over two sensors, comparisons between periods, and "why" questions. The vocabulary is one sensor, one period, one form.
- Automation traces and anything from the Automations tab (idea 33).
- Cameras, locations and calendar contents.
- Any write: no service that changes a device, no saved question, no history of answers.
- Installing or configuring the local model server, and the choice of the Home Assistant integration that exposes it as an AI Task entity. The panel's contract ends at the entity.
- The panel calling a model's HTTP API directly, and MCP.

## Further Notes

- **To verify before ticket 2.** The exact shape of `ai_task.generate_data` on the live Home Assistant version (the `structure` field's selectors, the response's `data` key, whether the frontend's `callService` returns the response or the client must send `call_service` with `return_response`), and which integration exposes an OpenAI-compatible local server as an AI Task entity with structured output. The spec's port is written to the service as documented; the ticket pins it against the running instance.
- **Why handles and not entity ids.** A handle keeps ids out of the model's context, makes a hallucinated sensor a parse error by construction and keeps the recorded fixtures free of anything from the live house.
- **The model's quality is a measured thing.** The recorded-model suite's score is the gate for enabling `ask` on the live house, and the way to compare two local models. A threshold is the owner's call after the first recording.
- **What grows next.** A new answer form or period is a new member of a union, a parser row, an evaluation and its strings. A new consumer of the model (a brief, an explanation) is a new structure on the same `generateData`.
