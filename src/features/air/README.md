# Air

What the Air tab computes and draws ([spec 18](../../../docs/specs/18-air.md)): the Mila purifiers, the outdoor station, the rating of each room and the controls. This folder holds, since #230, the pure half: the rules that find the purifiers and the station and rate the air (in `src/providers/`, because the smart stack reads them too, [ADR 0025](../../../docs/adr/0025-shared-reads-live-in-providers.md)), `readAir` that composes them with the AQHI, `airIds` that lists what the pane reads, `airModel` that words the card, the detail and the sub-line, the charts' series and options, and the purifier commands as data. The pane, the detail and the room cards follow in the same spec; the legacy panel draws the tab until then and deletes its own copies of these rules with #234.

## The folder

```
src/providers/
  mila.ts                  milaRooms(states, registries, names): AirRoomInputs[]; milaOutside(states, registries): OutsideAirInputs | null; milaAir(...): both from one pass; milaIds(registries): the ids both read, for the store; AIR_SUFFIXES
  air-quality.ts           AQ_BANDS, aqLevel(k, v), outdoorLevel(aqi), rateRoom(room): RoomRating (pure, shared by the stack)
src/features/air/
  README.md
  ids.ts                   airIds(store): each room's fan and sensors, the station's sensors and pollen, the AQHI sensor
  inputs.ts                readAir(states, registries, names, config): AirInputs
  model.ts                 airModel(inputs, deps): AirViewModel: the card, the detail and the sub-line, through `t`, `fmt` and the overlay
  history.ts               metricSeries, outdoorSeries, chartText, airChartOptions, outdoorChartOptions: statistics in, plain-data chart options out
  commands.ts              K (the overlay keys), setMode, setSpeed, toggleFan: `Command` data
```

## The providers

`milaRooms` is **registry-driven discovery** (devices of a platform, entities of a device, roles by suffix), the shape Hilo, FordPass and Wallbox follow. It groups the registry's `mila` entities by device; a device with a `fan.*` is a room, and each of its thirteen sensors is the entity whose id ends `sensor.*_<suffix>` (`AIR_SUFFIXES`). The room is named from the device's area, else the device, else the fan, through the resolver, and the list is by name. A device without a fan that has an `_aqi` sensor is the station, which `milaOutside` reads: the index, PM2.5, the distance and the four `_pollen_status_*` reports; a house without one gives null. The output is inputs, not a view: numbers are numbers (null when a sensor is missing, unavailable or not a number), the fan is `{on, available, percentage, preset}`, and the model words "Automagic" and "Fan off".

`rateRoom` is the legacy `roomAir`: **Mila's own index decides the level** when the room has one (on the US AQI scale, `outdoorLevel`), so the panel matches the Mila app; without it the level is the worst of PM2.5, CO₂, VOC and CO against `AQ_BANDS` (US EPA, ventilation guidance, UBA, WHO). A missing reading is -1, which is never better than good: a room reading only a good CO₂ is good, and a room reading nothing is -1. The `why` is the pollutants at the highest level above good, whatever decided the level. `outdoorLevel(null)` is good, as the legacy panel's was.

`readAir` joins the rooms, the station and the AQHI (`config.entities.aqhi`); `airIds` lists every fan and sensor once each, so the pane redraws only when one changes.

`airModel` is a pure function of the inputs and its deps: the fan's mode and speed come through `deps.overlay`, so a tap shows at once in the control and the card line from one held value (keys `K.mode`, `K.pct`); every word is a catalog key and every figure goes through `fmt`, so the French card reads `1,5k` and `1 234`. The chart options are plain data (ADR 0022): their callbacks close over `fmt`, and the colours are the caller's tokens. The commands are Media's `Command` shape; the element that runs them debounces the speed.
