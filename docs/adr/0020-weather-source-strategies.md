# 0020: Weather sources are a list of strategies, merged in order

Status: accepted (2026-11-09)

## Context

Weather's reading was Environment Canada's naming spread through the class: the folding of day and night forecast entries, the alert attributes, the wind chill, the normals. A house with another weather integration got a pane of dashes, nothing said which line assumed which integration, and none of it was tested. A house also has several sources at once: the weather entity knows the current reading and the forecast, Environment Canada's sensors know the alerts and the normals, and a field may come from either.

The alternatives were one provider that knows every integration (today's code under a new name), a lookup of one provider by integration name (a house has two), and a model with a branch per field. ADR 0005's reasoning applies: one adapter is a hypothetical seam, two make it real.

## Decision

A weather source is a **strategy** (Gamma et al.) behind one port, `WeatherSource` in `src/providers/weather-source.ts`: `ids(config)`, `present(states, config)` and `read(states, config)`, which returns the part of the generic `WeatherInputs` the source knows. Two adapters exist from the first day, `weatherEntitySource` and `environmentCanadaSource`, each an anti-corruption layer (Evans) that keeps its integration's naming and units out of the model.

`readWeather` in `src/features/weather/inputs.ts` starts from the empty inputs and the sun's part, then applies each present source in the order of `WEATHER_SOURCES`, a shallow merge of the defined fields in which a later source wins: the entity first, Environment Canada over it. A source is added by one file and one line.

An integration's own rules travel with the inputs, not with the model. Environment Canada's fold of day and night entries is `foldForecast`, a function on the inputs, because the forecast arrives in a message after the states. An alert from a sensor that only counts is data (a count, no title) which the model words.

## Consequences

A new source touches no model and no element, and each integration quirk has a named place and its own test. The providers import the core only and the feature imports the providers (ADR 0011).

The costs:

- A field set by two sources follows list order, documented in the folder's README. The outdoor temperature is now the Environment Canada sensor over the entity's attribute; the old panel preferred the attribute.
- The merge is shallow, so a group such as `wind` is replaced whole. An adapter leaves out a group it knows none of, which limits the loss.
- `WeatherInputs` carries a function, so it is not plain data.
- The entity adapter reads humidity, pressure and wind, which the old panel never showed from an entity: a house with only an entity shows them where it showed dashes.
- An integration's free text (Environment Canada's condition words, an alert's title) stays data, not catalog.

## Read

`docs/specs/15-weather.md`, "The provider seam (ADR 0020)"; Gamma et al., _Design Patterns_ (strategy); Evans, _Domain-Driven Design_ (anti-corruption layer).
