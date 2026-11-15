# Climate

What the Climate tab computes and draws ([spec 20](../../../docs/specs/20-climate.md)): the Hilo thermostats and the heat pump as a list, the phone's dial and the tablet's gauge. This folder holds, since #242, the pure half of the first move: the heat pump's reading, the list's items, and the dial and the gauge as geometry. The pane, the detail, the history and the controls come in the moves after it; until #248 the legacy panel draws the tab and keeps its own copies of these rules.

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
  dial-geometry.ts         dialGeometry(t, sp, lo, hi, size): the track, arc, ticks, dot and knob; dialValueFromPointer(rect, x, y, lo, hi)
  gauge-geometry.ts        gaugeGeometry(t, sp): positions on the 14 to 30 scale and which caption goes under it
```

## The heat pump

`heatPump` reads the config's `heat_pump` entity: the mode (its state), the action, the temperature, the target, the range (`min_temp ?? 16`, `max_temp ?? 30`) and the lists of modes, fan, preset and louvers. The **brand** is `Fujitsu` when the entity's platform is FGLair or its device's manufacturer says Fujitsu, else the manufacturer, else `null`: the provider words nothing, and the list calls an unnamed maker "Heat pump". An unavailable unit reads the defaults, and a configured entity Home Assistant does not know is `present: false`, which the list words "Not found".

## The geometry

`dialGeometry` and `gaugeGeometry` return numbers and path data, never markup: the element places them with `svg` templates, as Energy's `flowLayout` does, so the hardest SVG in the panel is tested with numbers. The dial's setpoint has three states, kept apart: a number (on, or off at the 5 degree frost guard), `null` (off) and `undefined` (not loaded, as on the house's dial, which has no knob). The words ("Off", the gauge's caption) are the model's, from `off` and `caption`. `dialValueFromPointer` is the way back: the angle from the dial's centre, snapped to half degrees, with `'off'` at or below the frost guard (the legacy returned the lowest step `lo` there, so the command that follows, #243 and #248, sends `lo` for `'off'`), and the quarter turn below the dial read as the nearer end.

## Words

The items' words are `climate.*` messages through the `t` the caller gives. The legacy rules are copied as they were, constants included; each copy names #248, the ticket that deletes the legacy panel's own.
