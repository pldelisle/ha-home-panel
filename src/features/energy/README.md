# Energy

What the Energy tab computes and draws ([spec 19](../../../docs/specs/19-energy.md)): the live power flow, the water heater, Hilo and the history behind them. This folder holds, since #237 and #238, the pure half: the history's slices and its on-demand loader, `readEnergy` that composes the readers, `energyIds` that lists what the pane reads, `energyModel` that words the card, the two cards and the phone's tiles, and the two drawings as geometry. The shared reads are in `src/providers/`, because the header, the live pill and Climate read them too ([ADR 0025](../../../docs/adr/0025-shared-reads-live-in-providers.md)); the elements come with #239.

## The folder

```
src/providers/
  power.ts                 powerNow(states, config): PowerNow; roomPower(states, room): the live flow every reader shares
  hilo.ts                  hiloRates, hiloChallenge, hiloRewards, hiloPresent: the tier rule and the challenge
  hydro-quebec.ts          hydroQuebec(states, config): the balance and the peak flags
  wallbox.ts               wallbox(states, config): the charger's power, status and presence
  power-history.ts         powerWindows, hourlyFlow, meterTotals, waterDay: the slices other readers share, pure over statistics rows (ADR 0028)
src/features/energy/
  README.md
  ids.ts                   energyIds(store): the grid and the meters, the water heater's, the charger's, Hilo's and Hydro-Québec's sensors, each room's power and thermostat
  inputs.ts                readEnergy(states, config, names): EnergyInputs
  model.ts                 energyModel(inputs, history, deps): EnergyViewModel: the summary, the card, the water heater and Hilo cards, the phone's tiles
  flow-layout.ts           flowLayout(power, deps): FlowGeometry: the rings, the connectors with their widths and dash durations, the captions
  water-chart.ts           waterChartGeometry(series, now, deps): the 24-hour chart's grid, ticks, bars and line
  history.ts               windows and slices only Energy reads: dailyTotals, groupTotals, roomTotals, monthlyTotals, waterCycles, waterDaily
  loader.ts                EnergyHistory: a reactive controller that loads the windows through the statistics cache when its host is shown
src/ui/
  thin-axis.ts             thinCategories(cats, phone, wide, compact): the phone's category thinning for a bar chart's axis
```

## The model

`energyModel` is a pure function of the inputs, the loaded history and its deps: every word is a catalog key and every figure goes through `fmt`, so the French card reads `3,24` and `Chauffe, chaud`. The tier is a typed table of two catalog keys (`TIER_WORDS`: the name, "Low tier", and the short form for running text, "low rate"), and so are the challenge's phases (`PHASE_WORDS`); no word is cut or recased in code. A house without Hilo still has a summary, whose tier reads "rate unknown", as the legacy panel's did; the Hilo card and its phone tile exist only for a house whose rate sensor is in the states, and the water heater's for one whose sensors are.

## The geometry

The flow and the water heater's chart are **pure geometry**: a layout function returns numbers and texts (the rings' centres and radii, a connector's `on`, `width` and `duration`, a bar's four numbers, the line's path), and an element places them with `svg` templates, so the arithmetic is tested as data and the template holds none. The numbers are those the legacy panel wrote into its SVG strings. A connector's dash `duration` is a string (`'1.20s'`) so a redraw with the same power keeps the attribute and the animation does not restart. Climate's dial and Car's battery follow the same shape.

## The history

`EnergyHistory` asks the statistics cache for Energy's windows when its host is shown and not before ([ADR 0028](../../../docs/adr/0028-history-on-demand-one-cache.md)); `history.ts` derives the slices from the replies, and `energyModel` reads them: today's meter, the 30-day groups, the water heater's last 24 hours and its daily totals. Until they arrive the tiles read dashes, as the legacy panel's did.
