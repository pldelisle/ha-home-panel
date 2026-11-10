# Weather

What the Weather tab computes and draws ([spec 15](../../../docs/specs/15-weather.md)). The model and its sources are pure, with no DOM; the pane and the detail are the elements that place what they return. A tile's history sheet is the third element, and the legacy panel holds no weather method of its own but what Home's card and the idle clock still read.

## What it draws

The pane's sub-line, the eight stat tiles, the phone's summary card, and the detail: the big reading, the eight tiles in the detail's wording, the sun arc, the alerts, the radar, the next hours as a strip and a chart, the days as range bars, three seven-day charts and the season. The words come out of one function, `weatherModel`, as strings and numbers an element only places; the charts and the season come out of `history.ts` over the statistics the cache returns.

## The providers

Two weather sources sit behind one port, `WeatherSource` ([ADR 0020](../../../docs/adr/0020-weather-source-strategies.md)):

| Source               | File                                  | Reads                                                                                                           |
| -------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `weather-entity`     | `src/providers/weather-entity.ts`     | the Home Assistant weather entity: the condition, temperature, humidity, pressure, wind and the credit line     |
| `environment-canada` | `src/providers/environment-canada.ts` | Environment Canada's sensors: the observation, the normals, the air quality, the alerts, the day and night fold |

`readWeather(states, config, sources = WEATHER_SOURCES)` starts from `EMPTY_INPUTS` plus the sun's part, then applies each present source's fields in list order. **A later source wins a field both know**, field by field and shallowly: a group such as `wind` is replaced whole, so a source leaves a group out when it knows none of it. The order is the order of resolution:

1. `weather-entity`: the first, so every house has a reading.
2. `environment-canada`: over it. Its condition, wind, pressure and the rest replace the entity's; its outdoor temperature fills only what the entity lacks.

A house adds a source with one file and one line in `WEATHER_SOURCES`; the model never changes.

## The elements

| File                                                                                    | What                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `index.ts`                                                                              | `weatherFeature`, the registry's descriptor: always shown, the More sheet's word from `weatherBrief`, and the pane's template.                                                                                                                                                                                                                                                                                              |
| `weather-pane.ts`                                                                       | `<hp-weather-pane>`: on the phone the header, the summary card, the eight `<hp-stat-tile>`s, keyed by `dayKey` and tile `key`, and the detail's `<hp-sheet>`; on a tablet the detail inline. It owns the statistics caches (the detail's, fifteen minutes, and a tile history's, ten) and draws the detail and the history only while they are on screen. A tile asks for `weather.history`, the card for `weather.detail`. |
| `weather-detail.ts`                                                                     | `<hp-weather-detail>`: the blocks in today's order and classes, from the pane's view model and the cache's rows; four `<hp-chart>`; the statistics asked for when it first shows, again when they are fifteen minutes old or the config changed. Everything it holds (the radar, a reply on its way, the charts) goes when it leaves the page.                                                                              |
| `radar.ts`                                                                              | `mountRadar(host, api, {dark, phone, hass, failed})`: loads the HACS card from its Lovelace resource (or HACS's own path), makes it, and returns `{update(hass), destroy()}`; the detail makes a new map only when the theme or the window's shape changes.                                                                                                                                                                 |
| `forecast-controller.ts`                                                                | The daily and hourly forecast, subscribed through the API client while the pane is connected and the house has the weather entity; it subscribes again when the entity or the config generation changes. A temporary `ForecastEvent` tells the guest, which still reads the forecast.                                                                                                                                       |
| `weather-history.ts`                                                                    | `<hp-weather-history>`: a tile's history in an `<hp-sheet>`: `<hp-range-tabs>`, a chart of its lines and the low, mean and high of each. The pane draws it only while the sheet host has `weather.history` open, so it asks for statistics while connected and lets go on disconnect; a reply for another range or for a closed sheet is dropped.                                                                           |
| `sheets.ts`                                                                             | The ids of the sheets Weather asks the shell for: `weather.detail` and `weather.history`.                                                                                                                                                                                                                                                                                                                                   |
| `styles.css`                                                                            | The pane's and the detail's rules in the legacy form, adopted through `forShadow`.                                                                                                                                                                                                                                                                                                                                          |
| `weather-pane.element.css`, `weather-detail.element.css`, `weather-history.element.css` | Each element's own `:host` rules and what only its tree has, adopted through `forShadow` after the sheets above.                                                                                                                                                                                                                                                                                                            |

A tile's request names it (`SheetRequestEvent('weather.history', {key})`); the sheet host keeps the `{key}` with the open sheet and the descriptor hands it to the pane (`historyTile`), which also stays in the page behind the sheet on any tab (`overSheets`), so the detail opened from Home's card can open a history over Home.

The pane draws nothing while it is not the tab on screen: the shell sets `active`, a hidden pane has paused its store controller, and its `willUpdate` keeps what it drew. A change to an entity it does not read never reaches it.

## The ids

`weatherIds(config)` is the union of what each source reads, the sun entity, the sensors for its next rising and setting and the one for its first light. The pane's store controller subscribes to exactly these, so a change anywhere else never reaches it.

## The model

```
weatherModel(inputs, forecast, deps) → WeatherViewModel
```

- **Inputs**: `WeatherInputs` from `readWeather` (the temperature, condition, sun, today's high and low, normals, wind, humidity, dew point, pressure and tendency, UV, air quality, visibility, feels-like, text forecast, observation, alerts) and the forecast as the API client delivers it (`daily` and `hourly` entries).
- **Deps**: `now` (passed in, never read), `fmt` and `t` from the store, `isoDay`, and the house's latitude and longitude.
- **Outputs**: `summary`, `card`, `tiles` (the pane's eight), `now` (the detail's first block, with its eight tiles), `sun`, `alerts`, `hours`, `hourSeries`, `days`. Every string went through `deps.t`, every figure through `deps.fmt`.

`TILES` is the eight stat tiles as data: the label, the history sheet's words as message keys, the series, the scale and the bands. A band carries a tone name (`ok`, `warn`, `crit`), never a colour; the element maps it to a token.

## The history

The detail and the history sheet draw from `history.ts`, a second pure module: the API client's rows in, data out. It never calls the client; the element asks `createStatisticsCache` (`src/core/statistics-cache.ts`, a time-to-live memo with the client's own signatures) and hands the rows over.

| Function                                              | Gives                                                                                                     |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `sevenDaySeries(rows, ids)`                           | the hourly temperature, dew point, humidity, pressure, wind and gusts as `[ms, value][]`, nulls skipped   |
| `seasonMonths(dayRows, isoDay)`                       | per month since the records began: days, mean, low, high, frost nights, hot days, the first day it covers |
| `records(dayRows, gustRows)`                          | the warmest, the coldest and the strongest gust, each with its day                                        |
| `seasonView(dayRows, gustRows, {fmt, t, now})`        | the season block as words and percentages: four tiles, the sentence, a row a month on one scale           |
| `tileHistory(def, ids, statRows, historyRows, range)` | the lines of a tile's chart: statistics when the recorder has them, else the plain history thinned        |
| `tileStats(series)` and `historyChartOptions(...)`    | each line's low, mean and high, and the multi-axis chart options without the theme                        |
| `detailChartOptions(hours, week, deps)`               | the detail's four charts' options without the theme, every word through `t` and `fmt`                     |
| `statisticsStart(now, days)`                          | the top of the hour, `days` back: the stable start that lets the cache hit                                |

The ranges (a day, a week, a month, a year) are `RANGES` in `src/ui/ranges.ts`, shared with every feature that draws a history, and their tabs are `<hp-range-tabs>` (`src/ui/range-tabs.ts`). A tile's history asks the pane's second cache (ten minutes) for the statistics of its sensors, then for the plain history of the ones the recorder keeps none for (`idsWithoutStatistics`); the start is `statisticsStart`'s, so choosing Week again is a hit.

## Things to know

- A field two sources both know follows list order, except one a source gives way on (`fallback`): the outdoor temperature sensor fills the temperature only when the weather entity has none, as the legacy panel, the Home card and the idle clock read it.
- The weather entity's humidity, pressure and wind now reach the tiles, so a house with only an entity shows them where the legacy panel showed dashes. Only the phone shows the tiles, so no tablet baseline moved.
- An alert from a sensor that only counts has no title; the model words it with the count (`weather.alerts.count`), in the alert's own row.
- Environment Canada's own condition phrases (`Mainly Sunny`) are the integration's data: its adapter maps the ones it knows to `weather.cond.ec.*` messages (`conditionWordsOf`, carried as `conditionWords`), so the French pane reads `Généralement ensoleillé` from the catalog; a phrase it does not know is capitalised by the model (`conditionName`) and stays in English in French.
- A tonight row has a low and no high (`isTonight`); the model says Tonight only for today's.

## The patterns

- **Strategy** (Gamma et al., _Design Patterns_): the sources behind `WeatherSource`, two adapters that both exist.
- **Anti-corruption layer** (Evans, _Domain-Driven Design_): each adapter keeps an integration's naming out of the model.
- **Functional core** (Bernhardt, _Boundaries_): `weatherModel` is a pure function of the inputs, the forecast and the clock it is given.
- **Humble object** (Meszaros, _xUnit Test Patterns_): the elements only place what the model returns.
- **Table-driven design**: `TILES` is data, not eight branches.

## Tests

`test/e2e/weather.spec.ts` (the phone's pane through the harness: tiles, both languages, the forecast, the detail's sheet, mutation counts), `test/e2e/weather-detail.spec.ts` (the tablet's detail: the cache, the charts, the radar), `test/e2e/weather-history.spec.ts` (a tile's history on both: the ranges, the cache, Escape and the focus, one notification each), `test/unit/providers/` (the two sources, the fold, the alerts), `test/unit/features/weather/` (`readWeather`'s order, the ids, the model from the test house in English and French, the forecast, the history from literal rows), `test/unit/core/statistics-cache.test.ts`, `test/unit/ui/ranges.test.ts`, `test/unit/i18n/moved-strings.test.ts` (the French of every `weather.*` message equals what the rewrite layer made of the English). The providers, the model, the ids, the inputs, the tiles, the history, the cache and the ranges are at 100 percent statements.
