# The smart stack

The cards that take turns in the Home card on a tablet and beside the idle clock ([spec 24](../../../docs/specs/24-home.md)): a door left open, lights that stopped answering, a weather warning, the car low at night, presence that froze, the hour before sunrise, the config's reminders, a critical peak or a Hilo challenge, a speaker playing, someone who came or left, today's events in the morning, Away mode, a room's poor air, tomorrow's weather in the evening, the car charging overnight, and two fillers (energy today, who's home). The stack is no tab, so the folder has no descriptor: the shell composes `<hp-smart-stack>` on the Home pane and the idle screen (#266, spec 26). This folder holds the pure half (#265); the elements come with #266, which deletes the legacy stack, `src/stack.js` and `test/unit/stack.test.mjs`.

## The folder

```
src/features/stack/
  README.md
  index.ts                 the feature's exports: stackCards, stackIds, readStack, StackHistory, stackModel
  ids.ts                   stackIds(store): every id the rules read, once each
  inputs.ts                readStack(states, registries, config, names, {now, fmt, location, forecast, history}): StackInputs
  cards.ts                 RULES: StackRule[] (seventeen links, the sixteen cards and the who's-home filler); stackCards(inputs, deps): StackCard[]
  rotation.ts              pickStack(cards, now), inHours, reminderLeft, STACK_TURN_MS: a typed copy of src/stack.js
  model.ts                 stackModel(cards, now, mode): the card for this tick, its place and how many take turns
  loader.ts                StackHistory: the Energy-today filler's three windows through the panel's statistics cache
```

## The inputs

`readStack` is the one place that knows which providers the stack reads: the door sensors (`doorMotionSensors`, doors only), the light tiles (`lightAreas`, each with its unavailable lights and whether one is on), the four alert feeds (`readAlerts`), the car (`readCar`), who's home (`presence`, whose `changed` is the person entity's last change) and the frozen iCloud trackers (`frozenPresence`), today's and tomorrow's sun (`sunTimes` at the house's place), Hydro-Québec and Hilo's challenge, the live flow (`powerNow`), the first speaker playing (`speakers`, with the television left out by the legacy `tv()` rule), today's events (`todaysEvents`, titled by their message or their calendar), the Away switch, the rooms' air (`milaRooms` and `rateRoom`), the forecast folded by day (`foldForecastDays`, the legacy `wxDays` fold) with tonight's condition, and the stack's history. Nothing in it reads the clock: `now` and the formatters are given.

## The rules

Each rule is a named `StackRule {key, run(inputs, deps): StackCard[]}`, in the legacy `stackCards()`'s order; a rule makes no card, one, or one per door, reminder or room. A card is a view model, never HTML: `tone` (red pins itself, amber goes first), `filler`, `icon`, `label`, `color`, `right`, `go` (a tab, a sheet, or a sensor's history), `body` (a list of parts: `big`, `mid`, `chips`, `ring`, `people`, `events`, `nowPlaying`, `bar`, `weather`) and `foot`. The thresholds are named constants copied from the legacy stack: a door open five minutes, lights gone five minutes, the car under forty percent from 21:00 to 6:00, an iCloud tracker silent three hours (the provider's), sixty minutes before sunrise, a person who came or left in thirty minutes, the agenda from 6:00 to 11:00, tomorrow from 17:00, the overnight charge from 21:00 to 7:00, the Energy filler from 8:00 to 21:00 and the who's-home filler from 7:00 to 22:00. Every word is a `stack.*` key, except the sources' brand names (Env. Canada, Hydro-Québec, Hilo) and the units (km, W, kW, kWh), which read the same in both languages (a few are other features' keys the catalog already has: `people.whosHome`, `air.metric.*`, `car.dayShort`, `weather.alerts.kindCount`), and the condition's name is `conditionName`, which moved to `src/core/i18n/` so Weather and the stack share it.

## The rotation and the model

`rotation.ts` is `src/stack.js` typed: every twenty seconds the next card of the pool, where the pool is the red cards when there are any, else the cards that are not fillers, else the fillers, amber first and then in the chain's order. `stackModel(cards, now, mode)` drops the who's-home filler in the Home card (the Who's home chips sit right above it) and picks.

## The history

`StackHistory` asks the three windows Energy's card asks (`powerWindows`' `hour7`, `today` and `meter33`), so the panel-wide cache answers it from theirs, and derives today's hourly flow and the meter's totals.
