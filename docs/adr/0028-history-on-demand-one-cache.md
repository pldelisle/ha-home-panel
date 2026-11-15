# 0028: History is derived on demand through one panel-wide cache; shared slices live in a provider

Status: accepted (2026-11-15)

## Context

The legacy panel loads every statistic at connect (`loadHistory`) and derives every slice at once (`derive`): the energy flow, the room temperatures, the Wallbox sessions. A tablet that never leaves Home still fetches a year of daily rows.

Weather and Security already keep a cache of their own (`createStatisticsCache`). The energy slices raise a second question: the smart stack's energy card, the live pill's water-heater activity, the Home pane's water-heater tile and the header's "Live · history" line read the same slices the Energy card does, and ADR 0011 forbids one feature reading another's.

## Decision

**A feature loads its own history through the shared cache when it is shown; nothing is fetched for a pane that is hidden.** The load is a reactive controller (`EnergyHistory`, a lazy load): on connect, and whenever its host is active, it asks for its windows in parallel if its data is older than fifteen minutes or the config generation changed. A reply that arrives after the host left or the config changed is dropped; a failure sets `error`, and the next try waits a minute.

**There is one statistics cache per panel**, `statisticsCacheContext`, provided by the shell (two panels stay independent) and handed to the legacy panel as `GuestContext.statistics`. The shell empties it when the config's generation changes. Identical windows are one call, whoever asks, which is why the legacy panel and the Energy card share theirs. Weather's and Security's caches stay as they are, with their own lifetimes.

**A slice that several features read is not one feature's to keep.** `hourlyFlow`, `meterTotals` and `waterDay` are pure functions over statistics rows in `src/providers/power-history.ts`, with the windows they need, the 400-day daily power included (ADR 0025's rule); the legacy panel may import them. What only Energy reads (the daily split, the months, the water heater's cycles) is in `src/features/energy/history.ts`. Spec 21 adds `chargingSessions` to `wallbox.ts` the same way.

## Consequences

- A hidden feature costs nothing.
- Windows start on a stable hour so the cache can answer a repeat; a start that follows the clock would never hit.
- Two features opened in sequence can make two calls where the legacy panel made one combined call; the cache dedupes identical windows.
- The legacy `loadHistory` reads the power windows (the hourly week, the 400 days, the meter's 33 days, today's hours, the water heater's day) through the cache, the very calls Energy's card makes. It asks the client for what only it reads: the temperatures, the Wallbox's year and the heat pump, until specs 20 and 21 move them.
- A shared slice's contract grows with each reader; a slice only one reader needs stays out of a provider.

## Read

`docs/specs/19-energy.md`, "History derived on demand"; ADR 0011; ADR 0025; Fowler, _Patterns of Enterprise Application Architecture_ (Lazy Load).
