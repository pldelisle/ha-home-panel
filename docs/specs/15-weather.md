# Spec 15: Weather, the first move: two providers, one model, three elements, and the recipe every later move follows

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 3.
Depends on: [14 Lit shell](14-lit-shell.md) steps B to F (the host, the registry, appearance, the sheet host, the shared test house). Blocks: 16 Media and every later move, which follow this spec's recipe.
Ships as: three pull requests, each a patch release, each pixel-identical. ADR 0020 lands with the first.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

Weather is the feature with the least shared state, which is why the programme moves it first, and it still touches eleven methods of the class, three constants, one sheet's markup, six CSS files and about 230 lines of the French map:

- The pane: `renderWxTiles` (the eight tiles), `renderCompactSubs`'s weather line (`weatherSummary`), and on the phone the old summary card (`#open-weather`, filled by `renderWeather`: sunrise or sunset, the temperature, the condition, high and low with the normals, four facts, four forecast days), moved into the pane by `placePanels`.
- The detail panel, inline in the pane on the tablet and a modal sheet on the phone (`#sh-weather`): `weatherSheet`, `renderWeatherNow` (the big reading, eight tiles with their own history buttons, the sun arc with daylight and its change since yesterday, sunrise, noon and sunset with first and last light, the alerts), `renderForecast` (24 hours as a strip and a chart, the days as range bars with the dot for now), `renderSeason` (months since the records began, warmest and coldest days, strongest gust), the three seven-day charts (temperature and dew point, wind and gusts, pressure), and the radar from the HACS Weather Radar Card (`loadRadarCard`, `radarInit`, `radarStop`).
- The history sheet per tile (`#sh-wx`): `openWx`, `wxSheet`, `loadWx` with the `WX_DEF` table (series, bands, notes, decimals) and `CRANGE` ranges, statistics first and plain history for the sensors that keep none.
- Data: `subscribeForecasts` (daily and hourly, through the API client since spec 12), `wxDays` (Environment Canada sends day and night entries that are folded into one row per local day; the first entry after mid-afternoon is tonight, a low with no high), `alerts` (the `alert_N` and `alert_time_N` attributes of the warnings, watches, advisories and statements sensors), `loadWxHistory` with its fifteen-minute cache (`this.WX`), `sunDay` and the pure `sunTimes`, `condName` and the `COND` table, `wxIcon` and `isDay`.

Environment Canada's knowledge is spread through it: the folding rule, the alert attributes, the observation time and station, the pressure tendency, the normals, the AQHI, wind chill and humidex. A house with another weather integration gets a pane that mostly shows dashes, and nothing says which part of the code assumes which integration. None of it has a test; the baselines are the only proof it works.

## Solution

Move Weather into `src/features/weather/`, with the integration-specific reading in two providers, the logic in one pure model, and three humble Lit elements, in three pull requests:

1. **The pane.** `<hp-weather-pane>` draws the pane header, the eight tiles and, on the phone, the summary card, from `weatherModel`. The providers, the model, their tests, the first UI-kit elements (`<hp-pane-header>`, `<hp-stat-tile>`, the icons module) and the sun maths in the core land here. The legacy detail panel still opens inline in the pane and as a sheet on the phone, through the sheet host.
2. **The detail panel.** `<hp-weather-detail>` draws now, sun, alerts, radar, the hours, the days, the three charts and the season from the model, the forecast controller and a statistics cache in the core; `<hp-chart>` wraps ApexCharts for every feature after this one.
3. **The history sheet, and the deletion.** `<hp-weather-history>` draws one tile's history over a range through `<hp-sheet>` and `<hp-range-tabs>`; the eleven methods, the three constants, the sheet markup, the weather rules of six CSS files and the weather entries of the French map are deleted; the footprint number drops.

Each pull request leaves every baseline identical, and the French pane reads the same text as before, now from the catalog. The recipe (providers, model, elements, styles, registry line, deletion, tests) becomes the "Anatomy of a feature" section of `docs/architecture.md`, with this feature as the worked example.

## User Stories

1. As a household member, I want the Weather tab, its detail panel on the tablet, its sheet on the phone and every tile's history to look and work exactly as before, so that the move is invisible.
2. As a French-speaking user, I want every weather string in French from the first paint, with `16 h 07`, `7 nov.`, `1 234` and `12,5` as today, so that the catalog is as good as the rewrite layer was.
3. As a household member, I want the forecast days and hours to update in place when Environment Canada sends a new forecast, without the strip jumping, so that a glance is never interrupted.
4. As a household member, I want a change to a thermostat or a light to leave the Weather pane untouched, so that the tablet does no work it does not need.
5. As a household member, I want the Weather pane to do nothing while I am on another tab, so that the tablet stays cool.
6. As an adopter with Met.no or OpenWeatherMap instead of Environment Canada, I want the pane to show what my weather entity knows and leave out what it does not, with no dashes for Environment Canada's sensors, so that the panel fits my house.
7. As an adopter, I want to add my weather integration's extras (alerts, normals) as one provider file, so that the model never changes for a new source.
8. As a maintainer, I want the model to be a pure function of the house's states, the forecast and the clock, tested against the made-up house and a recorded fixture, so that today's output is pinned before the code moves.
9. As a maintainer, I want the folding of Environment Canada's day and night entries, the alert attributes and the "tonight" rule in one provider with their own tests, so that an integration quirk is named where it lives.
10. As a maintainer, I want the eight tiles to be data (definitions with message keys, series, bands and notes), not eight branches, so that a ninth tile is one entry.
11. As a maintainer, I want the charts behind one `<hp-chart>` element that loads ApexCharts lazily, follows the theme and destroys itself on disconnect, so that the next six features draw charts by composition.
12. As a maintainer, I want the statistics cache beside the API client, with a time-to-live and stale-reply handling, so that Weather and Climate share one cache instead of `this.WX` and `this.CR`.
13. As a maintainer, I want the radar card loaded through the API client's resources call and mounted by a small module that knows nothing else, so that a missing HACS card degrades to one line of text as today.
14. As a maintainer, I want the behaviour tests for Weather to open the tab, tap a tile, switch a range and read what shows, through the harness alone, so that the tests survive the rewrite.
15. As a maintainer, I want a test that the French catalog entry for every moved string equals what the rewrite layer produced from the English, so that a move cannot change a French pixel.
16. As a maintainer, I want the legacy class to lose every weather method, constant, sheet, style and map entry in the third pull request, with grep gates, so that the footprint number means what it says.
17. As a learner, I want the feature folder to open with a README that names its providers, its model's inputs and outputs, the ids it reads and the patterns it applies, so that the folder teaches the shape every feature has.
18. As a learner, I want the provider seam explained as a strategy with two adapters that both exist (the generic weather entity, Environment Canada), so that the seam is real, not hypothetical.

## Implementation Decisions

### The folder

```
src/core/
  sun.ts                   sunTimes(lat, lon, isoDay): rise, set, dawn, dusk, noon (pure; the suncalc formulas); isDayAt(t, lat, lon, isoDay)
  statistics-cache.ts      createStatisticsCache(api, {ttlMs, now}): the fifteen- and ten-minute caches of the class, once; the client's `statistics` and `history` signatures plus `clear()`, a rejection (a StaleReply too) never kept
src/providers/
  weather-entity.ts        the Home Assistant weather entity: current reading and forecast entries → WeatherSource
  environment-canada.ts    Environment Canada's sensors: alerts, normals, AQHI, UV, feels-like, tendency, observation → WeatherSource
src/features/weather/
  README.md                what it draws, the providers, the ids, the model's inputs and outputs, the patterns
  index.ts                 weatherFeature: FeatureDescriptor
  ids.ts                   weatherIds(config): the entity ids the pane reads
  inputs.ts                readWeather(states, config, sources): WeatherInputs (the composition of the providers)
  model.ts                 weatherModel(inputs, forecast, deps): WeatherViewModel
  tiles.ts                 TILES: the eight StatTileDefinition entries (message keys, series, bands, notes, decimals)
  history.ts               pure: statistics and history rows → series, seven-day sets, season months, records
  forecast-controller.ts   ForecastController: subscribes to daily and hourly through the API client
  weather-pane.ts          <hp-weather-pane>
  weather-detail.ts        <hp-weather-detail>
  weather-history.ts       <hp-weather-history>
  radar.ts                 mountRadar(host, api, {dark, phone, hass, failed}): the HACS Weather Radar Card
  styles.css               the feature's own rules, split out of src/css/ (imported ?inline)
src/ui/
  icons.ts                 ico(name, size), weatherIcon(condition, size, day): svg templates (from the class's ico, wxIcon, COND)
  pane-header.ts           <hp-pane-header icon color heading>, slots title (instead of heading), sub, actions (landed with #167)
  stat-tile.ts             <hp-stat-tile> (today's .stile button)
  ranges.ts                RANGES: the four history ranges as data (the class's CRANGE, words as message keys), read by every feature's history
  chart.ts                 <hp-chart> (pull request 2)
  range-tabs.ts            <hp-range-tabs> (pull request 3)
  styles/stat-tile.css, badge.css, pane-header.css, chart.css, range.css
test/unit/
  providers/weather-entity.test.ts, environment-canada.test.ts
  features/weather/model.test.ts, history.test.ts, inputs.test.ts
  core/sun.test.ts, statistics-cache.test.ts
test/e2e/weather.spec.ts
```

### The provider seam (ADR 0020)

A provider is a **strategy** (Gamma et al.) behind one interface, and the panel composes several at once because one house has several sources: the weather entity knows the current reading and the forecast, Environment Canada's sensors know the alerts, the normals and the rest. Two adapters exist from the first day, so the seam is real by the rule of this spec (user story 18): a seam with one adapter is hypothetical, two make it real; the seam is Feathers's, ADR 0005.

```ts
// src/providers/weather-source.ts (the port; the core's types)
export interface WeatherSource {
  readonly name: string; // 'weather-entity', 'environment-canada'
  /** the entity ids this source reads for the given config; the pane subscribes to their union */
  ids(config: ResolvedConfig): readonly string[];
  /** true when the house has what this source reads; a source that is absent fills nothing */
  present(states: HassEntities, config: ResolvedConfig): boolean;
  /** the fields this source knows; a later source in the list overrides an earlier one, field by field */
  read(states: HassEntities, config: ResolvedConfig): Partial<WeatherInputs>;
}
```

- `src/features/weather/inputs.ts` exports `WEATHER_SOURCES = [weatherEntitySource, environmentCanadaSource]` and `readWeather(states, config, sources = WEATHER_SOURCES)`: starts from `EMPTY_INPUTS`, applies each present source's `read` in order with a shallow merge of defined fields, so Environment Canada's high and low override the entity's forecast-derived ones when both exist, as the class prefers `E.hi` to the entity's attributes today. An adopter adds a source by adding a file and a line; the model never changes. The order is the resolution order and it is documented in the README.
- **`weatherEntitySource`** reads the entity named by `config.entities.weather`: `temperature`, `humidity`, `pressure`, `wind_speed`, `wind_bearing`, the `state` as the condition, and `attribution`. It is present when the entity exists. It is what the bare test house has, so the bare baselines prove it; pull request 1 re-records the bare Weather baselines for them, the move's one approved visual change.
- **`environmentCanadaSource`** reads the keys the resolver already fills by suffix (`cond`, `outT`, `hi`, `lo`, `nhi`, `nlo`, `wind`, `windDir`, `bearing`, `gust`, `hum`, `dew`, `pres`, `tend`, `uv`, `aqhi`, `chill`, `humidex`, `vis`, `pop`, `summary`, `obs`, `warnings`, `watches`, `advisories`, `statements`). It is present when `config.entities.outT` or `config.entities.cond` resolves. It owns the three Environment Canada rules the class spreads out: `foldForecastDays(entries, isoDay)` (day and night entries into one row per local day; a night-only entry gives a low and no high; the condition is the day's, else the night's; the chance of precipitation is the day's maximum), `readAlerts(states, ids, t)` (the `alert_N`, `alert_time_N` attributes; a count without attributes gives one line "N warnings in effect"), and `feelsLike` (wind chill when present, else humidex, else null, with the kind). The forecast folding is exposed as a `foldForecast` field on the source so the model asks the source that knows the integration's shape: `inputs.foldForecast?.(entries) ?? defaultFold(entries)`, where the default is one row per `datetime` as a generic entity sends it.
- The two sources sit in `src/providers/` under the dependency rule (they import the core only). The port type sits in `src/providers/weather-source.ts` beside them; features import providers, providers never import features.

### The inputs, the model and the view model

```ts
// src/providers/weather-source.ts
export interface WeatherInputs {
  temperature: number | null;
  condition: string | null; // Home Assistant's condition word: 'partlycloudy', 'rainy', …
  isDay: boolean; // from the sun entity, else from sunTimes
  sun: {up: boolean; next: {kind: 'rise' | 'set'; at: number} | null};
  today: {hi: number | null; lo: number | null; pop: number | null};
  normals: {hi: number | null; lo: number | null};
  wind: {speed: number | null; gust: number | null; direction: string | null; bearing: number | null};
  humidity: number | null;
  dewPoint: number | null;
  pressure: {kpa: number | null; tendency: string | null};
  uv: number | null;
  aqhi: number | null;
  visibility: number | null;
  feelsLike: {value: number; kind: 'windChill' | 'humidex'} | null;
  summary: string | null; // Environment Canada's text forecast
  observation: {at: number; station: string | null} | null;
  alerts: WeatherAlert[]; // {kind: 'warning' | 'watch' | 'advisory' | 'statement', tone, title, time}
  foldForecast?: (entries: ForecastEntry[], isoDay: (ms: number) => string) => ForecastDay[];
}
export interface ForecastDay {
  dayKey: string; // YYYY-MM-DD in the house's zone
  at: number;
  hi: number | null;
  lo: number | null;
  condition: string | null;
  pop: number | null;
  isTonight: boolean; // a night entry with no high, today
}
```

```ts
// src/features/weather/model.ts
export interface WeatherModelDeps {
  now: number; // passed in, never read
  fmt: Formatters; // the store's locale-aware set (spec 11)
  t: Translate; // the store's t()
  isoDay: (ms: number) => string; // fmt.isoDay, for the fold
  latitude: number;
  longitude: number;
}
export function weatherModel(
  inputs: WeatherInputs,
  forecast: {daily: ForecastEntry[]; hourly: ForecastEntry[]},
  deps: WeatherModelDeps,
): WeatherViewModel;

export interface WeatherViewModel {
  summary: string; // the pane's sub-line: "Partly cloudy · observed 2:00 pm at Springfield · pressure falling · no alerts"
  card: {
    // the phone's summary card
    sunLabel: string;
    sunTime: string; // "Sunset", "4:47 pm"
    temperature: string; // "12.5°"
    condition: string;
    range: string; // "High 14° · Low 6° · normal 9° / 1°"
    facts: {label: string; value: string}[]; // wind, humidity, UV, air quality
    days: DayCell[]; // four: {label, icon: IconSpec, hi, lo, isTonight}
  };
  tiles: StatTileView[]; // eight: {key, icon, label, value, unit, sub, tone?}
  now: {
    // the detail panel's first block
    temperature: string;
    condition: string;
    icon: IconSpec;
    line: string; // "Feels like 10° · High 14° · Low 6°"
    summary: string | null;
    tiles: StatTileView[]; // the eight again, the detail's wording
  };
  sun: SunView | null; // daylight length and change, the arc geometry (percent through the day), sunrise, noon, sunset, first and last light
  alerts: {tone: 'crit' | 'warn' | 'ok'; kind: string; title: string; time: string | null}[];
  hours: HourCell[]; // every third hour of the next 24: {label, icon, temperature, pop}
  hourSeries: {temperature: [number, number][]; pop: [number, number][]}; // the chart's data, all 24
  days: DayRow[]; // {label, icon, condition, lo, hi, barLeft, barWidth, dot: number | null}
}
```

- The model is synchronous, has no DOM, reads no clock and formats everything through `deps.fmt` and `deps.t`, so the view model is strings and numbers an element only places. The sun arc geometry (`cx`, `cy` from the percent through the day) is computed in the model, not in the template, so it is tested.
- `src/features/weather/ids.ts` exports `weatherIds(config) = union(sources.map(s => s.ids(config)), [config.entities.sun, rising, setting])`; the pane's `StoreController` subscribes to exactly these.
- **History** (pull request 2 and 3) is a second pure module, `history.ts`: `sevenDaySeries(rows, ids)` (temperature, dew point, humidity, pressure, wind, gusts as `[ms, value][]`), `seasonMonths(dayRows, isoDay)` (per month: count, mean, low, high, frost nights, hot days, the first day it covers), `records(dayRows, gustRows)` (warmest, coldest, strongest gust, each with its day), `seasonView(dayRows, gustRows, deps)` (the season block's four tiles, its sentence and a row a month, worded through `t` and `fmt`, with the bars' geometry in percent), `tileHistory(def, ids, statRows, historyRows, range)` (statistics when present, else plain history, the class's `loadWx` mapping), `tileStats(series)` (low, mean and high of each line) and `historyChartOptions(def, series, range, deps)` (the multi-axis options of `wxSheet`, without the theme). Each takes the API client's typed replies (`StatisticRow`, `HistoryPoint` from spec 12) and returns data for `<hp-chart>` and tiles.

### The elements

Every element is a **humble object**: it owns a `StoreController`, an `AppearanceConsumer`, runs the model in `willUpdate`, and places the view model. No element reads `hass`, calls `callWS`, formats a date or holds a string the user reads.

- **`<hp-weather-pane>`** (`weather-pane.ts`): `active` property from the shell; `StoreController({ids: s => weatherIds(s.config)})`, paused while inactive; `ForecastController` for the daily and hourly forecast; renders `<hp-pane-header icon="wx" color="var(--m-blue)">` with `t('weather.title')` and the model's `summary`, then, on the phone (`:host([compact])`), the summary card with `repeat(days, d => d.dayKey)`, then the eight `<hp-stat-tile>` with `repeat(tiles, t => t.key)`, then the detail host. The detail host is `<hp-weather-detail>` inline on the tablet from pull request 2; in pull request 1 it is still the guest's `#sh-weather` panel, placed there by the sheet host's inline rule (spec 14 E), so the pane element has a `<slot name="detail">` and the registry's template puts the guest's container, `<div id="wxhost" slot="detail">`, in the pane's light DOM, where the sheet host finds it by id. A tile's `tile-open` event becomes `SheetRequestEvent('weather.history', {key})`; in pull request 1 the shell maps `'weather.history'` to the legacy sheet `sh-wx` through one temporary guest member, `guest.openWeatherHistory(key)`, which opens the class's `openWx`; from pull request 3 it opens `<hp-weather-history>`.
- **`ForecastController`** (`forecast-controller.ts`): on `hostConnected`, if `store.config.entities.weather` resolves, `api.subscribeForecast(id, 'daily', cb)` and `'hourly'`; holds `daily` and `hourly`; `host.requestUpdate()` on each message; unsubscribes on `hostDisconnected` and resubscribes when the store's `generation` changes (the entity may have changed). It is a reactive controller like `StoreController`, and it is the only place Weather talks to the API client for live data. The harness's `subscribeMessage` keeps the callbacks it is given and delivers nothing by itself (unless `?forecast=1` asks for a daily forecast), so the baselines show no forecast, as today; a behaviour test delivers a forecast through a new harness helper `window.house.forecast(type, entries)` that calls the stored callbacks, and reads the days in the pane. Until the detail panel and Home's card move, the guest still reads the forecast: the controller dispatches a temporary `ForecastEvent` that the shell forwards to `guest.forecastChanged`, so there is one subscription pair.
- **`<hp-weather-detail>`** (pull request 2): the blocks of the panel in today's order and markup classes (`.wnow`, `.tiles`, `.sunarc`, `.walerts`, `.radar`, `.hstrip`, `.drow`, `.mrow`), four `<hp-chart>` instances (hours, seven-day temperature, wind, pressure) fed from `hourSeries` and `sevenDaySeries`, the season from `seasonMonths` and `records`, and the radar through `mountRadar`. The statistics load goes through `createStatisticsCache(api, {ttlMs: 15 * 60_000})` from the core: `cache.statistics(ids, 'hour', start, ['mean','min','max'])` returns the cached reply when fresh, else calls the client; a `StaleReply` rejection is caught and says nothing (the reload after a config change asks again), and any other rejection shows the "History is not available right now" line, as today. On the phone the detail is wrapped by `<hp-sheet>`; inline on the tablet it is a child of the pane. The `active` rule applies to it through its parent: a detail in a hidden pane holds no subscription and no chart. As built (#158): the pane owns the cache and draws the detail only while it is on screen (inline while it is the tab, in the sheet while the sheet host has `weather.detail` open), so the rule is the pane's; the start passed to the cache is hour-aligned (`statisticsStart`), so a second opening within the fifteen minutes is a hit; the Home card opens the same sheet over Home, the Weather pane staying in the page behind it without a box and the active tab unchanged (ADR 0022).
- **`<hp-weather-history>`** (pull request 3): `<hp-sheet>` with `<hp-range-tabs>` (Day, Week, Month, Year from `CRANGE`, which moves to `src/ui/ranges.ts` as data for every feature's history), one `<hp-chart>` and the low, mean and high tiles from `tileHistory`. The tile definitions table `TILES` gives the title, sub, note, series, bands, decimals and the `stepline` flag as message keys and data, which is what `WX_DEF` is today with strings replaced by keys.
- **`<hp-chart>`** (`src/ui/chart.ts`, pull request 2): properties `options` (an ApexCharts options object without the theme), `height`; loads the chunk through `loadApex()` on first connect (one promise per page, the module-level cache allowed by spec 10), builds the base options from the host's computed tokens (`--f-body`, `--fg2`, `--line`, the dark tooltip theme), merges, renders; on an `options` change calls `updateOptions` rather than rebuilding; re-renders on a theme change from the appearance context; `destroy()` on disconnect; reduced motion through `MediaQueryController`. The class's `base()`, `mk()`, `S()` and `legend()` move here and into `src/ui/styles/chart.css`. The failure toast (`charts.failed`, spec 11's tracer bullet) is dispatched as a `ToastEvent`.
- **`<hp-stat-tile>`** (`src/ui/stat-tile.ts`): a button with the `.stile` markup (icon, value with a `<small>` unit, label and sub), `key` and `tone` attributes, dispatches `tile-open` with the key on click and on Enter and Space (a button already does). Used by Weather's pane first, by Climate, Energy, Air and Car later.
- **`<hp-pane-header>`** (`src/ui/pane-header.ts`): the `.ph` block with the badge (`icon`, `color`), the heading (`heading`, already translated, or a node in the `title` slot) and slots for the sub-line and the right-hand actions (Lights' Arrange bar uses it). It landed with the ten legacy pane headers (#167), so this ticket only uses it: its host is a block whose margin the pane sets, and in this pane's own shadow root the glass badge needs the Mercury drop's filter drawn there (`lensLike`, `src/ui/lens.ts`).
- **Icons** (`src/ui/icons.ts`): `ico(name, size)` and `weatherIcon(condition, size, day)` return `svg` templates (Lit's `svg` tag), typed by `IconName`; the `COND` names move to the catalog (`weather.cond.partlycloudy` and so on; `condName`'s fallback capitalisation becomes the model's). The class imports the module too until its last use goes, which is allowed (legacy may import nothing but the core; so the class keeps its own `ico` until it is deleted, and the kit's copy is the one that survives: the duplication is listed in the pull request and lasts until the last move).
- **Radar** (`radar.ts`): `mountRadar(host: HTMLElement, api: PanelApi, opts: {dark, phone, hass, failed})` (`hass` from the store, `failed` the catalog's note) loads `weather-radar-card` from the Lovelace resource URL through `api.lovelaceResources()` (falling back to `/hacsfiles/weather-radar-card/weather-radar-card.js`), waits for `customElements.whenDefined`, creates the element with today's `setConfig` object, sets `hass` from the store's `hass`, and returns `{update(hass), destroy()}`; the detail re-mounts only when the theme or the phone flag changed, as `radarKey` does today. The failure shows the one-line note from the catalog. The harness's `lovelace/resources` reply is `[]` (spec 12), and the import fails in the test server, so the note is what the baselines show today and will show after.

### Styles

- `src/features/weather/styles.css` receives, rule by rule and unchanged in text, every weather rule from `src/css/`: `.wxcard`, `.wx`, `.wxfacts`, `.wxd` from `base.css` and `extra.css`; `.wnow`, `.walerts`, `.walert`, `.sunarc`, `.hstrip`, `.drow`, `.dn`, `.dc`, `.dl`, `.dh`, `.dp`, `.rng`, `.season`, `.mrow`, `.radar`, `.rnote`, `.wsum` from `extra.css`; `.wxtiles` from `phone.css`; `.radar` from `glass.css`. `.wxchip` (Home's header chip) and `.wxi` with its animations (the detail's and the idle clock's icons) stay in `src/css/` until the detail, Home and the idle clock move. The card was a `.card.tap`, so its look is written under `.wxcard` and `.wxfacts`; the unused `.wx` and `.facts` rules are deleted. `src/ui/styles/stat-tile.css` receives `.stile` from `phone.css`, `glass.css`, `motion.css` and `extra.css`. The `.app.cp` and `.narrow` prefixes become `:host([compact])` and `:host([narrow])` in the feature's file, the one allowed rewrite of a rule, because the element reflects those attributes through `AppearanceConsumer`.
- `src/styles.js` concatenates the kit's files, as before; the feature's `styles.css` is not joined into it, because no legacy node matches the pane's rules once the card is the pane's own. The no-duplicate-selector test of spec 14 holds, with the pane's rules only in the feature's file. The weather rules of the detail panel leave `src/css/` with the detail's move.
- Glass: the kit's `glass.css` rules for `.stile` and `.radar` come with the kit's sheet; the `--g-m` and wallpaper tokens inherit.

### Strings and formats

- Every string moves to the catalog under `weather.*` (about 90 keys: the tile labels and subs, the detail's lines, the sun block, the alert kinds, the forecast words, the season sentences, the chart series names and tooltip units, the radar and history notes, the condition names) with the French text taken from the French map's entries, which the third pull request deletes. Plurals use ICU (`weather.alerts.count`: `{n, plural, one {# alert in effect} other {# alerts in effect}}`; `weather.frostNights`).
- Formats go through `deps.fmt`: `time` for sunrise and sunset, `hour` for the hour strip, `date` for the records' days, `month` for the season rows, `integer` and `number` for values; `isoDay` for the fold. The equivalence test of spec 11 is what makes this a pixel-identical change in French.
- **French equivalence per move**: `test/unit/i18n/moved-strings.test.ts` takes the list of English messages a move introduced (the catalog's diff, listed in a fixture file the move writes, `test/unit/fixtures/moved/weather.json`), renders each with sample values in English and in French, and asserts the French equals `createFrench(store).text(english)`, the rewrite layer's own output. A moved string whose French differs from the layer's is a visual change and needs an approved baseline, not a silent catalog edit. The test and the fixture files are deleted with the layer in phase 4.

### Deletion (pull request 3) and grep gates

Deleted from `src/home-panel.js`: `renderWeather`, `renderWxTiles`, `weatherSummary`, `alerts`, `wxDays`, `dayName`, `sunDay`, `subscribeForecasts`, `unsubscribeForecasts`, `loadWxHistory`, `weatherSheet`, `renderWeatherNow`, `renderForecast`, `renderSeason`, `openWx`, `wxSheet`, `loadWx`, `loadRadarCard`, `radarInit`, `radarStop`, `isDay`, `sunTimes`, `wxIcon`, `COND`, `condName`, `WX_DEF`, the weather branches of `renderLive` (`'renderWeather'`, the `sh-weather` block), `renderCompact` (`'renderWxTiles'`), `renderCompactSubs`, `buildSheet` and `wire()` (`[data-wx]`), the `#sh-weather` and `#sh-wx` markup (`#open-weather` went in pull request 1, with `renderWeather`: the card is the pane's own), `this.fc`, `this.WX`, `this.WXR`, `this.fcSubs`, `this.wrc`, `this.radarCard`, `this.radarKey`, `this.wxKey`, `this.wxRange`. The Home pane's `#hwx` card and the idle clock's weather icon keep their own reads until their moves (they read the store, not Weather).

Gates: `grep -nE 'renderWeather|renderWxTiles|weatherSummary|wxDays|WX_DEF|radarInit|wxSheet|loadWx\b|sunTimes|wxIcon|condName' src/home-panel.js src/auto.js` is empty; `grep -nE '\.(wxcard|wxtiles|stile|wnow|walerts|sunarc|hstrip|drow|mrow|radar|wxi)\b' src/css/*.css` is empty; `grep -c "weather\|Weather" src/i18n/fr.js` drops by the number of entries the pull request lists; `npm run lint` prints a smaller footprint only when a whole file leaves the set (none does here; the class shrinks by about 900 lines, quoted in the pull request).

### Performance, by construction

- The pane subscribes to about thirty ids; a change to any other entity never reaches it (the store's index, ADR 0012). A behaviour test counts mutations (spec 14's observer): a thermostat change gives zero mutations inside `hp-weather-pane`'s root; a change of the outdoor temperature gives mutations and the new value shows.
- A hidden pane is paused: on another tab the pane holds no subscription and the detail no chart; switching back runs the model once and re-subscribes.
- `repeat` keyed by `dayKey`, hour `datetime` and tile `key` keeps DOM nodes across forecast updates, so a strip never flickers and a focused tile stays focused.
- The forecast arrives through its own controller, so a forecast message re-renders the pane and nothing else; the statistics cache means opening the detail twice in fifteen minutes makes one request, as today.
- Charts update through `updateOptions`, not destroy and rebuild, except on a theme change where ApexCharts needs the new colours.

## Acceptance Criteria

Pull request 1, the pane:

1. `src/providers/weather-source.ts`, `weather-entity.ts`, `environment-canada.ts`, `src/core/sun.ts`, `src/features/weather/{README.md,index.ts,ids.ts,inputs.ts,model.ts,tiles.ts,forecast-controller.ts,weather-pane.ts,styles.css}`, `src/ui/{icons.ts,pane-header.ts,stat-tile.ts}` exist with module headers; `FEATURES` has `weatherFeature` in place of `legacyFeature('weather')`.
2. Vitest: the two providers (present and absent; the fold with day and night, night-only, tonight; alerts from attributes and from a bare count; feels-like kind), `readWeather`'s override order, `weatherModel` from the full test house at the afternoon instant in English and French and from the recorded fixture, `sunTimes` for a known date and place against published times within two minutes (the suncalc formulas run 50 to 110 s from NOAA's tables); providers, model, ids, inputs and sun at 100 percent statements.
3. Playwright `weather.spec.ts`: the tab opens and shows eight tiles with the house's values; a tile tap opens the history (still the legacy sheet) with the tile's title; the sub-line reads as before in English and French; `window.house.forecast('daily', …)` shows four days on the phone's card; a thermostat change causes zero mutations in the pane's root; axe clean on the tab.
4. The French equivalence test passes for `test/unit/fixtures/moved/weather.json`; the English map entries for the pane's strings are deleted from `src/i18n/fr.js`.
5. Every baseline identical (`npm run test:visual:docker` with no update), `npm run check` and `npm test -- --coverage` green; ADR 0020 accepted; `docs/architecture.md`'s "Anatomy of a feature" names this folder as the example.

Pull request 2, the detail:

6. `src/core/statistics-cache.ts` (tested with the fake `hass`: fresh hit, expired miss, `StaleReply` passthrough), `src/features/weather/{history.ts,weather-detail.ts,radar.ts}`, `src/ui/chart.ts` exist; `history.ts` at 100 percent statements with literal rows.
7. The detail is `<hp-weather-detail>` inline on the tablet and inside `<hp-sheet>` on the phone; the legacy `#sh-weather` markup and `weatherSheet`, `renderWeatherNow`, `renderForecast`, `renderSeason`, `loadWxHistory`, the radar methods are deleted; the baselines `weather-*` and the phone weather sheet are identical; a behaviour test opens the detail on the phone and reads the sun block; the charts' chunk is requested only when the detail opens (the existing `chunks.spec.ts` rule).

Pull request 3, the history and the deletion:

8. `<hp-weather-history>`, `<hp-range-tabs>`, `src/ui/ranges.ts` exist; a tile's history opens through `SheetRequestEvent`, switches ranges and reads low, mean and high; `openWx`, `wxSheet`, `loadWx`, `WX_DEF`, `#sh-wx` are deleted.
9. The grep gates above hold; the class's line count drop is quoted; the no-duplicate-selector test passes with the weather rules only in the feature's file.
10. Every baseline identical; the end-to-end, unit and lint runs green; the French map lost every weather entry the fixture lists.

## Testing Decisions

The seams are the two of ADR 0005. New in kind: the mutation count, the harness's `forecast` helper (the test's side of the boundary growing, as spec 10 allowed), and the French equivalence test over a move's strings. The providers and the model are the pure-function seam and get most of the tests; the elements are proven by `weather.spec.ts` and the baselines; `<hp-chart>` is proven by the detail's baselines and `chunks.spec.ts`. Prior art: `config.test.mjs` for the pure style, `lights-sheet.spec.ts` for the sheet-driving style, `tabs.spec.ts` for the observer trick.

## Out of Scope

- The Home pane's weather card (`#hwx`) and the idle clock's condition icon: they move with the shell's Home composition and the clock feature, and will consume `features/weather/weather-card.ts`, written then.
- Any new weather source (Met.no, OpenWeatherMap): the seam is there; the adapter is an adopter's pull request.
- Any change of look, wording or chart style; a French string whose catalog text would differ from the layer's output waits for its own pull request.
- Replacing the Weather Radar Card or ApexCharts.

## Notes

- **Why providers are a list and not a lookup by integration name.** A house has both sources at once, and a field may come from either; a merge in a declared order says which wins without a branch per field. The alternative, one provider that knows both, is today's code with a new name.
- **Why `foldForecast` is a field on the inputs.** The fold is integration knowledge (Environment Canada's day and night entries) but it runs on forecast messages that arrive later than the states; passing the fold with the inputs keeps the model pure and the knowledge in the provider.
- **Why the statistics cache is in the core and not in the feature.** Spec 12 kept caching out of the client as policy. Two features already cache (`this.WX`, `this.CR`), so the second adapter exists and the shared module is justified now, beside the client.
- **Why `sunTimes` is in the core.** It is pure arithmetic over a date and a place, used by Weather, by the day-or-night icon and later by the idle clock and the theme; it has no DOM and no `hass`, which is the core's definition.
- **Reading**: Gamma et al., _Design Patterns_ (strategy, composite); Evans, _Domain-Driven Design_ (anti-corruption layer, which is what the providers are); Lit docs, _Reactive Controllers_, _Templates: repeat_; ApexCharts, _updateOptions_; Home Assistant developer docs, _Weather entity_ and the `weather/subscribe_forecast` message; Environment Canada integration docs (the sensor list and the alert attributes).
