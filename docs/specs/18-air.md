# Spec 18: Air, the fourth move: the Mila provider, a rating model, the purifier controls, and the first charts after Weather

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 3.
Depends on: [15 Weather](15-weather.md) (`<hp-chart>`, the statistics cache, `<hp-range-tabs>`, `ranges.ts`), [16 Media](16-media.md) (`CommandRunner`, `OptimisticController`, `debounce`, the Home-card bridge), [17 Security](17-security.md) (the rule that a reading another feature needs lives in a provider). Blocks: 19 Energy and every later move; 24 Home, whose smart stack reads the Mila provider.
Ships as: two pull requests, each a patch release, each pixel-identical. No new ADR: the decisions are 0020 to 0025's, applied; one note records why the stepper is promoted to the kit.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

Air is the Mila purifiers: the Air tab (`pane-air`), the Home card `#open-air` that `placePanels` moves into the pane on a tablet, the detail panel `#sh-air` (inline in the pane on a tablet, a modal sheet on a phone), and one smart-stack card. In the class:

- `purifiers()` (~4518): the Mila devices from the registry (platform `mila`), one room per device with a `fan.*`, the thirteen sensor suffixes of `AIR_KEYS` found by name, the room named from the area, else the device, else the fan; the account-level device without a fan is the outdoor station (`_aqi`, `_station_pm2_5`, `_station_distance`, four `_pollen_status_*`).
- `roomAir` and `airSummary` (~4557): the rating rules. A room's level is Mila's own index on the US AQI scale (`outLevel`), else the worst of PM2.5, CO₂, VOC and CO against the `AQ` bands (US EPA, ventilation guidance, UBA, WHO); the "why" names the pollutants at the worst level; the house's summary counts clean rooms and names the worst.
- `renderAir` (~4580): the card: the outside AQI on the right, the `.aqsum` state line, one `.aqroom` per room with PM2.5, CO₂ and VOC, and the fan's line (Automagic or Manual with the percentage, the humidity).
- `airSheet`, `renderAirLive` (~4617): the detail: one `.aqcard` per room with seven tiles, a radio group Automagic or Manual and, in Manual, a stepper for the fan speed in steps of ten (minimum ten); the outside block with the AQI, Environment Canada's AQHI, the station's PM2.5 and distance, and the four pollen tiles.
- `loadAirRange`, `airChart`, `airOutChart` (~4682 to 4895): one line chart per metric (PM2.5, CO₂, VOC, humidity) over day, week or month, one series per room plus the station as a dashed line, a "Good" band; a second chart for the outdoor AQI and the AQHI on two axes with Good and Moderate bands; a ten-minute cache (`this.AR`) keyed by range and metric.
- `airControl` (~4895): the range and metric tabs, `fan.set_preset_mode` with a pending mode, `fan.set_percentage` debounced 900 ms with a pending percentage.
- The purifier branch of `phoneCmd` (gone with #220: no markup has written `data-pf` since 2.0.0), the Air line of `renderCompactSubs`, the `scard('air', …)` smart-stack card (~1711) that reads `purifiers()` and `roomAir`, and the `AQ`, `AQ_LVL`, `AIR_KEYS`, `POLLEN`, `aqLevel`, `aqFmt`, `outLevel` constants (~146 to 186).

The made-up test house has no Mila device, so the `air-tablet-*` baselines show the empty card and `bare-air-*` the same; the recorded fixture (spec 14 F) is the only data a test can pin today's output against. Every number is formatted with the English formatters whatever the profile.

## Solution

Move Air into `src/features/air/`, in two pull requests:

1. **The provider, the model and the pane.** `src/providers/mila.ts` reads the purifiers and the outdoor station into `AirInputs`; `airModel` turns them into ratings and lines through `t()` and `fmt`; `<hp-air-pane>` draws the card's content (the pane on a phone, the top of the pane on a tablet) and hosts `<hp-air-detail>` inline; `<hp-air-detail>` draws the room cards, the controls through the element's `CommandRunner` and the optimistic overlay, and the two charts through `<hp-chart>` over the statistics cache. `.stepper` is promoted to the kit as `<hp-stepper>` with Media's volume as its first user and the fan speed as its second. The class keeps `purifiers()` for the stack and the phone tile until pull request 2.
2. **The stack's read, the phone tile and the deletion.** The smart-stack card reads `milaRooms(...)` and `rateRoom(...)` from the provider and the feature's pure rating (the legacy-to-providers allowance of ADR 0025; the rating function moves into the provider's output as `level` so the class does not import the feature); the phone's purifier tile branch of `phoneCmd` is gone with #220: no markup has written `data-pf` since 2.0.0; every Air method, constant, style and French entry is deleted.

Each pull request leaves every baseline identical (`air-tablet-*`, `bare-air-*`, `home-*`).

## User Stories

1. As a household member, I want the Air tab, the card, the detail with its controls and charts, and the smart stack's air card to look and work exactly as before, so that the move is invisible.
2. As a household member, I want a tap on Automagic or Manual and on the fan's `+` or `−` to show at once and settle to what Mila reports, and the fan speed to be sent once after a burst of taps, as today, so that the purifier does not hunt.
3. As a French-speaking user, I want every Air string and number in French from the first paint (`1 234`, `12,5`), so that the one card that formatted in English follows the rest.
4. As an adopter with another purifier, I want the air model to work from generic inputs (a fan, a few sensors, a rating), so that a second provider is one file.
5. As a maintainer, I want the rating rules (the bands, Mila's index, the worst and the why) as a pure function tested against the recorded fixture, so that today's ratings are pinned.
6. As a maintainer, I want the charts to go through `<hp-chart>` and the statistics cache, so that Air draws charts by composition and shares the one cache.
7. As a maintainer, I want the stack's air card to read the provider, not the feature, so that the dependency rule holds and the rating has one implementation.
8. As a maintainer, I want the stepper in the kit with two users, so that the climate and car controls reuse it later.
9. As a maintainer, I want the behaviour tests to run against a test house that has a purifier, so that the pane is proven by more than the empty state (the house grows, with an approved baseline).
10. As a learner, I want the provider to show the registry-driven discovery (devices of a platform, entities of a device, suffixes) as a documented pattern, so that Hilo, FordPass and Wallbox follow it.

## Implementation Decisions

### The folder

```
src/providers/
  mila.ts                  milaRooms(states, registries, names): AirRoomInputs[]; milaOutside(...): OutsideAirInputs | null; AIR_SUFFIXES
  air-quality.ts           the bands and the scales: AQ_BANDS, aqLevel(k, v), outdoorLevel(aqi), rateRoom(room): RoomRating (pure, shared by the stack)
src/features/air/
  README.md
  index.ts                 airFeature
  ids.ts                   airIds(store)
  inputs.ts                readAir(states, registries, names, config): AirInputs (the AQHI is config.entities.aqhi)
  model.ts                 airModel(inputs, deps): AirViewModel
  history.ts               metricSeries, metricIds, outdoorSeries, chartText, airChartOptions, outdoorChartOptions, statisticsStart, rangeTabs (as built in #233)
  commands.ts              K, setMode(fan, mode, name), setSpeed(fan, pct, name), toggleFan(fan, on, name)
  sheets.ts                DETAIL_SHEET = 'air.detail' (as built in #233; the legacy 'sh-air' until then)
  air-pane.ts              <hp-air-pane>; air-pane.element.css
  air-card.ts              <hp-air-card> (the card's content: summary, rooms; used by the pane and, through the bridge, by Home); air-card.element.css
  air-detail.ts            <hp-air-detail>; air-detail.element.css
  room-card.ts             <hp-air-room> (one .aqcard with its tiles and controls); room-card.element.css
src/ui/
  stepper.ts               <hp-stepper> (promoted from Media's pod); stepper.element.css, steps.ts (as built in #231)
test/unit/
  providers/mila.test.ts, air-quality.test.ts
  features/air/{model,history,commands}.test.ts
test/e2e/air.spec.ts
test/houses/full.mjs       gains one Mila purifier and the outdoor station (its own pull request, see Testing Decisions)
```

### The provider and the shared rating

```ts
// src/providers/mila.ts
export const AIR_SUFFIXES = ['pm1', 'pm2_5', 'pm10', 'co', 'co2', 'voc', 'humidity', 'temperature', 'air_quality', 'fan_speed', 'air_changes', 'mode', 'time_to_clean'] as const;
export interface AirRoomInputs {
  deviceId: string;
  fanId: string; // fan.*
  areaId: string | null;
  name: string; // the area's name, else the device's, else the fan's, through the resolver (`nameOwner`)
  sensors: Partial<Record<(typeof AIR_SUFFIXES)[number], string>>; // entity ids by suffix
  readings: {pm1, pm2_5, pm10, co, co2, voc, humidity, temperature, airQuality, airChanges: number | null};
  fan: {on: boolean; available: boolean; percentage: number; preset: string | null}; // preset 'Automagic' | 'Manual' | other
}
export interface OutsideAirInputs {
  aqi: string | null; // entity ids, for the chart
  pm: string | null;
  distance: string | null;
  pollen: {kind: 'trees' | 'grass' | 'weeds' | 'mold'; id: string | null}[];
  readings: {aqi: number | null; pm: number | null; distance: number | null; pollen: Record<kind, string | null>};
}
export function milaRooms(states, registries, names): AirRoomInputs[]; // sorted by name
export function milaOutside(states, registries): OutsideAirInputs | null;
```

- Discovery is the class's: every registry entity with `platform === 'mila'` grouped by device; a device with a `fan.*` is a room, the sensors found by `^sensor\..*_<suffix>$`; the device without a fan but with `_aqi` is the station. The header names the pattern: **registry-driven discovery** (devices of a platform, entities of a device, roles by suffix), the shape Hilo, FordPass and Wallbox follow in specs 19 and 21.
- `src/providers/air-quality.ts` holds what the stack and the feature both need: `AQ_BANDS` (`pm2_5: [12, 35] µg/m³`, `co2: [800, 1200] ppm`, `voc: [300, 3000] µg/m³`, `co: [9, 35] ppm`, with the sources in the header), `aqLevel(k, v): -1 | 0 | 1 | 2`, `outdoorLevel(aqi)`, `rateRoom(room: AirRoomInputs): RoomRating {level, milaIndex, why: {k, v, level}[], pollutants: {k, v: number | null, level}[]}` (a pollutant with no reading is listed with `v: null` and level -1, so the card shows its dash, and `why` holds only numbers; Mila's index decides the level when present; the why is the pollutants at the highest level above good, as `roomAir` does). It is a provider module because the smart stack (spec 24, and the class until then) reads it; it has no strings.
- Readers in pull request 2: the class's `stackCards` calls `milaRooms` and `rateRoom`; `renderMore`'s Air summary and `renderCompactSubs`'s Air line are the registry's `summary` from `airModel`. `purifiers()`, `roomAir`, `airSummary` go.

### The inputs, the model and the view model

```ts
export interface AirInputs {
  rooms: AirRoomInputs[];
  outside: OutsideAirInputs | null;
  aqhi: number | null; // Environment Canada's, from the weather provider's inputs (config.entities.aqhi), for the outside line, printed as the legacy panel printed it (the number as it is)
  aqhiId: string | null; // the sensor's id while its state exists, readable or not: the outdoor chart's gate and its statistics request
}
export interface AirModelDeps {
  now: number; // the contract of every model; no Air line is dated
  t: Translate;
  fmt: Formatters;
  overlay: <T>(key: string, current: T) => T;
  metric?: ChartMetric; // the detail's selection, for the chart's title and caption (the legacy sheet's own defaults: PM2.5, day)
  range?: Range;
}
export function airModel(inputs: AirInputs, deps: AirModelDeps): AirViewModel;

export interface AirViewModel {
  summary: string; // the sub-line: "2 purifiers · Good" | "2 purifiers · Moderate · Office: CO₂ 1 050" | "No purifiers found"
  card: {title: string} & (
    | {empty: true; message: string} // "No purifiers found" on the right, nothing else
    | {
        empty: false;
        outside: {label: string; aqi: string; level: string} | null; // "Outside AQI", the figure, its level
        state: {tone: 0 | 1 | 2; text: string; why: string}; // why: "All 2 rooms clean" | "1 of 2 rooms clean" | the why; a room that reads nothing is drawn as good, as before
        rooms: {id, name, tone, metrics: {metric, label, value, high}[3], line: string}[]; // the fan line: "Automagic · 40% · 45% RH" | "Fan off" | "Purifier offline"
      }
  );
  detail: {
    title: string;
    sub: string; // "Good in every room" | "Moderate · Office: CO₂ 1 050" | "No readings yet"
    rooms: RoomDetail[]; // {id, name, tone, state, headline, tiles: {metric, label, value, unit, high}[7], control: {offline: true, message} | {modeLabel, modes, speed: {pct, text, atMin, atMax, ...} | null (Manual), hint | null (Automagic)}}
    history: {label, metric, metrics: {metric, label}[], title, caption, unavailable}; // "PM2.5, last 24 hours"; "Good is up to 12 µg/m³, moderate up to 35. The dashed line is the outdoor station."
    outside: {title, hint, tone, state, reading: {label, value}, more, pollen: {label, value}[] | null, pollenHint} | null; // reading is "AQI" and its figure (the figure in bold), more "AQHI 2 · PM2.5 9.0 µg/m³ · station 6 km away"
    outdoorChart: {title, hint, empty} | null;
  };
}
```

- Formats: `aqFmt`'s rules become `fmt.integer`, `fmt.fixed(v, 1)` for CO under ten (`1.0`, as today: `fmt.number(v, 1)` would drop the zero and change the English baselines), and the short `k` form for the card (`1.5k`, `1,5k` in French, through `fmt.fixed`; from ten thousand it rounds to a whole number), all locale-aware: the one visible change of the spec is French numbers on the Air card and detail, and the French baselines are checked against the fixture-fed test house (the `air-tablet-*-fr` baselines today show the empty state, so no committed pixel changes; the new house baselines are recorded once, below).
- The overlay applies to the fan's `preset` and `percentage` (keys `K.mode(fan)`, `K.pct(fan)`), so a tap shows at once in the control and the card line alike.
- `history.ts`: `metricSeries(stats, {rooms, outside}, metric, range): {rooms: {name, points}[]; outside: points | null}` (mean per bucket shifted by half the range's bucket, one decimal, nulls dropped; the axis starts from `now` in the options, so the series carries no `start`), `metricIds(inputs, metric)` (the ids to ask the recorder for), `outdoorSeries(stats, {aqi, aqhi}, range)`, `chartText(metric, range, {t, fmt})` (the chart's title and caption, which `airModel` places), `airChartOptions(series, metric, range, {fmt, t, tokens, now})` (the line chart: the room colours from the four token slots, the dashed station line, the Good or Comfortable band, the integer axis), `outdoorChartOptions(series, range, {fmt, t, tokens, now})` (two axes, the AQI bands); pure, tested by shape. The options take `t` and `now` besides `fmt`, as Weather's do: the band and series names are words and the axis ends now.
- `commands.ts`: `K = {mode, pct}` (the typed overlay keys, Air's own: a feature does not import Media's); `setMode(fan, mode, name)` holds `K.mode`, `fan.set_preset_mode`, done `air.modeSet` (`{name}: {mode}`, the mode worded by an ICU select over the two presets); `setSpeed(fan, pct, name)` holds `K.pct` with the clamp (10 to 100 in steps of ten; the held value is `data.percentage`), `fan.set_percentage`, done `air.fanSet` (`{name} fan {pct}%`); the element debounces `setSpeed` by 900 ms with `debounce`. The purifier's toggle (`fan.turn_on`/`turn_off`, done `air.purifierOn`/`purifierOff`) is `toggleFan(fan, on, name)`; it holds nothing, as no model reads a held power.

### The elements

- **`<hp-air-pane>`**: `active`; `StoreController({ids: s => airIds(s)})`; `<hp-pane-header icon="aq" color="var(--ok)">` with `t('air.title')` and `vm.summary`; `<hp-air-card .view=${vm.card}>`; then `<hp-air-detail>` inline on a tablet (`:host(:not([compact]))`), or a tap on the card dispatching `SheetRequestEvent('air.detail')` on a phone, where the detail is wrapped by `<hp-sheet>` as the Weather detail is.
- **`<hp-air-card>`**: the `.top` line (the outside AQI with its level on the right, the `›`), the `.aqsum` with the level class `lv0..2`, the `.rooms` of `.room.aqroom` with the `.n` dot, the `.aqm` metrics and the `.s` line (`repeat` by device id). Also Home's `#air` card content through the bridge from pull request 2 (`#open-air` keeps its `.card.tap` wrapper and its tap opens the detail: the guest's listener becomes the element's `SheetRequestEvent`).
- **`<hp-air-detail>`**: the `h2`/sub from the model, `<hp-range-tabs .ranges=${[day, week, month]}>` in the header's `tabs` slot, the `.aqrooms` of `<hp-air-room>` (`repeat`), the history block (`h3`, caption, the metric `seg` radio group, the legend, `<hp-chart>`), the outside block (the `.aqsum`, the pollen `.tiles` or the hint, the outdoor `<hp-chart>` with its legend or the "No outdoor history yet" line). Data: on open and on range or metric change, `cache.statistics(ids, range.period, start, ['mean'])` through the statistics cache (ten-minute ttl, as `this.AR` had), a `StaleReply` dropped, a late reply for another range or metric dropped (`this.range === r && this.metric === m`).
- **`<hp-air-room>`**: one `.aqcard` with the `.aqhead`, the seven `.tile`s, and the `.aqctl`: the `seg` radio group (Automagic, Manual) and, in Manual, `<hp-stepper>`; else the Automagic hint with the current percentage and the air changes; the offline paragraph when the fan is unavailable.
- **`<hp-stepper>`** (`src/ui/stepper.ts`): `value`, `label` (the small word under the value), `min`, `max`, `step`, `decrementLabel`, `incrementLabel`, `disabled`; renders the `.stepper` markup (`−`, the `.sv` with the bold value and the small label, `+`) with the buttons disabled at the bounds; dispatches `step-change` with `{value}` (as built, not `step`: the property `step` is the tap size, and the kit names its events as `<hp-range-tabs>`' `range-change` does); the host debounces. Media's `<hp-speaker-pod>` switches to it in this spec's first pull request (its second user is what promotes it; Media's `.stepper` rules move from the feature's file to `src/ui/styles/stepper.css`). As built in #231: the element is `src/ui/stepper.ts` with `stepper.element.css` beside it (not `styles/stepper.css`: the legacy fan and climate controls still draw `.stepper`, so the kit's copy reads as `.step` and `.sv`, and an element's own file is adopted by its root alone); the host is the pill (`display: flex`), named by the owner's `aria-label` and given `role="group"`; the next value comes from the pure `stepBy` (`src/ui/steps.ts`), rounded to the step's decimals; the pod sets `flex`, `order` and `padding` on the tag and `::part(button)` and `::part(value)`. Media's model hands it `level` in place of the old `atMin`, `atMax`, `down` and `up`.

### Styles

- `src/features/air/styles.css` receives `.aqsum`, `.aqroom` and its levels, `.aqm`, `.aqrooms`, `.aqcard`, `.aqhead`, `.aqt`, `.aqctl`, `.aqmetric` (`extra.css` ~771 to 895 and 1265), the `.rooms`/`.room` rules it shares with Climate's list stay in the legacy sheet until spec 20 decides (Climate's room list is their main user; the Air card's `.room.aqroom` reads them from the legacy concatenation through the kit's `room.css` split in spec 20; until then the Air element adopts a copy under a feature-scoped selector `.aqroom` and the duplication is listed in the pull request and removed by spec 20).
- `.stepper` → `src/ui/stepper.element.css` (as built in #231, see the `<hp-stepper>` entry). `.app.cp` → `:host([compact])`, `.app.gl` → `:host([glass])`.

### Strings and formats

About seventy `air.*` keys, English and French, in `src/core/i18n/{en,fr}.ts` and listed in `test/unit/fixtures/moved/air.json`: the card and the sub-line (`quality`, `noPurifiers`, `purifiers` plural, `noData`, `noReadings`, `noReadingsYet`, `goodEveryRoom`, `level.good`/`moderate`/`poor`, `allRoomsClean` plural, `roomsClean`, `milaIndex`, `cleanAir`, `roomWhy`, `outsideAqi`, `purifierOffline`, `fanOff`, `automagic`, `manual`, `fanLine`, `rh`), the detail and the controls (`offlineHint`, `automagicHint` with its `{clauses}` made of `hintNow` and `hintChanges`, `slower`, `faster`, `fan`, `percent`, `fanSpeed`, `mode`), the commands (`modeSet`, `fanSet`, `purifierOn`/`Off`), the pollutants (`metric.*`, seven), the history chart (`whatToChart`, `chartTitle`, `goodUpTo`, `dashedOutdoor`, `comfortableHumidity`, `comfortable`, `historyUnavailable`) and the outside block (`outside`, `outsideHint`, `outdoorAir`, `outdoorHint`, `aqi`, `aqhiValue`, `stationPm`, `station`, `pollen.*`, `pollenLevel.*`, `noPollenYet`, `noOutdoorHistory`, `aqiSeries`, `aqhiSeries`, `axis.aqi`/`aqhi`). `isHigh` (the stack's "{name} is high") comes with pull request 2, which is its first reader; the series name "Outside" is `air.outside`. French is the rewrite layer's output for each text (`src/i18n/fr.js` ~740 to 830, deleted in pull request 2); the texts the layer left in English, or never made as one message, are written in the fixture as `written`: `purifiers` (the plural), `allRoomsClean` (its singular reads "La pièce est propre"), `roomsClean`, `milaIndex`, `rh` ("45 % HR": the layer left "RH" after an offline fan's line), `dashedOutdoor`, `hintNow`, `hintChanges`, the Automagic hint with the air changes only, `station`, `outdoorHint`, and the lower-case forms `noDataLower` and `levelLower.*`. The legacy panel still draws the tab, so none of this French shows today: the French Air baselines of #232 and #233, the first to draw the elements, will show these texts beside the French numbers. A mode, a `Moderate` or a `no data` in running text is its own key, never a lower-cased catalog word. `plural(n, 'room')`, `plural(n, 'purifier')` become ICU plurals.

### Deletion (pull request 2) and grep gates

Deleted from `src/home-panel.js`: `purifiers`, `roomAir`, `airSummary`, `renderAir`, `airSheet`, `renderAirLive`, `loadAirRange`, `airChart`, `airOutChart`, `airControl`, the `data-pf` branch of `phoneCmd` (gone with #220: no markup has written `data-pf` since 2.0.0), the Air line of `renderCompactSubs`, `AQ`, `AQ_LVL`, `AIR_KEYS`, `POLLEN`, `aqLevel`, `aqFmt`, `outLevel`, the `#sh-air` markup, the `'renderAir'` entry of `renderLive`, the `sh-air` branches of `renderLive` and `buildSheet`/`sheetOpened`, the `open-air`/`sh-air` pair of the card listeners (~1952), the `panels['sh-air']` listener (~2337), `this.AR`, `this.airC`, `this.aoC`, `this.airTag`, `this.aoTag`, `this.airRange`, `this.airMetric`, `this.spT`; the `scard('air', …)` block reads the provider. `CHART_SHEETS` loses `sh-air`. `#open-air` and `#air` stay as the bridge's hosts until spec 24.

Gates: `grep -nE '^  (purifiers|roomAir|airSummary|renderAir|airSheet|renderAirLive|loadAirRange|airChart|airOutChart|airControl)\(|^const (AQ|AQ_LVL|AIR_KEYS|POLLEN)\b|aqLevel|aqFmt|outLevel|data-pf|sh-air' src/home-panel.js` is empty; `grep -nE '\.(aqsum|aqroom|aqm|aqrooms|aqcard|aqhead|aqt|aqctl|aqmetric)\b' src/css/*.css` is empty (`.stepper` is not in it: the legacy climate stepper still draws it, so its copy stays until #248, Climate move 7, deletes it); the French map lost the listed entries; the class shrinks by about 430 lines, quoted.

### Performance, by construction

- The pane subscribes to the Mila ids (about fifteen per room, the station's seven, the AQHI); a light or thermostat change gives zero mutations in its root.
- The detail loads statistics when shown and per range and metric through the shared cache; the charts update through `updateOptions`; a hidden pane holds no chart.
- The stepper's burst is one `set_percentage`; the held percentage shows in the card line and the control from one overlay.

## Acceptance Criteria

Pull request 1, the provider, the pane and the detail:

1. `src/providers/{mila,air-quality}.ts`, `src/features/air/{README.md,index.ts,ids.ts,inputs.ts,model.ts,history.ts,commands.ts,air-pane.ts,air-card.ts,air-detail.ts,room-card.ts,styles.css}`, `src/ui/stepper.ts`, `src/ui/stepper.element.css` exist with headers; `FEATURES` has `airFeature`; `<hp-speaker-pod>` uses `<hp-stepper>`.
2. Vitest: `milaRooms` (grouping by device, suffix discovery, the station without a fan, the name fallbacks, sort), `rateRoom` (each band edge, Mila's index overriding, the why), `airModel` from the recorded fixture in `en` and `fr` and from the grown test house, `metricSeries`/`outdoorSeries` with literal rows, the two options builders by shape, every command as data; 100 percent statements on the pure modules.
3. Playwright `air.spec.ts` (against the grown test house): the tab shows the rooms with their metrics; the detail shows the tiles and the Automagic control; tapping Manual sends `fan.set_preset_mode` and shows the stepper at once; three quick taps on `+` send one `fan.set_percentage` with the final value; `Week` sends one statistics request and the chart redraws; a thermostat change gives zero mutations in `hp-air-pane`'s root; axe clean on the tab and the detail.
4. Every baseline identical, with the grown-house baselines recorded in their own prior pull request (Testing Decisions); the French equivalence test passes for `test/unit/fixtures/moved/air.json`; `npm run check`, `npm test -- --coverage`, `npm run lint` green; changeset (patch): "The Air tab is redrawn with the same look. Nothing visible changes."

Pull request 2, the stack's read, the phone tile and the deletion:

5. `stackCards`'s air card reads `milaRooms` and `rateRoom`; `grep -n 'milaRooms\|rateRoom' src/home-panel.js` lists the stack's call sites; the stack's air card is proven by `smart-stack.spec.ts` with a poor-air room in the grown house.
6. The grep gates hold; the styles-split test passes; the French map lost the listed entries; every baseline identical; all suites green; changeset (patch): "Internal tidying of the air cards. Nothing visible changes."

## Testing Decisions

The seams are the two of ADR 0005. New in kind: **the test house grows**. The full house gains one Mila purifier (a fan with its thirteen sensors, Automagic on, PM2.5 moderate) and the outdoor station (AQI 42, PM2.5 9, distance 6 km, pollen trees low), in a pull request **before** this spec's first, which records the new `air-tablet-*` baselines and the changed `home-*` ones (the Home air card is no longer empty) under ADR 0003's approval rule. The bare house stays bare, so `bare-air-*` still proves the empty state. The move's pull requests then run against a house that shows the feature. The provider, the rating, the model and `history.ts` are the pure seam; the elements are proven by `air.spec.ts` and the baselines; prior art: `weather.spec.ts` for the inline detail, `media.spec.ts` for the debounced control.

## Out of Scope

- A second purifier provider: the generic inputs are the seam; the adapter is an adopter's pull request.
- Changing the bands or Mila's rating; the pollen scale.
- The `.rooms`/`.room` rules' final home: spec 20 (Climate) splits them.

## Notes

- **Why the rating is in a provider module and not in the feature's model.** The smart stack's "Office air is high" card needs the level and the worst pollutant; a feature may not export to the shell's stack through the legacy class, and the rule of ADR 0025 says shared reads go down. The rating has no strings, so it sits well beside the bands.
- **As built in #232** (the pane and the card, before the detail): `airFeature` replaces the legacy descriptor; it is always shown (the legacy tab had no `available` either) and its More word is `guest.moreLine('air')`, the legacy "Good" or "No purifiers", because the pane's sub-line ("1 purifier · Good") would change the More sheet's baselines until #234. The card is the phone's: on a tablet the old `#open-air` card was parked in the hidden Home columns and the tab was the detail panel alone, so `<hp-air-pane>` draws its header there and does not show it (the `air-tablet-*` baselines are the proof) and draws no `<hp-air-card>`; on a phone it draws the header and the card, whose box is a button (`openLabel`, `aria-description` as the legacy `#open-air` had) that asks for `sh-air`, the legacy detail sheet (`sheets.ts`, `DETAIL_SHEET`: the sheet host opens a legacy sheet by its own id, so `detailSheet` waits for #233, which gives the element's detail `air.detail`). The detail panel is moved into `#pane-air` after the pane by the sheet host, as before. The card's box is an inner element (`.aqbox`, for the glass's lens), the file is `air-card.element.css` and there is no `styles.css` yet; the rules of `.aqroom` and `.aqm` moved out of `src/css/`, `.aqsum` stayed because the legacy detail's outside block still draws it, so the card's state line is `.aqstate` until #233, and the climate list's `.rooms`/`.room` and `.go` rules are copied under `.aqlist`, `.aqroom` and `.aqgo` (the duplication #248 and #268 delete). The card's held values are the purifier's own (no tap holds one yet), so the pane passes the model an identity overlay until #233's controls hold them. `#open-air` and `#air` stay in the guest's markup, empty, as empty legacy containers until #268 (nothing writes into them; the bridge's hosts are `#hscenes` and `#hsec`); `renderAir`, the Air line of `renderCompactSubs` and the `open-air` entry of `placePanels` are gone, and `renderHome`, `stackCards` and `moreLines` still call `purifiers()` and `airSummary()` until #234. The one string added to the catalog is `air.open`, the card's `aria-description`.
- **As built in #233** (the detail): `air-detail.ts` and `room-card.ts` with their `.element.css` (there is no `styles.css`: the `.aqcard`, `.aqhead`, `.aqt`, `.aqctl` rules went to the room card's file, `.aqrooms`, `.aqmetric` and `.aqsum` to the detail's, and the legacy copies, with `.aqsum` and the `lv0..2 .state` rules, were deleted; the kit's `.inner`, `.tiles`, `.seg` and `.legend` are adopted as they are, and `.state` is copied into both files until #268). The detail is a controlled component: `<hp-air-pane>` keeps the range and the metric for the panel's life (as `this.airRange` and `this.airMetric` were kept), the ten-minute `createStatisticsCache` (cleared at a new config generation) and an `OptimisticController` whose `read` is the model's overlay, so a hold in a room card draws the pane again; it hands the detail `view.detail`, the `AirInputs` (the sensor ids the statistics are asked for), the cache, `range` and `metric`, and hears `range-chosen` (the detail's tabs) and the sheet's `range-change`, and `metric-chosen`. The range tabs are `rangeTabs(t)`: the sheet's `tabs` slot on a phone, the detail's own `hp-pane-header` (`actions` slot) on a tablet, with the legacy sheet's three-line badge slotted for the same pixels. Each chart asks the cache itself, `statistics(ids, period, statisticsStart(now, range), ['mean'])` from the top of the hour (so the same range within the hour is a hit; the axis still starts at `now` less the range), on first show and when the config generation, the range, the metric (the metric chart only) or the sensor list change; a reply is dropped unless the detail is connected and still asking for that key (which is `this.range === r && this.metric === m` and more), a `StaleReply` is dropped, and disconnecting forgets what was asked so a detail put back asks again. The two requests of a range (the metric's and the outdoor index's) are two reads, as the legacy sheet's were. `<hp-air-room>` holds `K.mode` or `K.pct` in the shared optimistic store at each tap and runs `setMode` or the debounced `setSpeed` (900 ms, cancelled on disconnect with the held speed released). A model's `speed` lost `atMin` and `atMax` (the stepper disables its buttons at its bounds, as Media's did). A house with neither a station nor an AQHI draws no outside block (the legacy sheet drew its two headings with nothing under them), so `bare-air-tablet-light-en` lost that card; every other baseline is identical, the French ones included, since the catalog's French reads what the rewrite layer made. `airFeature` has `detailSheet`, the pane binds `detailOpen`, and a phone's stack card (`go: 'air.detail'`) opens the sheet over any tab; the legacy panel lost `airSheet`, `renderAirLive`, `loadAirRange`, `airChart`, `airOutChart`, `airControl`, the `#sh-air` markup and its listeners, `this.AR`, `this.airC`, `this.aoC`, `this.airTag`, `this.aoTag`, `this.airRange`, `this.airMetric` and the air keys of `this.spT`, and `CHART_SHEETS` lost `sh-air`. Two catalog keys came with it: `air.close` (the sheet's Close button) and `air.historyLoading`.
- **Why `<hp-stepper>` is promoted here.** Media's volume stepper was its first user; the fan speed is the second with a different step and bounds, which is what proves the interface is general. The climate setpoint controls (spec 20) are the third.
- **Why the test house grows for this move and did not for the earlier ones.** Weather, Media and Security had entities in the house; Air had none, so its baselines proved only the empty state. A feature cannot be moved pixel-identically against pixels that show nothing of it; growing the house first, in an approved baseline pull request, is the ADR 0003 way.
- **Reading**: Home Assistant developer docs, _Fan entity_ (`preset_mode`, `percentage`), the entity and device registries; US EPA PM2.5 breakpoints; UBA TVOC guideline values; WHO CO 8-hour guideline; Mila integration docs (the sensor list).
