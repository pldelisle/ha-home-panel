# Climate

What the Climate tab computes and draws ([spec 20](../../../docs/specs/20-climate.md)): the Hilo thermostats and the heat pump as a list, the phone's dial and the tablet's gauge. This folder holds the pure half of the first move: the heat pump's reading, the list's items, and the dial and the gauge as geometry (#242), and the model that words and shapes all of it (#243). The pane, the detail, the history and the controls come in the moves after it; until #248 the legacy panel draws the tab and keeps its own copies of these rules.

## The folder

```
src/providers/
  heat-pump.ts             heatPump(states, registries, config): HeatPumpInputs | null; hpSeries(points, pick): the state history as a line a gap breaks
  power.ts                 powerNow's rooms (spec 19), which gain minTemp and maxTemp here
src/features/climate/
  README.md
  ids.ts                   climateIds(store): each room's thermostat, temperature, target and power, the heat pump, the weather entity and the outside sensor
  inputs.ts                readClimate(states, registries, config): ClimateInputs
  items.ts                 climateItems(inputs, deps): the house, each room and the heat pump, with their words, figures and tones
  keys.ts                  K: the overlay's typed keys, a room's setpoint and the heat pump's mode, target, fan, preset and louvers
  model.ts                 climateModel(inputs, history, sel, deps): the summary, the items, the phone's tiles and the detail's head, dial or gauge, tiles, note and controls
  dial-geometry.ts         dialGeometry(t, sp, lo, hi, size): the track, arc, ticks, dot and knob; dialValueFromPointer(rect, x, y, lo, hi)
  gauge-geometry.ts        gaugeGeometry(t, sp): positions on the 14 to 30 scale and which caption goes under it
```

## The heat pump

`heatPump` reads the config's `heat_pump` entity: the mode (its state), the action, the temperature, the target, the range (`min_temp ?? 16`, `max_temp ?? 30`) and the lists of modes, fan, preset and louvers. The **brand** is `Fujitsu` when the entity's platform is FGLair or its device's manufacturer says Fujitsu, else the manufacturer, else `null`: the provider words nothing, and the list calls an unnamed maker "Heat pump". An unavailable unit reads the defaults, and a configured entity Home Assistant does not know is `present: false`, which the list words "Not found".

## The geometry

`dialGeometry` and `gaugeGeometry` return numbers and path data, never markup: the element places them with `svg` templates, as Energy's `flowLayout` does, so the hardest SVG in the panel is tested with numbers. The dial's setpoint has three states, kept apart: a number (on, or off at the 5 degree frost guard), `null` (off) and `undefined` (not loaded, as on the house's dial, which has no knob). The words ("Off", the gauge's caption) are the model's, from `off` and `caption`. `dialValueFromPointer` is the way back: the angle from the dial's centre, snapped to half degrees, with `'off'` at or below the frost guard (the legacy returned the lowest step `lo` there, so the command that follows, #243 and #248, sends `lo` for `'off'`), and the quarter turn below the dial read as the nearer end.

## The model

`climateModel` takes the inputs, the loaded history (`null` until #246: the charts are `null` and the Range and Heating tiles show a dash), the selection (`house`, `hp` or a room's key; one that names nothing the house has shows the house, and `selection` says which) and the deps: the catalog and formats, the overlay, `compact` (the phone: the dial, not the big number and the gauge), the range, and the two pieces of element state, the "set every room" value and the armed button. It returns the strings and shapes the elements place, and the controls as a discriminated union (`hp`, `house`, `room`, each possibly `offline`) the element switches on and never computes. A held setpoint or target (`K.sp`, `K.hp.sp`) wins in the dial and the controls and not in the pill or the gauge, which follow the unit, as the legacy panel did; the heat pump's held mode is read once and decides the pill, the gauge's mark and the dial together. The frost guard's rule (below 5.5 is off) is read, never applied: the commands that follow it are #248's.

## Words

The words are `climate.*` messages through the `t` the caller gives; the heat pump's own (modes, fan speeds, presets and louver positions) are the catalog's where Home Assistant's name is known and are shown capitalised, with the underscore a space, where it is not. The legacy rules are copied as they were, constants included; each copy names #248, the ticket that deletes the legacy panel's own.
