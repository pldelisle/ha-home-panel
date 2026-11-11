# Spec 17: Security, the third move: the cameras, the doors and the motion, two sheets, and the first provider another feature reads

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 3.
Depends on: [15 Weather](15-weather.md) (the recipe, `<hp-sheet>`, `<hp-range-tabs>`, `ranges.ts`), [16 Media](16-media.md) (the Home-card bridge of ADR 0024, `CommandRunner` is not needed here). Blocks: 18 Air and every later move; 22 Live pill and 24 Home, which read the door and motion sensors through the provider this spec creates.
Ships as: two pull requests, each a patch release, each pixel-identical except one new baseline (the sensor history sheet, which has none today). ADR 0025 lands with the first.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

Security is the Security tab (`pane-cams`), two cards, two sheets and one Home card, and it is the first feature whose reading **other features need**:

- `cameras()` (~4447): the UniFi Protect cameras only (the platform, or the attribution when the registry has no platform), one tile per device out of Protect's high, medium and low channels, the `_radar` and `insecure` entities skipped, the device's motion sensor found among its siblings, the name without the channel suffix. `renderCameras` (~4482) draws the `#cams` card: the grid of snapshots refreshed every ten seconds by a stamp on the URL, the motion line per camera, and the empty state with the "Add UniFi Protect" link.
- `sensors()` (~5160): every `binary_sensor` whose device class is a door or a motion class, not Protect's (its motion shows on the camera tile), not hidden, not a diagnostic; with its area, its name through the device, and its battery and illuminance siblings. `sensorState` (the Open or Closed, Motion now or No motion lines with "for 12 min", the lux and the low battery), `sensorChip`, `renderSensors` (the `#sensors` card, doors first then motion, "2 doors open" in amber on the right).
- Today the two cards are **Home cards** that `enterTabs` moves into the pane's `#camhost` and `#senhost` (~5768), and the Home pane draws its own compact security card `#hsec` (~6111 to 6150: the shield, four camera thumbnails, the sensor rows) that `secWatch` (~1831) makes glow for 2.8 seconds when a sensor turns on.
- The camera sheet `#sh-cam` (`openCamera`, `camSheet` ~6800): the camera's name and state, the live view through Home Assistant's own `ha-camera-stream` element when the frontend has it, else the MJPEG proxy image.
- The sensor history sheet `#sh-sens` (`openSens`, `sensSheet` ~6873): day or week, one `history` call, the on periods as a strip over the range with an axis, the last forty events as a list, and four tiles (times opened, total, longest, last); the English formatters (`fmtEn`) are used for the axis and the events whatever the profile's language.
- `sensors()` is also read by the Status checks (~2791: a door open at night), the smart stack (~1446: the door-left-open card), the More sheet's summary (~5726) and the Home pane. Under ADR 0017 a feature never imports another, so when Security moves, those readers (the live pill of spec 22, the stack of spec 24, the Home composition) need the reading **below** the features, in a provider.

Nothing has a unit test; `cams-tablet-*` and `bare-cams-*` are the proof, and the sensor sheet has no baseline at all.

## Solution

Move Security into `src/features/security/`, in two pull requests:

1. **The pane and the provider.** `src/providers/door-motion.ts` reads the door and motion sensors into generic inputs (the first provider written for more than one feature, ADR 0025: a reading two features need lives in a provider, and the provider's output is the contract). `src/providers/unifi-protect.ts` reads the cameras. `<hp-security-pane>` draws `<hp-camera-card>` and `<hp-sensor-card>` from `securityModel`; the two cards stop being Home cards moved into the pane and become the pane's children, so `enterTabs`'s `mv` lines for them go. `<hp-camera-sheet>` mounts the live view through a small mount module; `<hp-sensor-history>` draws the strip, the events and the tiles over `<hp-sheet>` and `<hp-range-tabs>` from a pure `history.ts`, with the profile's formats (the sheet gets its first baseline).
2. **The Home card and the deletion.** `<hp-security-card>` is the feature's Home contribution (`#hsec`), placed by the guest through the bridge; its glow is an element-side rule over the provider's output. `cameras`, `sensors`, `sensorState`, `sensorChip`, `renderCameras`, `renderSensors`, `secWatch`, `openCamera`, `camSheet`, `openSens`, `sensSheet`, the Security line of `renderPaneSubs`, the sheets' markup, the CSS rules and the French entries are deleted; the Status checks, the stack and the More sheet in the class read `doorMotionSensors(...)` from the provider (legacy may import the core and, by this spec, the providers: the dependency rule gains that one allowance, recorded in ADR 0025, so a shared read never has two implementations).

Each pull request leaves every baseline identical (`cams-*`, `bare-cams-*`, `home-*`), and adds `sensor-history-tablet-light-en` as a new baseline in the first.

## User Stories

1. As a household member, I want the Security tab, the camera sheet, a sensor's history and the Home security card to look and work exactly as before, so that the move is invisible.
2. As a household member, I want the camera snapshots to keep refreshing every ten seconds and the live view to open in Home Assistant's own player, so that the cameras stay what they are.
3. As a household member, I want the Home security card to glow when a door opens or motion starts, as today, so that a glance catches it.
4. As a French-speaking user, I want every Security string in French from the first paint, and the sensor history's times in my profile's format (`16 h 07`, `7 nov.`), so that the one sheet that still showed English times follows the rest.
5. As an adopter without UniFi Protect, I want the cameras card to show the same empty state and the doors and motion card to work from any `binary_sensor` with a door or motion class, so that the panel fits my house.
6. As a maintainer, I want the door and motion reading in one provider that the Status checks, the smart stack, the Home card and the Security pane all call, so that "which sensors count" is one rule.
7. As a maintainer, I want the Protect channel rule (one tile per device, high over medium over low), the motion sibling rule and the name cleaning in one provider with tests, so that an integration quirk is named where it lives.
8. As a maintainer, I want the on-period segmentation, the period statistics and the axis ticks of the history sheet as pure functions over `HistoryPoint[]`, so that the sheet's logic is tested with literal rows.
9. As a maintainer, I want the live view mounted by a module that knows only `ha-camera-stream` and the proxy URL, so that a frontend without the element degrades to the image as today.
10. As a maintainer, I want the behaviour tests to open a camera, open a sensor's history, switch the range and read the tiles through the harness, so that the tests survive the rewrite.
11. As a maintainer, I want the legacy class to lose every Security method, sheet, style and map entry in the second pull request, with grep gates, so that the footprint means what it says.
12. As a learner, I want the provider that serves several features explained (why below the features, what its contract is, what it costs), so that the next shared read goes to the right place without a debate.

## Implementation Decisions

### The folder

```
src/providers/
  door-motion.ts           doorMotionSensors(states, registries, names): SensorInputs[]; sensorKind(deviceClass)
  unifi-protect.ts         protectCameras(states, registries, names): CameraInputs[]; the channel, motion and name rules
  cameras.ts               CameraInputs, CameraSource (the type the list holds); CAMERA_SOURCES = [protectCameras]
src/features/security/
  README.md
  index.ts                 securityFeature; exports <hp-security-card>
  ids.ts                   securityIds(store): cameras, their motion sensors, the door and motion sensors, their battery and lux siblings
  inputs.ts                readSecurity(states, registries, names, sources): SecurityInputs
  model.ts                 securityModel(inputs, deps): SecurityViewModel
  history.ts               segments(points, t0, now), periodStats(segs), axisTicks(t0, now, n), durationText(ms, t)
  activity.ts              newlyActive(prev, next): string[] (the glow rule), pure
  security-pane.ts         <hp-security-pane>
  camera-card.ts           <hp-camera-card>
  sensor-card.ts           <hp-sensor-card>
  camera-sheet.ts          <hp-camera-sheet>
  camera-stream.ts         mountCameraStream(host, hass, stateObj, cameraName): {destroy()}
  sensor-history.ts        <hp-sensor-history>
  security-card.ts         <hp-security-card> (Home, pull request 2)
  styles.css
test/unit/
  providers/door-motion.test.ts, unifi-protect.test.ts
  features/security/{model,history,activity}.test.ts
test/e2e/security.spec.ts
```

### The shared provider (ADR 0025)

```ts
// src/providers/door-motion.ts
export type SensorKind = 'door' | 'motion';
export interface SensorInputs {
  id: string;
  kind: SensorKind;
  deviceClass: string;
  areaId: string | null;
  area: string; // the area's display name, '' when none
  name: string; // the device's name through the resolver, else the entity's; "Détecteur de mouvement " stripped (sensorName)
  on: boolean;
  available: boolean;
  since: number; // last_changed in ms
  battery: number | null; // the sibling sensor.*_battery
  illuminance: number | null; // the sibling sensor.*_illuminance
}
export const DOOR_CLASSES = ['door', 'window', 'opening', 'garage_door'] as const;
export const MOTION_CLASSES = ['motion', 'occupancy', 'presence'] as const;
export function doorMotionSensors(states: HassEntities, registries: Registries, names: Names): SensorInputs[];
```

- The rules are the class's: a `binary_sensor` with a door or motion class, not on the `unifiprotect` platform, not hidden, with no `entity_category`; area from the entity else its device; siblings by device; sorted doors first then by name. The output is **inputs**, not a view: no strings a person reads, no "for 12 min".
- **Why a provider and not a feature export.** Four readers in three layers (the Security feature, the live feature of spec 22, the shell's Home composition and stack of spec 24, and the legacy class until then) must agree on which sensors count. ADR 0011 forbids a feature importing a feature; ADR 0017 says shared reads go down. The cost is a provider with no integration in its name, which the glossary's definition allows (a provider turns entities into the generic inputs a model expects; the domain's device classes are the "integration" here). The ADR also records the one allowance this spec adds to the dependency rule: **the legacy class may import `src/providers/`** (as it may the core), so the Status checks, the stack and the More sheet call `doorMotionSensors` instead of `this.sensors()` from pull request 2 on, and the class's copy is deleted rather than kept beside the provider. `.dependency-cruiser.cjs`'s rule for the legacy set gains `src/providers/` in its allowed targets; the architecture test is updated with the reason.
- `src/providers/unifi-protect.ts`: `protectCameras` with the class's rules: a `camera.*` whose registry platform is `unifiprotect`, or with no platform and an attribution matching `/unifi|protect/i`; `_radar` and `insecure` skipped; one per device, rank high (0) over the unranked (2) over medium (1)? No: the class ranks `_high` 0, `_medium` 1, the rest 2, `_low` 3, and keeps the lowest rank; copy that exactly, test it; the motion sensor is the device's `binary_sensor.*motion*` not `*detection*`, preferring `_motion$`; the name is the device's through the resolver with the `(High|Medium|Low)( Resolution Channel)?` suffix dropped; sorted by name. Output `CameraInputs {id, deviceId, name, available, picture: string | null, motion: {on: boolean; since: number} | null, state: string}`.
- `src/providers/cameras.ts` holds `CameraInputs` and `CAMERA_SOURCES = [protectCameras]`: a list of one. This is a hypothetical seam by the rule of ADR 0005's reasoning, and the spec says so rather than inventing a generic adapter: a generic `camera.*` adapter would show cameras the class hides today, which is a visible change for a house with other cameras and needs its own pull request and baseline. The list form costs one line and makes that pull request a one-file addition.

### The inputs, the model and the view model

```ts
export interface SecurityInputs {
  cameras: CameraInputs[];
  sensors: SensorInputs[];
}
export interface SecurityModelDeps {
  now: number;
  t: Translate;
  fmt: Formatters; // ago, time, date, integer
}
export function securityModel(inputs: SecurityInputs, deps: SecurityModelDeps): SecurityViewModel;

export interface SecurityViewModel {
  summary: string; // "2 cameras · all doors closed · motion now" | "No cameras · 1 door open"
  cameras: {
    count: string; // "2 cameras" | "Not connected"
    empty: boolean;
    tiles: CameraTile[]; // {id, name, picture: string | null (with the ten-second stamp), when: string, moving: boolean, offline: boolean, label}
  };
  sensors: {
    hidden: boolean; // no sensors at all: the card is hidden, as today
    line: {text: string; warn: boolean} | null; // "2 doors open" in amber, "All doors closed", "Door closed", or none without doors
    rows: SensorRow[]; // {id, kind, name, tone: '' | 'warn' | 'act' | 'off', main, sub, label}
  };
  home: {
    // the Home card
    line: string; // the compact summary under "Security"
    cameras: CameraTile[]; // the first four
    rows: SensorRow[];
    hint: string | null; // "No door or motion sensors yet."
  };
}
```

- The stamp: `Math.floor(now / 10000)` appended to `entity_picture`, computed in the model from `deps.now`; the element re-runs the model on its own ten-second timer (a `TickController` in the kit, `src/ui/controllers/tick.ts`, one interval per host, paused with the pane; it is also what the Weather detail's observation line and the scenes' "Last 2 h ago" will use, so it has three users by the end of phase 3).
- `sensorState`'s wording becomes keys: `security.open`, `closed`, `motionNow`, `noMotion`, `forDuration` (`for {d}`), `batteryLow` (`battery {n}%`), `offline`, `lux` (`{n} lx`), joined with `·` as today; `fmt.ago` with the `' ago'` suffix stripped for "for 12 min" is `fmt.agoBare` (spec 11's relative formatter gains the bare form if it lacks one; its equivalence test grows).
- `history.ts`: `segments(points: HistoryPoint[], t0, now): Segment[]` (`{a, b, live}` as the class builds them, the first point clamped to `t0`, an open segment closed at `now` and marked live), `periodStats(segs, now): {count, total, longest, last: number | null}`, `axisTicks(t0, now, n)`, `durationText(ms, t)` (seconds under a minute, minutes under an hour, else `h min`, through `t('security.duration.*')`), `eventRows(segs, range, fmt, t)` (the last forty, newest first, "Still open" or "Open for 3 min"). All pure over spec 12's `HistoryPoint`.
- `activity.ts`: `newlyActive(prev: Record<string, boolean>, next: Record<string, boolean>): string[]` is `secWatch`'s rule: ids that are on now and were off before (not unknown before). The Home card holds `prev` as element state and adds the `glow` class for 2.8 seconds when the list is not empty.

### The elements

- **`<hp-security-pane>`**: `active`; `StoreController({ids: s => securityIds(s)})`; `TickController(10_000)`; renders `<hp-pane-header icon="shield" color="var(--m-purple)">` with `t('security.title')` and `vm.summary`, then `<hp-camera-card .view=${vm.cameras}>` and `<hp-sensor-card .view=${vm.sensors}>`. On the phone the pane is what the More sheet opens; the cards are the same.
- **`<hp-camera-card>`**: the `.top` line, the `.camgrid` of `button.cam` (`repeat` by id) with the image (`loading="lazy"`, the stamped URL) or the `.camoff` icon, the `.camlbl` with the `.mdot` when moving; a tap dispatches `SheetRequestEvent('security.camera', {id})`; the empty state with the link to `/config/integrations/dashboard/add?domain=unifiprotect` (`target="_top"`, as today).
- **`<hp-sensor-card>`**: the `.top` line with the amber count, the `.sgrid` of `button.schip` (`repeat` by id) with the tone class, the icon (`door` or `walk`), the name and the `em` main text; a tap dispatches `SheetRequestEvent('security.history', {id})`; `hidden` when `vm.sensors.hidden`.
- **`<hp-camera-sheet>`**: an `<hp-sheet id="security.camera">` with the camera's name and the sub-line (`cap(state)` becomes `t('security.state.' + state)` with a capitalised fallback, "motion now" or "last motion 5 min ago"); on open, `mountCameraStream(box, store.hass, state, name)`; on close, `destroy()`. `camera-stream.ts`: if `customElements.get('ha-camera-stream')`, create it and set `hass`, `stateObj`, `muted`, `controls`, `allowExoPlayer` as today (the one place a feature hands the raw `hass` object onward, because Home Assistant's element wants it; the header says so); else an `img` on `/api/camera_proxy_stream/<id>?token=<access_token>`; offline shows `t('security.cameraOffline')`. The harness has neither the element nor the proxy, so the baseline shows the offline or the broken-image state as today; a behaviour test asserts the sub-line and that an `img` with the proxy URL is created.
- **`<hp-sensor-history>`**: `<hp-sheet id="security.history">` with the badge (`door` or `walk`, `--acc` `var(--t-warn)` or `var(--t-home)`), the name, "Door" or "Motion", `<hp-range-tabs .ranges=${[RANGES.day, RANGES.week]}>` (the two the sheet offers), the `h3` "name, last 24 hours", the strip (`.sstrip` with one `i` per segment positioned by percent, `role="img"` and its label), the `.saxis`, the `ul.sevents` or the hint, and the four `.tiles` from `periodStats`; `history` through `api.history([id], new Date(t0), {minimal: true, attributes: false})` on open and on range change, through the statistics cache's `history` (spec 15's core module, ten-minute ttl); a `StaleReply` is dropped; a reply for a closed element or another range is dropped (`this.isConnected && this.range === r`). Formats through `fmt.time`/`fmt.date`: this is the one visible change of the spec, French only, and the sheet gets its first baseline (`sensor-history-tablet-light-en`, `-fr`) in pull request 1, recorded as new, not changed.
- **`<hp-security-card>`** (pull request 2): the `#hsec` card: the `button.hh[data-tab=cams]` header (the shield SVG, "Security", the compact line) dispatching `tab-select` (the shell listens; it is the one card header that switches tabs), the `.hcams` of up to four `button.hcam` (`repeat`), the `.hsens` rows or the hint; the glow from `newlyActive`. Placed by the guest in `#hsec` through the bridge; `secWatch` is deleted.

### Styles

- `src/features/security/styles.css` receives `.camgrid`, `.cam`, `.camoff`, `.camlbl`, `.camempty`, `.camlive` (`extra.css` ~334 to 430, 535), `.sgrid`, `.schip` and its tones (`extra.css` ~898 to 975), `.senstabs` (`motion.css` 53), `.sstrip`, `.saxis`, `.sevents`, `.hcams`, `.hcam`, `.hcn`, `.hsens`, `.hsen`, `.hsecico`, `.glow` and its keyframes (`tabs.css`, `motion.css`; grep `hsec|glow`), `.mdot`. `.app.cp` → `:host([compact])`, `.app.gl` → `:host([glass])`.
- The `.tiles`/`.tile` rules the stats use are the kit's (`src/ui/styles/tile.css`, split by Weather's detail if not already); `.hh` (the Home card header button) is shared with the other Home cards and stays in the legacy sheet until spec 24, when the kit's `card.css` takes it.

### Strings and formats

About forty `security.*` keys (`title`, `cameras`, `notConnected`, `camerasCount` with an ICU plural, `noCamerasYet`, `addProtectHint`, `addProtect`, `motionNow`, `motionAgo`, `offline`, `openLive` (`Open {name} live`), `doorsMotion`, `doorsOpen` plural, `doorClosed`, `allDoorsClosed`, `open`, `closed`, `noMotion`, `forDuration`, `batteryLow`, `lux`, `history` (`{name} history`), `door`, `motion`, `overPeriod`, `loading`, `timesOpened`, `motionEvents`, `totalOpen`, `totalMotion`, `longest`, `last`, `stillOpen`, `openFor`, `motionFor`, `notOpenedInPeriod`, `noMotionInPeriod`, `openPeriods`, `motionPeriods`, `cameraOffline`, `lastMotion`, `noSensorsYet`, `summary.*` fragments), French from the map's entries (lines ~349 to 360, 377 to 383, 896 to 925, 963 to 973, 1322 to 1335 of `src/i18n/fr.js`), listed in `test/unit/fixtures/moved/security.json`, deleted in pull request 2. The duration texts (`{n} s`, `{n} min`, `{n} h {n} min`) become one ICU message each.

### Deletion (pull request 2) and grep gates

Deleted from `src/home-panel.js`: `cameras`, `renderCameras`, `sensors`, `sensorState`, `sensorChip`, `renderSensors`, `secWatch`, `openCamera`, `camSheet`, `openSens`, `sensSheet`, `sensorName`, `DOOR_DC`, `MOTION_DC`, the `'renderCameras'`, `'renderSensors'`, `'secWatch'` entries of `renderLive`, the `mv('cams', …)` and `mv('sensors', …)` lines of `enterTabs`, the `'cams'` and `'sensors'` entries of `LAYOUT` and their `.cols` markup, the `#cams` and `#sensors` listeners in `wire()` (~1995, 2218, 2242), the `sh-cam`/`sh-sens` branches of `show`/`buildSheet` (or of `sheetOpened` after spec 14 E), the `#sh-cam` and `#sh-sens` markup, the Security line of `renderPaneSubs`, the `#hsec` inner markup (the container stays as the bridge host), `this.camId`, `this.camEl`, `this.sensX`, `this.sensRange`, `this.secWas`, `this.glowT`. The Status checks (`attention`), the stack (`stackCards`) and `renderMore` call `doorMotionSensors(this.hass.states, registries, this.store.names)` from the provider.

Gates: `grep -nE '^  (cameras|renderCameras|sensors|sensorState|sensorChip|renderSensors|secWatch|openCamera|camSheet|openSens|sensSheet)\(|DOOR_DC|MOTION_DC|sensorName|sh-cam|sh-sens|data-cam|data-sens' src/home-panel.js` is empty; `grep -nE '\.(camgrid|cam|camoff|camlbl|camempty|camlive|sgrid|schip|sstrip|saxis|sevents|hcams|hcam|hsens|hsen|hsecico)\b' src/css/*.css` is empty; the French map lost the listed entries; the class shrinks by about 320 lines, quoted.

### Performance, by construction

- The pane and the Home card subscribe to the security ids (cameras, their motion sensors, the sensors and their two siblings each); a thermostat change gives zero mutations in both roots.
- The ten-second snapshot refresh is one `TickController` per visible host, paused with the pane; the class re-stamped on every `renderLive` tick, which is every second.
- `repeat` by id keeps a camera's `img` node across updates, so a stamp change swaps `src` without re-creating the element, and a sensor's row keeps focus.
- The history sheet's reply goes through the cache, so reopening the same sensor within ten minutes makes no call.

## Acceptance Criteria

Pull request 1, the pane, the sheets and the provider:

1. `src/providers/{door-motion,unifi-protect,cameras}.ts`, `src/features/security/{README.md,index.ts,ids.ts,inputs.ts,model.ts,history.ts,security-pane.ts,camera-card.ts,sensor-card.ts,camera-sheet.ts,camera-stream.ts,sensor-history.ts,styles.css}`, `src/ui/controllers/tick.ts` exist with headers; `FEATURES` has `securityFeature`.
2. Vitest: `doorMotionSensors` (classes, the Protect exclusion, hidden and diagnostic exclusions, area from device, siblings, sort), `protectCameras` (platform or attribution, `_radar` and `insecure`, the channel rank, the motion sibling preference, the name suffix), `securityModel` from the test house in `en` and `fr` and from the recorded fixture, `segments` (open at the start, open at the end as live, back to back), `periodStats`, `axisTicks`, `durationText`, `eventRows` (forty cap, newest first); all at 100 percent statements.
3. Playwright `security.spec.ts`: the tab shows the house's cameras and sensors; a camera tap opens the sheet with its name and an `img` on the proxy URL; a sensor tap opens its history, `Week` switches the range and one `history/history_during_period` message is sent per range (the harness logs WebSocket reads); the four tiles read as literals from the harness's history reply; Escape closes and focus returns; a thermostat change gives zero mutations in `hp-security-pane`'s root; axe clean on the tab and both sheets.
4. Every existing baseline identical; `sensor-history-tablet-light-en` and `-fr` added as new baselines (the pull request says so and shows them); the French equivalence test passes for `test/unit/fixtures/moved/security.json`; `npm run check`, `npm test -- --coverage`, `npm run lint` green; ADR 0025 accepted; changeset (patch): "The Security tab is redrawn with the same look; a sensor's history shows times in your language. Nothing else changes."

Pull request 2, the Home card and the deletion:

5. `<hp-security-card>` placed through the bridge; the `home-*` and `bare-home-*` baselines identical; a behaviour test turns the hall motion on through `window.house.setState` and sees the `glow` class on the card's root element for under three seconds.
6. The Status checks, the stack and the More sheet read the provider: `grep -n 'doorMotionSensors' src/home-panel.js` lists three call sites and `grep -nE '^  sensors\(' src/home-panel.js` is empty; `npm run lint` passes with the legacy-to-providers allowance in `.dependency-cruiser.cjs` and `test/unit/architecture.test.mjs` updated.
7. The grep gates hold; the styles-split test passes; the French map lost the listed entries; every baseline identical; all suites green; changeset (patch): "Internal rewiring of the Home security card. Nothing visible changes."

## Testing Decisions

The seams are the two of ADR 0005. New in kind: the harness logging WebSocket reads (`window.house.reads`, beside `calls`), so "one history call per range" is a behaviour test; and the first new baseline added by a move, for a sheet that had none. The providers, the model and `history.ts` are the pure seam. Prior art: `weather.spec.ts` for tapping into a history sheet, `tabs.spec.ts` for the mutation observer.

## Out of Scope

- A generic camera adapter (any `camera.*`): the list is ready; the adapter is a visible change with its own pull request and baseline.
- Locks and the "door open at night" rule of the Status checks: they stay in the class until spec 22, which reads the provider.
- Recording and playback of camera clips; a motion history for cameras.

## Notes

- **Why the two cards stop being Home cards.** `enterTabs` moving `#cams` and `#sensors` into the pane was the cards view surviving inside the tabs view; the cards view is gone since 1.16.0 (the comment in `setView`), so the pane simply owns them. The Home pane shows `#hsec`, which stays a Home card through the bridge.
- **Why the legacy class may import a provider.** The alternative is two implementations of "which sensors count" for a few releases, one in the class and one in the provider, that can disagree; the allowance is one regular expression in the dependency rules and is deleted with the class.
- **Why `TickController` is in the kit.** Three features need a per-host interval that pauses with the pane (snapshots, "ago" lines, the idle clock later); the class's one-second `tick()` that redraws everything is what it replaces.
- **Why the history sheet keeps the profile's formats and gets a baseline.** Spec 11 made the formatters the one place that knows the locale; `fmtEn` in `sensSheet` predates that rule. A new baseline records the French sheet as it should be, and the English one is unchanged in pixels.
- **Reading**: Evans, _Domain-Driven Design_ (anti-corruption layer, for the providers); Fowler, _PoEAA_ (Gateway); Home Assistant developer docs, _Binary sensor device classes_, _Camera entity_, the `ha-camera-stream` element in the frontend repository; UniFi Protect integration docs (channels, motion sensors).
