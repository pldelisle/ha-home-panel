# Spec 22: The live-activity pill and the Status checks, extracted from the header: three activities and fourteen checks as pure rules over the providers

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 3.
Depends on: [17 Security](17-security.md) (`doorMotionSensors`), [19 Energy](19-energy.md) (`powerNow`, `hiloRates`, `hiloChallenge`, `hydroQuebec`, `wallbox`, history on demand), [20 Climate](20-climate.md) (`heatPump`), [21 Car](21-car.md) (`findCar`, `readCar`). Blocks: 24 Home (the header becomes the shell's composition once this and the greeting have homes), 26 Idle clock (nothing directly).
Ships as: two pull requests, each a patch release, each pixel-identical. No new ADR: this is ADR 0017's "compose at the root, share reads in providers" applied to the header; one note records why `<hp-ring>` is promoted here.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

The header's right-hand chips are the panel's most cross-cutting reader. In the class:

- **The Status checks** (`attention`, ~2734): fourteen rules over eight integrations: Hydro-Québec stale after 36 hours, the heat pump offline (with its brand), the Hilo gateway offline or disconnected, thermostats not reporting, a critical peak in progress or coming, Environment Canada warnings, the car's tire pressure, lock and battery sensor, a door open for over ten minutes (with "Open for 12 min"), an offline sensor, a sensor battery under 15 percent, the Wallbox offline; each rule yields an item (`crit` or `warn`, a title, a line) or a "clear" phrase. `renderAttention` draws the popup `#attpop`: one card per live activity, then the Status block with its items or "Everything is reporting normally." and the clear phrases.
- **The live activities** (`liveActs`, ~2831, 250 lines): three activities with a priority, a ring (percent done), a pill text, a short text, an aria label and a card: the **Hilo challenge** (pre-heat, reduction, recovery from the challenge sensor's `next_events[0].phases`, with the phase bar, the time left, the inside temperature, the house's power, the kWh used of the allowed), the **car charging** (FordPass charging, or plugged in with the Wallbox paused below the limit; the ETA from Ford's attributes when any names an end or a remaining time, else from the battery capacity in the config and the charger's power; the current session's kWh and cost; the "Pause charging" and "Open Car" buttons), and the **water heater** (drawing power, the time left as the median of today's other cycles from the 5-minute window, the temperature's rate per ten minutes, a sparkline of this cycle). A finished activity keeps a check for ten minutes (`laDone`: "Charged to 90%", "Challenge done").
- **The pill** (`laPill`, ~3080): with nothing running and nothing to check the spot is empty (2.8.0); a problem alone is an amber pill (red when critical) with "N things need attention"; otherwise the first activity's ring and text (the long text on a phone, the short one on a tablet), the other activities as small ring bubbles and the problem as a "!" bubble; `aria-expanded` follows the popup; the weather chip beside it turns `slim` when an activity shows. `laClick` handles the card buttons; `toggleAttention` opens the popup, which the Escape handler closes second.
- The header also carries the **"Critical peak now"** chip from Hydro-Québec, the greeting and date line (`renderHeader`, ~2587) and the weather chip; `liveActs` and `attention` run on every tick.

`live-pill.spec.ts` (checks 10 to 15 and 45) and the `live-popup-*` and `status-checks-*` baselines are the proof; the rules themselves have no tests.

## Solution

Move the pill and the Status checks into `src/features/live/`, in two pull requests:

1. **The rules, the model and the elements.** `checks.ts` is the fourteen rules as pure functions over the providers' outputs; `activities.ts` is the three activities as pure functions returning data (texts through `t()`, a `card` as a view model, not a closure); `done.ts` is the ten-minute check; `liveModel` composes them into the pill and the popup. `<hp-live-pill>` and `<hp-status-popup>` are placed by the shell in the header (the header is the shell's frame since spec 14 C; its `#chips` container keeps a guest span for the weather chip until spec 24). `<hp-ring>` joins the kit with the pill's rings as its first user and the smart stack's as the second (spec 24). The water heater's window loads through the statistics cache (the same window as Energy's water card, so one call).
2. **The peak chip, the guest's reads and the deletion.** `<hp-peak-chip>` replaces the header's "Critical peak now" chip; `attention`, `renderAttention`, `liveActs`, `laPill`, `laClick`, `toggleAttention`, `durTxt`, the pill's part of `renderHeader`, the `#attpop` markup and listeners, `live.css` and the French entries go; the sheet host's Escape order names the element.

Each pull request leaves every baseline identical.

## User Stories

1. As a household member, I want the pill, its bubbles, the popup's cards and the Status checks to look and behave exactly as before, so that the move is invisible.
2. As a household member, I want "Pause charging" in the car's card to flip at once and "Open Car" to take me to the car, as today.
3. As a household member, I want a finished charge or challenge to show its check for ten minutes, as today, so that I see it ended.
4. As a French-speaking user, I want every pill and check string in French from the first paint, with `16 h 07` in the phase bar, so that the catalog is as good as the rewrite layer was.
5. As an adopter without Hilo, Hydro-Québec, a car or a heat pump, I want the checks that concern them to be absent (not "clear"), as today, so that the panel fits my house.
6. As a maintainer, I want each check as one named pure function with a test for its item and its clear phrase, so that adding a fifteenth check is one function and one test.
7. As a maintainer, I want each activity as a pure function over the providers' outputs and the window, tested at a known instant (the ETA rules, the phase bar, the median cycle), so that the hardest rules in the header are pinned.
8. As a maintainer, I want the pill and the popup to read the providers and never a feature, so that the dependency rule holds and the features' moves cannot break the header.
9. As a maintainer, I want the behaviour tests of `live-pill.spec.ts` to pass unchanged, so that the extraction is proven by the tests that exist.
10. As a learner, I want the header explained as a composition at the root (the shell places elements that read providers), so that the Home composition of spec 24 follows the same shape.

## Implementation Decisions

### The folder

```
src/features/live/
  README.md
  index.ts                 exports <hp-live-pill>, <hp-status-popup>, <hp-peak-chip>; no FeatureDescriptor (the header, not a pane)
  ids.ts                   liveIds(store): every id the checks and activities read
  inputs.ts                readLive(states, registries, config, names): LiveInputs (the providers composed)
  checks.ts                CHECKS: Check[]; runChecks(inputs, deps): {items: CheckItem[]; clear: string[]}
  activities.ts            hiloActivity(inputs, deps), carActivity(inputs, history, deps), waterActivity(inputs, history, deps): Activity | null; sortActivities
  done.ts                  nextDone(prev: Seen, seen: Seen, inputs, now): Done | null (the ten-minute check)
  model.ts                 liveModel(inputs, history, state, deps): LiveViewModel
  loader.ts                LiveHistory: the water heater's 5-minute window through the statistics cache
  live-pill.ts             <hp-live-pill>
  status-popup.ts          <hp-status-popup>
  activity-card.ts         <hp-activity-card>
  peak-chip.ts             <hp-peak-chip> (pull request 2)
  styles.css               live.css, .attchip, .att, .arow
src/ui/
  ring.ts                  <hp-ring> (percent, color, size; the kit's ring)
  styles/ring.css
test/unit/features/live/{checks,activities,done,model}.test.ts
test/e2e/live-pill.spec.ts (unchanged), test/e2e/live.ts (unchanged)
```

### The inputs

```ts
export interface LiveInputs {
  now: number;
  power: PowerNow; // grid, rooms with availability and temperatures, water heater power
  hilo: {rates: HiloRates | null; challenge: HiloChallenge | null; gateway: {on: boolean; disconnected: boolean} | null}; // hilo.ts gains `hiloGateway`
  hydroQuebec: {balance: {lastUpdated: number} | null; peakNow: boolean | null; peakUpcoming: boolean | null} | null;
  heatPump: HeatPumpInputs | null;
  weatherWarnings: number | null; // the Environment Canada provider's `warnings` count (environment-canada.ts exports `warningCount(states, config)`)
  car: CarInputs | null; // readCar; null without a car
  wallbox: WallboxInputs | null;
  sensors: SensorInputs[]; // doorMotionSensors
  waterHeater: {power: number | null; temperature: number | null; powerLastChanged: number | null};
  config: {carBatteryKwh: number | null};
}
```

`readLive` is the composition of eight provider calls; it is the one place that knows which providers the header reads, and its header lists them.

### The checks

```ts
export interface Check {
  key: string; // 'hydroQuebecStale', 'heatPumpOffline', …
  run(inputs: LiveInputs, deps: {t: Translate; fmt: Formatters}): {item?: CheckItem; clear?: string} | null; // null: the check does not apply to this house
}
export interface CheckItem { level: 'crit' | 'warn'; title: string; line: string; key: string }
export const CHECKS: readonly Check[]; // in today's order, so the popup's list order is unchanged
export function runChecks(inputs, deps): {items: CheckItem[]; clear: string[]};
```

The fourteen rules copied: `hydroQuebecStale` (36 hours), `heatPumpOffline` (crit, with the brand), `hiloGateway` (crit), `thermostatsNotReporting` (plural, the names), `criticalPeak` (now: crit; coming: warn; else clear "No critical peak" when the sensor exists), `weatherWarnings` (plural; clear at zero), `tirePressure`, `carUnlocked` (clear "Car locked"), `carNotReporting`, `doorOpenTenMinutes` (one item per door, "Open for {d}" through `fmt.agoBare`), `sensorOffline` (one per sensor), `sensorBatteryLow` (under 15, one per sensor), `doorsClosed` (clear only), `wallboxOffline`. A check returns `null` when its integration is absent, so the house without Hilo has no Hilo line at all, as today. Each is a named export with its own test; `CHECKS` is the **chain** that `runChecks` folds (Gamma et al., _Chain of Responsibility_ in its collecting form).

### The activities

```ts
export interface Activity {
  key: 'hilo' | 'car' | 'wh';
  priority: number; // 0 reduction, 1 pre-heat or recovery, 2 car, 3 water heater
  icon: IconName; color: string; progress: number | null; tint: boolean;
  pill: PillText; // {label, value?, extra?}: the long form (phone)
  short: PillText; // the tablet's
  ariaLabel: string;
  card: ActivityCardView; // below
}
export type ActivityCardView =
  | {kind: 'hilo'; title; right; phases: {segments: {label, flex, color}[]; ticks: {left: number; text: string}[]; aria} | null; big: {n, to} | null; meta: string; note: string}
  | {kind: 'car'; title; state; right; big: {soc, limit, eta: {at, inText} | null}; bar: {soc, limit, aria}; meta; buttons: {pause: {show, resume: boolean}; open: true}}
  | {kind: 'wh'; title; right; spark: SparkGeometry | null; big: {t, rate: {up: boolean; text} | null, left: {text, main} | null}; meta};
```

- `hiloActivity`: the phase from the challenge's state (`on` is reduction), the phase times from `next_events[0].phases` parsed with the space-to-T rule, the progress, the time left to the next boundary (`durTxt` becomes `fmt.durationShort`: "52 min", "1 h 50", "3 h", added to the formatters with its equivalence test), the inside mean, the house's power, used of allowed.
- `carActivity`: the "paused below the limit" rule, the ETA rules in order (an attribute naming an end date in the future; an attribute naming minutes remaining under 3,000; else the capacity rule), the current session (the last session that ended within two hours and started after the plug-in, from the car's `CarHistory`? No: the header does not import the car feature; the session rule `sessions(rows)` moves to the **Wallbox provider** (`wallbox.ts` exports `chargingSessions(rows)`, pure over statistics rows), and both Car and Live call it; Car's spec is amended by this one in its folder note), the price, the plug-in time.
- `waterActivity`: the runs from the 5-minute power points of the last 24 hours (on above 0.2 kW; a run closed at the last point plus five minutes), the current run's start (the last run if it ended within fifteen minutes, else the power's `last_changed`), the median of the other runs over five minutes, the time left, the temperature rate per ten minutes over the run, the kWh this cycle, the cycle count, the sparkline geometry (340 × 46).
- `done.ts`: `nextDone(prev, seen, inputs, now)` is the `laSeen`/`laDone` rule: the car vanished from the activities at or above its limit minus one gives "Charged to N%"; the challenge vanished with the sensor off gives "Challenge done"; a done entry expires after ten minutes or when an activity appears. `Seen` and `Done` are element state on `<hp-live-pill>`, threaded through the model.
- Commands: the card's "Pause charging" is `wallboxCommands.pause(on)` from `src/providers/wallbox.ts` (a `Command` as data; the provider stays pure), run through `<hp-activity-card>`'s `CommandRunner` (`commands.run(cmd)`) with the overlay key `K.pause`; Car's `<hp-charger-controls>` uses the same builder (spec 21's `togglePause` is this; its spec is read with this amendment). "Open Car" dispatches `SheetRequestEvent('car.detail')`: the host's inline rule switches to the Car tab on a tablet and opens the sheet on a phone, which is what `show('sh-car')` did; the popup closes first.

### The model and the elements

```ts
export interface LiveViewModel {
  pill: null | {kind: 'attention'; level: 'crit' | 'warn'; text: string; aria: string} | {kind: 'activity' | 'done'; main: MainView; bubbles: BubbleView[]; aria: string; hasActivities: boolean};
  popup: {activities: ActivityCardView[]; status: {line: string; items: CheckItem[]; clear: string[]; empty: string | null}};
}
```

- **`<hp-live-pill>`**: `StoreController({ids: s => liveIds(s)})`; `LiveHistory`; element state `seen`, `done`, `open`; renders nothing or the `button.chip.attchip.lap` with the `.lmain` (an `<hp-ring>`, the texts, `tint`), the `.lbub` bubbles and the `.lwarn` mark, `aria-haspopup="dialog"`, `aria-expanded`; a tap dispatches `SheetRequestEvent('live.status')`; dispatches `live-activities` with `{count}` so the shell sets `data-live` on `#chips` for the weather chip's `slim` rule (one CSS rule in the legacy sheet until spec 24: `#chips[data-live] .wxchip` with the `slim` declarations).
- **`<hp-status-popup>`**: registered with the sheet host as the non-modal popup `live.status` (the host's Escape order: modal sheet, then this, then the settings popup; `hidden` toggled by the host); renders the `.lact` cards (`<hp-activity-card>`, `repeat` by key) and the `.lstat` block; the `la` class on the host when there are cards.
- **`<hp-activity-card>`**: the three card kinds from `ActivityCardView` with today's classes (`.lah`, `.lph`, `.lpt`, `.lbig`, `.lmeta`, `.lbar`, `.lbtns`, `.lspark`); the buttons run the command or dispatch the sheet request.
- **`<hp-ring>`** (`src/ui/ring.ts`): `value` (0 to 1 or null), `color`, `size`, `icon?`; the two circles with `color-mix` fills and the dash offset as `ring()` draws them; `src/ui/styles/ring.css` takes `.lring` and, in spec 24, the stack's `.sring`.
- **`<hp-peak-chip>`** (pull request 2): the "Critical peak now" chip when `hydroQuebec.peakNow`; placed by the shell before the pill.
- The shell's header template: `#chips` holds `<span class="guest" id="wxchip-host"></span>` (the guest's weather chip until spec 24) then `<hp-peak-chip>` and `<hp-live-pill>`; `#attpop` becomes `<hp-status-popup>` in the same position. The guest's `renderHeader` loses the chips and the popup and keeps the greeting, the date line and the weather chip.

### Styles and strings

- `src/features/live/styles.css` receives all of `src/css/live.css` (319 lines; `.lap`, `.lmain`, `.lbub`, `.lwarn`, `.ll`, `.lv`, `.lsep`, `.lact`, `.lah`, `.lph`, `.lpt`, `.lbig`, `.lmeta`, `.lbar`, `.lbtns`, `.lspark`, `.latt`, `.lstat`), `.attchip` (`extra.css` ~304 to 320, 536), `.att`, `.arow` (`base.css` ~464 to 495; the car's `#car-ford` rows use `.arow` too, so they go to the kit's `list.css` as a shared row style with two users), `.lring` → `ring.css`. `.app.gl` → `:host([glass])` (check 45's rule about the bare round badge is a `:host([glass])` rule now; the test's computed-style assertion is unchanged). `src/css/live.css` is deleted and leaves the legacy set (the footprint drops by one file; `scripts/legacy-set.cjs` keeps `css/` as a folder pattern, so the count is by file).
- About eighty `live.*` keys (the checks' titles and lines, the clear phrases, `needsAttention` plural, `allClear`, `status`, `reportingNormally`, the activities' words (`hiloPreheat`, `hiloChallenge`, `hiloRecovery`, `preheat`, `challenge`, `recovery`, `challengeIn`, `endsIn`, `untilHolds`, `untilEnds`, `untilRecovery`, `heldBack`, `warmingUp`, `inside`, `houseUsing`, `ofAllowed`, `charging`, `chargingPaused`, `fullIn`, `fullAt`, `limit`, `pluggedInAt`, `soFarAbout`, `range`, `resumeCharging`, `pauseCharging`, `openCar`, `waterHeater`, `water`, `almostDone`, `started`, `thisCycle`, `cyclesIn24h`, `chargedTo`, `challengeDone`), `criticalPeakNow`), French from the map's entries (`src/i18n/fr.js` ~307 to 331, 1541 to 1700), listed in `test/unit/fixtures/moved/live.json`.

### Deletion and grep gates

Pull request 1 deletes `liveActs`, `laPill`, `laClick`, `renderAttention`, `attention`, `toggleAttention`, the pill's part of `renderHeader`, the `#attpop`/`#att` markup and the `attpop` listeners, `this.laSeen`, `this.laDone`; the class's `renderHeader` keeps `#hello`, `#clock` and the weather chip. Pull request 2 deletes the peak chip's lines, `durTxt`, `src/css/live.css`, the French entries; the `#chips[data-live] .wxchip` rule is the one addition to the legacy sheet, removed by spec 24.

Gates (after pull request 2): `grep -nE '^  (attention|renderAttention|liveActs|laPill|laClick|toggleAttention)\(|durTxt|attpop|data-la' src/home-panel.js` is empty; `ls src/css/live.css` fails; `grep -nE '\.(attchip|att|arow|lap|lact|lring)\b' src/css/*.css` is empty; `npm run lint` prints a footprint one lower; the French map lost the listed entries; the class shrinks by about 450 lines, quoted.

### Performance, by construction

- The pill subscribes to the ids the checks and activities read (about forty); a light change gives zero mutations in it, where the class recomputed fourteen checks and three activities every second.
- The water heater's window is the statistics cache's; Energy's water card asked for the same window, so the header's load is a cache hit.
- `<hp-ring>` updates its dash offset by attribute binding; the class rebuilt the SVG string every tick.

## Acceptance Criteria

Pull request 1, the rules, the model and the elements:

1. `src/features/live/{README.md,index.ts,ids.ts,inputs.ts,checks.ts,activities.ts,done.ts,model.ts,loader.ts,live-pill.ts,status-popup.ts,activity-card.ts,styles.css}`, `src/ui/ring.ts`, `src/ui/styles/ring.css` exist with headers; `hilo.ts` gains `hiloGateway`, `environment-canada.ts` gains `warningCount`, `wallbox.ts` gains `chargingSessions` and `wallboxCommands.pause`; `fmt.durationShort` and `fmt.agoBare` exist with their equivalence tests.
2. Vitest: every check (applies or not; item or clear; the 36-hour, ten-minute and 15-percent thresholds at the edge), the three activities at a fixed instant (the Hilo phases and progress, the three ETA rules in order, the paused-below-limit rule, the water heater's median and rate), `nextDone` (the car at its limit, the challenge off, expiry, an activity clearing it), `liveModel` for the five pill cases (empty, attention only, activity, done, activity with attention bubble) in `en` and `fr`; 100 percent statements.
3. Playwright: `live-pill.spec.ts` checks 10 to 15 and 45 pass unchanged against the element; a thermostat change gives zero mutations in `hp-live-pill`'s root (the pill reads thermostat availability, so this case uses a light instead); axe clean on the pill and the open popup.
4. Every baseline identical (`live-popup-*`, `status-checks-*`, `home-*`); the French equivalence test passes for `test/unit/fixtures/moved/live.json`; `npm run check`, `npm test -- --coverage`, `npm run lint` green; changeset (patch): "The header's pill and Status checks are redrawn with the same look. Nothing visible changes."

Pull request 2, the peak chip and the deletion:

5. `<hp-peak-chip>` exists and shows when `hydroQuebec.peakNow` (a behaviour test sets the peak sensor on and reads the chip); the grep gates hold; `src/css/live.css` is gone and the footprint printed by `npm run lint` dropped by one; the styles-split test passes; the French map lost the listed entries; every baseline identical; all suites green; changeset (patch).

## Testing Decisions

The seams are the two of ADR 0005. New in kind: the first move proven by an **unchanged** behaviour suite (`live-pill.spec.ts` drives the pill as a person does and never knew it was a class method), and time-fixed unit tests for rules that mix the clock with the house (every activity test passes `now`). Prior art: `tabs.spec.ts` for the mutation observer; `energy.spec.ts` for a cache hit asserted through `window.house.reads`.

## Out of Scope

- The greeting, the date line and the weather chip: spec 24 (the header completes as the shell's composition there).
- New checks or activities; changing a threshold.
- The idle screen's use of the activities (none today).

## Notes

- **Why a feature folder with no descriptor.** The pill is not a pane; it is a header composition the shell places, like the Home cards of spec 24. `features/live/` keeps the dependency rule (it imports providers and the kit only) and the README names it as the one feature without a tab.
- **Why the session rule moves to the Wallbox provider.** Two features (Car, Live) need "the current charging session" from the same rows; a feature cannot import a feature; a pure function over statistics rows belongs with the integration's provider.
- **Why `<hp-ring>` is promoted here.** The pill's rings are its first user and the smart stack's `sring` (spec 24) is the second, already known; the programme named the ring a kit element from the start.
- **Why the checks are a chain of named functions and not one function.** Fourteen rules in one function is what `attention()` is; one function per rule gives each a test, a key for the popup's `repeat`, and a place for the fifteenth.
- **Reading**: Gamma et al., _Design Patterns_ (Chain of Responsibility); Apple HIG, _Live Activities_ (the pill's model); Hilo integration docs (the challenge sensor's `next_events` and phases); FordPass integration docs (the charging attributes).
