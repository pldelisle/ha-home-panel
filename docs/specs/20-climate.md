# Spec 20: Climate, the sixth move: the rooms and the heat pump, a dial and a gauge from pure geometry, the heatmap, and the controls that need a second tap

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 3.
Depends on: [15 Weather](15-weather.md) (`<hp-chart>`, the statistics cache, `<hp-range-tabs>`), [16 Media](16-media.md) (`CommandRunner`, the overlay, the bridge), [18 Air](18-air.md) (`<hp-stepper>`), [19 Energy](19-energy.md) (`powerNow` with the rooms, history on demand, `thinCategories`, the pure-geometry style). Blocks: 21 Car (`<hp-seg>`, `ArmedController`), 24 Home (the climate tile).
Ships as: three pull requests, each a patch release, each pixel-identical. No new ADR: 0021 to 0027 apply; three notes record the kit promotions.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

Climate is the Hilo thermostats and the heat pump: the Climate tab, which on a tablet is the old detail panel inline (`#sh-climate`: the room list on the left, the selected room's detail on the right, the all-rooms heatmap and the outside chart below) and on a phone is a grid of tiles that open the detail as a sheet with an Apple Home style dial. In the class:

- **Reading.** `live()`'s rooms (temperature, setpoint, power, heating, availability; now `powerNow` since spec 19), `climItems` (~5497: the house, each room and the heat pump as list items with their status words), `hpBrand` (~5490: Fujitsu through FGLair, else the manufacturer), `climateSummary` (~7176), `lacking().climate`.
- **History.** `loadClimRange` (~7219): per range, one statistics call (temperatures, targets, powers, the outside) and the heat pump's state history; the setpoint series rule (a stretch partly off shows its highest setpoint, one off throughout is a gap), the heating kWh per room from mean kW times hours, `hpSeries` (~619: a gap in the heat pump's history is a break in the line); a ten-minute cache (`this.CR`); `houseSeries` (~7284: the mean of the rooms where every room has a value); `bucket` (~914: the heatmap's cells by hour, six hours, day or week with unique labels).
- **Drawing.** `renderClimateList` (~7199), `climInfo` (~7410: the title, sub, temperature, setpoint, pill, tiles and note per selection), `renderClimateHead` (~7482: on a tablet the big number and the `gauge` (~7211: a 14 to 30 degree bar with the setpoint mark); on a phone the `dial` (~7670: a 270-degree track, 55 ticks, the setpoint knob, the dot at the room temperature, draggable through `dialValue`)), `climateDetail` (~7540: the room, setpoint and outside lines through ApexCharts with a `monotoneCubic` curve when a setpoint has gaps), the heatmap (`heatColor`, `heatRanges`, `HEAT_LIGHT`, `HEAT_DARK`, the OKLab blend `toOk`/`fromOk`/`lin` ~553 to 608) with its legend, the outside range-area chart; `renderClimateTiles` (~5549: the phone's tiles).
- **Controls.** `renderClimateControls` (~7589): the heat pump's mode, target, fan, preset and louvers (`HVAC`, `swingName`), the house's "set every room" with a stepper and two **armed** buttons (a second tap within four seconds confirms), a room's setpoint stepper with the frost-guard rules (below 5.5 is off; up from off is 15) and the quick buttons (Off, 19 to 22); `climateControl` (~7754), `applySp` (~7718: a setpoint from the dial or the stepper, held and sent 1,100 ms after the last change), the dial's pointer handlers in `wire()` (~2300 to 2335), the `clist` and `#ctabs` listeners.
- The Home card `#open-climate` (`renderClimate`, `spark`, ~3146) is drawn into the `.cols`, which the tabs view hides since 1.16.0: the card and `spark` are dead code; the Home pane's climate tile is `renderHome`'s and is spec 24's.

Nothing has a unit test; `climate-tablet-*` and `climate-phone-*` (eight) are the proof.

## Solution

Move Climate into `src/features/climate/`, in three pull requests:

1. **The provider, the model and the pane with its list and detail head.** `src/providers/heat-pump.ts` reads the heat pump; the rooms come from `powerNow` (spec 19). `climateModel` gives the summary, the items, the detail's head (gauge or dial as geometry), its tiles and its note; `<hp-climate-pane>` draws the pane header, the phone tiles and, on a tablet, `<hp-climate-list>` and `<hp-climate-detail>`'s head and tiles. The detail's chart, heatmap, outside chart and controls are still the guest's in this pull request (the sheet host's inline rule keeps `#sh-climate`'s lower blocks in place; the element renders the head into the panel's `#chead`? No: the element owns the whole `.clim` block and the guest's `#sh-climate` keeps only the heatmap and outside sections until pull request 2; `placePanels`'s inline move puts what is left of the panel under the element).
2. **The history and the charts.** `history.ts` (the range series, the setpoint rule, the heating kWh, `houseSeries`, `bucket`, `hpSeries`) and the loader through the statistics cache; `<hp-chart>` for the room chart, the heatmap and the outside chart; `src/core/color.ts` (the OKLab blend) and the heat scale; the guest loses the climate windows of `loadHistory`, `loadClimRange`, `climateSheet`, `climateDetail` and the two sections.
3. **The controls and the deletion.** `<hp-seg>` (the radio group every feature draws) and `ArmedController` (the second tap) join the kit; `<hp-dial>` becomes draggable; `commands.ts` and the controls element replace `renderClimateControls`, `climateControl`, `applySp`; the dead Home card and `spark` are deleted with everything else; the footprint drops.

Each pull request leaves every baseline identical.

## User Stories

1. As a household member, I want the Climate tab on the tablet and the phone, the dial, the gauge, the heatmap and every control to look and work exactly as before, so that the move is invisible.
2. As a household member, I want a setpoint I tap or drag to show at once and to be sent once my finger rests, as today, so that a thermostat is not asked ten times.
3. As a household member, I want "All off" and "Set all" to need a second tap within four seconds, as today, so that a stray touch on a wall panel changes nothing.
4. As a household member, I want the heat pump's mode, fan, preset and louvers to work as they do, with the French words I know, so that nothing changes but the code.
5. As a French-speaking user, I want every Climate string in French from the first paint, so that the catalog is as good as the rewrite layer was.
6. As an adopter without a heat pump or with another brand, I want the list to show what my house has, named by its manufacturer, so that the panel fits my house.
7. As a maintainer, I want the dial and the gauge as pure geometry (angles, points, arcs) tested with numbers, so that the hardest SVG in the panel has tests.
8. As a maintainer, I want the setpoint series rule, the heating kWh rule, the house mean and the heatmap bucketing as pure functions over statistics rows, so that `loadClimRange`'s rules are named and pinned.
9. As a maintainer, I want the climate history loaded per range through the shared cache when the detail is shown, so that the tablet on Home asks for nothing.
10. As a maintainer, I want the radio group and the second-tap confirmation in the kit, so that Car and Lights reuse them and the a11y rules of a radio group live in one place.
11. As a maintainer, I want the behaviour tests to select a room, drag the dial, tap a quick setpoint and arm "All off" through the harness, so that the tests survive the rewrite.
12. As a learner, I want the OKLab blend explained and tested (why OKLab, what the stops are), so that the heat scale is understood, not copied.

## Implementation Decisions

### The folder

```
src/providers/
  heat-pump.ts             heatPump(states, registries, config, names): HeatPumpInputs | null; brand rule; hpSeries(points, pick)
src/core/
  color.ts                 oklabBlend(hexA, hexB, f), toOklab, fromOklab, linear (pure; the heat scale's blend)
src/features/climate/
  README.md
  index.ts                 climateFeature (available: rooms or a heat pump present)
  ids.ts                   climateIds(store)
  inputs.ts                readClimate(states, registries, config, names): ClimateInputs
  model.ts                 climateModel(inputs, history, selection, deps): ClimateViewModel
  items.ts                 climateItems(inputs, deps): ClimateItem[] (the house, rooms, heat pump)
  history.ts               climateWindow(range, config, now), rangeSeries, setpointSeries, heatingKwh, houseSeries, bucket, heatScale, heatmapOptions, roomChartOptions, outsideChartOptions
  loader.ts                ClimateHistory: per-range loads through the statistics cache (ten-minute ttl)
  dial-geometry.ts         dialGeometry(t, sp, lo, hi): track, active arc, ticks, knob, dot, big text; dialValueFromPointer(rect, x, y, lo, hi)
  gauge-geometry.ts        gaugeGeometry(t, sp): positions on the 14 to 30 scale
  commands.ts              setRoomTemperature, setAllRooms, hpMode, hpTemperature, hpFan, hpPreset, hpSwing
  climate-pane.ts          <hp-climate-pane>
  climate-list.ts          <hp-climate-list> (role=listbox)
  climate-detail.ts        <hp-climate-detail> (head, tiles, controls, chart)
  climate-controls.ts      <hp-climate-controls>
  dial.ts                  <hp-dial> (pull request 3 makes it draggable)
  gauge.ts                 <hp-gauge>
  heatmap-legend.ts        <hp-heat-legend>
  styles.css
src/ui/
  seg.ts                   <hp-seg> (radio group; pull request 3)
  controllers/armed.ts     ArmedController (pull request 3)
  styles/seg.css
test/unit/
  providers/heat-pump.test.ts
  core/color.test.ts
  features/climate/{items,model,history,dial-geometry,gauge-geometry,commands}.test.ts
test/e2e/climate.spec.ts
```

### The provider

```ts
// src/providers/heat-pump.ts
export interface HeatPumpInputs {
  id: string; // config.entities.hp
  brand: string; // 'Fujitsu' when the platform is fglair or the manufacturer matches, else the manufacturer, else t('climate.heatPump') by the model
  available: boolean;
  mode: string; // the state: off, heat, cool, auto, …
  action: string | null; // hvac_action
  temperature: number | null; // current_temperature
  target: number | null; // temperature
  minTemp: number; maxTemp: number; // min_temp ?? 16, max_temp ?? 30
  modes: string[]; fanModes: string[] | null; presetModes: string[] | null; swingModes: string[] | null;
  fan: string | null; preset: string | null; swing: string | null;
  lastUpdated: number;
}
export function heatPump(states, registries, config, names): HeatPumpInputs | null;
export function hpSeries(points: HistoryPoint[], pick: (attrs, state) => number | null): [number, number | null][]; // the class's hpSeries: a null breaks the line
```

The rooms are `powerNow(states, config).rooms` (spec 19): key, name, climate id, power, temperature, setpoint, heating, available, plus `minTemp`/`maxTemp` from the climate entity's attributes, which `powerNow` gains here (`min_temp ?? 5`, `max_temp ?? 30`).

### Items, the model and the view model

```ts
export type ClimateSelection = 'house' | 'hp' | string; // a room key
export interface ClimateInputs { rooms: RoomInputs[]; heatPump: HeatPumpInputs | null; outside: number | null; heat: number; heatPumpOn: boolean }
export function climateItems(inputs, deps): ClimateItem[]; // {id, icon, name, sub, value, tone: '' | 'on' | 'bad'}: climItems' rules with keys
export function climateModel(inputs, history: ClimateHistoryData | null, sel: ClimateSelection, deps): ClimateViewModel;

export interface ClimateViewModel {
  summary: string; // "20.8° average inside · 3.1° outside · 2 rooms heating · heat pump off"
  items: ClimateItem[];
  tiles: ClimateItem[]; // the phone's grid (the house tile wide)
  detail: {
    title: string; sub: string; pill: {text: string; tone: '' | 'on' | 'bad'};
    temperature: string | null; outside: string | null;
    gauge: GaugeGeometry | null; // tablet
    dial: {sp: number | null | undefined; lo: number; hi: number; editable: boolean; state: string; geometry: DialGeometry} | null; // phone
    tiles: StatTileView[]; // Range, Drawing now, Heating; or Warmest, Coolest, Heating now, Heating; or Range, Last update
    note: string | null;
    legend: LegendItem[];
    chart: ApexOptions | null; // the room, setpoint and outside lines
    controls: ControlsView; // below
    heatmap: {title: string; legend: HeatLegend; options: ApexOptions | null; empty: string | null} | null; // tablet only
    outside: {title: string; note: string; options: ApexOptions} | null; // tablet only
  };
}
```

- `ControlsView` is one of: `{kind: 'hp', offline: true}`, `{kind: 'hp', mode, modes: Option[], target: {value, lo, hi} | null, fan: Option[] | null, preset: Option[] | null, swing: Option[] | null}`, `{kind: 'house', allSetpoint, armed: 'allset' | 'alloff' | null, roomsCount}`, `{kind: 'room', offline: true}`, `{kind: 'room', setpoint: {value, lo, hi, off}, quick: {value, label, pressed}[]}`; the overlay supplies the held values (`K.sp(climateId)`, `K.hp.mode`, `K.hp.sp`, `K.hp.fan`, `K.hp.preset`, `K.hp.swing`), `allSetpoint` and `armed` are element state passed in.
- `dial-geometry.ts`: `dialGeometry(t, sp, lo, hi, size = 260)` returns `{track: path, active: path | null, ticks: {x1, y1, x2, y2, major}[], now: {cx, cy} | null, knob: {cx, cy} | null, big: string, off: boolean}` with the class's constants (radius 106, start 135°, sweep 270°, 55 ticks, every sixth major); `dialValueFromPointer(rect, x, y, lo, hi)` is `dialValue` (the angle snapped to half degrees; below the lowest step is off). `gauge-geometry.ts`: `gaugeGeometry(t, sp)` returns the percent positions and the scale caption rule (`14°`, "Bar marks the setpoint" or "Thermostat off (5° frost guard)", `30°`).
- `history.ts`: `climateWindow(range, config, now)` (ids and period as `loadClimRange`), `rangeSeries(stats, id, range)` (mean, min, max shifted by `range.mid`, two decimals), `setpointSeries(stats, id, range)` (the partly-off rule), `heatingKwh(stats, id, period, now)`, `houseSeries(roomSeries, roomCount)`, `bucket(points, range, fmt)` (the four groupings with unique keys and labels; `fmt.dayParts`, `fmt.utc.date`, Monday as the week start), `heatScale(dark)` (the stops and `heatColor(v, stops)` through `oklabBlend`, `heatRanges(stops)` in 0.1° steps), `heatmapOptions(series, range, stops, tokens, compact)`, `roomChartOptions(points, setpoints, outside, range, tokens, fmt)` (the curve rule: straight for the heat pump, monotoneCubic with a setpoint, smooth otherwise), `outsideChartOptions(out, range, tokens)` (range area plus mean line).
- `src/core/color.ts`: `toOklab(hex)`, `fromOklab(lab)`, `oklabBlend(a, b, f)`; the header explains why OKLab (perceptually even steps so neighbouring cells blend without a visible band) and tests the known pairs (`#24467F` to `#3F7DBF` at 0.5 against the class's output).
- `loader.ts`: `ClimateHistory` holds one entry per range `{at, start, rooms, sp, kwh, out, hp, hpSp, hpFrom}`, loads through `cache.statistics(window.ids, period, start, ['mean', 'min', 'max'])` and `cache.history([hp], start, {minimal: false, attributes: true})` when the detail is shown or the range changes and the entry is older than ten minutes; a `StaleReply` or a late reply for another range is dropped; the phone sheet loads the same window (the chart is drawn there too; the heatmap and the outside chart are tablet only, as today).

### The elements

- **`<hp-climate-pane>`**: `active`; `StoreController({ids: s => climateIds(s)})` (every room's climate, temperature, target and power, the heat pump, the outside temperature); `<hp-pane-header icon="therm" color="var(--c-wh)">` with `t('climate.title')` and `vm.summary`; on a tablet `.clim` with `<hp-climate-list>` and `<hp-climate-detail>`, then the heatmap block and the outside block; on a phone the `.ctiles2` grid of `<hp-stat-tile>` (the house tile `wide`) whose `tile-open` sets the selection and dispatches `SheetRequestEvent('climate.detail', {sel})`; the sheet holds `<hp-climate-detail compact>`. The selection (`climSel`, default `house`) and the range (`crange`, default `day`) are element state on the pane, passed down.
- **`<hp-climate-list>`**: `role="listbox"`, `button.citem[role=option]` per item (`repeat` by id) with `aria-selected`; dispatches `select`.
- **`<hp-climate-detail>`**: the `.big` head (title, sub, pill), then `<hp-gauge>` with the big number and the outside line on a tablet or `<hp-dial>` on a phone (the `in` class on first draw for the motion), the `.tiles` (the Range tile gets `trange`), `<hp-climate-controls>`, the legend and `<hp-chart>`; the `ClimateHistory` controller lives here.
- **`<hp-dial>`**: properties `geometry`, `editable`, `lo`, `hi`, `value`, `label`; `role="slider"` with `aria-valuemin/max/now/text` when editable, `role="img"` otherwise; pull request 3 adds the pointer handlers (`pointerdown` sets a capture and dispatches `dial-input` with the value from `dialValueFromPointer`, `pointermove` while captured, `pointerup` dispatches `dial-change`) and the keyboard (arrows by half a degree, Home and End); the host holds the value through the overlay and debounces the command by 1,100 ms.
- **`<hp-climate-controls>`**: renders `ControlsView`: `<hp-seg>` for the modes, fan, preset and quick setpoints? No: the quick setpoints are `.quick` buttons with `aria-pressed`, kept as they are; `<hp-stepper>` for the targets (step 0.5, the "Off" value text when at the frost guard); a `select.csel` for the louvers; the two `.abtn` with the `armed` class and the "Tap again" text from `ArmedController`.
- **`<hp-seg>`** (`src/ui/seg.ts`, pull request 3): `options: {value, label, sub?}[]`, `value`, `label` (aria), `disabled`; renders `.seg[role=radiogroup] > button[role=radio][aria-checked]` with arrow-key movement between options (today's markup has none; adding it changes no pixel and axe accepts both; the behaviour is an improvement the pull request names); dispatches `change`. Air's mode group and metric group switch to it in the same pull request (its second and third users; `src/ui/styles/seg.css` takes the `.seg` rules from `base.css` ~935 to 990 and `motion.css` 54).
- **`ArmedController`** (`src/ui/controllers/armed.ts`): `arm(key)`, `isArmed(key)`, `confirm(key): boolean` (true when the key was armed; clears), a four-second timer that disarms and updates the host; the second tap pattern of the climate "all" buttons and of the car's remote start and unlock (spec 21).
- `commands.ts`: `setRoomTemperature(room, value)` (hold `K.sp(room.climate)`, `climate.set_temperature`, done `climate.roomSet` or `climate.roomOff`); `setAllRooms(rooms, value)` (hold every room; one `set_temperature` with the list of ids; done `climate.allSet`/`allOff`); `hpMode(hp, mode)` (`set_hvac_mode`, done `climate.hpMode` with the HVAC word), `hpTemperature`, `hpFan` (`set_fan_mode`), `hpPreset` (`set_preset_mode`), `hpSwing` (`set_swing_mode`, done with `swingName`'s rule as keys `climate.swing.*`). The stepper rules (below 5.5 going down is `lo`; up from off is 15; snapped to halves) are in `commands.ts` as `nextSetpoint(current, delta, lo, hi)`, pure and tested.

### Styles

- `src/features/climate/styles.css` receives `.clim`, `.clist`, `.citem` and its children, `.cdet` and its `.big`, `.t`, `.tiles`, `.note` (`base.css` ~1270 to 1440, `extra.css` 1261), `.gauge` and its parts (`base.css` ~1389 to 1425), `.hleg` (`extra.css` ~594 to 620), `.crow`, `.quick` (`extra.css` 447, 490 to 535, `motion.css` 51 to 52), `.cctl`, `.clbl`, `.csel`, `.abtn` and `.abtn.armed` (`base.css` ~1094, 1119; `.abtn` is shared with the car's buttons: it goes to the kit's `button.css` as `.abtn` with Car as the second user), `.dial` and its parts (`phone.css` ~744 to 820, `motion.css` 112 to 141), `.ctiles2` (`phone.css` 8, 336), `.trange`. `.seg` goes to `src/ui/styles/seg.css`; `.ctl-l` (the control label) goes with it. `.rooms`/`.room` (`base.css` ~519 to 560) go to Air's `styles.css` (its `.aqroom` was their last live user once the dead climate card is deleted). `.spark` (`base.css` 595) goes to Car's bars until spec 21 decides.

### Strings and formats

About ninety `climate.*` keys (the title, `averageInside`, `outside`, `roomsHeating` plural, `noRoomsHeating`, the heat pump words (`heatPump`, `offline`, `off`, `actionTo` (`{action} to {t}°`), `notFound`, `fujitsuThrough`), the item subs (`unavailable`, `heating` (`Heating · {kw} kW`), `holding`, `set`, `off`, `wholeHouse`, `heatPumpPlus`), the detail (`range`, `drawingNow`, `heating`, `lastUpdate`, `warmest`, `coolest`, `heatingNow`, `allThermostats`, `averageOf`, `hiloThermostat`, `houseAverage`, `setpoint`, `outsideSeries`, the two notes, `historyStarts`), the gauge and dial captions, the controls (`mode`, `target`, `fan`, `preset`, `louvers`, `normal`, the `hvac.*` words, the `swing.*` words with the positional variants, `allRooms`, `setEveryRoomTo`, `setAllTo`, `tapAgainAll`, `allOff`, `tapAgainOff`, `frostGuardHint`, `lower`, `raise`, `thermostatUnavailable`, `heatPumpOffline`, `quick.off`), the heatmap titles per range (`RANGES` gains `heatTitle` and `outNote` keys), `historyUnavailable`, `noThermostats`), French from the map's entries (`src/i18n/fr.js` ~640 to 760, 1340 to 1380), listed in `test/unit/fixtures/moved/climate.json`.

### Deletion and grep gates

Pull request 1 deletes `renderClimateTiles`, `renderClimateList`, `climItems`, `hpBrand`, `climateSummary`, `climInfo`, `renderClimateHead`, `gauge`, `dial`, `dialValue`, the `data-csel` and `.citem` listeners, the Climate line of `renderCompactSubs`, the dead `renderClimate` and `spark` and the `'renderClimate'` entry of `renderLive`, the `#open-climate` card markup and its `LAYOUT` entry. Pull request 2 deletes `loadClimRange`, `houseSeries`, `bucket`, `climateSheet`, `climateDetail`, `hpSeries`, `HEAT_LO/HI`, `HEAT_LIGHT/DARK`, `lin`, `toOk`, `fromOk`, `heatColor`, `heatRanges`, the climate windows of `loadHistory`/`derive` (`temp7`, `temp24`, `heatmap`, `out90`, `hpPts`, `hpLastAttrs`), `this.CR`, `this.climTag`, `this.climChart`, the `#cheatwrap` and `#coutwrap` markup, the `sh-climate` branches of `renderLive`. Pull request 3 deletes `renderClimateControls`, `climateControl`, `applySp`, `HVAC`, `swingName`, the dial pointer handlers in `wire()`, the `#ctabs` listener, `this.climSel`, `this.crange`, `this.allSp`, `this.armed`, `this.armT`, `this.spT`'s climate keys, `this.dialDrag`, the `#sh-climate` markup, the `sh-climate` entry of `CHART_SHEETS` and of `TAB_SHEET`, the `climate` branch of `lacking()` (the descriptor's `available`).

Gates (after pull request 3): `grep -nE '^  (renderClimate|spark|climItems|hpBrand|climateSummary|renderClimateList|gauge|loadClimRange|houseSeries|climateSheet|climInfo|renderClimateHead|climateDetail|renderClimateControls|dial|dialValue|applySp|climateControl|bucket)\(|^const (HEAT_|HVAC|swingName|hpSeries|lin|toOk|fromOk|heatColor|heatRanges)|sh-climate|data-csel' src/home-panel.js` is empty; `grep -nE '\.(clim|clist|citem|cdet|gauge|hleg|crow|quick|cctl|clbl|csel|abtn|dial|dialc|ctiles2|seg|ctl-l|rooms|room|spark)\b' src/css/*.css` is empty except `.spark` until spec 21; the French map lost the listed entries; the class shrinks by about 750 lines, quoted.

### Performance, by construction

- The pane subscribes to the climate ids only (about five per room plus the heat pump and the outside); a light change gives zero mutations.
- History loads per range when the detail is shown; a range already loaded within ten minutes redraws from memory; nothing loads on Home.
- The dial's drag updates the held value and the geometry without a command; one `set_temperature` follows 1,100 ms after the finger rests; the heatmap and the outside chart do not redraw on a setpoint change (they depend on the range only).
- The list uses `repeat` by id, so a selection change touches two `aria-selected` attributes.

## Acceptance Criteria

Pull request 1, the provider, the model, the pane, the list and the detail head:

1. `src/providers/heat-pump.ts`, `src/features/climate/{README.md,index.ts,ids.ts,inputs.ts,items.ts,model.ts,dial-geometry.ts,gauge-geometry.ts,climate-pane.ts,climate-list.ts,climate-detail.ts,dial.ts,gauge.ts,styles.css}` exist with headers; `FEATURES` has `climateFeature` with `available` from the inputs; `powerNow` gives `minTemp`/`maxTemp`.
2. Vitest: `heatPump` (brand rule, defaults, null when unset), `climateItems` (the house, rooms and heat pump subs and tones), `dialGeometry` (angles at lo, hi and midpoint; off; ticks count and majors), `dialValueFromPointer` (snapping, below the lowest step is off, the dead zone above 270°), `gaugeGeometry`, `climateModel` from the test house in `en` and `fr` and from the recorded fixture; 100 percent statements.
3. Playwright `climate.spec.ts`: the tab lists the house, the rooms and the heat pump with the house's values; selecting a room changes the head and the tiles; on the phone the tiles open the sheet with the dial; a thermostat change updates the room's tile and gives zero mutations in `hp-security-pane`'s root (the cross-feature check now runs the other way); axe clean (the listbox and the slider roles).
4. Every baseline identical; the French equivalence test passes for `test/unit/fixtures/moved/climate.json`; `npm run check`, `npm test -- --coverage`, `npm run lint` green; changeset (patch): "The Climate tab is redrawn with the same look. Nothing visible changes."

Pull request 2, the history and the charts:

5. `history.ts`, `loader.ts`, `heatmap-legend.ts`, `src/core/color.ts` exist; Vitest covers the setpoint rule (partly off, off throughout, on), `heatingKwh` (the running period's hours so far), `houseSeries` (a bucket missing a room is dropped), `bucket` (the four groupings, unique keys, labels), the OKLab blend against the class's colours, the three options builders by shape; the room chart, the heatmap and the outside chart draw through `<hp-chart>`; `Week` sends one statistics request and one history request and a second `Week` within ten minutes sends none (`window.house.reads`); `loadHistory` holds only the Car's window; the `climate-*` baselines identical; `chunks.spec.ts` holds; changeset (patch).

Pull request 3, the controls and the deletion:

6. `<hp-seg>`, `ArmedController`, `<hp-climate-controls>`, `commands.ts` exist; Air's two groups use `<hp-seg>`; Vitest covers `nextSetpoint` (the frost-guard rules), every command as data, the armed controller's timer; Playwright: five quick taps on `+` send one `climate.set_temperature` with the final value; a dial drag on the phone sends one call after the finger rests; `All off` once shows "Tap again: all rooms off" and sends nothing, twice sends one call with every room's id; the heat pump's mode group sends `set_hvac_mode`; the grep gates hold; the styles-split test passes; the French map lost the listed entries; every baseline identical; all suites green; changeset (patch).

## Testing Decisions

The seams are the two of ADR 0005. New in kind: pointer-driven tests (the dial's drag through Playwright's mouse, asserting the value and the single call) and keyboard tests for the slider and the radio group (arrow keys), which the a11y improvements of `<hp-seg>` and `<hp-dial>` make possible. The geometry, the history rules and the colour blend are the pure seam. Prior art: `lights-sheet.spec.ts` for one call per drag; `weather.spec.ts` for the inline detail and the range tabs.

## Out of Scope

- A dial on the tablet or a gauge on the phone: each keeps its device, as today.
- Schedules, presets per room, or a humidity reading: not in the panel.
- Promoting `<hp-dial>` to the kit: it has one user; the note below says what would promote it.

## Notes

- **Why the dead Home card is deleted and not moved.** `renderClimate` draws into `.cols`, hidden since the tabs-only view of 1.16.0; no baseline shows it. Moving dead code would be the recipe applied to nothing; the Home pane's climate tile (spec 24) reads `climateItems` for its text.
- **Why `<hp-seg>` is promoted here and not in Air.** Air's groups were the first user; Climate's four groups make the shape general (sub labels, disabled, a select beside them), and the arrow-key behaviour is worth one implementation.
- **Why the OKLab blend is in the core.** It is arithmetic over colours with no DOM; the heatmap is its only user today, but a colour scale is what the kit's charts will want next (the smart stack's rings are a candidate), and a core module is what the dependency rule allows everyone to import.
- **Why `<hp-dial>` stays in the feature.** One user. If the water heater or the car's charge limit grows a dial, it moves to the kit then, with its geometry module.
- **Reading**: Björn Ottosson, _OKLab_ (the colour space); Apple HIG, _Sliders_ (the dial's a11y as a slider); Lit docs, _Events_ (pointer capture in an element); Home Assistant developer docs, _Climate entity_ (`hvac_modes`, `fan_modes`, `preset_modes`, `swing_modes`, `set_temperature` with several ids).
