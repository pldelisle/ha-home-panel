# Energy

What the Energy tab computes and draws ([spec 19](../../../docs/specs/19-energy.md)): the live power flow, the water heater, Hilo and the history behind them. This folder holds the pure half, since #237 and #238: the history's slices and its on-demand loader, `readEnergy` that composes the readers, `energyIds` that lists what the pane reads, `energyModel` that words the card, the two cards and the phone's tiles, and the two drawings as geometry; and, since #239, the elements that place them, and, since #240, the detail: the charts, the Sankey and the totals. The shared reads are in `src/providers/`, because the header, the live pill and Climate read them too ([ADR 0025](../../../docs/adr/0025-shared-reads-live-in-providers.md)).

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
  model.ts                 energyModel(inputs, history, deps): EnergyViewModel: the summary, the card, the water heater and Hilo cards, the phone's tiles, the detail
  flow-layout.ts           flowLayout(power, deps): FlowGeometry: the rings, the connectors with their widths and dash durations, the captions
  sankey-layout.ts         sankeyLayout(data, rooms, deps): SankeyGeometry: the grid, the uses and the rooms as ribbons, bars and labels, small rooms gathered
  charts.ts                mainChartOptions, donutOptions and the rows a range draws: the detail's ApexCharts options as plain data
  water-chart.ts           waterChartGeometry(series, now, deps): the 24-hour chart's grid, ticks, bars and line
  history.ts               windows and slices only Energy reads: dailyTotals, groupTotals, roomTotals, monthlyTotals, waterCycles, waterDaily
  loader.ts                EnergyHistory: a reactive controller that loads the windows through the statistics cache when its host is shown
  glance.ts                glance(store, deps), waterGlance(store, deps): the Home pane's Energy and Water heater tiles, from the loaded history, #267
  index.ts                 energyFeature: the descriptor the registry lists, with the two sheets the pane binds
  sheets.ts                the ids of the sheets: the detail's, the water heater's and Hilo's
  energy-pane.ts           <hp-energy-pane>: the header, the card and the tiles on a phone; the detail and the two cards on a tablet; the range and the Sankey's period
  energy-detail.ts         <hp-energy-detail>: the main chart by range, the Sankey and its tabs, the donut with its table, the six totals
  sankey.ts                <hp-sankey>: the Sankey's ribbons, bars and labels, placed from sankeyLayout
  energy-card.ts           <hp-energy-card>: the title line, <hp-power-flow> and four tiles; a button that asks for the detail
  power-flow.ts            <hp-power-flow>: the five rings and four lines, placed with svg templates from flowLayout
  water-card.ts            <hp-water-card>: the hero, the 24-hour chart from waterChartGeometry, its legend and the cycles line
  hilo-card.ts             <hp-hilo-card>: the hero with the rate and the tier, three tiles
  tile-list.ts             tileList(tiles): the kit's tile markup the Energy card, Hilo's card and the totals place
  styles.css               the box, the title line and the chevron the three cards share (adopted, not joined into the legacy sheet)
src/ui/
  thin-axis.ts             thinCategories(cats, phone, wide, compact): the phone's category thinning for a bar chart's axis
  styles/hero.css          .hero: a big figure with its unit and a state pill (the cards here, the legacy Car card, the climate gauge later)
```

## The model

`energyModel` is a pure function of the inputs, the loaded history and its deps: every word is a catalog key and every figure goes through `fmt`, so the French card reads `3,24` and `Chauffe, chaud`. The tier is a typed table of two catalog keys (`TIER_WORDS`: the name, "Low tier", and the short form for running text, "low rate"), and so are the challenge's phases (`PHASE_WORDS`); no word is cut or recased in code. The flow's captions (`GRID`, `WATER HEATING`, `kW · HOME`) are the one place the catalog carries a casing: the legacy SVG wrote them in capitals, and the French equivalence test and #239's markup compare the catalog's text as it reads. Unit symbols (`kWh`, `¢`, `$`, `°C`, the ring's `kW`) are data constants beside the model; a word beside a unit is a catalog key. A house without Hilo still has a summary, whose tier reads "rate unknown", as the legacy panel's did; the Hilo card and its phone tile exist only for a house whose rate sensor is in the states, and the water heater's for one whose sensors are.

## The geometry

The flow, the water heater's chart and the Sankey are **pure geometry**: a layout function returns numbers and texts (the rings' centres and radii, a connector's `on`, `width` and `duration`, a bar's four numbers, the line's path, a ribbon's path and a node's bar), and an element places them with `svg` templates, so the arithmetic is tested as data and the template holds none. The numbers are those the legacy panel wrote into its SVG strings. The Sankey has two scales, `k` for the grid and the four uses (300 pixels less 12 between them, over the grid's total) and `kr` for the rooms (the same, over the larger of the heating and the rooms' sum), and a room under 3 percent of the heating is gathered with the others that small as "Other rooms" when there are two of them; its Now period is not drawn by `sankeyLayout`: the detail places `<hp-power-flow>` with the geometry the card already has. A connector's dash `duration` is a string (`'1.20s'`) so a redraw with the same power keeps the attribute and the animation does not restart. Climate's dial (#242) and Car's 30-day bars (#249) will follow the same shape.

## The detail

`<hp-energy-detail>` draws what `model.detail` words and the loaded history gives. The pane keeps the range (today, week, month, year) and the Sankey's period (now, today, 30 days) for the panel's life and hands them down; a tap is told upward as `range-chosen` and `mode-chosen`. The main chart's and the donut's options are built in `willUpdate` from the history, the range, the theme, the language and the shape, and from nothing else, so a power reading draws no chart again and a range tap reads no statistics: the slices of every range are in the history the pane loaded. The tokens the options need (the four uses' colours, the card's) are read from the element's computed style, and the bars' kinds (a time axis for today and the week, categories for the month and the year) are told to `<hp-chart>` as its `shape`, which draws a new chart when it changes. The detail is inline in the pane on a tablet, with its own header and the range tabs in it, and in `<hp-sheet>` on a phone, with the tabs in the sheet's header, and exists only while shown, so a closed sheet holds no chart.

## The history

`EnergyHistory` asks the statistics cache for Energy's windows when its host is shown and not before ([ADR 0028](../../../docs/adr/0028-history-on-demand-one-cache.md)); `history.ts` derives the slices from the replies, and `energyModel` reads them: today's meter, the 30-day groups, the water heater's last 24 hours and its daily totals. Until they arrive the tiles read dashes, as the legacy panel's did.

The pane mounts `EnergyHistory` over the panel's statistics cache and wants it while the tab, or one of its sheets, is on screen; nothing is asked while it is hidden. The legacy panel still asks the same cache for the four power windows when it starts (`loadSharedHistory`: its Home tiles, stack and header read what they make until the specs after this one move them), so the hourly week, the meter and the water heater's day are read once for the panel and the card finds them there; the year of daily power is Energy's alone, and is asked when the card first connects and not at start. Opening the tab again within the fifteen minutes reads none.

## The elements

`<hp-energy-pane>` is the humble object of ADR 0005: `willUpdate` reads the inputs, `energyModel` words them, and the template places what comes back. On a phone it draws the header, `<hp-energy-card>` (a button that asks for the detail's sheet, `energy.detail`) and a `<hp-stat-tile>` for the water heater and for Hilo, each asking for its own sheet (`energy.water`, `energy.hilo`), where the card is drawn `framed` and only while the sheet is open. On a tablet the old summary card was never on screen, so the pane draws no card and no header: the detail is drawn inline while the pane is the tab, and the two cards follow it. A sheet asked for a section the house lacks dismisses itself, and Home's phone tile for the water heater asks for the same sheet, the pane staying in the page behind it (`overSheets`).

`<hp-power-flow>` binds attributes and text nodes of one `<svg>`: a line that keeps its power keeps its `class` and its `animation-duration` string, so the dashes do not restart on the next second's update, and a charging car's ring is drawn only while it charges. The three cards draw their box on an inner element, so the guest's lens backdrop reaches it. Their rules that copy a legacy rule the other cards still draw are under selectors of their own and name the ticket that deletes the legacy one in the file's header.
