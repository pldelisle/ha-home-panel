# Spec 21: Car, the seventh move: the FordPass and Wallbox providers, charging sessions from the Wallbox's history, a departure schedule as draft state, and the end of the class's history loader

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 3.
Depends on: [16 Media](16-media.md) (`runCommand`, the overlay, `<hp-switch>`), [19 Energy](19-energy.md) (the Wallbox provider, history on demand, `thinCategories`), [20 Climate](20-climate.md) (`<hp-seg>`, `ArmedController`, `.abtn` in the kit). Blocks: 22 Live pill (the FordPass provider's charging state), 24 Home (the car tile).
Ships as: three pull requests, each a patch release, each pixel-identical. No new ADR: 0021 to 0027 apply; the notes record the last `pend`/`call` users and why the sessions are the car's.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

Car is the FordPass integration and the Wallbox charger: the Car tab (`pane-car`), the Home card `#open-car` that `placePanels` moves into the pane on a tablet (`carhost`), the detail `#sh-car` inline on a tablet and modal on a phone, the phone's summary, and the readers in the header and the stack. In the class:

- **Discovery and state.** `findCar` (~3203): the car is found by `sensor.fordpass_<name>_soc` and every other entity is `<domain>.fordpass_<name>_<key>`; `carName` (the config's name, else the vehicle image's name without "Vehicle Picture"), `carImg` (Ford's photo through the image proxy, else the drawn car `CARSVG` in the config's colour, else the default; an image error flips to the drawing for the session), `carState` (~3223: the charge, the range from the `soc` attribute else the `elveh` sensor, the limit, plugged, charging, locked, home and where).
- **Drawing.** `renderCarCard` (~3258: the hero with the charge and the range, the `socbar` with the limit mark, three tiles, the daily EV `bars` over 30 days from the energy history), `carSheet` (~7847: the sessions' summary tiles and the monthly chart), `renderSessions` (the table of the last ten or all, with a bar per row and an estimated cost at the Wallbox's price), `renderCarSheetLive` (~7917, redrawn every second while open: battery with the car image, tire pressures in psi from whatever unit Ford sends around the top-view drawing `CARTOP`, the doors, windows, hood, alarm and gear chips, the 12 V battery, the software version, the Ford messages from `json_src`, the departure times line, the last plug-in from `energytransferlogentry`), `renderCarControls` (~8117: the Wallbox's current limit as a radio group, the read-only charge limit, the charging and lock switches; remote start and three heaters as armed or plain buttons, the seat heating text, lock and unlock with a second tap, honk and flash; the departure schedule's switch, days, time field and cabin temperature with "Save schedule"), `closedText`, `depState`, `depDesc`, `schedText`, `clockTime`, `plugStamp`.
- **Commands.** `carControl` (~8232): `number.set_value` for the amps, the Wallbox `switch` and `lock`, the FordPass switches, `button.press`, `lock`/`unlock`, the departure switch, and the custom service `fordpass.update_departure_schedule` with the draft (`depDraft`: days, time, cabin temperature) rounded to five minutes; `sw` (the switch's optimistic read), `pend`, `pending`, `call`, `armed`.
- **History.** The Wallbox's hourly power for 366 days gives the **sessions** (`derive` ~3580: runs above 0.3 kW joined across gaps up to three hours, at least 1 kWh), the last session on the card, the daily EV bars from the energy daily slice; after specs 19 and 20 the Wallbox window is the last one `loadHistory` holds.
- Readers elsewhere: the header's live pill (charging) and `upcoming` (the departure schedule) read `this.car` and `schedText`; `lacking().car` hides the tab.

`car-departure.spec.ts` covers the time field and malformed Ford data; the `car-tablet-*` and `car-phone-*` baselines (eight) are the rest of the proof.

## Solution

Move Car into `src/features/car/`, in three pull requests:

1. **The provider, the model, the pane and the card.** `src/providers/fordpass.ts` reads the car into `CarInputs` (discovery by prefix, the state, the sensors' attributes typed, the tire pressure conversion, the messages, the schedule); `wallbox.ts` (spec 19) gives the charger. `carModel` gives the card, the summary and the detail's read-only blocks; `<hp-car-pane>` draws the header, `<hp-car-card>` (with the image fallback as element state) and hosts the legacy detail inline through the sheet host. `history.ts` gives `sessions` and the daily bars from the car's own windows through the cache; the class's `loadHistory`, `derive`, `this.H` and `histErr` are deleted (their last window was this one).
2. **The detail.** `<hp-car-detail>` with its blocks (`<hp-car-battery>`, `<hp-car-status>` with the top-view drawing, `<hp-car-ford>`, `<hp-car-last-plug>`, `<hp-car-sessions>` with `<hp-chart>` and the table) replaces `carSheet`, `renderSessions`, `renderCarSheetLive`.
3. **The controls and the deletion.** `<hp-charger-controls>` and `<hp-car-comfort>` with `commands.ts`, `<hp-seg>`, `<hp-switch>`, `ArmedController` and the schedule's draft as element state replace `renderCarControls`, `carControl`, `depState`, `depDesc`; the header and `upcoming` read the provider; `pend`, `pending`, `call` and `sw` leave the class if Lights (spec 23) no longer needs them (it does: `lightCmd` holds pending values, so they stay until spec 23 and this pull request says so); everything else goes.

Each pull request leaves every baseline identical.

## User Stories

1. As a household member, I want the Car tab, the card, the detail with its status, controls, Ford messages and charging history, and the phone's sheet to look and work exactly as before, so that the move is invisible.
2. As a household member, I want remote start and unlock to need a second tap, the charging and lock switches to flip at once, and the current limit to be sent once, as today, so that the car does what I meant.
3. As a household member, I want the departure schedule to keep my draft (days, time, cabin temperature) while I edit it, to refuse to save without a temperature or a day, and to round the time to five minutes, as today.
4. As a French-speaking user, I want every Car string in French from the first paint, with the departure time as `8 h 30`, so that the catalog is as good as the rewrite layer was.
5. As an adopter without a FordPass car, I want no Car tab and no car tile, as today; with another car integration, I want the provider seam to be where my adapter goes.
6. As a maintainer, I want the FordPass reading (prefix discovery, the charging and plug states, the tire pressure units, the schedule's shape) in one provider with tests, so that Ford's quirks are named where they live.
7. As a maintainer, I want the charging sessions as a pure function over the Wallbox's hourly rows, tested with literal rows (gaps, the 1 kWh floor), so that the rule is pinned.
8. As a maintainer, I want the class's `loadHistory` and `derive` gone with this move, so that the history layer is per feature everywhere (ADR 0026 complete).
9. As a maintainer, I want the live pill and the upcoming list to read the FordPass provider, so that the dependency rule holds when they move.
10. As a maintainer, I want the behaviour tests to open the detail, arm and confirm remote start, change the amps, edit and save a schedule through the harness, and to keep `car-departure.spec.ts`'s cases, so that the tests survive the rewrite.
11. As a learner, I want the draft-state pattern (edit locally, validate, send once) named and explained, so that the next form in the panel follows it.

## Implementation Decisions

### The folder

```
src/providers/
  fordpass.ts              findCar(states): CarRef | null; readCar(states, registries, config, names, ref): CarInputs; tirePsi(value): number | null; departureSchedule(states, ref): Schedule | null
  wallbox.ts               (spec 19) gains the controls' inputs: amps {value, min, max}, pause {on, available}, lock {locked, available}, price
src/features/car/
  README.md
  index.ts                 carFeature (available: a car is found)
  ids.ts                   carIds(store, ref)
  inputs.ts                readCarFeature(states, registries, config, names): CarFeatureInputs (the car, the charger)
  model.ts                 carModel(inputs, history, overlay, draft, deps): CarViewModel
  history.ts               carWindows(now), sessions(rows), monthlySessions(sessions, fmt), dailyEv(dayRows), sessionsChartOptions(...)
  loader.ts                CarHistory: the two windows through the statistics cache
  bars-geometry.ts         barsGeometry(values, labels, unit): the 30-day bars (from `bars`)
  schedule.ts              ScheduleDraft, draftFromSchedule(schedule), toggleDay, roundToFive, describe(draft, fmt, t), validate(draft): Problem | null
  commands.ts              setAmps, togglePause, toggleChargerLock, remoteStart, toggleHeater, honk, lockCar, unlockCar, toggleDeparture, saveSchedule
  car-pane.ts              <hp-car-pane>
  car-card.ts              <hp-car-card>
  car-detail.ts            <hp-car-detail> (pull request 2)
  car-battery.ts, car-status.ts, car-ford.ts, car-last-plug.ts, car-sessions.ts
  charger-controls.ts      <hp-charger-controls> (pull request 3)
  car-comfort.ts           <hp-car-comfort> (pull request 3)
  car-art.ts               carSide(color) and carTop(): svg templates (from CARSVG, CARTOP)
  styles.css
test/unit/
  providers/{fordpass,wallbox}.test.ts
  features/car/{model,history,schedule,commands,bars-geometry}.test.ts
test/e2e/car.spec.ts     (absorbs car-departure.spec.ts)
```

### The providers

```ts
// src/providers/fordpass.ts
export interface CarRef { prefix: string; id(domain: string, key: string): string } // sensor.fordpass_<prefix>_<key>
export function findCar(states: HassEntities): CarRef | null; // the first /^sensor\.fordpass_[a-z0-9]+_soc$/
export interface CarInputs {
  name: string; // config.car.name, else the image entity's name without "Vehicle Picture", else t('car.title') by the model
  picture: string | null; // entity_picture of image.*_vehicleimage
  color: string | null; // config.car.color
  soc: number | null; range: number | null; limit: number | null;
  plugged: boolean; charging: boolean; chargingKw: number | null; chargeState: string | null;
  locked: boolean | null; home: boolean | null; tracker: string | null;
  lastRefresh: number | null;
  battery: {remainingKwh, capacityKwh, temperature, fullRangeKm} ; // from elveh / elvehcharging attributes
  acLimit: number | null; // number.*_globalaccurrentlimit, else the charging attribute
  cabin: number | null; outsideTemp: number | null;
  tires: {frontLeft, frontRight, rearLeft, rearRight: {psi: number | null; state: string | null}};
  doors: {closed: boolean | null; open: string[]; hoodTailgateClosed: boolean | null}; windowsClosed: boolean | null;
  alarm: string | null; gear: string | null; odometer: number | null;
  battery12: {percent: number | null; volts: number | null};
  firmware: {version: string | null; since: number | null} | null; autoUpdates: boolean | null;
  messages: {subject: string; body: string; created: number | null}[]; // json_src, the first three; a malformed date is null
  lastPlug: {plugIn: number | null; plugOut: number | null; firstSoc, lastSoc, rangeAddedKm, pluggedHours} | null;
  schedule: Schedule | null; departureOn: boolean | null; // sensor.*_departureschedules attribute `schedule`, switch.*_departuretimes
  comfort: {ignition, defrostFront, defrostRear, wheel: SwitchState}; seats: string | null; honkButton: string | null;
  lockAvailable: boolean;
}
export function tirePsi(raw: unknown): number | null; // psi, bar, kPa, Pa by unit, else guessed by size, as the class does
```

- Every attribute read of the class is a typed field here, including the ones that guard against Ford's malformed data (`asDate` on `createdDate`, `plugInTime`); `car-departure.spec.ts`'s two cases become provider tests plus one behaviour test.
- `wallbox.ts` (spec 19) gains `amps: {value, min, max, available}`, `pause: {on, available}`, `lock: {locked, available}`, `price: number | null` (default 0.07 in the model, as `carSheet` assumes).

### Sessions and the windows

- `carWindows(now)`: the Wallbox's hourly power for 366 days (`['mean', 'max']`) and the daily EV energy for 30 days (the `evP` daily mean times 24, today's hours so far, as `derive`'s `daily` did for the `ev` column: `dailyEv(dayRows, todayKey, hoursToday)`).
- `sessions(rows: StatisticRow[]): Session[]` is the class's rule: hours with a mean above 0.3 kW, joined across gaps up to three hours, `end + 1 h` as the session's end, the peak from `max`, sessions under 1 kWh dropped. `monthlySessions(sessions, fmt)` groups by month for the chart; `sessionsChartOptions` builds the bar chart (categories as short months, the tooltip "N kWh in M sessions").
- `CarHistory` (`loader.ts`) loads the two windows when the card connects (the card shows the last session and the bars) and keeps them for fifteen minutes; the detail reads the same controller through its parent.
- With this, `loadHistory`, `derive`, `this.H`, `this.loadingGen`, `this.histErr`, `noHistory`, `this.hpLastAttrs` leave the class in pull request 1; the header's `#err` line shows nothing until spec 24 deletes the container (the Energy card has its own error line since spec 19, and this card gets one: `t('car.historyFailed')`).

### The model, the draft and the commands

- `carModel(inputs, history, deps)` returns `{summary, card, detail}`: the card (name, where, hero with the charge and range, the `socbar` with the limit, the three tiles, the bars geometry and the "Daily EV energy" line), the summary (the phone's sub-line: where, charge and range, charging or plugged or unplugged, or "No FordPass car found."), and the detail's read-only blocks as strings and numbers (battery, status with the tire panels and the chips, Ford's messages and the departure line, the last plug-in, the sessions' tiles, rows and chart options). The controls' view is `chargerControls(inputs, overlay, armed)` and `comfortControls(inputs, overlay, armed, draft)`.
- **The draft** (`schedule.ts`): `ScheduleDraft {days: Day[]; time: string; temp: 'low' | 'medium' | 'high' | 'off' | null}`; `draftFromSchedule(schedule)` seeds it from Ford's saved schedule (`08:00` when none); `describe(draft, on, fmt, t)` is `depDesc` (every day, weekdays, or the day abbreviations, "at 8:30 am" through `fmt.utc.time` on a fixed UTC day as `clockTime` does, no time when the field is cleared); `validate(draft)` returns the toast key when the temperature or the days are missing; `roundToFive(time)`. The draft is **element state** on `<hp-car-comfort>`, created when the detail opens and reset when the car's saved schedule changes; the pattern is named in the header: **edit locally, validate, send once** (a form draft; Fowler's _Unit of Work_ in miniature).
- `commands.ts`: `setAmps(wallbox, a)` (hold `K.amps`, `number.set_value`, done `car.ampsSet`), `togglePause(wallbox, on)` (hold, `switch.turn_on/off`, done `car.chargingOn/Off`), `toggleChargerLock(wallbox, lock)` (hold, `lock.lock/unlock`, done), `remoteStart(car, on)` (armed when starting; `switch.turn_on/off` on `ignition`, done `car.remoteStartSent/Stopped`), `toggleHeater(car, which, on)` (the three heaters), `honk(car)` (`button.press`, done), `lockCar`/`unlockCar` (unlock armed; `lock.lock/unlock`, done `car.lockSent/unlockSent`), `toggleDeparture(car, on)` (hold `K.dep`, `switch.turn_on/off`), `saveSchedule(car, draft)` (`fordpass.update_departure_schedule` with `{hour, minute, schedule_days, precondition_temperature}`, done `car.scheduleSaved` with the description). The two-tap rule is `ArmedController` (spec 20) with the "Tap again" labels from keys.

### The elements

- **`<hp-car-pane>`**: `active`; `StoreController({ids: s => carIds(s, ref)})` (every `fordpass_<prefix>_*` entity the provider reads, the Wallbox's six); `<hp-pane-header icon="car" color="var(--c-ev)">` with the car's name and `vm.summary`; `<hp-car-card>`; the detail inline on a tablet (`<hp-car-detail>` from pull request 2; the legacy panel through the sheet host before), as a sheet on a phone from the card's tap.
- **`<hp-car-card>`**: the `.top` line, the `.hero`, the `.socbar` and `.socscale`, the three tiles, the bars SVG from `barsGeometry` (the `.spark` rules come here), the daily line; the image fallback: an `@error` on the `img.carimg` sets `imageFailed` for the element's life and the drawing shows (`carSide(color)`).
- **`<hp-car-detail>`** and its blocks (pull request 2): the `.two` grids as today (`#car-bat` with `#car-status`, `#car-charger` with `#car-comfort`), then the sessions block (`h3`, the caption, the four tiles, `<hp-chart>`, the table with `repeat` by session start, the "Show all N sessions" toggle as element state), `#car-ford`, `#car-last`; the sub-line (where, locked, "the car last checked in at 4:05 pm"); every number through `fmt`.
- **`<hp-charger-controls>`** (pull request 3): the `h3` and status line, `<hp-seg>` for the amps steps (16 to 48 filtered by the Wallbox's min and max; disabled when unavailable), the read-only charge limit `<hp-seg disabled>`, the two `.tgl` rows with `<hp-switch>`.
- **`<hp-car-comfort>`** (pull request 3): the four `.cbtn` (remote start armed), the seat text, the `.access` row with lock status, honk and the armed lock button, the departure `.tgl` with `<hp-switch>`, the `.deprow` with the seven day buttons (`aria-pressed`, French initials `LMMJVSD`), the `input.dtime[type=time][step=300]`, the cabin `<hp-seg>`, the hint and the `button.more` "Save schedule".

### Styles

- `src/features/car/styles.css` receives `.carcard`, `.carhero`, `.carimg`, `.carside`, `.socbar`, `.socscale`, `.tpms`, `.tp`, `.clear`, `.cbtn`, `.access`, `.tgl`, `.deprow`, `.days`, `.dtime`, `.sess*` and the sessions table rules, `.hide-s`, `.wrapv`, `.spark` (`base.css` ~825 to 880, 1094 to 1140, `extra.css` 16 to 30, 1232; grep `tpms|cbtn|access|tgl|deprow|dtime|slist|smore`). `.abtn` is the kit's since spec 20. `.app.cp` → `:host([compact])`.

### Strings and formats

About one hundred and twenty `car.*` keys (the card and summary, the battery block, the status chips and tire states, the software and updates, the Ford messages block, the last plug-in, the sessions (`sessionsSince` with ICU plural, `estimatedCost`, the table's words, `showAll`/`showLatest`), the charger controls, the comfort and access words, the departure schedule (`everyDay`, `weekdays`, `noDays`, `at`, the toasts `pickTemperature`, `pickDay`, `scheduleSaved`), the armed labels, `noCar`, `historyFailed`), French from the map's entries (`src/i18n/fr.js` ~1000 to 1130), listed in `test/unit/fixtures/moved/car.json`. The departure time goes through `fmt.utc.time` on a fixed UTC day, as `clockTime` does, so `8 h 30` in French and `8:30 am` in English; `plugStamp` is `fmt.date` + `fmt.time`.

### Deletion and grep gates

Pull request 1 deletes `findCar`, `carName`, `carImg`, `carState`, `renderCarCard`, `bars`, `CARSVG`, `CARTOP`, the `'renderCarCard'` entry of `renderLive`, the `#open-car`/`#carcard` markup in `.cols` and the `LAYOUT` entry, the Car line of `renderCompactSubs`, `loadHistory`, `derive`, `noHistory`, `this.H`, `this.loadingGen`, `this.histErr`, the `#err` write in `renderHeader`, the `car` branch of `lacking()`; `this.car` stays as `findCar`'s result from the provider for the header and `upcoming` until pull request 3. Pull request 2 deletes `carSheet`, `renderSessions`, `renderCarSheetLive`, `plugStamp`, the `carimg` error listener, the `#smore` listener, `this.sesAll`, `this.imgFail`, the `#sh-car` blocks' markup. Pull request 3 deletes `renderCarControls`, `closedText`, `depState`, `depDesc`, `schedText`, `clockTime`, `sw`, `carControl`, the `panels['sh-car']` listeners, `this.depDraft`, `this.pending.amps/dep`, `this.armed`'s car keys, the `#sh-car` markup, the `sh-car` entry of `CHART_SHEETS` and `TAB_SHEET`; the header's pill and `upcoming` call `findCar`/`readCar`/`departureSchedule` from the provider; `pend`, `pending`, `call` stay for Lights with a comment naming spec 23.

Gates (after pull request 3): `grep -nE '^  (findCar|carName|carImg|carState|renderCarCard|bars|carSheet|renderSessions|renderCarSheetLive|plugStamp|clockTime|schedText|sw|renderCarControls|closedText|depState|depDesc|carControl|loadHistory|derive)\(|^const (CARSVG|CARTOP|noHistory)|sh-car|this\.H\b|histErr' src/home-panel.js` is empty; `grep -nE '\.(carcard|carhero|carimg|carside|socbar|socscale|tpms|tp|cbtn|access|tgl|deprow|days|dtime|spark|hide-s|wrapv)\b' src/css/*.css` is empty; `grep -c 'statistics(' src/home-panel.js` is 0; the French map lost the listed entries; the class shrinks by about 650 lines, quoted.

### Performance, by construction

- The pane subscribes to the car's thirty-odd entities and the Wallbox's six; a thermostat change gives zero mutations.
- The detail no longer redraws every second: the class's `renderCarSheetLive` ran on every tick while open; the element re-renders when one of its ids changes, which for a parked car is rarely.
- The sessions load once per fifteen minutes through the cache; the card and the detail share the controller.
- The schedule draft lives in the element, so typing in the time field re-renders one block, not the sheet.

## Acceptance Criteria

Pull request 1, the providers, the model, the pane and the card, the end of `loadHistory`:

1. `src/providers/fordpass.ts` and the Wallbox additions, `src/features/car/{README.md,index.ts,ids.ts,inputs.ts,model.ts,history.ts,loader.ts,bars-geometry.ts,car-art.ts,car-pane.ts,car-card.ts,styles.css}` exist with headers; `FEATURES` has `carFeature` with `available` from `findCar`.
2. Vitest: `findCar` (the prefix, none), `readCar` (the charging and plug rules, the range fallback, the name rule, `tirePsi` in psi, bar, kPa, Pa and the guessed units, a malformed message date, a plug-in without a plug-out), `sessions` (a gap under three hours joins, over splits, the 1 kWh floor, the end plus an hour), `dailyEv`, `barsGeometry`, `carModel` from the test house in `en` and `fr` and from the recorded fixture; 100 percent statements.
3. Playwright `car.spec.ts`: the tab shows the card with the house's charge, range and charger state; the bars draw after the statistics arrive; the two windows are requested when the card connects and not again within fifteen minutes; a light change gives zero mutations in `hp-car-pane`'s root; `grep -n 'loadHistory\|derive(' src/home-panel.js` is empty; axe clean.
4. Every baseline identical; the French equivalence test passes; `npm run check`, `npm test -- --coverage`, `npm run lint` green; changeset (patch): "The Car tab is redrawn with the same look and loads its history when you open it. Nothing visible changes."

Pull request 2, the detail:

5. `<hp-car-detail>` and its five read-only blocks exist; the detail is inline on a tablet and in `<hp-sheet>` on a phone; the sessions table shows ten rows and "Show all N sessions" shows them all; `car-departure.spec.ts`'s malformed-data case passes against the new blocks; the `car-*` baselines identical; axe clean; changeset (patch).

Pull request 3, the controls and the deletion:

6. `<hp-charger-controls>`, `<hp-car-comfort>`, `schedule.ts`, `commands.ts` exist; Vitest covers the draft (`describe` for every day, weekdays, a list, a cleared time; `validate`; `roundToFive`) and every command as data; Playwright: remote start once shows "Tap again to start" and sends nothing, twice sends `switch.turn_on`; `32 A` sends `number.set_value`; the charging switch sends `switch.turn_off` and flips at once; the departure case of `car-departure.spec.ts` passes (a cleared time, a day tapped, `08:30`); saving without a temperature toasts and sends nothing; saving with one sends `fordpass.update_departure_schedule` with the rounded time; the grep gates hold; the styles-split test passes; the French map lost the listed entries; every baseline identical; all suites green; changeset (patch).

## Testing Decisions

The seams are the two of ADR 0005. New in kind: a custom service call (`fordpass.update_departure_schedule`) asserted through `window.house.calls` like any other; the provider tests absorb what `car-departure.spec.ts` tested through the DOM (malformed Ford data), and the behaviour test keeps the one case that is about the sheet staying alive. Prior art: `media.spec.ts` for a failing command, `climate.spec.ts` for the armed buttons.

## Out of Scope

- A second car integration: `findCar` and `CarInputs` are the seam; the adapter is an adopter's pull request.
- Changing the session rule or the cost estimate.
- Moving `pend`, `pending`, `call`, `sw`: Lights is their last user; spec 23 deletes them.

## Notes

- **Why the sessions are the car's and not Energy's.** They are derived from the Wallbox's hourly rows, which only the car reads at that resolution; Energy's hourly flow uses the same sensor for seven days, a different window. ADR 0026's rule (a feature loads its own windows) puts the year of Wallbox hours here.
- **Why the detail stops redrawing every second.** `renderCarSheetLive` was on the tick because the class had no per-entity notification; the store has one. "the car last checked in at" reads a state, not the clock, so nothing in the block depends on now.
- **Why the draft is element state and not in the store.** It is one person's unsaved edit on one screen; the store holds the house's state. If a second screen needed the draft, it would move to a provider-like module, which is the test the pattern note gives.
- **Reading**: Fowler, _PoEAA_ (Unit of Work, for the draft); Nielsen Norman Group on confirmation taps; Home Assistant developer docs, _Lock_, _Number_, _Switch_, `image` entities and the image proxy; the FordPass integration's services (`update_departure_schedule`) and sensor attributes.
