# The recorded-model suite

How good is the model behind the Ask sheet? This folder measures it. Nothing here runs a model in CI: the model is asked by hand, its raw replies are saved, and a test judges the saved replies ([spec 29](../../../../docs/specs/29-ask.md), "The recorded-model suite").

- `questions.json`: about forty questions in English and French (Québec phrasing), each with `expected`, the plan a correct model returns. They are written against the **full test house's** catalog (`scripts/lib/ask-house.mjs`), with made-up names only. Three forms, the nine periods, binary and threshold tests, a minimum length, and some that must be `unsupported` (a why question, two sensors, a request to switch something, a sensor the house lacks, two periods, small talk, right now).
- `recordings/<label>.json`: what a model answered, one file per model label. Absent until the owner records one.

## Measuring a model

Run it by hand, never in CI, against a Home Assistant that has an AI Task entity:

```sh
HASS_URL=http://homeassistant.local:8123 HASS_TOKEN=<long-lived token> \
  npm run ask:record -- --entity ai_task.local_model --model local-model-1
```

The URL and the token come from the environment and from nowhere else. For each question the command sends the very instructions and structure the panel sends (`askInstructions`, `askStructure`), for the full test house's catalog in the question's language and at a fixed date (stored in the recording as `now`), so a second run asks the same thing. The live house only lends its model: nothing of it is sent. It then writes `test/unit/fixtures/ask/recordings/<label>.json`:

```json
{
  "instructionsVersion": 1,
  "model": "local-model-1",
  "recordedAt": "2026-12-01T15:00:00.000Z",
  "now": "2026-11-21T20:00:00.000Z",
  "replies": {"en-series-office-yesterday": {"form": "series", "sensor": "temp.office", "...": "..."}},
  "failures": {"fr-total-car-last-week": "the model is loading"}
}
```

`replies` holds each raw reply, the six flat fields as the model sent them (`null` where a call failed, with its message in `failures`: a failed call is a miss, not a crash). A reply varies from run to run, so a recording is a snapshot of one run, not a guarantee: record once per label and do not average.

### The score

The command prints how many replies parse, with the panel's own `parsePlan`, to exactly the expected plan: the total, then per language and per form (the form is the one a correct model returns), then each miss as `wanted ..., got ...` (`refused bad_test` is a reply the parser turned away, `unsupported` a plan that gave up). A miss that is `unsupported` or refused costs the household a "cannot look that up"; a miss that is a wrong valid plan costs a wrong answer, which is the one to read first. What score is good enough to turn `ask` on is the owner's call after the first recording.

### In CI

`test/unit/features/ask/recorded.test.ts` parses every reply of every recording and compares it with `expected`. With no recording, it passes and says so. To accept the misses of a model, add the line the command printed to the file, by hand:

```json
"knownMisses": ["fr-total-car-last-week", "en-unsupported-why"]
```

A reply that differs and is not listed fails the test; a known miss that now passes fails it too (remove it from the list); so does a recording whose `instructionsVersion` is older than `INSTRUCTIONS_VERSION` in `src/features/ask/instructions.ts`. The message then names the command to record again. Change the instructions, raise the version, record again.
