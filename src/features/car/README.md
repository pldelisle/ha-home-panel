# Car

What the Car tab reads and computes ([spec 21](../../../docs/specs/21-car.md)): the FordPass car and the Wallbox charger, their charging sessions, the departure schedule's draft and the card's bars. This folder holds the pure half of the first move (#249), the providers' readings, the schedule's rules and the bars as geometry, the model, the history and the loader of the second (#250), since the third (#251), the pane and the card that draw them, since the fourth (#252), the detail's read-only blocks, and, since the fifth (#253), the controls: the charger's card, the comfort and access card and the commands they send.

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
  car-pane.ts              <hp-car-pane>: `active`, `detailOpen`, the store controller on `carIds`, `CarHistory`, the header, the card, the detail inline or in its sheet
  car-card.ts              <hp-car-card>: the card over the model's `card`, the bars, the photo's fallback
  car-detail.ts            <hp-car-detail>: the blocks in the legacy panel's order, the charger's and comfort's cards in the row after the status
  charger-controls.ts      <hp-charger-controls>: the current limit, the charge limit, the charging and lock switches
  car-comfort.ts           <hp-car-comfort>: remote start and the heaters, the lock and the horn, the departure schedule and its draft
  car-battery.ts, car-status.ts, car-ford.ts, car-last-plug.ts, car-sessions.ts   the five read-only blocks, each over its model block
  car-tiles.ts, soc-bar.ts   the tiles and the battery bar, as template functions the blocks and the card share (soc-bar.css is the bar's)
  car-art.ts               carArt(art, failed, onError), carSide(color, label), carTop(label): the picture and the drawn car as `svg` templates
  styles.css               what the blocks and the two control cards share; each element's own rules are `<element>.element.css`; controls.css the two cards' labels and hints
  sheets.ts                DETAIL_SHEET: `car.detail`, the id the card, Home's tile and the live pill ask for
  ids.ts                   carIds(store, ref): the car's entities and the Wallbox's six
  inputs.ts                readCarFeature(states, config, names): the reference, the car and the charger
  schedule.ts              ScheduleDraft, draftFromSchedule, redraft, scheduleKey, toggleDay, roundToFive, withFiveMinutes, validate, scheduleWords, describe
  commands.ts              setAmps, togglePause, toggleChargerLock, remoteStart, toggleHeater, honk, lockCar, unlockCar, toggleDeparture, saveSchedule: `Command` data
  controls.ts              chargerControls, comfortControls: the two cards as strings and flags, from the inputs, the held values, the armed buttons and the draft
  keys.ts                  K: the overlay keys of the held values (the current, the locks, the ignition, the heaters, the departure switch)
  bars-geometry.ts         barsGeometry(values, labels): the 30-day bars as numbers
  history.ts               carWindows(now, config), dailyEv, deriveCarHistory, monthlySessions, sessionsChartOptions
  loader.ts                CarHistory: the two windows through the statistics cache, kept fifteen minutes (a WindowedHistory of the kit)
  model.ts                 carModel(inputs, history, deps): the summary, the card and the detail's read-only blocks
```

## The car

The car is `sensor.fordpass_<name>_soc`, the first one found, and every other entity is `<domain>.fordpass_<name>_<key>`: a `CarRef` carries the prefix and builds the ids, so the provider names a key and never a house's entity. `readCar` types every attribute the legacy sheet read. The rules are the legacy panel's: the car is plugged in unless its plug sensor says `DISCONNECTED`, and charging when the charging sensor says `CHARGING` and not `NOT_CHARGING`; the range is the charge sensor's `batteryRange`, else the `elveh` sensor's state; the name is the config's, else the picture entity's own name without "Vehicle Picture", else `''`, which the model words "Car" (the provider has no catalog). Ford's data is not always well formed, so a message's date, a plug-in's times and the last check-in are `null` where they are not dates, and a plug-in with no plug-out still reads.

**Tire pressure.** Ford reports `3.02 bar`, `302 kPa` or `43.8 psi` by Home Assistant's unit system, and sometimes a bare number: `tirePsi` converts by the unit and guesses a bare number by size (over 1,000 is pascals, over 100 kilopascals, under 10 bars, else psi). It returns psi unrounded; the model rounds to a tenth.

**The schedule.** `departureSchedule` is the days Ford saved, in its order, with the first day's time of day; none saved is `null`.

## The charger and its sessions

`wallbox` gains what the controls read: the current limit with its range (6 to 48 amps where the charger gives none), the charging switch, the lock and the price, each switch with its entity id and whether Home Assistant has a value for it. `chargingSessions(rows)` is the legacy `derive`'s rule over the hourly rows (`mean` and `max` in kW): hours above 0.3 kW, joined across gaps up to three hours, each session ending an hour after its last hour, with the energy as the sum of the means and the peak from `max`; under 1 kWh is no session. It lives in the provider and not here because the live pill (spec 22) needs the current session from the same rows and a feature cannot import a feature. `wallboxCommands.pause(target, on)` is the same story for "Pause charging": a `Command` as data (`switch.turn_on` or `turn_off`, the toast, the key it holds), typed by the core's `Command` and held under the core's `overlayKey`, which is what the kit's runner and elements use too, so a provider that cannot import the kit has no copy of either. A `Session` is `{start, end, kwh, peak}`.

## The departure draft

`ScheduleDraft` is what a person edits before anything is sent: the days, the time and the cabin setting. The pattern is **edit locally, validate, send once**: `draftFromSchedule` starts it from Ford's schedule (`08:00` and no days when there is none, and no cabin setting, which Ford does not report), `toggleDay` and a time field change it, `validate` names the toast that says what is missing (the cabin setting, then a day, then a time: a cleared field has no hour to send, where the legacy panel sent `NaN`), and `withFiveMinutes` makes the time Ford's five-minute steps before it is sent (`roundToFive` is the rule). `describe` is the switch's line in words and `scheduleWords` its days and time alone, both through the catalog and `fmt.clock`, so the time is `8:30 am` in English and `8 h 30` in French. The draft is plain data replaced by new values; `<hp-car-comfort>` holds the one copy, begins it from Ford's schedule when the card is drawn, begins it again when the saved schedule changes (`scheduleKey` says so; `redraft` takes Ford's days and time and keeps the cabin setting the person picked, which Ford never reports) and drops it when the card leaves the document. It is never in the store.

## The bars

`barsGeometry(values, labels)` is the legacy `bars()` as numbers: a 300 by 56 box, two pixels between the bars, the tallest 52 pixels high, a bar with something in it at least two pixels and an empty one a pixel, all to a tenth. A bar's title and the chart's label are words, the model's.

## The history

The Car asks two windows through the panel's cache (ADR 0028): the Wallbox's hourly `mean` and `max` for 366 days, which `chargingSessions` turns into the sessions, and the grid's and the charger's daily mean for 30 days, which `dailyEv` turns into the card's bars (the charger's mean kW times 24 hours, or the hours so far for today, on the days the grid has a mean for). `deriveCarHistory` makes both from the replies; `monthlySessions` groups the sessions by the month they began in, and `sessionsChartOptions` is the monthly bar chart as data, its colour handed in by the element (#252). `CarHistory` is the controller: it loads both windows together when its host is shown, not again for fifteen minutes, nothing while the host is hidden, drops a reply that is late (the host left, or the config changed) and says why a load failed at most once a minute. It is the kit's `WindowedHistory` given the Car's windows and what derives them, as `EnergyHistory` is given Energy's.

## The model

`carModel(inputs, history, deps)` is the whole view in strings and numbers: the phone's line (`Parked at home · 64.0% · 280 km · charging`), the card (name, where, the charge and `280 km range · locked · charging`, the battery bar with its limit, the charger, the last charge and the odometer, the daily bars and their sentence once the history is in), and the detail's blocks (battery, status with the four tires and the chips, Ford's messages and the departure times, the last plug-in, the sessions with their tiles, months, table rows and toggle). Every number goes through `fmt` and every word through the catalog; a tile whose sensor the car does not have is left out. The sessions' cost is at the Wallbox's price, else 7 cents. Nothing in it reads the clock: "the car last checked in at 4:05 pm" is a state, and the sessions' "today" is the history's. What the element holds, the table's "show all" and the failed image's drawing, is not the model's: `allSessions` comes in with the deps and the image fallback is the card's. The controls' view is `controls.ts` (#253).

Two texts of Ford's own are worded by the catalog, the tire pressure warning's subject and body, because the legacy rewrite layer knew them; any other message is shown as Ford sent it. The charger's status goes through the same table Energy's flow uses (`chargerStatusKey`, in the Wallbox provider).

## The pane and the card

`<hp-car-pane>` is the tab, since #251. On a phone it draws `<hp-pane-header>` (the car's name, then the model's summary line), `<hp-car-card>` and the detail's `<hp-sheet>`; on a tablet the tab is the detail, inline. It reads the car and the charger in `willUpdate` through `readCarFeature`, runs `carModel` and keeps the view; its store controller listens to `carIds` while it is the tab and not otherwise, and a hidden pane keeps what it drew. `CarHistory` asks its two windows when any part of the pane is first on screen (the tab, or the sheet Home's tile or the live pill opened) and not again for fifteen minutes; the windows go through the shell's cache (`sessionsWindow`, one definition), so each is read once for the panel.

`<hp-car-card>` places the model's card: the title line, the charge and its line beside the photo, the battery bar with the limit's mark, three tiles and the 30 days' bars from `barsGeometry`. Its box is a button that asks the shell for the detail's sheet, `car.detail`. It keeps no state; the photo's failure is the pane's (see below): Ford's picture goes through Home Assistant's image proxy, and an `error` on it sends `car-image-failed` (src/features/car/events.ts), after which the pane hands `imageFailed` back and the drawn car (`carSide`, in the config's colour) shows for the pane's life and is never cleared, so a new address from Home Assistant is not tried. The bars take their colours from the frame's tokens, so a light change or a theme change gives the pane no mutation. A history that did not load is its line under the card, "History didn't load: ...", where the legacy panel wrote it at the top of every tab.

## The tests

Each rule is pinned with literal states and rows: the provider's under `test/unit/providers/`, this folder's under `test/unit/features/car/`. `ids.test.ts` records every id `readCarFeature` asks of the states and compares the list with `carIds`, so a subscription cannot drift from the reads. The departure spec's malformed-data case, now in `car.spec.ts`, has its twin in `fordpass.test.ts`; `commands.test.ts` pins every command as a literal and `controls.test.ts` the two cards' words, flags and held values in both languages. The model is tested from the test house in both languages, from literal houses for each shape of car (plugged in, unplugged, every sensor, none) and from the recorded house when there is one; the loader with a fake cache, store and host and a fake clock; the history with literal rows; and `test/unit/fixtures/moved/car.json` pins the French of every message to what the rewrite layer made of the English.

## The detail

`<hp-car-detail>` (#252) is the pane's `car.detail`: inline in the pane on a tablet, with a header of its own, and in `<hp-sheet>` on a phone, which draws the header and holds the detail only while it is open, so a closed sheet has no chart and asks for nothing. It places the model's `detail` in the legacy panel's order: the battery with the status, the charger's and comfort's cards (`<hp-charger-controls>` and `<hp-car-comfort>`, which take the pane's inputs and not a view), the charging history, then Ford's messages with the last plug-in. Each block is an element over its model block and draws its own `.inner` card (`<hp-car-battery>` with the photo or drawing and the bar, `<hp-car-status>` with the four tire panels around the car from above and the chips, `<hp-car-ford>` with the kit's `.arow` rows, `<hp-car-last-plug>`, `<hp-car-sessions>` with the sentence, four tiles, the monthly bars through `<hp-chart>` and the table keyed by the session's start). The pane re-runs the model when one of `carIds` changes and each block re-renders from its new view, so a parked car's detail draws nothing between changes; the legacy panel's one-second redraw of the sheet is gone.

The sessions table shows the latest ten, and the button asks for all of them with a `sessions-toggle` event: the pane holds which, because the model words the rows and the button, and passes it in as `allSessions`. The photo's failure is the pane's, for the card and the battery block alike: the pane keeps `imageFailed` (the legacy `imgFail`, per session) and hands it down through the detail, so a photo that did not load is asked for once and not again when the detail or the tab is opened again.

## The controls

`<hp-charger-controls>` and `<hp-car-comfort>` (#253) are the detail's row after the battery and the status, each an `.inner` card. Each takes the pane's `inputs` and calls its pure view in `willUpdate` (`chargerControls`, `comfortControls`) with the catalog, the formatters and the panel's held values, since each holds what a model must not: the comfort card the buttons waiting for a second tap (`ArmedController`, four seconds, cleared when the card leaves) and the departure draft. A tap holds the value it asks for in the panel's overlay (`K`, and `pauseHold` for the charging switch, which the live pill holds too) and runs a `Command` from `commands.ts` through `CommandRunner`: a failure releases the hold and says why in a toast that stays. Remote start and unlock need a second tap and arming one lapses the other, as the legacy `armed` did; stopping a running car and locking do not. The current limit's steps are 16 to 48 amps filtered by the Wallbox's own range, with the kilowatts at 240 V; the charge limit is a disabled `<hp-seg>`; the switch rows are the kit's `<hp-switch-row>`; the French day initials are the catalog's (`LMMJVSD`).

Saving validates first: with no cabin setting, no day or no time it says which in a toast and sends nothing; otherwise one `fordpass.update_departure_schedule` carries the days, the time in five-minute steps and the setting, the field shows the time that was sent, and the toast says it. The legacy `renderCarControls`, `carControl`, `depState`, `depDesc`, `closedText` and `#car-controls` bridge are gone with their `car-detail-shown` event.
