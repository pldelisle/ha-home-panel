# Air

What the Air tab computes and draws ([spec 18](../../../docs/specs/18-air.md)): the Mila purifiers, the outdoor station, the rating of each room and the controls. This folder holds, since #230, the pure half: the rules that find the purifiers and the station and rate the air (in `src/providers/`, because the smart stack reads them too, [ADR 0025](../../../docs/adr/0025-shared-reads-live-in-providers.md)), `readAir` that composes them with the AQHI, `airIds` that lists what the pane reads, `airModel` that words the card, the detail and the sub-line, the charts' series and options, and the purifier commands as data. Since #232 the feature draws the Air tab's header and card: `<hp-air-pane>` and `<hp-air-card>`, on a phone. Since #233 it draws the detail too: `<hp-air-detail>` with a `<hp-air-room>` per purifier, inline in the pane on a tablet (whose pane header is not shown) and in `<hp-sheet>` (`air.detail`) on a phone; the legacy panel's detail is gone, and #234 deleted its own copies of the rules: the stack's air card and the Home tile read `milaRooms` and `rateRoom` through one legacy reader, `airRooms()`, which #268 deleted with the Home tile, and the More word is `airBrief`.

## The folder

```
src/providers/
  mila.ts                  milaRooms(states, registries, names): AirRoomInputs[]; milaOutside(states, registries): OutsideAirInputs | null; milaAir(...): both from one pass; milaIds(registries): the ids both read, for the store; AIR_SUFFIXES
  air-quality.ts           AQ_BANDS, aqLevel(k, v), outdoorLevel(aqi), rateRoom(room): RoomRating (pure, shared by the stack)
src/features/air/
  README.md
  ids.ts                   airIds(store): each room's fan and sensors, the station's sensors and pollen, the AQHI sensor
  inputs.ts                readAir(states, registries, names, config): AirInputs
  model.ts                 airModel(inputs, deps): AirViewModel: the card, the detail and the sub-line, through `t`, `fmt` and the overlay; airBrief(rooms, t): the More sheet's word
  history.ts               metricIds, metricSeries, forRoom, isHistoryRequest, outdoorSeries, chartText, airChartOptions, outdoorChartOptions, statisticsStart, rangeTabs: statistics in, plain-data chart options out
  commands.ts              K (the overlay keys), setMode, setSpeed: `Command` data
  glance.ts                glance(store): the Home pane's Air tile, worded by the model's airGlance, #267
  index.ts                 airFeature: the descriptor, with `detailSheet` and `overSheets`; its More word is `airBrief`, the legacy word ("Good", "No data", "No purifiers")
  sheets.ts                DETAIL_SHEET = 'air.detail', HISTORY_SHEET = 'air.history'
  air-pane.ts              <hp-air-pane>: the detail inline under its header on a phone (the range tabs in it) and alone on a tablet, the detail's sheet over another tab; owns the statistics cache and the range, and draws the reading's history over any tab; air-pane.element.css
  air-detail.ts            <hp-air-detail>: the rooms and the outdoor block with its chart; air-detail.element.css
  air-history.ts           <hp-air-history>: a tile's sheet (#382): one reading in the tapped room over Day, Week or Month, with the station's PM2.5 beside PM2.5; air-history.element.css
  room-card.ts             <hp-air-room>: a purifier's seven tiles, each a button that asks for its history (`air.history`, `{metric, room}`), and its Automagic or Manual control with the debounced stepper; room-card.element.css
  styles.css               the `.aqsum` state line, adopted by the detail
```

## The providers

`milaRooms` is **registry-driven discovery** (devices of a platform, entities of a device, roles by suffix), the shape Hilo, FordPass and Wallbox follow. It groups the registry's `mila` entities by device; a device with a `fan.*` is a room, and each of its thirteen sensors is the entity whose id ends `sensor.*_<suffix>` (`AIR_SUFFIXES`). The room is named from the device's area, else the device, else the fan, through the resolver, and the list is by name. A device without a fan that has an `_aqi` sensor is the station, which `milaOutside` reads: the index, PM2.5, the distance and the four `_pollen_status_*` reports; a house without one gives null. The output is inputs, not a view: numbers are numbers (null when a sensor is missing, unavailable or not a number), the fan is `{on, available, percentage, preset}`, and the model words "Automagic" and "Fan off".

`rateRoom` is the legacy `roomAir`: **Mila's own index decides the level** when the room has one (on the US AQI scale, `outdoorLevel`), so the panel matches the Mila app; without it the level is the worst of PM2.5, CO₂, VOC and CO against `AQ_BANDS` (US EPA, ventilation guidance, UBA, WHO). A missing reading is -1, which is never better than good: a room reading only a good CO₂ is good, and a room reading nothing is -1. The `why` is the pollutants at the highest level above good, whatever decided the level. `outdoorLevel(null)` is good, as the legacy panel's was.

`readAir` joins the rooms, the station and the AQHI (`config.entities.aqhi`); `airIds` lists every fan and sensor once each, so the pane redraws only when one changes.

`airModel` is a pure function of the inputs and its deps: the fan's mode and speed come through `deps.overlay`, so a tap shows at once in the control and the card line from one held value (keys `K.mode`, `K.pct`); every word is a catalog key and every figure goes through `fmt`, so the French card reads `1,5k` and `1 234`. The chart options are plain data (ADR 0022): their callbacks close over `fmt`, and the colours are the caller's tokens. The commands are Media's `Command` shape; `<hp-air-room>` holds each tap in the optimistic store and runs them through `CommandRunner`, and debounces the speed by 900 ms, so a burst of taps is one `fan.set_percentage`.

The detail and the history are controlled components: the pane keeps the range for the panel's life (the legacy sheet kept it) and the ten-minute cache, and `<hp-air-detail>` (the outdoor chart) and `<hp-air-history>` (a tile's reading, #382, which replaced the detail's metric control and its one chart: every one of the seven tiles has a history one tap away, drawn for the tapped room) ask the cache for their chart when it shows and when the range or the config changes, from the top of the hour so a second request within the hour is the cache's hit, dropping a reply that comes late (the detail left, or another range or reading was asked for). A house with no station and no AQHI has no outside block.
