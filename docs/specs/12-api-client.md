# Spec 12: One typed client is the only caller of Home Assistant's WebSocket

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 2.
Depends on: [10 entity store](10-entity-store.md) (the store's `hass` and `generation`). Blocks: nothing in phase 2; every phase-3 feature move calls Home Assistant through it.
Ships as: one pull request, a patch release, no visible change. ADR 0014 lands with it.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

The panel builds Home Assistant WebSocket messages by hand at fourteen sites in the class and the Automations module: `recorder/statistics_during_period` (one wrapper, `stats()`), `history/history_during_period` (four sites, each spelling its own `minimal_response`, `no_attributes` and `significant_changes_only`), `frontend/get_system_data` and `frontend/set_system_data` under the `home_panel` key (three sites), `trace/list`, `trace/get` and `automation/config` (Automations), `lovelace/resources` (to find the radar card), the `weather/subscribe_forecast` subscription (daily and hourly), and `callService` through `call()` and once directly. Each site reads the reply by guessing its shape (`y.lu || y.lc`, `r.value`, `x.mean`, `(rs || []).find`), so a renamed field in a Home Assistant release is `undefined` on the tablet and nothing in the build knows. A reply that arrives after the panel's config changed is dropped in two different ways (`loadHistory` compares a config key, the sensor sheet compares a `Symbol`) and not at all in two others (the climate and weather series caches). The harness's fake `callWS` mirrors every message by hand in a chain of ternaries, with no type telling it what a reply should look like. Phase 3 will add eleven features that read history, statistics and forecasts; each would copy the pattern.

In the reading list's words: there is no port. `hass.callWS` is reached from everywhere, so the wire format of Home Assistant is the panel's format.

## Solution

One module, the **API client**, is the panel's **port** to Home Assistant (Cockburn's ports and adapters): a typed method per message the panel sends, with a typed reply, and nothing else in `src/` may call `callWS`, `callService` or `connection.subscribeMessage`. The client is also the **anti-corruption layer** (Evans): a reply is read at the edge into the panel's own type, so the rest of the panel never parses a wire shape (times become milliseconds, the two history shapes become one; field names the panel reads as they are stay the wire's). Reads carry the store's config generation and **reject with a typed `StaleReply`** when the config changed before the reply arrived, one rule for the four ad-hoc guards. `hass` is the production adapter at this port; the fake `hass` of the unit tests and the harness is the second adapter, which is what makes the seam real. A lint rule makes the port the only way out.

## User Stories

1. As a maintainer, I want every WebSocket message the panel sends written once, so that a Home Assistant change is fixed in one place.
2. As a maintainer, I want each reply typed from what the panel reads, so that a wrong field name is a type error and not `undefined` on a tablet.
3. As a maintainer, I want a reply for a stale config dropped by one rule, so that a redraw after a config change never paints old history over new rooms.
4. As a maintainer, I want the fake `hass` to answer every typed message with a typed reply, so that a test of a phase-3 model has realistic data to feed it.
5. As a maintainer, I want a lint error on `callWS` outside the client, so that the port stays the only exit after I stop looking.
6. As an agent thread, I want the client tested with the fake `hass` by asserting the exact message sent and the typed reply returned, so that I can change the client without a browser.
7. As an agent thread writing a phase-3 feature, I want to call `api.history(...)` and get rows with named fields, so that the model's test fixtures are the client's reply type and nothing else.
8. As a household member, I want the panel to behave exactly as before, so that a structural release is invisible to me.
9. As a learner, I want the client's header and ADR to name ports and adapters, the anti-corruption layer and the gateway pattern, so that I see the textbook shape in a hundred lines.
10. As CI, I want the client at full statement coverage, so that the phase-2 gate is enforced.
11. As a maintainer, I want the in-flight request count visible in the harness console (the `WS` protocol), so that a behaviour test can still assert what the panel asked Home Assistant.

## Implementation Decisions

### The client

`src/core/api.ts` exports `createApi(store)`; the element creates `this.api` beside its store. The header names the patterns: port (Cockburn), gateway (Fowler, _Patterns of Enterprise Application Architecture_), anti-corruption layer (Evans). The methods, each with the message it sends (exactly what the class sends today) and the reply type it returns:

| Method                                             | Message                                                                                                                                                                          | Reply type                                                                                                                                                                                        | Replaces                                             |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `statistics(ids, period, start, types, end?)`      | `recorder/statistics_during_period` with `statistic_ids`, `period`, `types`, ISO `start_time`, optional `end_time`, and `units: {power: 'kW', energy: 'kWh', temperature: '°C'}` | `Record<statisticId, StatisticRow[]>`; `StatisticRow` has `start`, `end` (ms or ISO, read into ms), optional `mean`, `min`, `max`, `change`, `sum`, `state`                                       | `stats()` and its six callers                        |
| `history(ids, start, {minimal, attributes, end?})` | `history/history_during_period` with `entity_ids`, ISO `start_time`, `minimal_response`, `no_attributes`, `significant_changes_only: false`, optional `end_time`                 | `Record<entityId, HistoryPoint[]>`; `HistoryPoint` is `{state, lastUpdated, lastChanged, attributes?}` read from either the minimal (`s`, `lu`, `lc`, `a`) or the full shape                      | the four history sites                               |
| `getSystemData(key)` / `setSystemData(key, value)` | `frontend/get_system_data` `{key}` / `frontend/set_system_data` `{key, value}`                                                                                                   | `PanelSystemData` for key `home_panel`: `{light_order?: string[] \| null, light_links?: string[][]}`; `null` when unset                                                                           | `loadLightOrder`, `saveLightOrder`, `saveLightLinks` |
| `traceList(domain)`                                | `trace/list` `{domain}`                                                                                                                                                          | `TraceSummary[]` (`item_id`, `run_id`, `timestamp.start/finish`, `state`, `script_execution`, `last_step`, `error?`)                                                                              | the Automations list load                            |
| `traceGet(domain, itemId, runId)`                  | `trace/get` `{domain, item_id, run_id}`                                                                                                                                          | `Trace` (the fields the flow drawing reads; the rest `unknown`)                                                                                                                                   | the Automations flow load                            |
| `automationConfig(entityId)`                       | `automation/config` `{entity_id}`                                                                                                                                                | `{config: AutomationConfig \| null}`                                                                                                                                                              | the Automations config load                          |
| `lovelaceResources()`                              | `lovelace/resources`                                                                                                                                                             | `{id, url, type}[]`                                                                                                                                                                               | the radar card loader                                |
| `subscribeForecast(entityId, type, cb)`            | `connection.subscribeMessage(cb, {type: 'weather/subscribe_forecast', forecast_type, entity_id})`                                                                                | `cb` receives `ForecastEntry[]` (`datetime`, `condition`, `temperature`, `templow?`, `precipitation?`, `precipitation_probability?`, `wind_speed?`, `is_daytime?`); returns `Promise<() => void>` | `subscribeForecasts`                                 |
| `callService(domain, service, data?)`              | `hass.callService(domain, service, data)`                                                                                                                                        | `Promise<void>`                                                                                                                                                                                   | `call()` and the direct `media_player.turn_on` site  |

- **Reading at the edge.** Each method maps the wire reply to its type in the client (`lu`/`lc` seconds to `lastUpdated` ms; `start` string or number to ms) so no caller does. Fields the panel does not read stay out of the types or are `unknown`; the type is "what the panel reads", not Home Assistant's whole schema. Types live in `src/core/ha.ts` beside `PanelHass`; what `home-assistant-js-websocket` already types (`HassEntity`, `HassConfig`, `HassUser`, `Connection`, `MessageBase`) is imported from it.
- **Stale replies.** Every read method captures `store.generation` when called and, when the reply arrives under a different generation, rejects with `StaleReply` (an `Error` subclass with the two generations). A read whose answer does not depend on the config opts out with `{stale: false}` (`getSystemData` for the light order: the system data is the same under every config, and a boot sets `hass` before `panel`, so the first read would otherwise always be stale). Writes (`setSystemData`, `callService`) and subscriptions never reject for staleness (a save is a save; the class tears subscriptions down itself). The four ad-hoc guards are deleted; `loadHistory`'s key check, the sensor sheet's `Symbol`, and the two caches now simply catch `StaleReply` and return. A caller that does not care (`.catch(() => ({}))`) keeps working. The ADR records why rejection and not a silent `undefined`: a dropped reply must be visible to a reader of the code and distinguishable from a network error (make illegal states unrepresentable: "no reply" and "old reply" are different values).
- **No caching, no retries, no batching** in the client. The class's caches (`CR`, `WXR`, the ten-minute rule) stay where they are until the Climate and Weather moves put them in models. A deep module hides complexity callers need; it does not take on policy they would then have to configure.
- **The console protocol** of the harness (`SERVICE …`, `WS …`) is unchanged: the harness's fake `callService` and `callWS` log as today; the client only changes who calls them.

### The lint rule

An ESLint `no-restricted-syntax` block for every file under `src/` except `src/core/api.ts` forbids member calls named `callWS`, `callService`, `subscribeMessage` and `subscribeEvents`, with the message "Call Home Assistant through the API client (src/core/api.ts)". The dependency rule of spec 09 already keeps `src/core/` free of the rest; this rule keeps the rest free of the socket. Checked once with a deliberate violation in the PR.

### The class and the Automations module

Each of the fourteen sites becomes a call on `this.api` with the row's method; the Automations module's methods run with `this` as the element and do the same. The `call(domain, service, data, done)` helper stays (it owns the toast), calling `this.api.callService`. `subscribeForecasts` keeps its lifecycle and calls `this.api.subscribeForecast` twice. Behaviour is unchanged: the same messages, the same replies read the same way.

### Fakes

- `test/unit/fake-hass.ts` (spec 10) gains a `callWS` router keyed by message `type`, with default replies typed as the client's reply types: empty records for statistics and history, `{value: null}` for system data, `[]` for traces and resources, and a `calls` log of every message sent. A test overrides a reply per type.
- `harness.html`'s `callWS` adds `lovelace/resources` → `[]` (today it falls into the default `{}` and the loader's `.find` on an object is a latent error), keeps every other branch, and its forecast subscription stays a no-op: delivering a forecast would change the weather baselines, which a structural release may not.

### Tests

Vitest, with the fake `hass`: for every method, the exact message sent (literal, copied from today's call site, in the test) and the typed reply returned from a literal wire reply, including the minimal and full history shapes and `start` as a number and as a string; `StaleReply` when `setPanelConfig` changes between call and reply, and no `StaleReply` for `setSystemData` and `callService` under the same change; `subscribeForecast` sends the message, forwards `forecast` to `cb` and its returned function unsubscribes; `getSystemData` returns `null` for `{value: null}`. The Playwright suites that already assert `WS` lines (Arrange, linked rooms) and the Automations spec are the behaviour proof; the baselines prove the pixels.

## Acceptance Criteria

1. `grep -rnE '\.(callWS|callService|subscribeMessage|subscribeEvents)\(' src/ | grep -v '^src/core/api.ts'` returns nothing, and `npm run lint` fails on a deliberately added `hass.callWS(...)` in the class (checked once and reverted).
2. `grep -nE 'sensTag|loadingH === ' src/home-panel.js` returns nothing (the ad-hoc stale guards are gone); `StaleReply` is caught where each guard was.
3. The visual project passes with no baseline updated; the behaviour suites pass (Arrange, linked rooms and Automations still log the same `WS` lines).
4. Vitest covers `src/core/**` at 100 percent statements; the tests listed above exist and pass.
5. `home-assistant-js-websocket` is a dev dependency, pinned, imported with `import type` only (`grep -rn "from 'home-assistant-js-websocket'" src/` shows only `import type`), so `LICENSES.md` is unchanged.
6. `docs/adr/0014-typed-api-client.md` exists (accepted); `src/core/api.ts` and `ha.ts` open with the header convention.
7. `npm run size` before and after is quoted in the PR.
8. A changeset (patch) says: "Every request the panel makes to Home Assistant now goes through one typed door, so a change in Home Assistant is caught at build time. Nothing visible changes."

## Testing Decisions

The client is tested at its interface with the fake `hass`, the second adapter at the port (ADR 0005): a test asserts the message that left and the value that came back, never how the client got there. No socket is mocked; `callWS` is a function on an object, which is exactly what Home Assistant gives the panel. The behaviour suites that read the console protocol are the end-to-end proof. Prior art: the French tests (a fake `hass` handed in), the lights Playwright specs (asserting `WS` lines).

## Out of Scope

- Caching, retrying, batching or deduplicating requests (model-layer and shell concerns of phase 3).
- A camera thumbnail call: the panel builds a `camera_proxy_stream` URL and never calls `camera_thumbnail`; the programme spec's list is corrected.
- Typing Home Assistant's whole trace or forecast schema; only what the panel reads.
- Delivering a forecast in the harness (would change baselines).
- Subscribing to entity or registry collections through `home-assistant-js-websocket`'s `subscribeEntities`; the panel receives `hass` from the frontend, which already does that.

## Notes

- Home Assistant's own frontend has the same shape: `src/data/history.ts`, `src/data/recorder.ts` and `src/data/weather.ts` are typed functions over `hass.callWS`, one per message. The client mirrors that layout in one file because the panel sends nine messages, not nine hundred; it splits when it grows.
- `StaleReply` is the panel's one typed error so far; a future `Unavailable` (Home Assistant disconnected) would be its sibling, not a `null`.
- Reading: Cockburn, _Hexagonal Architecture_ (2005); Evans, _Domain-Driven Design_, anti-corruption layer; Fowler, _Patterns of Enterprise Application Architecture_, Gateway; Home Assistant developer docs, _Frontend data_ and the WebSocket API reference for each message.
