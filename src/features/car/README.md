# Car

What the Car tab reads and computes ([spec 21](../../../docs/specs/21-car.md)): the FordPass car and the Wallbox charger, their charging sessions, the departure schedule's draft and the card's bars. This folder holds the pure half of the first move (#249): the providers' readings, the schedule's rules and the bars as geometry. The model, the history and the pane that draw them come in the moves after it (#250 to #253).

## The folder

```
src/providers/
  fordpass.ts              findCar(states): CarRef | null; readCar(states, config, names, ref): CarInputs; tirePsi(raw); departureSchedule(states, ref); carEntityIds(ref)
  wallbox.ts               (spec 19) gains amps, pause, lock and price on its inputs, chargingSessions(rows) and wallboxCommands.pause(target, on)
src/core/i18n/
  format.ts                gains clock(hours, minutes): a time of day with no date, no zone
src/features/car/
  README.md
  ids.ts                   carIds(store, ref): the car's entities and the Wallbox's six
  inputs.ts                readCarFeature(states, config, names): the reference, the car and the charger
  schedule.ts              ScheduleDraft, draftFromSchedule, toggleDay, roundToFive, validate, scheduleWords, describe
  bars-geometry.ts         barsGeometry(values, labels): the 30-day bars as numbers
```

## The car

The car is `sensor.fordpass_<name>_soc`, the first one found, and every other entity is `<domain>.fordpass_<name>_<key>`: a `CarRef` carries the prefix and builds the ids, so the provider names a key and never a house's entity. `readCar` types every attribute the legacy sheet read. The rules are the legacy panel's: the car is plugged in unless its plug sensor says `DISCONNECTED`, and charging when the charging sensor says `CHARGING` and not `NOT_CHARGING`; the range is the charge sensor's `batteryRange`, else the `elveh` sensor's state; the name is the config's, else the picture entity's own name without "Vehicle Picture", else `''`, which the model words "Car" (the provider has no catalog). Ford's data is not always well formed, so a message's date, a plug-in's times and the last check-in are `null` where they are not dates, and a plug-in with no plug-out still reads.

**Tire pressure.** Ford reports `3.02 bar`, `302 kPa` or `43.8 psi` by Home Assistant's unit system, and sometimes a bare number: `tirePsi` converts by the unit and guesses a bare number by size (over 1,000 is pascals, over 100 kilopascals, under 10 bars, else psi). It returns psi unrounded; the model rounds to a tenth.

**The schedule.** `departureSchedule` is the days Ford saved, in its order, with the first day's time of day; none saved is `null`.

## The charger and its sessions

`wallbox` gains what the controls read: the current limit with its range (6 to 48 amps where the charger gives none), the charging switch, the lock and the price, each switch with its entity id and whether Home Assistant has a value for it. `chargingSessions(rows)` is the legacy `derive`'s rule over the hourly rows (`mean` and `max` in kW): hours above 0.3 kW, joined across gaps up to three hours, each session ending an hour after its last hour, with the energy as the sum of the means and the peak from `max`; under 1 kWh is no session. It lives in the provider and not here because the live pill (spec 22) needs the current session from the same rows and a feature cannot import a feature. `wallboxCommands.pause(target, on)` is the same story for "Pause charging": a `Command` as data (`switch.turn_on` or `turn_off`, the toast, the key it holds), written in the provider in the shape the kit's runner takes, because a provider cannot import the kit; a test pins the shape and the key to the kit's.

## The departure draft

`ScheduleDraft` is what a person edits before anything is sent: the days, the time and the cabin setting. The pattern is **edit locally, validate, send once**: `draftFromSchedule` starts it from Ford's schedule (`08:00` and no days when there is none, and no cabin setting, which Ford does not report), `toggleDay` and a time field change it, `validate` names the toast that says what is missing (the cabin setting, then a day), and `roundToFive` makes the time Ford's five-minute steps before it is sent. `describe` is the switch's line in words and `scheduleWords` its days and time alone, both through the catalog and `fmt.clock`, so the time is `8:30 am` in English and `8 h 30` in French. The draft is plain data replaced by new values; the element that will hold it (#253) owns the one copy.

## The bars

`barsGeometry(values, labels)` is the legacy `bars()` as numbers: a 300 by 56 box, two pixels between the bars, the tallest 52 pixels high, a bar with something in it at least two pixels and an empty one a pixel, all to a tenth. A bar's title and the chart's label are words, the model's.

## The tests

Each rule is pinned with literal states and rows: the provider's under `test/unit/providers/`, this folder's under `test/unit/features/car/`. `ids.test.ts` records every id `readCarFeature` asks of the states and compares the list with `carIds`, so a subscription cannot drift from the reads. `car-departure.spec.ts`'s malformed-data case has its twin in `fordpass.test.ts`.
