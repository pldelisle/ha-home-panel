# Spec 19: Energy, the fifth move: three providers, history derived on demand, the flow and the Sankey as pure geometry, and the ApexCharts question answered

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 3.
Depends on: [15 Weather](15-weather.md) (`<hp-chart>`, the statistics cache, `<hp-range-tabs>`, `ranges.ts`), [16 Media](16-media.md) (`CommandRunner`, the overlay, the bridge), [17 Security](17-security.md) (shared reads in providers; legacy may import providers), [18 Air](18-air.md) (`<hp-stepper>`, registry-driven discovery). Blocks: 20 Climate (the rooms' power and the history pattern), 21 Car (the Wallbox provider and the charging sessions), 22 Live pill (the Hilo and power providers), 24 Home (the energy card).
Ships as: three pull requests, each a patch release, each pixel-identical. ADR 0026 (history derived on demand) and ADR 0027 (ApexCharts, reopening #84) land with the first.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

Energy is the largest reader in the class and the owner of its history:

- **One load for everything.** `loadHistory` (~3410) runs at connect and again on every config change: seven statistics calls (hourly power and temperatures for 7 days, daily for 400 days, the meters for 33 days, the Wallbox hourly for 366 days, today's meter by hour, 5-minute means for 25 hours) and the heat pump's state history, then `derive` (~3453, 160 lines) turns the replies into `this.H`: `flow`, `daily`, `g30`, `room30`, `monthly`, `totals`, `wh24`, `wh14` (Energy and the water heater), `temp7`, `temp24`, `heatmap`, `out90`, `hpPts` (Climate), `sessions` (the car). Everything is fetched whether or not its pane is ever shown, which is the opposite of "a wall tablet does no work for what it does not show".
- **Live power.** `live()` (~2529): the grid, the water heater and the EV from the config's power sensors, each room's power, temperature and setpoint from the `rooms:` config, the heat pump's action; `rest` is what is left. Read by the energy card, the Sankey's live mode, the energy summary, the phone's header line ("20.5° inside") and the live pill.
- **Hilo and Hydro-Québec.** `rateInfo` (~2562): the current rate against the low, medium and reward rates gives the tier and its short word; the challenge sensor (`defi`), the rewards, the critical-peak flags (`hqPeak`, `hqUpcoming`); read by the energy card, the Hilo card, the phone tiles, the header's "Critical peak now" chip, the upcoming list and the live pill.
- **Drawing.** `flowSvg` (~2676): the live flow as hand-written SVG (grid, home, water heating, room heating, EV, rest; dashes that run faster with the power). `renderEnergy` (the card: the flow and four tiles), `energySummary`, `renderWater` and `whChart` (~3304: the hero, a hand-written 24-hour SVG of temperature and heating power, the cycles line), `renderHilo` (~3385), `renderEnergyTiles` (~5562, the phone's two tiles), `energySheet` and `energyMain` (~3774: the stacked bars by today, week, month or year with `thin()` for category axes, the donut with its table, the totals), `sankeyData` and `renderSankey` (~6307: the live flow again, or a hand-written Sankey of grid → four groups → rooms, small rooms gathered). The chart helpers `base`, `thin`, `mk`, `S`, `groups`, `legend` (~3701) serve every chart in the class.
- Containers: `#open-energy` (`#energy`), `#water`, `#hilo` (Home cards that `enterTabs` moves into the pane's `#ehost` and `#eside`), `#etiles`, the `#sh-energy` panel inline on a tablet; `lacking().water` and `.hilo` hide the cards and tiles; the `CHART_SHEETS` wait for the chunk.
- Deferred here: **#84**, the ApexCharts freeze at 3.45.2, to be decided when the chart wrapper exists.

## Solution

Move Energy into `src/features/energy/`, in three pull requests:

1. **The providers, the power read, the history layer, and the two decisions.** `src/providers/hilo.ts`, `hydro-quebec.ts`, `wallbox.ts` (registry-driven discovery and the config's keys), `src/providers/power.ts` (`powerNow`: the live flow every reader shares), `src/features/energy/history.ts` (the energy slices of `derive` as pure functions over statistics rows), and the feature's own loader through the statistics cache: history is derived **on demand, per feature** (ADR 0026). `<hp-energy-pane>` with `<hp-energy-card>`, `<hp-power-flow>` (the flow SVG from a pure layout), the phone tiles, and the water heater and Hilo cards; the class keeps `loadHistory` for the Climate and Car slices only. ADR 0027 answers #84.
2. **The detail.** `<hp-energy-detail>`: the range tabs, the main stacked chart through `<hp-chart>`, the Sankey block with its own tabs (`<hp-sankey>` from a pure layout), the donut and its table, the totals. The legacy `#sh-energy` and its methods go.
3. **The live-pill reads and the deletion.** The header's "Critical peak now" chip, the upcoming list and the live pill read `hilo.ts`, `hydro-quebec.ts` and `power.ts` from the class (the ADR 0025 allowance); `live`, `rateInfo`, `flowSvg`, the chart helpers' last energy use, the French entries and the CSS go; the footprint drops.

Each pull request leaves every baseline identical (`energy-tablet-*`, `bare-energy-*`, `home-*`, `live-popup-*`).

## User Stories

1. As a household member, I want the Energy tab, its card, the water heater and Hilo cards, the detail with its charts and Sankey, and the phone tiles to look and work exactly as before, so that the move is invisible.
2. As a household member on a wall tablet, I want the panel to fetch a year of daily statistics only when I open Energy, not at every start, so that the tablet starts faster and asks Home Assistant for less.
3. As a household member, I want the flow's dashes to keep running at the speed of the power, and the Sankey to show the same ribbons, so that the pictures I know stay.
4. As a French-speaking user, I want every Energy string and number in French from the first paint, so that the catalog is as good as the rewrite layer was.
5. As an adopter without Hilo, I want the energy card to show my grid power and my meter and to leave out the Hilo card, the tier words and the challenge, so that the panel fits my house.
6. As a maintainer, I want each history slice (hourly flow, daily totals, monthly, meter totals, the water heater's day) as a pure function over statistics rows, tested with literal rows, so that `derive`'s 160 lines become named rules.
7. As a maintainer, I want one `powerNow` reading shared by Energy, Climate, the header and the live pill, so that "what is the rest of the home" is one rule.
8. As a maintainer, I want the Hilo tier rule in the Hilo provider with tests, so that the live pill (spec 22) reads a tier, not four sensors.
9. As a maintainer, I want the flow and the Sankey drawn from pure layout functions that return geometry, so that their arithmetic is tested and the templates only place it.
10. As a maintainer, I want the ApexCharts decision recorded now that `<hp-chart>` exists, so that #84 closes with an ADR.
11. As a maintainer, I want the behaviour tests to open the tab, switch a range and a Sankey mode, and read the totals through the harness, with the harness's statistics replies, so that the tests survive the rewrite.
12. As a learner, I want the history layer explained (why on demand, why per feature, what the cache guarantees), so that the next feature with charts copies the shape.

## Implementation Decisions

### The folder

```
src/providers/
  power.ts                 powerNow(states, config): PowerNow; roomPower(states, room); the live flow every reader shares
  hilo.ts                  hiloRates(states, config): HiloRates | null (tier rule); hiloChallenge(states, config); hiloRewards; present
  hydro-quebec.ts          hydroQuebec(states, config): {balance, peakNow, peakUpcoming} | null
  wallbox.ts               wallbox(states, config): WallboxInputs | null (power, status, amps, pause, lock, price); present
src/features/energy/
  README.md
  index.ts                 energyFeature; exports the Home card
  ids.ts                   energyIds(store)
  inputs.ts                readEnergy(states, config, sources): EnergyInputs
  model.ts                 energyModel(inputs, history, deps): EnergyViewModel
  history.ts               the pure slices: hourlyFlow, dailyTotals, groupTotals, monthlyTotals, meterTotals, waterDay, waterCycles; energyWindows(now, fmt)
  loader.ts                EnergyHistory: a reactive controller that loads the windows through the statistics cache when its host is shown
  flow-layout.ts           flowLayout(power, deps): FlowGeometry (nodes, connectors, labels)
  sankey-layout.ts         sankeyLayout(data, rooms, deps): SankeyGeometry (nodes, ribbons, labels)
  water-chart.ts           waterChartGeometry(series, now): the 24-hour SVG's lines, bars, ticks
  charts.ts                mainChartOptions(range, rows, deps), donutOptions(parts, deps): ApexCharts options, pure
  energy-pane.ts           <hp-energy-pane>
  energy-card.ts           <hp-energy-card> (the card: top line, <hp-power-flow>, four tiles)
  power-flow.ts            <hp-power-flow> (SVG from flowLayout)
  water-card.ts            <hp-water-card>
  hilo-card.ts             <hp-hilo-card>
  energy-detail.ts         <hp-energy-detail> (pull request 2)
  sankey.ts                <hp-sankey> (pull request 2)
  styles.css
src/ui/
  styles/hero.css          .hero (the water heater and Hilo cards now; the climate gauge later)
  thin-axis.ts             thinCategories(cats, n, wide, compact): the phone's category thinning (pure; used by Energy's month and year charts, by Climate's and Car's later)
test/unit/
  providers/{power,hilo,hydro-quebec,wallbox}.test.ts
  features/energy/{model,history,flow-layout,sankey-layout,water-chart,charts}.test.ts
test/e2e/energy.spec.ts
```

### The providers

- **`power.ts`** is the class's `live()` as data: `powerNow(states, config): {grid, waterHeater, ev, rooms: {key, name, climate, power, temperature, setpoint, heating, available}[], heat, rest, heatPump: {available, on} | null}` (kW; `rest = max(0, grid - wh - ev - heat)`; a room is heating when `hvac_action === 'heating'` or its power is over 50 W, as today). Read by the energy card, the Sankey, the summary, the phone header line (the class, then spec 24), the live pill (spec 22) and Climate (spec 20). The room's display name follows the rule `roomName` applies (in French the thermostat's own name without "Thermostat "), kept in `names` (spec 11) and called from here.
- **`hilo.ts`**: `hiloRates(states, config)`: `{current, low, medium, reward, tier: 'low' | 'medium' | 'challenge' | 'current' | 'unknown'}` (the comparison order of `rateInfo`: reward first, then medium, then low); `hiloChallenge(states, config): {state: string, active: boolean} | null`; `hiloRewards(states, config): number | null`; `present` when `config.entities.rate` resolves (today's `lacking().hilo`). The words (`Low tier`, `low rate`) are the model's, from keys.
- **`hydro-quebec.ts`**: `{balance, peakNow, peakUpcoming}` from `hq`, `hqPeak`, `hqUpcoming`; `null` when none resolves.
- **`wallbox.ts`**: `{power, status, amps, paused, locked, price, present}` from the six `wb*` keys and `evP`; `present` when `evP` or `wbStatus` resolves. Energy reads `power` and `status`; Car (spec 21) reads the rest and sends the commands.
- Each is a pure module over `states` and `config.entities`; the config's keys are the discovery here (convention over configuration, as `entities.ts` says), so the registry is not consulted.

### History derived on demand (ADR 0026)

```ts
// src/features/energy/history.ts (pure)
export interface EnergyWindows { hour7: Window; day400: Window; meter33: Window; today: Window; fiveMin25h: Window } // {start: Date, period, ids, types}
export function energyWindows(now: number, config: ResolvedConfig, fmt: Formatters): EnergyWindows;
export function hourlyFlow(stats: StatsReply, ids: FlowIds): FlowRow[]; // [t, ev, wh, heat, rest, total] per hour, kWh
export function dailyTotals(stats: StatsReply, ids: FlowIds, rooms: RoomIds[], todayKey: string, hoursToday: number, isoDay): DailyRow[];
export function groupTotals(daily: DailyRow[], days = 30): [heat, wh, ev, rest];
export function roomTotals(daily: DailyRow[], days = 30): number[];
export function monthlyTotals(daily: DailyRow[]): [monthKey, {heat, wh, ev, rest}][]; // last 12
export function meterTotals(meterStats, todayStats, ids, keys: {today, yesterday, month}): {today, yesterday, d30, month};
export function waterDay(fiveMin: StatsReply, ids: {temperature, power}): {t: Point[]; p: Point[]};
export function waterCycles(p: Point[], now: number): {kwh24: number; cycles: number};
export function waterDaily(meter: StatsReply, id: string, todayKey: string): [dayKey, kwh][]; // 14 days, today excluded
```

- Every function is `derive`'s rule for that slice, copied; the day keys use `fmt.isoDay` with the noon shift (`x.t + 12 h`) as today (#132's UTC-pinned keys through `fmt.utc`).
- **`EnergyHistory`** (`loader.ts`) is a reactive controller: on `hostConnected` and when `active` becomes true, if the data is older than fifteen minutes or the config generation changed, it asks the statistics cache for the five windows in parallel (`cache.statistics(...)` per window), derives the slices, and calls `host.requestUpdate()`; a `StaleReply` is dropped; a failure sets `error` for the card's "History didn't load" line (today's `histErr`, which stays the header's `#err` until spec 24 and is also shown by the card's own line from this spec). The controller holds `{at, flow, daily, g30, room30, monthly, totals, wh24, wh14}` and nothing else.
- **What this changes.** Today everything loads at connect. After this spec the energy slices load when the Energy card first connects, which on a tablet is at connect too (the Home tab shows the card through the bridge) and on a phone is when the Energy tab or a tile is opened; the Climate and Car slices stay in the class's `loadHistory`, which shrinks to their windows (the hourly temperatures, the daily temperatures for the heatmap, the Wallbox hourly year, the heat pump history) until specs 20 and 21 take them. The ADR records the rule: **a feature loads its own history through the shared cache when it is shown; nothing is fetched for a pane that is hidden.** The cost: two features opened in sequence make two calls where the class made one combined; the cache dedupes identical windows, and the windows that differ were never one call anyway.
- Baselines: the energy screenshots wait for the charts as they do today (the fixture's statistics replies are the same; the `energy-*` baselines are taken after `c-main` has drawn, see `visual/tabs.spec.ts`'s waits), so the pixels are the same once loaded.

### ApexCharts (ADR 0027, closing #84)

The chart wrapper exists since spec 15, so the question #84 deferred is decided here, with its evidence: 3.45.2 (MIT) has no advisory; 3.54.1 and 5.0.0 are dead ends under MIT; the live line is under ApexCharts' own licence; a version change re-records about thirty baselines. Decision: **stay on 3.45.2 behind `<hp-chart>` through phase 3**, because the phase is pixel-identical by contract and a library change is the opposite, and because `<hp-chart>`'s interface (an options object and the kit's base options) is now the one place a change would touch. Revisit at the phase-3 gate (#188) with options (b), (c) and (d) of #84 open, and at once if an advisory appears. The ADR names what `<hp-chart>` must keep stable so a later swap is one module: the options are plain data built by pure functions (`charts.ts` here, `history.ts`'s builders in Weather), never ApexCharts instances; the formatter callbacks take `fmt`; the element owns the instance. Renovate's two rules stay. #84 is closed by the pull request with a link to the ADR.

### The inputs, the model and the view model

```ts
export interface EnergyInputs {
  power: PowerNow;
  hilo: HiloRates | null;
  challenge: {state: string; active: boolean} | null;
  rewards: number | null;
  hydroQuebec: {balance, peakNow, peakUpcoming} | null;
  wallbox: {power: number | null; status: string | null} | null;
  water: {temperature: number | null; power: number | null; name: string; present: boolean}; // whT, whP; the name from whName's rule through the resolver
  rooms: PowerNow['rooms'];
}
export interface EnergyModelDeps { now: number; t: Translate; fmt: Formatters; range: EnergyRange; sankeyMode: 'now' | 'today' | 'd30' }
export function energyModel(inputs: EnergyInputs, history: EnergyHistoryData | null, deps: EnergyModelDeps): EnergyViewModel;

export interface EnergyViewModel {
  summary: string; // "Grid supplying 2.30 kW · room heating 1.10 kW · Hilo low rate"
  card: {
    topRight: string; // "Grid only · low rate"
    flow: FlowGeometry; // from flowLayout(power, ...)
    tiles: StatTileView[4]; // Today kWh, Room heating, Water heating, EV charging (last 30 days)
    error: string | null;
  };
  water: {present: boolean; name: string; temperature: string; state: {heating: boolean; text: string}; chart: WaterChartGeometry | null; legend: ...; line: string | null} ;
  hilo: {present: boolean; challenge: string; rate: string; tier: {text: string; ok: boolean}; tiles: StatTileView[3]};
  tiles: MediaTileLike[2]; // the phone: water heater and Hilo, from <hp-stat-tile>, each opening its card as a sheet
  detail: {
    sub: string;
    main: {title: string; caption: string; legend: LegendItem[]; options: ApexOptions | null};
    sankey: {note: string; mode: 'now' | 'today' | 'd30'; geometry: SankeyGeometry | null; live: boolean}; // live: draw the flow instead
    donut: {options: ApexOptions; rows: {name, kwh: string, pct: string, color}[]} | null;
    totals: StatTileView[6];
  };
}
```

- The flow's layout (`flow-layout.ts`) returns the nodes' centres, radii, texts and the connectors with `on`, `width` (3 + min(2, kW / 2)) and `duration` (max(0.45, 2.4 − kW × 0.4) s), the four captions and the rest-of-home label, all from `powerNow` and `t()`; `<hp-power-flow>` places them with `svg` templates and the `dash`/`npulse` classes (the keyframes move with the feature's CSS).
- The Sankey's layout (`sankey-layout.ts`) returns the grid node, the group nodes with their ribbons, the room nodes with theirs (small rooms under 3 percent of heating gathered as "Other rooms"), from `sankeyData`'s three modes (live power, today's energy, 30 days) with the same `k` and `kr` scales and the 980 × 332 viewBox.
- `charts.ts` builds the main chart's options per range exactly as `energyMain` does (stacked bars; datetime axis for today and week with the busiest-hour caption; category axes thinned with `thinCategories` for month and year; the MWh axis for year), and the donut's (70 percent, the total label), with `fmt` for every number and the kit's tokens for colours; `<hp-chart>` renders them. The water heater's 24-hour chart stays hand-written SVG (`water-chart.ts` returns its geometry; it was never ApexCharts).
- Strings: about seventy `energy.*` keys (the card, the flow captions and the aria label, the tier words, the challenge lines, the water heater lines with ICU plurals for cycles and days, the detail's titles and captions, the Sankey notes, the donut and totals labels, "History didn't load: {reason}. Live values still update.", "No data yet", "No complete hour yet today."), French from the map's entries (`src/i18n/fr.js` ~551 to 631, 1301), listed in `test/unit/fixtures/moved/energy.json`.

### The elements

- **`<hp-energy-pane>`**: `active`; `StoreController({ids: s => energyIds(s)})` (the grid, the meters, the water heater's three, the Wallbox's two, the Hilo seven, the Hydro-Québec three, every room's power and climate); `EnergyHistory`; `<hp-pane-header icon="bolt" color="var(--c-grid)">`; on a tablet: `<hp-energy-card>`, then `<hp-energy-detail>` inline (pull request 2; the legacy panel through the sheet host's inline rule in pull request 1), and the `.eside` with `<hp-water-card>` and `<hp-hilo-card>` (hidden when not present); on a phone: `<hp-energy-card>` as the pane's top (its tap dispatches `SheetRequestEvent('energy.detail')`), then the two `<hp-stat-tile>`s dispatching `SheetRequestEvent('energy.water')` / `('energy.hilo')`, which open the cards inside `<hp-sheet>` as `openCard` did.
- **`<hp-energy-card>`**: the `.top` line, `<hp-power-flow .geometry=${vm.card.flow}>`, the four `.tiles`. Home's `#energy` through the bridge from pull request 3 (the Home tab's card and the pane's are one element with one history controller: the pane's instance and the card's instance share the cache, so the windows are fetched once).
- **`<hp-water-card>`**: the hero (temperature, the heating or idle state with its dot), the 24-hour SVG from `waterChartGeometry`, the legend line, the cycles line. **`<hp-hilo-card>`**: the hero (the rate in ¢/kWh, the tier) and the three tiles.
- **`<hp-energy-detail>`** (pull request 2): `<hp-sheet>`-wrapped on a phone, inline on a tablet; `<hp-range-tabs>` with today, week, month, year (`RANGES` gains `today` as a range without a statistics period, used by this feature only); the main block (`h3`, caption, legend, `<hp-chart>`); the Sankey block with its own `<hp-range-tabs>`-like `seg` (now, today, 30 days) and `<hp-sankey .geometry>` or `<hp-power-flow>` in the live mode; the donut `<hp-chart>` with its table; the totals tiles. Range and mode are element state.
- Commands: none in this spec (the Wallbox's pause and lock are the Car's).

### Styles

- `src/features/energy/styles.css` receives `.flow`, `.flow text`, `.flow .big`, `.flow .cap`, `.flow .st`, `.dash` and its keyframes, `.npulse` (`base.css` ~388 to 420, `motion.css` 188), `.donut` and its table (`base.css` ~731 to 750), `.totals` (`base.css` ~751 to 765 and 1464), `.eside`, `.shead`, `.sankey`, `.sk` (`tabs.css` ~658 to 700), `.etiles` (`phone.css` 9, 337), `.whleg`. `.hero` goes to `src/ui/styles/hero.css` (two users now, the climate gauge later). `.legend` goes to the kit's `chart.css` (Weather's split) if it is not there yet. `.go` (the card's chevron) goes to the kit's `card.css`.

### Deletion and grep gates

Pull request 2 deletes `energySheet`, `energyMain`, `sankeyData`, `renderSankey`, the `#sh-energy` markup, `this.range`, `this.smode`, `this.mainChart`, the `etabs`/`stabs` listeners. Pull request 3 deletes `live`, `rateInfo`, `flowSvg`, `renderEnergy`, `energySummary`, `renderWater`, `whChart`, `whName`, `renderHilo`, `renderEnergyTiles`, `groups`, `S` (when no legacy chart remains; else it stays until Climate), the energy windows and slices of `loadHistory`/`derive` (`flow`, `daily`, `g30`, `room30`, `monthly`, `totals`, `wh24`, `wh14`), the `'renderEnergy'`, `'renderWater'`, `'renderHilo'` entries of `renderLive`, the `mv('water', …)`/`mv('hilo', …)` lines, the `'open-energy'`, `'water'`, `'hilo'` entries of `LAYOUT` and their `.cols` markup, the `water`/`hilo` branches of `lacking()` (the providers' `present`), the `sh-energy` entry of `CHART_SHEETS`, `L0kw`, `this.H.*` energy fields; the header's peak chip, `upcoming` and `liveActs` read the providers.

Gates (after pull request 3): `grep -nE '^  (live|rateInfo|flowSvg|renderEnergy|energySummary|renderWater|whChart|whName|renderHilo|renderEnergyTiles|energySheet|energyMain|sankeyData|renderSankey|groups)\(|sh-energy|L0kw' src/home-panel.js` is empty; `grep -nE '\.(flow|dash|npulse|donut|totals|eside|shead|sankey|sk|etiles|whleg|hero)\b' src/css/*.css` is empty; `grep -c 'statistics(' src/home-panel.js` drops to the Climate and Car windows (quoted); the French map lost the listed entries; the class shrinks by about 700 lines, quoted.

### Performance, by construction

- The pane subscribes to about thirty ids; a light or a camera change gives zero mutations in its root.
- History loads when the card is shown, through one cache that both the card and the detail read; the detail's range change recomputes from the loaded slices without a call (the windows cover every range, as today).
- The flow's SVG updates by binding attributes (`stroke-width`, `style`, the text nodes), not by rebuilding the SVG, so the dash animation does not restart on every second's update; the class rebuilt the whole SVG string every tick, which is why the dashes stutter today in some browsers (a behaviour the baselines cannot see; noted in the pull request as a side effect, not a change).
- `<hp-chart>` updates the main chart through `updateOptions` on a range change; the Sankey is a `repeat`-keyed set of paths.

## Acceptance Criteria

Pull request 1, the providers, the history layer, the pane and the cards:

1. `src/providers/{power,hilo,hydro-quebec,wallbox}.ts`, `src/features/energy/{README.md,index.ts,ids.ts,inputs.ts,model.ts,history.ts,loader.ts,flow-layout.ts,water-chart.ts,energy-pane.ts,energy-card.ts,power-flow.ts,water-card.ts,hilo-card.ts,styles.css}`, `src/ui/styles/hero.css`, `src/ui/thin-axis.ts` exist with headers; `FEATURES` has `energyFeature`.
2. Vitest: `powerNow` (rest never negative, heating by action or by power, a missing sensor), `hiloRates` (each tier, the comparison order), `hydroQuebec`, `wallbox`; every slice of `history.ts` with literal rows (hours with a missing room, today's hours so far, the noon shift on day keys, months from days, meter totals with today excluded from the 14 days, water cycles joined within five minutes); `flowLayout` (widths, durations, texts), `waterChartGeometry` (the scale rules, the hour ticks); `energyModel` from the test house and the recorded fixture in `en` and `fr`; 100 percent statements on the pure modules.
3. Playwright `energy.spec.ts`: the tab shows the flow with the house's grid value and the four tiles after the statistics arrive; the water heater and Hilo cards read as before; on the phone the two tiles open their cards as sheets; the statistics requests for the energy windows are sent when the Energy card first connects and not again when the tab is reopened within fifteen minutes (`window.house.reads`); a light change gives zero mutations in `hp-energy-pane`'s root; axe clean.
4. Every baseline identical; the French equivalence test passes for `test/unit/fixtures/moved/energy.json`; `npm run check`, `npm test -- --coverage`, `npm run lint` green; ADR 0026 and ADR 0027 accepted; #84 closed by the pull request; changeset (patch): "The Energy tab is redrawn with the same look and loads its history when you open it. Nothing visible changes."

Pull request 2, the detail:

5. `<hp-energy-detail>`, `<hp-sankey>`, `sankey-layout.ts`, `charts.ts` exist; the detail is inline on a tablet and in `<hp-sheet>` on a phone; `Week`, `Month`, `Year` redraw the main chart without a new statistics call; the Sankey's `Today` and `30 days` show the ribbons and `Now` shows the flow; the donut's table and the totals read as literals; `chunks.spec.ts`'s rule holds (the charts chunk loads when the detail shows); the legacy `#sh-energy` and its methods are gone; the `energy-*` baselines identical; axe clean on the detail; changeset (patch).

Pull request 3, the shared reads and the deletion:

6. The header's peak chip, `upcoming` and `liveActs` read `hydroQuebec`, `hiloRates`, `hiloChallenge`, `powerNow` from the providers (`grep -n 'powerNow\|hiloRates\|hiloChallenge\|hydroQuebec' src/home-panel.js` lists them); `loadHistory` holds only the Climate and Car windows; the grep gates hold; the styles-split test passes; the French map lost the listed entries; every baseline identical (`live-popup-*` included); all suites green; changeset (patch).

## Testing Decisions

The seams are the two of ADR 0005. New in kind: the harness's statistics replies become the fixture of a **per-window** test (which windows were requested, when), through `window.house.reads` (spec 17); and the pure-geometry style for SVG drawings (a layout function returns numbers and texts; the element places them), which is how Climate's dial and gauge and the Car's battery will be tested. Prior art: `weather.spec.ts` for the inline detail, the `energy-*` baselines' waits in `visual/tabs.spec.ts`.

## Out of Scope

- Changing the ApexCharts version (ADR 0027 says why not now) or replacing the hand-written SVGs with a library.
- The Wallbox commands and the charging sessions: spec 21.
- The phone header's "inside" line and the `#err` line: they read the providers from the class until spec 24.
- Solar or battery flows: the model has `grid` only, as today.

## Notes

- **Why history moves per feature and not into one core "house history" module.** A core module that loads everything is `loadHistory` with a new name: it would still fetch a year of daily rows for a tablet that never leaves Home. Per-feature loaders through one cache keep the fetch proportional to what is shown, and the cache keeps a shared window (the hourly power, which Energy and Climate both want) to one call.
- **Why the flow and the Sankey are not `<hp-chart>`.** ApexCharts has no Sankey, and the flow is a diagram, not a chart. Pure layout functions make them as testable as the options builders.
- **Why `powerNow` is a provider though it names no integration.** Four readers in three layers need the same arithmetic; ADR 0025's rule puts a shared read below the features, and the glossary's definition of a provider (entities into generic inputs) covers the config's power sensors.
- **Why the ApexCharts decision is (a).** The phase's contract is pixel identity; the other options all re-record thirty baselines and two of them are dead ends under MIT. The wrapper makes the later decision cheap, which is what #84 asked for.
- **Reading**: Fowler, _PoEAA_ (Lazy Load, for the on-demand controller); Nygard, _Release It!_ (on not fetching what is not shown); Tufte on Sankey diagrams; Home Assistant developer docs, `recorder/statistics_during_period`; Hilo and Hydro-Québec integration docs (the sensors); #84 and #36 for the ApexCharts evidence.
