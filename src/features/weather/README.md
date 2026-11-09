# Weather

What the Weather tab computes, with no DOM. The elements that draw it come in the next tickets (spec 15, [the pane](../../../docs/specs/15-weather.md)); this folder and `src/providers/` are what they will be given.

## What it draws

The pane's sub-line, the eight stat tiles, the phone's summary card, the detail panel's first block (the big reading, the eight tiles in the detail's wording, the sun arc, the alerts), the next hours and the days as range bars. All of it comes out of one function, `weatherModel`, as strings and numbers an element only places.

## The providers

Two weather sources sit behind one port, `WeatherSource` ([ADR 0020](../../../docs/adr/0020-weather-source-strategies.md)):

| Source               | File                                  | Reads                                                                                                           |
| -------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `weather-entity`     | `src/providers/weather-entity.ts`     | the Home Assistant weather entity: the condition, temperature, humidity, pressure, wind and the credit line     |
| `environment-canada` | `src/providers/environment-canada.ts` | Environment Canada's sensors: the observation, the normals, the air quality, the alerts, the day and night fold |

`readWeather(states, config, sources = WEATHER_SOURCES)` starts from `EMPTY_INPUTS` plus the sun's part, then applies each present source's fields in list order. **A later source wins a field both know**, field by field and shallowly: a group such as `wind` is replaced whole, so a source leaves a group out when it knows none of it. The order is the order of resolution:

1. `weather-entity`: the first, so every house has a reading.
2. `environment-canada`: over it. Its outdoor temperature, condition, wind, pressure and the rest replace the entity's.

A house adds a source with one file and one line in `WEATHER_SOURCES`; the model never changes.

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

## Things to know

- A field two sources both know follows list order. The outdoor temperature is Environment Canada's sensor over the weather entity's attribute (the legacy panel preferred the attribute; Environment Canada publishes the same observation in both).
- The weather entity's humidity, pressure and wind now reach the tiles, so a house with only an entity shows them where the legacy panel showed dashes.
- An alert from a sensor that only counts has no title; the model words it with the count (`weather.alerts.count`), in the alert's own row.
- Environment Canada's own condition words (`Mainly Sunny`) are the integration's data, not catalog messages: the model capitalises them (`conditionName`), and the rewrite layer still translates them in French until it is deleted.
- A tonight row has a low and no high (`isTonight`); the model says Tonight only for today's.

## The patterns

- **Strategy** (Gamma et al., _Design Patterns_): the sources behind `WeatherSource`, two adapters that both exist.
- **Anti-corruption layer** (Evans, _Domain-Driven Design_): each adapter keeps an integration's naming out of the model.
- **Functional core** (Bernhardt, _Boundaries_): `weatherModel` is a pure function of the inputs, the forecast and the clock it is given.
- **Humble object** (Meszaros, _xUnit Test Patterns_): the elements only place what the model returns.
- **Table-driven design**: `TILES` is data, not eight branches.

## Tests

`test/unit/providers/` (the two sources, the fold, the alerts), `test/unit/features/weather/` (`readWeather`'s order, the ids, the model from the test house in English and French, the forecast), `test/unit/i18n/moved-strings.test.ts` (the French of every `weather.*` message equals what the rewrite layer made of the English). The providers, the model, the ids, the inputs and the tiles are at 100 percent statements.
