# 0030: The daily forecast reaches the elements outside Weather by a context the shell provides

Status: accepted (2026-11-17)

## Context

Weather's `ForecastController` owns the forecast subscription (spec 15) and announces each message with `ForecastEvent`, which the shell heard and passed to the guest, the forecast's last reader there. The smart stack (#266) reads tomorrow's forecast for its evening card, and the Home pane's weather card will (#268). Neither may import Weather (ADR 0011), a provider may not call the API client (ADR 0025), and a second subscription per reader would ask Home Assistant for the same forecast twice. The Home-card bridge forbids the guest from setting a property on an element it places (ADR 0024).

## Decision

**The shell keeps the last daily forecast it heard and provides it as `forecastContext`** (`src/ui/contexts.ts`, typed by the core's `ForecastEntry`), next to the store and the statistics cache. An element that reads tomorrow consumes it with `subscribe: true` and draws again when a new forecast arrives. `ForecastEvent` stays Weather's one announcement; the guest's `forecastChanged` is deleted with its last reader.

## Consequences

- One subscription for the panel, as before; a new reader costs a consumer, not a request.
- The forecast arrives only while Weather's pane is in the page, which it always is (a hidden pane keeps its subscription); until the first message the context holds an empty list, and the evening card waits for it, as the legacy card waited for `this.fc`.
- The shell casts the event's entries to the core's type: the weather provider's type only widens `datetime` to a number, which the API never sends.
- A seventh context: every reader of the forecast outside Weather depends on the shell having heard Weather's event.

## Read

`docs/specs/24-home.md`, "As built in #266"; ADR 0011; ADR 0018; ADR 0025.
