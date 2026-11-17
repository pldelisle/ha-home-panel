# Car

What the Car tab reads and computes ([spec 21](../../../docs/specs/21-car.md)): the FordPass car and the Wallbox charger, their charging sessions, the departure schedule's draft and the history's bars. This folder holds the pure half of the first move (#249), the providers' readings, the schedule's rules and the bars as geometry, the model, the history and the loader of the second (#250), since the third (#251), the pane and the card that draw them, since the fourth (#252), the detail's read-only blocks, and, since the fifth (#253), the controls: the charger's card, the comfort and access card and the commands they send.

## The folder

```
src/providers/
  fordpass.ts              findCar(states): CarRef | null; readCar(states, config, names, ref): CarInputs; tirePsi(raw); departureSchedule(states, ref); carEntityIds(ref)
  wallbox.ts               (spec 19) gains amps, pause, lock and price on its inputs, chargingSessions(rows) and wallboxCommands.pause(target, on)
  power-history.ts         gains sessionsWindow(now, power): the Wallbox's hourly power for the sessions' year
src/core/i18n/
  format.ts                gains clock(hours, minutes): a time of day with no date, no zone
src/features/car/
  README.md
  glance.ts                glance(store): the Home pane's Car tile (the charge, the range, the plug, the locks), #267
  index.ts                 carFeature: the descriptor, `available` from `findCar`
  car-pane.ts              <hp-car-pane>: `active`, `detailOpen`, the store controller on `carIds`, `CarHistory`, the phone's header, the detail inline, and the sheet the Home tile and the pill open
  car-detail.ts            <hp-car-detail>: the summary and the actions, the charger, the departure and history rows, the status and Ford's messages; two columns on a tablet, one on a phone
  charger-controls.ts      <hp-charger-controls>: the current limit, the charge limit, the charging and lock switches
  car-actions.ts           <hp-car-actions>: Unlock or Lock, Start… or Stop engine, Pause or Resume charging, Honk & flash; the Unlock and Start questions as the kit's `<hp-dialog>` (ADR 0035)
  car-departure.ts         <hp-car-departure>: the departure row and its switch, and the editor sheet (Cancel, Save) with the draft
  car-history.ts           <hp-car-history>: the charging history row; a tap asks the host for `car.history`
  car-history-sheet.ts     <hp-car-history-sheet>: what that sheet holds, the 30 days' bars, the sessions and the last plug-in; the pane draws it in `<hp-sheet>`
  car-summary.ts, car-status.ts, car-ford.ts, car-last-plug.ts, car-sessions.ts   the read-only blocks, each over its model block
  car-tiles.ts, soc-bar.ts   the tiles and the battery bar, as template functions (soc-bar.css is the bar's)
  dialog.css               what the Car's dialogs hold beyond the kit's `<hp-dialog>` (ADR 0035): the departure editor's sheet and the grouped rows of the editor and of the Start question
  car-art.ts               carArt(art, failed, onError), carSide(color, label), carTop(label): the picture and the drawn car as `svg` templates
  styles.css               what the blocks and the two control cards share; each element's own rules are `<element>.element.css`; controls.css the two cards' labels and hints
  sheets.ts                DETAIL_SHEET, HISTORY_SHEET: `car.detail`, which Home's tile and the live pill ask for, and `car.history`, which the history row asks for
  ids.ts                   carIds(store, ref): the car's entities and the Wallbox's six
  inputs.ts                readCarFeature(states, config, names): the reference, the car and the charger
  schedule.ts              ScheduleDraft, draftFromSchedule, redraft, scheduleKey, toggleDay, roundToFive, withFiveMinutes, validate, scheduleWords
  commands.ts              setAmps, togglePause, toggleChargerLock, remoteStart, toggleHeater, honk, lockCar, unlockCar, toggleDeparture, saveSchedule: `Command` data
  controls.ts              carActions, chargerControls, departureControls: the actions row, the charger and the departure as strings and flags, from the inputs, the held values and the draft
  keys.ts                  K: the overlay keys of the held values (the current, the locks, the ignition, the heaters, the departure switch)
  bars-geometry.ts         barsGeometry(values, labels): the 30-day bars as numbers
  history.ts               carWindows(now, config), dailyEv, deriveCarHistory, monthlySessions, sessionsChartOptions
  loader.ts                CarHistory: the two windows through the statistics cache, kept fifteen minutes (a WindowedHistory of the kit)
  model.ts                 carModel(inputs, history, deps): the phone's line and the detail's read-only blocks
```

## The car

The car is `sensor.fordpass_<name>_soc`, the first one found, and every other entity is `<domain>.fordpass_<name>_<key>`: a `CarRef` carries the prefix and builds the ids, so the provider names a key and never a house's entity. `readCar` types every attribute the legacy sheet read. The rules are the legacy panel's: the car is plugged in unless its plug sensor says `DISCONNECTED`, and charging when the charging sensor says `CHARGING` and not `NOT_CHARGING`; the range is the charge sensor's `batteryRange`, else the `elveh` sensor's state; the name is the config's, else the picture entity's own name without "Vehicle Picture", else `''`, which the model words "Car" (the provider has no catalog). Ford's data is not always well formed, so a message's date, a plug-in's times and the last check-in are `null` where they are not dates, and a plug-in with no plug-out still reads.

**Tire pressure.** Ford reports `3.02 bar`, `302 kPa` or `43.8 psi` by Home Assistant's unit system, and sometimes a bare number: `tirePsi` converts by the unit and guesses a bare number by size (over 1,000 is pascals, over 100 kilopascals, under 10 bars, else psi). It returns psi unrounded; the model rounds to a tenth.

**The schedule.** `departureSchedule` is the days Ford saved, in its order, with the first day's time of day; none saved is `null`.

## The charger and its sessions

`wallbox` gains what the controls read: the current limit with its range (6 to 48 amps where the charger gives none), the charging switch, the lock and the price, each switch with its entity id and whether Home Assistant has a value for it. `chargingSessions(rows)` is the legacy `derive`'s rule over the hourly rows (`mean` and `max` in kW): hours above 0.3 kW, joined across gaps up to three hours, each session ending an hour after its last hour, with the energy as the sum of the means and the peak from `max`; under 1 kWh is no session. It lives in the provider and not here because the live pill (spec 22) needs the current session from the same rows and a feature cannot import a feature. `wallboxCommands.pause(target, on)` is the same story for "Pause charging": a `Command` as data (`switch.turn_on` or `turn_off`, the toast, the key it holds), typed by the core's `Command` and held under the core's `overlayKey`, which is what the kit's runner and elements use too, so a provider that cannot import the kit has no copy of either. A `Session` is `{start, end, kwh, peak}`.

## The departure draft

`ScheduleDraft` is what a person edits before anything is sent: the days, the time and the cabin setting. The pattern is **edit locally, validate, send once**: `draftFromSchedule` starts it from Ford's schedule (`08:00` and no days when there is none, and no cabin setting, which Ford does not report), `toggleDay` and a time field change it, `validate` names what is missing, which the editor says while Save waits (the cabin setting, then a day, then a time: a cleared field has no hour to send, where the legacy panel sent `NaN`), and `withFiveMinutes` makes the time Ford's five-minute steps before it is sent (`roundToFive` is the rule). `scheduleWords` is the days and time in words (the departure row, the save toast), both through the catalog and `fmt.clock`, so the time is `8:30 am` in English and `8 h 30` in French. The draft is plain data replaced by new values; `<hp-car-departure>` holds the one copy, begins it from Ford's schedule when the row is drawn, begins it again when the saved schedule changes (`scheduleKey` says so; `redraft` takes Ford's days and time and keeps the cabin setting the person picked, which Ford never reports) and drops it when the row leaves the document or the editor is cancelled. It is never in the store.

## The bars

`barsGeometry(values, labels)` is the legacy `bars()` as numbers: a 300 by 56 box, two pixels between the bars, the tallest 52 pixels high, a bar with something in it at least two pixels and an empty one a pixel, all to a tenth. A bar's title and the chart's label are words, the model's.

## The history

The Car asks two windows through the panel's cache (ADR 0028): the Wallbox's hourly `mean` and `max` for 366 days, which `chargingSessions` turns into the sessions, and the grid's and the charger's daily mean for 30 days, which `dailyEv` turns into the card's bars (the charger's mean kW times 24 hours, or the hours so far for today, on the days the grid has a mean for). `deriveCarHistory` makes both from the replies; `monthlySessions` groups the sessions by the month they began in, and `sessionsChartOptions` is the monthly bar chart as data, its colour handed in by the element (#252). `CarHistory` is the controller: it loads both windows together when its host is shown, not again for fifteen minutes, nothing while the host is hidden, drops a reply that is late (the host left, or the config changed) and says why a load failed at most once a minute. It is the kit's `WindowedHistory` given the Car's windows and what derives them, as `EnergyHistory` is given Energy's.

## The model

`carModel(inputs, history, deps)` is the whole view in strings and numbers: the phone's line (`Parked at home · 64.0% · 280 km · charging`) and the detail's blocks, each fact once (docs/apple-hig-audit-car-2026-11-17.md): the summary (the charge, the range, the bar with "Limit 90% · set in FordPass", and the facts: the plug and its power, the doors, windows, hood, lock, alarm and gear, what needs a look in the warning tone), the status (the battery's line, the four tires, and the details as value rows), the history row (`3 sessions · 39 kWh`, the year's cost, and the 30 days' bars its sheet draws), the sessions with their tiles, months, table rows and toggle, the last plug-in, and Ford's own messages (null when there are none). Every number goes through `fmt` and every word through the catalog; a row whose sensor the car does not have is left out. The sessions' cost is at the Wallbox's price, else 7 cents. Nothing in it reads the clock: "the car last checked in at 4:05 pm" is a state, and the sessions' "today" is the history's. What the elements hold, the table's "show all" and the failed image's drawing, is not the model's: `allSessions` comes in with the deps and the image fallback is the pane's. The controls' view is `controls.ts` (#253).

Two texts of Ford's own are worded by the catalog, the tire pressure warning's subject and body, because the legacy rewrite layer knew them; any other message is shown as Ford sent it. The charger's status goes through the same table Energy's flow uses (`chargerStatusKey`, in the Wallbox provider).

## The pane

`<hp-car-pane>` is the tab, since #251. The tab shows the detail inline on a phone as on a tablet (HIG, Sheets: "Avoid using a sheet to help people navigate your app's content"); on a phone it draws `<hp-pane-header>` (the car's name, then the model's summary line) over it, and keeps the detail's `<hp-sheet>` for Home's tile and the live pill, which open it over another tab. It reads the car and the charger in `willUpdate` through `readCarFeature`, runs `carModel` and keeps the view; its store controller listens to `carIds` while any part of it is on screen, and a hidden pane keeps what it drew. `CarHistory` asks its two windows when any part of the pane is first on screen and not again for fifteen minutes; the windows go through the shell's cache (`sessionsWindow`, one definition), so each is read once for the panel.

Ford's picture goes through Home Assistant's image proxy, and an `error` on it sends `car-image-failed` (src/features/car/events.ts), after which the pane hands `imageFailed` down and the drawn car (`carSide`, in the config's colour) shows for the pane's life and is never cleared, so a new address from Home Assistant is not tried. A history that did not load says why on the history row, and the live values still draw.

## The tests

Each rule is pinned with literal states and rows: the provider's under `test/unit/providers/`, this folder's under `test/unit/features/car/`. `ids.test.ts` records every id `readCarFeature` asks of the states and compares the list with `carIds`, so a subscription cannot drift from the reads. The departure spec's malformed-data case, now in `car.spec.ts`, has its twin in `fordpass.test.ts`; `commands.test.ts` pins every command as a literal and `controls.test.ts` the two cards' words, flags and held values in both languages. The model is tested from the test house in both languages, from literal houses for each shape of car (plugged in, unplugged, every sensor, none) and from the recorded house when there is one; the loader with a fake cache, store and host and a fake clock; the history with literal rows; and `test/unit/fixtures/moved/car.json` pins the French of every message to what the rewrite layer made of the English.

## The detail

`<hp-car-detail>` (#252, reworked 2026-11) is the pane's `car.detail`, inline on a phone and a tablet, and in `<hp-sheet>` when Home's tile or the live pill opens it on a phone. It places the model's `detail` in the order people use it: on a tablet, the summary, the actions row and the status in one column, and the charger, the departure and history rows and Ford's messages in the other; on a phone, one column, the summary, the actions, the charger, the rows, the status and Ford's messages. Each block is an element over its model block or, for the controls, over the pane's inputs, and draws its own `.inner` card (`<hp-car-summary>` with the photo or drawing, the bar and the facts, `<hp-car-status>` with the four tire panels around the car from above and the value rows, `<hp-car-ford>` with the kit's `.arow` rows, and in the history's sheet `<hp-car-last-plug>` and `<hp-car-sessions>` with the sentence, four tiles, the monthly bars through `<hp-chart>` and the table keyed by the session's start). The sheets draw their charts only while they are open. The pane re-runs the model when one of `carIds` changes and each block re-renders from its new view, so a parked car's detail draws nothing between changes.

The sessions table shows the latest ten, and the button asks for all of them with a `sessions-toggle` event: the pane holds which, because the model words the rows and the button, and passes it in as `allSessions`. The photo's failure is the pane's: the pane keeps `imageFailed` (the legacy `imgFail`, per session) and hands it down through the detail, so a photo that did not load is asked for once and not again when the detail or the tab is opened again.

## The controls

`<hp-car-actions>`, `<hp-charger-controls>` and `<hp-car-departure>` take the pane's `inputs` and call their pure views in `willUpdate` (`carActions`, `chargerControls`, `departureControls`) with the catalog, the formatters and the panel's held values, since each holds what a model must not: the actions their two questions, the departure its draft. A tap holds the value it asks for in the panel's overlay (`K`, and `pauseHold` for the charger's pause, which the live pill holds too) and runs a `Command` from `commands.ts` through `CommandRunner`: a failure releases the hold and says why in a toast that stays.

The actions row shows only what the house can do: Unlock (or Lock), Start… (or Stop engine) when the car has a remote start, Pause (or Resume) charging while the Wallbox answers, and Honk & flash when the car has the button, each with how things stand under its name. Unlocking and starting ask first in the kit's `<hp-dialog>` (HIG, Alerts): nothing is sent until the question's Unlock or Start; locking and stopping do not ask. The Start question holds the heaters the car runs with a remote start as switches under "Runs with every start", each saved to the car at once (HIG, Toggles: a switch shows a state in effect), which the footnote says, so Cancel is not their undo; then the seats' setting. The charger is the current limit (16 to 48 amps filtered by the Wallbox's own range, with the kilowatts at 240 V) and its lock while it answers, and one line saying since when it has not answered (the status sensor's last change, as a date and a time) while it does not; the charge limit is the summary's bar.

The departure row says what Ford saved and has the departure switch; tapping it opens the editor, a native dialog drawn as a sheet with Cancel and Save (ADR 0035: it holds a draft, so a stray tap on the backdrop does not close it, and Escape closes it alone): the time, the cabin as a menu that starts on "Choose", and the seven days as a checkmark list. Save waits until `validate` allows it and says why; it then sends one `fordpass.update_departure_schedule` with the days, the time in five-minute steps and the setting, and the toast says it. Cancel starts the draft again from Ford's schedule, keeping the cabin choice, which Ford does not report.

The charging history row asks the sheet host for `car.history` (ADR 0021): the pane draws `<hp-car-history-sheet>` in the kit's `<hp-sheet>` while that sheet is open, on a tablet and a phone alike, so it has the kit's grabber, Close, Escape and focus return, as Weather's histories do. On a phone, opening it from the detail sheet over Home closes that sheet first: the host's one-sheet rule.
