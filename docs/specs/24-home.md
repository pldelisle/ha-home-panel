# Spec 24: Home, the ninth move: the shell's first composition, the header completed, who's home and the smart stack as features

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 3.
Depends on: every move before it ([15](15-weather.md) to [23](23-lights.md)): the Home pane composes each feature's Home card and reads each provider; [22 Live](22-live.md) (the header's pill and chips are already elements); [25 Automations](25-automations.md) pull request 1 (`upcomingRuns` in the providers; the Automations pane itself may move after). Blocks: 26 Idle clock (the stack), the phase gate.
Ships as: three pull requests, each a patch release, each pixel-identical. No new ADR: ADR 0017 (compose at the root) and ADR 0022 (the bridge, which this spec retires) apply; the notes record the bridge's end.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

Home is the pane a wall tablet shows when it wakes, and the one place in the class that reads every feature: `renderHome` (~5964, 190 lines) draws the Home weather card `#hwx` (the next sun event, the big temperature with the condition and the high and low, the house picture, Who's home, and on a tablet the smart stack slot), the six at-a-glance tiles (`#htiles`: Lights, Climate, Car, Energy, Air, Water heater, each with a value and a line from its feature's reading, opening its tab or, on a phone, its sheet), the config-error card (`renderConfigCard`, spec 13, already catalog-driven), and the compact Security card `#hsec` (spec 17's `<hp-security-card>` through the bridge). Around it:

- **The header** (`renderHeader`, ~2587): the greeting by the hour with the user's first name, the date line with the inside and outside temperatures on a phone, Who's home as chips, the clock with the "Live · history" line, the weather chip, and since spec 22 the elements for the pill and the peak chip. Spec 14 made the header's frame the shell's and left `#hello`, `#clock` and the weather chip as guest containers.
- **Who's home** (`presence`, ~5028: a `person.*` whose first name matches a configured name wins; else the household's phones and watches by owner's name with the home state and the "since" time; `whoHtml`), read by the header, the Home card and the stack.
- **The smart stack** (`stackCards`, ~1429, 370 lines; `src/stack.js`'s `pickStack`, `inHours`, `reminderLeft`; `scard`, `sring`; `renderHomeStack`, `stackGo`): about sixteen card rules over every provider (a door open five minutes, lights unreachable, a weather warning, the car low and unplugged at night, presence frozen, the hour before sunrise, the config's reminders, a critical peak or a challenge, a speaker playing, someone came or left, today's calendar events in the morning, Away mode, a room's poor air, tomorrow's weather in the evening, the car charging overnight, the energy-today and who's-home fillers), with a tone (red pins itself, amber first), a filler flag, a `go` target, and HTML bodies; `pickStack` rotates them every twenty seconds; the Home card hosts the stack on a tablet, the idle screen beside the clock.
- **Upcoming** (`upcoming`, ~6152): the sun's next events with their effects, Hilo's challenge, Hydro-Québec's peak, the car's departure, the modes that are on; drawn in the Home card? No: it feeds the Home pane's "Coming up" list on a phone (`renderHome`'s tail) and the Automations' timeline reads `upcomingRuns` (spec 25).
- **Layout**: the tabs view's Home pane is a fixed grid (`.hwx`, `.hright` with `.htiles` and `.hsec`, `.hscenes`); the old column packing (`layout`, `LAYOUT`, `plan`) is dead with the cards view (spec 20 noted the same for the climate card).
- The Home cards placed by the bridge since specs 16 to 18 (`<hp-tv-card>`, `<hp-scene-tiles>`, `<hp-security-card>`, `<hp-air-card>`'s Home use, `<hp-energy-card>`'s): ADR 0022's two to five exceptions, to be retired here.

The `home-*` (eight), `bare-home-*`, `idle-stack-*` baselines and `smart-stack.spec.ts` (checks 16 to 21) are the proof; the stack's rules have none, and `stack.test.mjs` covers only the rotation.

## Solution

In three pull requests:

1. **The two features.** `src/features/people/` (the household's presence as a provider-backed feature: `presence` becomes `src/providers/people.ts`, read by the header, the Home card and the stack; `<hp-who-chips>` and `<hp-who-card>`), and `src/features/stack/` (`cards.ts`: each stack rule as a named pure function returning a `StackCard` view model, over the providers; `rotation.ts` from `src/stack.js`; `<hp-smart-stack>` and `<hp-stack-card>`). The guest's `stackCards`, `renderHomeStack`, `scard`, `sring` go; `src/stack.js` leaves the legacy set.
2. **The Home pane as the shell's composition.** `src/shell/home-pane.ts` composes `<hp-home-pane>`: the weather card from `features/weather/weather-card.ts` (written here, from `#hwx`'s weather part), `<hp-who-card>`, `<hp-smart-stack mode="home">`, the six `<hp-glance-tile>`s from each feature's exported `homeTile` reader (`features/*/index.ts` exports `glance(store, deps): GlanceView`), `<hp-config-card>` (spec 13's card as an element), `<hp-security-card>`, `<hp-scene-tiles>`, on a phone the "Coming up" list from `upcoming.ts` in the shell; `legacyFeature('home')` becomes `homeFeature` from the shell; the bridge's cards become children of this composition, and ADR 0022's exceptions and `renderHome` go.
3. **The header completed, and the deletion.** `src/shell/header.ts`: `<hp-greeting>` (the greeting, the name, the date line with the phone's temperatures), `<hp-who-chips>`, `<hp-clock-line>` (the clock with its small line, now "Live" alone since the history line left with spec 21), `<hp-weather-chip>` from `features/weather`, the peak chip and the pill (spec 22); the guest's `renderHeader`, the header containers, `upcoming`, `layout`, `LAYOUT`, `enterTabs`/`leaveTabs`'s remaining moves, `placePanels`'s last Home-card moves, `#chips[data-live]` rule, the French entries go; the `.cols` markup is deleted.

Each pull request leaves every baseline identical.

## User Stories

1. As a household member, I want the Home pane, the header, Who's home and the smart stack to look and behave exactly as before, so that the move is invisible.
2. As a household member, I want the stack's cards to keep their rules (a red card pins itself, amber first, fillers only when nothing else applies) and their taps to open what they are about, as today (checks 16 to 21).
3. As a French-speaking user, I want the greeting, the date, Who's home and every stack card in French from the first paint, so that the catalog is as good as the rewrite layer was.
4. As an adopter, I want a tile to vanish when its feature is absent (no car, no purifier, no water heater), as today, so that the panel fits my house.
5. As a maintainer, I want each stack rule as a named pure function tested at a known instant, so that the sixteen rules are sixteen tests and a seventeenth is one function.
6. As a maintainer, I want the Home pane to be a composition in the shell that imports each feature's card and reader, so that ADR 0017's rule is visible in one file.
7. As a maintainer, I want the bridge retired (no guest-placed element remains), so that ADR 0022's exceptions are closed as it promised.
8. As a maintainer, I want the header to be elements the shell places, so that spec 14's "the header is the shell's" is complete.
9. As a maintainer, I want `smart-stack.spec.ts` to pass unchanged and `stack.test.mjs` to grow into the cards' tests, so that the stack is proven by what exists.
10. As a learner, I want the Home composition explained (what the shell owns, what a feature exports for Home, how a reader is shared), so that it is the worked example of composition at the root.

## Implementation Decisions

### The folder

```
src/providers/
  people.ts                presence(states, registries, config.people, names): Person[] (person entities first, else phones and watches by owner)
  calendar.ts              todaysEvents(states, registries, now, fmt): CalendarEvent[] (the stack's agenda card)
src/features/people/
  README.md, index.ts, ids.ts, model.ts (peopleModel: chips and card views), who-chips.ts <hp-who-chips>, who-card.ts <hp-who-card>, styles.css (.who, .wp, .hwho)
src/features/stack/
  README.md
  index.ts                 exports <hp-smart-stack>
  ids.ts                   stackIds(store): the union of every rule's ids
  inputs.ts                readStack(states, registries, config, names, history): StackInputs (every provider the rules read)
  cards.ts                 RULES: StackRule[]; stackCards(inputs, deps): StackCard[] (sixteen named rules)
  rotation.ts              pickStack(cards, now), inHours, reminderLeft, STACK_TURN_MS (from src/stack.js)
  loader.ts                StackHistory: the energy-today filler's windows through the statistics cache (today's hourly flow and the meter's today)
  model.ts                 stackModel(cards, now, mode): {pick, n, i} | null
  smart-stack.ts           <hp-smart-stack mode="home" | "idle">
  stack-card.ts            <hp-stack-card>
  styles.css               .sc, .sh, .si, .sbig, .smid, .sfoot, .schips, .srow, .skv, .spl, .sp, .sav, .sev, .snp, .sart, .sbar, .swx, .scw, .speek, .sdots
src/features/weather/
  weather-card.ts          <hp-weather-card> (Home's weather part: next sun, big temperature, condition, high and low, the house picture)
  weather-chip.ts          <hp-weather-chip> (the header's chip)
src/features/*/index.ts    each exports glance(store, deps): GlanceView | null (lights, climate, car, energy (two: energy and water heater), air)
src/shell/
  home-pane.ts             <hp-home-pane>: the composition
  glance-tile.ts           <hp-glance-tile>
  config-card.ts           <hp-config-card> (spec 13's card as an element, from renderConfigCard)
  upcoming.ts              upcoming(inputs, deps): UpcomingRow[] (sun, Hilo, Hydro-Québec, the car, the modes; the phone's "Coming up")
  header.ts                <hp-header>: greeting, who, clock line, chips, pill, popup
  greeting.ts              <hp-greeting>; clock-line.ts <hp-clock-line>
test/unit/providers/{people,calendar}.test.ts; features/people/model.test.ts; features/stack/{cards,rotation,model}.test.ts (rotation.test from stack.test.mjs); shell/{upcoming,home-pane-model}.test.ts
test/e2e/smart-stack.spec.ts (unchanged), home.spec.ts (new: the tiles, the header, Who's home)
```

### Presence, the stack and the Home readers

- `src/providers/people.ts`: `presence(states, registries, people, names): Person[]` is `presence()`: a `person.*` whose `friendly_name`'s first word folds to a configured name wins (`home`, `since`); else the `device_tracker.*` whose name matches "Owner's iPhone" or "iPhone de Owner" for an owner in the list, iPhones and watches only; the list in the config's order. `frozenPresence(states, registries, now)` is the stack's "presence not updating" rule's reading (iCloud trackers stale three hours).
- `src/providers/calendar.ts`: `todaysEvents(states, registries, now, fmt)`: the visible `calendar.*` entities with a `start_time` today and an end after now, sorted; a reading the stack's agenda card needs and nothing else today.
- **The stack's rules** (`cards.ts`): `StackRule {key, run(inputs, deps): StackCard | null}`; `StackCard {key, tone: 'red' | 'amber' | null, filler: boolean, icon, label, color, right, go: Go | null, body: BodyView, foot}` where `BodyView` is a union of the body shapes the class draws (`big` with a unit, `mid`, `chips`, `ring` with values (`<hp-ring>`), `people`, `events`, `nowPlaying`, `bar`, `weather`) so the card element places them without HTML; `Go` is `{tab} | {sheet, detail?} | {sensorHistory: id}` (the `stackGo` cases: a tab, a sheet request, a sensor's history). The sixteen rules copied with their thresholds (five minutes, forty percent, 21 to 6, three hours, the hour before sunrise, the morning and evening windows, the thirty minutes, 0.3 of heating? no, that is Energy; the air levels through `rateRoom`). Each reads providers only: `doorMotionSensors`, `lightAreas`, the weather provider's alerts and forecast days, `readCar`, `presence`, `sunTimes`, the config's reminders, `hydroQuebec`, `hiloChallenge`, `powerNow`, the speakers' reading (`features/media/speakers.ts` moves to `src/providers/media-players.ts` so the stack may read it), `todaysEvents`, the `away` entity, `milaRooms` and `rateRoom`, `weatherEntity` forecast fold (the fold moves with the inputs: the stack calls the Weather provider's `foldForecast`), the energy-today filler over the stack's own two windows (`StackHistory`), the who's-home filler.
- `rotation.ts` is `src/stack.js` moved as is (its tests move to `rotation.test.ts`); `stackModel(cards, now, mode)` applies the Home mode's filter (no who's-home filler in the Home card, as `renderHomeStack` does) and `pickStack`.
- **The Home readers**: each feature's `index.ts` exports `glance(store, deps): GlanceView | null` (`{key, icon, color, label, value, line, charging?, go}`): Lights ("3 on" and the rooms' percentages), Climate (the average and "2 rooms heating · heat pump off"), Car (the charge and the line), Energy (the grid power and "· 12.3 kWh today · low rate"; the water heater tile with its 24-hour kWh from the energy history, which the Energy card's controller has: the glance takes the loaded slices as an argument), Air (the level and the why). A reader is a pure function of the store's state and the feature's history data; the shell calls them (a shell importing a feature is the dependency rule's intended direction).

### The composition

- **`<hp-home-pane>`** (`src/shell/home-pane.ts`): `active`; renders the `.cfgerrh` host with `<hp-config-card>` (shown while the store has problems and the user is an admin), the `.hwx` card with `<hp-weather-card>`, `<hp-who-card>` (the `.hwho` label and chips, or the "No one is tracked yet." hint), and on a tablet `<hp-smart-stack mode="home">` in the `.hstk` slot; the `.hright` with the `.htiles` of `<hp-glance-tile>` (`repeat` by key; a tile dispatches `tab-select` or, on a phone, the sheet request its `go` names) and `<hp-security-card>`; `<hp-scene-tiles>` in `.hscenes`; on a phone the `.hwx` card is tappable and opens the weather detail, and the "Coming up" list follows. The pane holds no logic: its header says so (the composition root's child, a humble composition).
- The glance tiles' availability: a feature whose `glance` returns `null` has no tile (the car without a car, the water heater without its sensors, Air without purifiers: `gateTabs`'s tile hiding, now by construction).
- **`<hp-header>`** (pull request 3): the shell's `header.head` content as elements: the menu button, `<hp-greeting>` (the greeting by the hour from `fmt.hourNow`, the first name capitalised per word, the date line through `fmt.dateLong`, the phone's "20.5° inside · 3.1° outside" from `powerNow` and the weather provider), `<hp-who-chips>`, `<hp-clock-line>` (the time split into main and suffix, `fmt.time24` in French, `TickController(1_000)`; the small line "Live"), the `#chips` row with `<hp-weather-chip>`, `<hp-peak-chip>`, `<hp-live-pill>`, the gear, `<hp-status-popup>`, `<hp-settings-popup>`. The weather chip's `slim` rule is a sibling CSS rule inside `<hp-header>`'s own sheet (`:host([data-live]) hp-weather-chip`), which retires the legacy sheet's `#chips[data-live]` rule of spec 22.
- `src/shell/upcoming.ts`: `upcoming(inputs, deps): UpcomingRow[]` is `upcoming()` (the sun's two events in today's order with their effect lines, the Hilo challenge, the peak coming, the car's departure through `departureSchedule`, the modes on), read by the phone's Home pane; the Automations pane reads `upcomingRuns` from spec 25's provider, which is a different list (scheduled automation runs); the two are not merged, as today.
- `<hp-config-card>`: `renderConfigCard`'s aside as an element over `store.configProblems` with `translate="no"` on its host (the rewrite layer's rule), the same classes (`.cfgerr`, `h3`, `p`, `ul`, `code`); the `config-error-*` baselines prove it.

### Deletion and grep gates

Pull request 1 deletes `presence`, `whoHtml`, `stackCards`, `renderHomeStack`, `stackGo`, `scard`, `sring`, `src/stack.js` (the legacy set loses `stack\\.js`), the stack's part of `renderIdle` (the idle screen keeps a `<hp-smart-stack mode="idle">` placed by the guest through the bridge until spec 26, the bridge's last use), the `#hstk` write. Pull request 2 deletes `renderHome`, `renderConfigCard`, `houseImg`, the `#hwx`, `#htiles`, `#hscenes`, `#hsec`, `#cfgerr` writes and the `legacyFeature('home')` line, the bridge placements (`#tv`, `#hscenes`, `#hsec`, `#air`, `#energy` containers and `src/shell/guest.ts`'s bridge list), the `data-tab`/`data-sheet`/`data-card` tile branches of `wire()`. Pull request 3 deletes `renderHeader`, `upcoming`, `up`, `layout`, `LAYOUT`, `plan`, `enterTabs`, `leaveTabs`, `placePanels`, `onCompact`'s remaining body, `setView`, the `.cols` markup, the `#hello`, `#clock`, `#chips`, `#err` containers and the weather chip, the `'renderHeader'` entry of `renderLive`, `'renderHome'` and `'renderPaneSubs'`' last lines of `renderTabs` (every pane's sub-line is its element's now; `renderPaneSubs` goes), the French entries.

Gates (after pull request 3): `grep -nE '^  (presence|whoHtml|stackCards|renderHomeStack|stackGo|scard|sring|renderHome|renderConfigCard|renderHeader|upcoming|up|layout|enterTabs|leaveTabs|placePanels|onCompact|setView|renderPaneSubs)\(|LAYOUT|houseImg|class="cols"|hwx|htiles|hello|data-card' src/home-panel.js` is empty; `ls src/stack.js` fails; `grep -n 'bridge\|guest-placed' src/shell/guest.ts` lists no live use; `grep -nE '\.(hwx|hbig|hhouse|hwho|hright|htiles|htile|hv|hs|hscenes|cfgerrh|cfgerr|who|wp|sc|sh|si|sbig|smid|schips|srow|skv|spl|sav|sev|snp|sart|sbar|swx|scw|speek|sdots|hello|chips|chip|clock)\b' src/css/*.css` is empty; `npm run lint` prints a footprint one lower; the class shrinks by about 900 lines, quoted; the French map lost the listed entries.

### Styles and strings

- `src/features/stack/styles.css` receives `.sc` and its children, `.scw`, `.speek`, `.sdots` (`tabs.css` ~236 to 265 for the Home slot, the idle's in `tabs.css` ~1475 to 1490 stay with spec 26's idle screen, the card's own rules wherever they are: grep `\.s(c|h|i|big|mid|foot|chips|row|kv|pl|p|av|ev|np|art|bar|wx)\b`); `src/features/people/styles.css` receives `.who`, `.wp` (`extra.css` ~1051 to 1090, `tabs.css` 295 to 300); `src/shell/home-pane.css` receives `.hwx`, `.hbig`, `.hhouse`, `.hright`, `.htiles`, `.htile` and its parts (`tabs.css` ~179 to 215, 301, 408 to 470, `motion.css` 204), `.hscenes` (Media's `.ptile` rules are Media's), `.cfgerrh`, `.cfgerr` (`tabs.css` 310 to 365); `src/shell/header.css` receives `.head`, `.hello`, `.chips`, `.chip`, `.clock` (`base.css` ~176 to 260, `extra.css` 301); the kit's `card.css` takes `.card`, `.card.tap`, `.card .top` and `.hh` (every Home card's header button, `tabs.css` 1259 to 1290 generalised), `.hero` is already the kit's.
- About eighty keys across `home.*`, `people.*`, `stack.*` (the greetings by hour, `inside`, `outside`, `whosHome`, `noOneTracked`, `home`, `away`, `arrived`, `left`, `atAGlance`, `comingUp`, `nothingScheduled`, `sunsetTheme`, `sunriseLights`, `departure`, `on`; the glance tiles' words come from each feature's keys; the sixteen cards' labels, bodies and footers (`doorOpen`, `openSince`, `staysUntilClosed`, `lightsUnreachable`, `notAnswering`, `inEffect`, `warningsInEffect` plural, `issued`, `tapForDetails`, `notPluggedIn`, `plugInBeforeBed`, `presenceNotUpdating`, `phonesStopped` plural, `signInAgain`, `sunrise`, `lightsOffAtSunrise`, `inMinutes`, `everyLightOff`, `lightsStillOn`, `everyLightIsOff`, `criticalPeakNow`, `criticalPeakComing`, `lowerConsumption`, `announcedPeak`, `usingNow`, `hiloChallenge`, `nowPlaying`, `tapForPlayer`, `playing`, `opened`, `today`, `events` plural, `allDay`, `andMore`, `fromCalendars`, `away`, `since`, `lightsOn` plural, `allLightsOff`, `endsWhenHome`, `roomAir`, `isHigh`, `openWindow`, `purifierFaster`, `tomorrow`, `tonight`, `charging`, `pluggedIn`, `chargingTo`, `notChargingNow`, `energyToday`, `soFar`, `heatingWaterCar`), French from the map's entries (`src/i18n/fr.js` ~287 to 300, 447, 1255 to 1300, 1380 to 1420), listed in `test/unit/fixtures/moved/home.json`, `people.json`, `stack.json`.

### Performance, by construction

- The Home pane's children each subscribe to their own ids: a thermostat change updates the Climate glance tile and nothing else in the pane; the class redrew the six tiles, the weather card and the stack on every tick.
- The stack computes its cards when one of its ids changes and rotates on a twenty-second tick without recomputing (the cards are cached until an id changes; the rotation picks from the cache); the class recomputed sixteen rules every second.
- The header's clock ticks once a second in one small element; the greeting changes by the hour.

## Acceptance Criteria

Pull request 1, people and the stack:

1. `src/providers/{people,calendar,media-players}.ts`, `src/features/people/*`, `src/features/stack/*` exist with headers; `src/stack.js` is gone and the legacy set no longer names it; `<hp-smart-stack mode="idle">` is placed by the guest in `#istk` through the bridge (the bridge's last use, listed).
2. Vitest: `presence` (a person entity wins; phones and watches by owner's name in both name shapes; iPads excluded; the config's order), `frozenPresence`, `todaysEvents`, each of the sixteen rules at a known instant (applies, does not, the threshold edge, the tone, the filler flag, the `go`), `rotation.ts` (the moved tests), `stackModel` (the Home mode's filter), `peopleModel`; 100 percent statements.
3. Playwright: `smart-stack.spec.ts` checks 16 to 21 pass unchanged; `idle.spec.ts` green; the `home-*` and `idle-stack-*` baselines identical; a light change gives zero mutations in `hp-smart-stack`'s root unless a rule reads lights (it does: the test uses a thermostat); axe clean on the stack card.
4. The French equivalence tests pass for `people.json` and `stack.json`; every baseline identical; `npm run check`, `npm test -- --coverage`, `npm run lint` (footprint one lower) green; changeset (patch): "Internal rewiring of the smart stack and Who's home. Nothing visible changes."

Pull request 2, the Home pane:

5. `src/shell/{home-pane.ts,glance-tile.ts,config-card.ts,upcoming.ts}`, `src/features/weather/weather-card.ts`, every feature's `glance` exist; `FEATURES` has `homeFeature` from the shell; no bridge placement remains for the Home pane (`src/shell/guest.ts`'s list holds the idle stack only).
6. Vitest: `upcoming` (the sun's order by day or night, each row), each `glance` in `en` and `fr` against the test house, the Home pane's view (which tiles show in the full and bare houses); Playwright `home.spec.ts`: the tiles read the house's values; a tile switches tabs on a tablet and opens the sheet on a phone (check: the Car tile opens the car sheet on the phone); the config-error card shows for an admin with a bad config (`config-error.spec.ts` unchanged); the Home security card and the scenes row are in place; a thermostat change updates the Climate tile and gives zero mutations elsewhere in `hp-home-pane`'s root; axe clean.
7. Every baseline identical (`home-*`, `bare-home-*`, `config-error-*`); the `home.json` equivalence test passes; changeset (patch): "The Home tab is redrawn with the same look. Nothing visible changes."

Pull request 3, the header and the deletion:

8. `src/shell/{header.ts,greeting.ts,clock-line.ts}`, `src/features/weather/weather-chip.ts` exist; the guest's header containers are gone; the grep gates hold; the `.cols` markup is gone; the styles-split test passes; the French map lost the listed entries; every baseline identical; all suites green (the two-panel spec: two headers with two names); changeset (patch): "Internal rewiring of the header. Nothing visible changes."

## Testing Decisions

The seams are the two of ADR 0005. New in kind: time-windowed rules tested at several instants (the stack's morning, evening and night windows), and a composition proven by the per-child mutation count (a change touches one child). `smart-stack.spec.ts` passes unchanged, as `live-pill.spec.ts` did for spec 22. Prior art: `live.spec.ts`'s rule style for the checks, `tabs.spec.ts` for the observer.

## Out of Scope

- A new layout for Home, new tiles, or a new stack card.
- The idle screen's composition: spec 26 (it consumes `<hp-smart-stack mode="idle">`).
- Merging the two "upcoming" lists.

## Notes

- **Why Home is a shell composition and not a feature.** It imports every feature's card and reader; under ADR 0011 a feature may not. The shell is the one layer that may import features, so the composition lives there, and `features/people/` and `features/stack/` are what Home needed that no other feature owned.
- **Why the stack's rules read providers and not features.** The stack is a feature; a feature never imports another; every reading it needs was pushed down by the earlier moves (the sensors, the areas, the car, the power, the air rating, the speakers now). The one reading left in a feature, Weather's forecast fold, travels with the inputs as spec 15 designed it.
- **Why the bridge ends here.** Its purpose was a feature card on a pane the guest still drew; with the Home pane composed, every card has a parent, and the idle stack's last placement ends with spec 26. ADR 0022 is marked by the date its exceptions closed, in its Status line only.
- **Why `glance` is a function and not an element.** Six tiles with one shape and six readers: one `<hp-glance-tile>` fed by a view model keeps the tiles identical and the readers testable without a DOM.
- **Reading**: Seemann, _Dependency Injection_ (the composition root, now with children); Fowler, _PoEAA_ (Registry, for `FEATURES` carrying `glance`); Apple HIG, _Widgets_ and _Smart Stack_ (the rotation's model).
