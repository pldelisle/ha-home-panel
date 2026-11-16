# Climate

What the Climate tab computes and draws ([spec 20](../../../docs/specs/20-climate.md)): the Hilo thermostats and the heat pump as a list, the phone's dial and the tablet's gauge. This folder holds the pure half of the first move: the heat pump's reading, the list's items, and the dial and the gauge as geometry (#242), and the model that words and shapes all of it (#243); and the pane, the list, the detail, the gauge and the dial that draw it (#244). The history's rules come as pure functions (#245) and are drawn in the move after it: until #246 and #248 the legacy panel loads the history and draws the controls, the chart, the heatmap and the outside chart into containers the pane slots, and keeps its own copies of the rules the model has.

## The folder

```
src/providers/
  heat-pump.ts             heatPump(states, registries, config): HeatPumpInputs | null; hpSeries(points, pick): the state history as a line a gap breaks
  power.ts                 powerNow's rooms (spec 19), which gain minTemp and maxTemp here
src/core/
  color.ts                 oklabBlend(from, to, f), toOklab, fromOklab, linear: the heat scale's blend
src/features/climate/
  README.md
  ids.ts                   climateIds(store): each room's thermostat, temperature, target and power, the heat pump, the weather entity and the outside sensor
  inputs.ts                readClimate(states, registries, config): ClimateInputs
  items.ts                 climateItems(inputs, deps): the house, each room and the heat pump, with their words, figures and tones
  history.ts               climateWindow, rangeSeries, setpointSeries, heatingKwh, houseSeries, bucket, heatScale, heatColor, heatRanges, and the options of the heatmap, the room chart and the outside chart
  keys.ts                  K: the overlay's typed keys, a room's setpoint and the heat pump's mode, target, fan, preset and louvers
  model.ts                 climateModel(inputs, history, sel, deps): the summary, the items, the phone's tiles and the detail's head, dial or gauge, tiles, note and controls
  dial-geometry.ts         dialGeometry(t, sp, lo, hi, size): the track, arc, ticks, dot and knob; dialValueFromPointer(rect, x, y, lo, hi)
  gauge-geometry.ts        gaugeGeometry(t, sp): positions on the 14 to 30 scale and which caption goes under it
  index.ts                 climateFeature: the descriptor, `available` from hasClimate, the pane's template with the legacy panel's three containers
  sheets.ts                DETAIL_SHEET: the id of the phone's sheet
  events.ts                ClimateDetailEvent: the pane tells the shell which room and range its detail shows
  climate-pane.ts          <hp-climate-pane>: the header, the phone's tiles and sheet, the tablet's list and detail; keeps the room and the range
  climate-list.ts          <hp-climate-list>: the listbox of the house, the rooms and the heat pump; tells its choice as `select`
  climate-detail.ts        <hp-climate-detail>: the head, the gauge or the dial, the tiles and the note, with slots for the legacy controls and chart
  gauge.ts, dial.ts        <hp-gauge> and <hp-dial>: the geometry placed with svg templates; the dial is an image until #248
  *.element.css            each element's own rules, moved from the legacy sheet
```

## The heat pump

`heatPump` reads the config's `heat_pump` entity: the mode (its state), the action, the temperature, the target, the range (`min_temp ?? 16`, `max_temp ?? 30`) and the lists of modes, fan, preset and louvers. The **brand** is `Fujitsu` when the entity's platform is FGLair or its device's manufacturer says Fujitsu, else the manufacturer, else `null`: the provider words nothing, and the list calls an unnamed maker "Heat pump". An unavailable unit reads the defaults, and a configured entity Home Assistant does not know is `present: false`, which the list words "Not found".

## The geometry

`dialGeometry` and `gaugeGeometry` return numbers and path data, never markup: the element places them with `svg` templates, as Energy's `flowLayout` does, so the hardest SVG in the panel is tested with numbers. The dial's setpoint has three states, kept apart: a number (on, or off at the 5 degree frost guard), `null` (off) and `undefined` (not loaded, as on the house's dial, which has no knob). The words ("Off", the gauge's caption) are the model's, from `off` and `caption`. `dialValueFromPointer` is the way back: the angle from the dial's centre, snapped to half degrees, with `'off'` at or below the frost guard (the legacy returned the lowest step `lo` there, so the command that follows, #243 and #248, sends `lo` for `'off'`), and the quarter turn below the dial read as the nearer end.

## The model

`climateModel` takes the inputs, the loaded history (`null` until #246: the charts are `null` and the Range and Heating tiles show a dash), the selection (`house`, `hp` or a room's key; one that names nothing the house has shows the house, and `selection` says which) and the deps: the catalog and formats, the overlay, `compact` (the phone: the dial, not the big number and the gauge), the range, and the two pieces of element state, the "set every room" value and the armed button. It returns the strings and shapes the elements place, and the controls as a discriminated union (`hp`, `house`, `room`, each possibly `offline`) the element switches on and never computes. A held setpoint or target (`K.sp`, `K.hp.sp`) wins in the dial and the controls and not in the pill or the gauge, which follow the unit, as the legacy panel did; the heat pump's held mode is read once and decides the pill, the gauge's mark and the dial together. The frost guard's rule (below 5.5 is off) is read, never applied: the commands that follow it are #248's.

## The history

`history.ts` is `loadClimRange` and the chart code of the legacy panel as functions over statistics rows, so each rule is named and pinned with literal rows; #246 loads the rows through the shared cache and draws what these return. A row is drawn at the middle of its bucket (`RANGES`' `bucketMs`, halved), to two decimals. **The setpoint rule**: a stretch off throughout (its highest setpoint at or below the frost guard's 5.5) is a gap, one never off shows its mean, one partly off shows its highest. **Heating** is each period's mean kW times its hours, the running period only the hours so far. **The house** is the mean of the rooms at each instant every room has a reading for. **`bucket`** groups a series into the heatmap's cells: the local hour (a day), the six-hour block (a week), the local day (a month) or the week, which starts on Monday by arithmetic on the day key so it does not move with the zone (a year); every cell has a unique key and label, and an `axis` text that says what the heatmap's axis writes under it. The words of a week's blocks are `climate.block.*`; a day's label is the weekday and the hour as `fmt` writes them. The colours are the heat scale's `[degrees, colour]` stops blended in OKLab (`src/core/color.ts`: perceptually even, so neighbouring cells join without a band), in 0.1 degree bands for the chart. The three options builders return plain data (ADR 0022) with the page's colours as tokens the caller gives; the room chart's curve is straight for the heat pump, `monotoneCubic` with a setpoint (ApexCharts splits a `smooth` line once any series has a gap) and `smooth` otherwise. The titles by range (`RANGE_WORDS`) are Climate's own table and not the kit's `RANGES`, which holds only what every reader of a range needs.

## Words

The words are `climate.*` messages through the `t` the caller gives; the heat pump's own (modes, fan speeds, presets and louver positions) are the catalog's where Home Assistant's name is known and are shown capitalised, with the underscore a space, where it is not. The legacy rules are copied as they were, constants included; each copy names #248, the ticket that deletes the legacy panel's own.

## The pane and the legacy panel

`<hp-climate-pane>` is given three containers by the descriptor, as static light DOM the legacy panel fills and Lit binds nothing in: `#cctl` (the controls, slotted under the detail's head), `#cchart` (the legend and the chart, under its tiles) and `#chost` (where the sheet host puts the legacy sheet's panel on a tablet: the heatmap and the outside chart, under the grid). The pane keeps the room and the range for the panel's life, and tells the shell through `ClimateDetailEvent` when its detail comes on screen, changes or leaves; the shell hands the guest `climateDetailChanged`, and the guest draws for it, so the legacy code has no selection of its own. Until #246 types the history, the guest tells the pane the two figures it reads off its own load, the Range tile's span and the Heating tile's kWh, as `climate-figures` on `#chost`, and `climateModel` takes them as `ClimateFigures` (a figure for another room or range is a dash). On a phone a tile asks for `climate.detail` with its room and the sheet holds the same detail with the dial; Home's Climate tile asks for it with nothing and gets the house. The dial is an image until #248 gives it the pointer, the keys, the slider role and the command; the legacy steppers show on the phone until then.
