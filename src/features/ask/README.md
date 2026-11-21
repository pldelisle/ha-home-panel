# Ask the history

A button in the header opens a sheet where a household member types a question about the house's history, and gets an answer the panel computed ([spec 29](../../../docs/specs/29-ask.md), parent issue #533; [ADR 0040](../../../docs/adr/0040-the-model-plans-the-panel-computes.md), "The model plans, the panel computes"). The model's only output is a **plan** in a closed vocabulary: which sensor, which period, which form. The panel resolves the period, fetches the history, computes every figure and writes every sentence. No reading and no entity id leaves the panel.

This folder is built in slices. **The tracer** (#538) is here: a header button on every tab, the sheet it opens, and a chart for a typed question about a temperature or a power reading, in English and French. The pure half of a series (#537) and the port to the model (`generateData` on the API client, #536) came before it. The failure states (#539) are in too: the Cancel button, the thirty-second timeout, the model unavailable (its entity's state, or a call that fails), no history, the coverage note and Try again. The moments (#540) are in too: a question about when, how often or how long gives a list of spans with the count and the total, for doors, motion, who is home and thresholds on a measure. The next slices are the suggestions, the total and the recorded-model suite.

The feature is a **lazy chunk**: the shell imports `sheets.ts` (one constant, the id `ask.sheet`) and `import()`s `index.ts`, which defines the two elements, on the first tap of the header's Ask button. A house with no `ask` block draws no button and never fetches the chunk. The dependency rule holds both ways: the shell imports the feature, the feature imports no shell module.

## The folder

```
src/features/ask/
  README.md
  catalog.ts       askCatalog(reads, names, config): Catalog: the sensors a question may name, as handles, and the private map to entities
  plan.ts          Period, Test, Plan, PlanError; parsePlan(reply, catalog): Plan | PlanError, the one place a model's reply is read
  period.ts        resolvePeriod(period, now, fmt, weekStart): the nine periods as a window of the house's calendar
  instructions.ts  askInstructions(...), askStructure(catalog), INSTRUCTIONS_VERSION: what the model is told and the fields it fills
  evaluate.ts      evaluateSeries(rows, window): the points, the low, the high, the mean and the coverage, or empty; evaluateMoments(input, query, window, now): the spans a test held, their count and total
  model.ts         AskState, askReducer, askView(state, t, fmt, catalog): the sheet's state and its texts
  checks.ts        askChecks(catalog): the cap warning (the entity and exclude warnings are the core's checkHouse); the sheet shows it to an admin
  charts.ts        seriesChartOptions(answer, deps): the chart's options as data, for <hp-chart>
  loader.ts        AskLoader: the controller that runs one question (AI Task, plan, history window, answer) into the reducer; drops a stale or cancelled reply
  sheets.ts        ASK_SHEET, the sheet's id (ADR 0021)
  index.ts         defines the elements; imported dynamically by the shell
  ask-sheet.ts     <hp-ask-sheet>: the field, the send button and the result in an aria-live region
  ask-answer.ts    <hp-ask-answer>: the summary, then the mean and <hp-chart> of a series or the list of spans of moments, and the understood line
```

Every file but the loader and the two elements is a pure module: values in, values out, no clock, no DOM, no `hass`. The loader holds the one question in flight and reads the clock it is given; the elements are humble (ADR 0005).

## The catalog

Built from the providers' reads (ADR 0025), never from a feature. An entry is `{key, name, kind, unit, words?}`: the key is a stable handle (`temp.office`, `power.grid`), built from the room's area (else the key its config gives it, else its display name) or the power role, and never from an entity id. The name is the display name in the panel's language, and the kind is `binary`, `measure` or `meter`. The map from a key to an entity id stays on the panel's side. The `measure` entries are the rooms' temperatures and the live power readings. The `binary` entries are the doors, windows and motion sensors (`door.living_room`, `motion.office`, from the area, else the display name) and the people (`home.alex`, from the configured name, with the `person.*` entity behind it); each carries the message keys of its two states (`ask.words.open` and `ask.words.closed`, home and away) for the understood line. `ask.exclude` removes entries by entity id, and the catalog is cut at 60.

## The plan

The model fills six flat fields (`form`, `sensor`, `period`, `test`, `value`, `longer_than_min`), because that is what Home Assistant's `ai_task.generate_data` structure takes and what the probe of #535 found a local model fills correctly: every field is nullable, the unused ones come back `null`, and `test` is the word `none` for a series. `parsePlan` maps them onto the spec's `Plan` and treats an absent field, `null` and `''` alike. A combination that makes no sense (a series of a binary sensor, a total of a measure) is a `PlanError`, not a runtime branch. `total` parses to `form_not_supported_yet` until its slice lands; `readPlan` already parses the whole union.

## Moments

`evaluateMoments` takes the history that suits the sensor: a binary sensor's state history (`cache.history`, minimal states, from the period's start to its end) or a measure's statistics rows (5-minute buckets up to a day, hourly beyond). A binary sensor's states are laid end to end from point to point; the first point is the state when the window opened, not a change, so a span that began before it starts at the period's start. `on` is `on` or `home`, its opposite is every other state; `unavailable` and `unknown` end a span and are counted for neither. A measure's bucket holds when its mean meets the threshold (a threshold exactly met is met), and a bucket with no value or no row ends a span. A span must last at least `longerThanMin`, and one that reaches the end of a window that ends now is `ongoing`, which the list says as "still". No point at all is `empty` (the sheet says there is no history); history with no matching span is an answer of no moments.

## The instructions

Fixed text plus the question (quoted, cut at 200 characters), the date and weekday in the house's zone, and the catalog. The probe found the instructions matter more than the schema: they say what each form is, which test goes with which kind of sensor and when a field is `null`. Change the text, raise `INSTRUCTIONS_VERSION`.

## Tests

`test/unit/features/ask/`, on literals and on the full and the bare test houses. The coverage gate holds every module here at 100 percent of statements.
