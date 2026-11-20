# 0040: The model plans, the panel computes

Status: accepted (2026-11-20)

## Context

The household wants to ask the history in words: "was the patio door left open this week?", "how warm was the office yesterday afternoon?". A language model can turn a sentence into a query. Three forces shape how the panel may use one.

- A model's reply is the least trusted input the panel has ever read. It can be wrong, malformed or hostile text, and the panel must never show it as written or follow it as an instruction.
- The owner sends no reading out of the house. A model that is handed a week of states has them.
- The model is small and local, and a small model that does arithmetic over a week of readings gets it wrong with confidence. It must also be replaceable, with no panel release in between.

## Decision

- **The model returns a plan, and nothing else.** The plan is a closed vocabulary: a form (a series, moments, a total or unsupported), a sensor from the catalog the panel sent, a period from nine words and, for moments, a test. It is parsed once, from `unknown`, into a type (ADR 0015); a reply outside the vocabulary is an error value, shown as "unsupported".
- **The panel does the rest.** It resolves the period to dates in the house's time zone, fetches the history through the statistics cache (ADR 0028), computes every figure with pure functions and writes every sentence from its own catalogs, in its own language.
- **The panel reaches the model only through Home Assistant's AI Task entity**, by the API client (ADR 0014): one method, `generateData`, that calls `ai_task.generate_data`. What the panel sends is the question, the date and the sensor catalog's names; no state, no reading and no entity id.

## Consequences

- No reading leaves the panel, so the exposure is the catalog's names, and the owner can exclude a name.
- A small local model is enough: the task is classification into a few enumerations, not reasoning over data.
- The answer's language is the panel's, not the model's, so French costs nothing.
- A model that is wrong shows as a wrong plan, which a line under the answer states in words, and not as a wrong figure.
- The price: a question outside the vocabulary has no answer, and the vocabulary grows by a spec (a new member of a union, a parser row, an evaluation and its strings), not by a prompt.
- Changing the model is a Home Assistant setting. Its quality is measured by a recorded-model suite the owner runs outside CI.

Alternatives rejected:

- **An agent with history tools.** The values would leave the house, and time arithmetic is where agents fail.
- **The panel calling a model's HTTP API directly.** The tablet would need a key, CORS and mixed-content handling, and the panel's config would hold the model's address.
- **MCP.** It gives a model tools to call; it is not how a client calls a model.

## Read

Spec 29, "The decision this spec records"; ADR 0014 (the typed API client), ADR 0015 (parse, don't validate), ADR 0028 (history on demand).
