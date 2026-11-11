# Spec 23: Lights, the eighth move: area tiles from the registry, the Adaptive Lighting provider, two tall sliders, linked rooms, Arrange, and the last of `pending`

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 3.
Depends on: [15 Weather](15-weather.md) (`sunTimes`, the kit's sheets), [16 Media](16-media.md) (`runCommand`, the overlay, `<hp-switch>`, the bridge), [17 Security](17-security.md) (the pane-header actions slot carries the Arrange bar since #167), [20 Climate](20-climate.md) (`<hp-seg>` is not needed; the pointer-driven test style is), [21 Car](21-car.md) (the last reader of `pend`, `pending`, `call` and `sw` before this one). Blocks: 24 Home (the Lights tile and the stack's "Lights unreachable" card read the provider).
Ships as: three pull requests, each a patch release, each pixel-identical. No new ADR: 0021 to 0025 apply; the notes record why the slider is a feature element and why the order stays in system data.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

Lights is the feature with the most behaviour per pixel and the most tests (four Playwright files, checks 22 to 39): the Lights tab on a tablet (the tiles in rows, the Arrange bar in the pane header, the Adaptive Lighting strip), the phone's tile grid, the room's sheet with its two tall sliders, Auto and Night, the bulbs' chips and the "Linked with" picker, and the saved order. In the class:

- **Reading** (`lightAreas`, ~6420, 100 lines): every `light.*` grouped by area through the entity's or its device's area; light groups own their members (the group gives the area, the bulbs get the controls); `split_light_areas` gives one tile per group in an area; the Adaptive Lighting switch for an area found by its configured lights, else the config's `adaptive_lighting_areas`, else the switch's area, else a group sharing its name; `shortNames` drops the words every name shares; linked pairs (from system data, else the config's `light_links` while their switch is on) move the second tile beside the first; the saved order (`light_order` in system data) sorts the units, pairs as one, unknown tiles last. `lightState` (which are on, the mean brightness, the colour-temperature range in 50 K steps and the mean, the tint from the first lit bulb's `rgb_color` or its kelvin through `kelvinRGB`), `lightMode` (Auto is Adaptive Lighting on with none of the lights under manual control; Night is its sleep mode), `lightSub`, `lightTint`.
- **Drawing**: `renderLights` and `lightGrid` (the tablet's rows), `lightCell` (the tile: the bulb switches, the rest opens the sheet, the grip for Arrange), `linkPair`, `linkTag`, `renderLightTiles` (the phone), `renderLightSheet` (~5407: the power button in the header, the brightness pill and the colour pill as `role=slider` with `--v`, the Auto and Night rows, the bulb chips, the Linked with row), `lightPicker` (the radio list with Back), `renderAlBar` (~6183: today's Adaptive Lighting colour temperature as a gradient strip from the sun's times, with the now mark, sunrise, noon and sunset), `setLightEdit`, `loadLightOrder`, `saveLightOrder`, `saveLightLinks`.
- **Commands** (`lightCmd`, ~6684, 90 lines): all off; toggle one bulb; the area's toggle (a pair as one); Auto on (resume: the switch on and `adaptive_lighting.set_manual_control` off) and off (the switch off and Night off); Night on (hands the room back to Auto) and off; brightness and colour by hand (the room leaves Auto and Night: manual control on, or the switch off when the service is missing; `turn_off` under one percent; the colour only to the bulbs that support it); `linkTo` (save the pairs; copy this room's light onto the new partner, colour included when set by hand). The sheet's pointer handlers (`lpVal`, `lpPaint`, ~2000 to 2075: the finger's height is the value, a tap jumps, nothing re-renders while held, one command on release; arrow keys step by ten percent or 100 K), the Arrange drag (~2093 to 2200: lift, the row under the finger takes the place, auto-scroll near the edges, drop saves; taps blocked while arranging; arrow keys move the focused row), `lightDrag` (a flag every renderer checks to leave the DOM alone during a drag).
- The Home card `#lights` (`renderLights`) is moved into the pane's `#lhost` by `enterTabs`; the Home pane's Lights tile is `renderHome`'s. `pending`, `pend`, `call` and `sw` have Lights as their last user after spec 21 (`lightCmd` does not hold pending values today; it relies on Home Assistant's reply, which is why a tap on a bulb lags the round trip. The spec keeps that behaviour: pixel and timing identity).

The `lights-*` and `light-sheet-*` baselines (twelve) and the four Playwright files are the proof; the area grouping, the Adaptive Lighting matching and the mode rules have no unit test.

## Solution

Move Lights into `src/features/lights/`, in three pull requests:

1. **The providers, the model and the tiles.** `src/providers/light-areas.ts` groups the lights into areas (the registry rules, the groups, the splits, `shortNames`); `src/providers/adaptive-lighting.ts` finds the switch per area and reads its mode (Auto, Night, manual control); `features/lights/order.ts` applies the saved order and the links; `lightsModel` gives the tiles, the summary and the strip. `<hp-lights-pane>` draws the pane header's actions (Arrange, Reset order in the header's slot), `<hp-al-strip>`, and the tiles (`<hp-light-tile>`, `<hp-light-pair>`); the sheet is still the guest's through the sheet host. The system-data reads go through a `SystemDataController` in the kit (the one read of `frontend/get_system_data` the panel makes, with the write-through and the "same under every config" rule).
2. **The sheet.** `<hp-light-sheet>` with `<hp-light-slider>` (the tall pill as a slider element with pointer capture and the arrow keys), the Auto and Night `<hp-switch>` rows, the bulb chips, the Linked with row and the picker; `commands.ts` with every rule of `lightCmd` and `linkTo`.
3. **Arrange and the deletion.** `DragReorderController` in the kit (lift, swap, auto-scroll, drop; the arrow keys) with the tiles as its first user (the kit's second user is named: the smart stack's reminders or the scenes' order, whichever comes first; until then it is a kit module with one user because its behaviour is generic and its tests are the point); the order saved through the controller; `pending`, `pend`, `call`, `sw`, `lightDrag` and every Lights method, style, French entry and the `src/css/lights.css` file go (the footprint drops by one).

Each pull request leaves every baseline identical and the four Playwright files green.

## User Stories

1. As a household member, I want the Lights tab, the tiles, the sheet with its sliders, Auto and Night, the linked rooms and Arrange to look and work exactly as before, so that the move is invisible.
2. As a household member, I want a drag on the brightness slider to send one call on release and to take the room off Auto, as today (check 27), so that a dimmer feels like a dimmer.
3. As an admin, I want Arrange to drag a tile into place and save the order for every screen, and Reset order to return to the order by area, as today (checks 37 to 39).
4. As a household member, I want a linked pair to switch, dim and change colour together in one call, as today (check 33).
5. As a French-speaking user, I want every Lights string in French from the first paint, so that the catalog is as good as the rewrite layer was.
6. As an adopter without Adaptive Lighting, I want the tiles and the sheet without the Auto and Night rows and without the strip, as today, so that the panel fits my house.
7. As a maintainer, I want the area grouping (groups, members, splits, the device's area, hidden and diagnostic entities) as a pure provider tested against the test house's kitchen, so that the rules of checks 22 to 25 are unit facts.
8. As a maintainer, I want the Adaptive Lighting matching (configured lights, the config's map, the switch's area, a shared name) in one provider with tests, so that an integration quirk is named where it lives.
9. As a maintainer, I want the slider as an element with pointer capture and keyboard tested through the harness, and the drag reorder as a controller tested the same way, so that the two hardest interactions have behaviour tests that survive the rewrite.
10. As a maintainer, I want the class to lose `pending`, `pend`, `call`, `sw` and `src/css/lights.css` with this move, so that the overlay has one implementation and the footprint drops.
11. As a learner, I want the light commands as data with their side rules (resume Auto, leave Auto, copy onto a partner) tested as pure functions, so that the most intricate command logic in the panel reads as a table.

## Implementation Decisions

### The folder

```
src/providers/
  light-areas.ts           lightAreas(states, registries, names, config): LightArea[] (groups, members, splits, names); shortNames
  adaptive-lighting.ts     adaptiveSwitch(area, states, registries, config): string | null; alMode(area, switchId, states): AlMode; alCurve(configs, sun, now): CurveGeometry inputs; hasManualControlService(services)
src/features/lights/
  README.md
  index.ts                 lightsFeature; exports the Home tile's reader for spec 24 (lightsSummary)
  ids.ts                   lightIds(store): every light, group, Adaptive Lighting switch and sleep-mode switch, the sun
  inputs.ts                readLights(states, registries, names, config, sysdata): LightsInputs
  order.ts                 applyLinks(areas, pairs), applyOrder(units, order): the pair and order rules, pure
  state.ts                 areaState(area, states): AreaState (on, brightness, colour range, tint); kelvinRGB → src/core/color.ts
  model.ts                 lightsModel(inputs, deps): LightsViewModel
  commands.ts              allOff, toggleOne, toggleArea, setAuto, setNight, setBrightness, setColorTemp, link, unlink (each returns Command[])
  al-strip-layout.ts       alStripLayout(curve, now, fmt): stops, marks, hours (from renderAlBar)
  lights-pane.ts           <hp-lights-pane>
  light-tile.ts            <hp-light-tile>; light-pair.ts <hp-light-pair>
  al-strip.ts              <hp-al-strip>
  light-sheet.ts           <hp-light-sheet> (pull request 2)
  light-slider.ts          <hp-light-slider> (pull request 2)
  link-picker.ts           <hp-link-picker> (pull request 2)
  styles.css               lights.css, split by element
src/ui/
  controllers/system-data.ts   SystemDataController(host, api, key): read once per generation, write-through, the "same under every config" rule
  controllers/drag-reorder.ts  DragReorderController (pull request 3)
test/unit/
  providers/{light-areas,adaptive-lighting}.test.ts
  features/lights/{order,state,model,commands,al-strip-layout}.test.ts
test/e2e/lights-tiles.spec.ts, lights-sheet.spec.ts, lights-links.spec.ts, lights-arrange.spec.ts (unchanged)
```

### The providers

```ts
// src/providers/light-areas.ts
export interface LightArea {
  key: string; // the area id, or the group id for a split tile
  areaId: string | null; area: string; other: boolean; // "Other lights" when no area
  name: string; // the area's name, or the short name of the split unit
  ids: string[]; // the lights this tile controls (members, loose lights)
  units: string[]; // the buttons under it: groups and loose lights
  labels: string[]; // shortNames(units' names)
}
export function lightAreas(states, registries, names, config: {splitLightAreas: string[]}): LightArea[]; // sorted: areas by name, "Other" last
export function shortNames(names: string[]): string[];
```

- The rules are `lightAreas`'s first half, copied: the groups by `entity_id` attribute arrays, the owner map, `gArea`, the slot per area, hidden and diagnostic exclusions, the split rule, the sort. Tested against the test house (one tile per kitchen group, the Sink bulb's own lights, an area without splits as one tile: checks 22 and 24 as unit facts).
- `src/providers/adaptive-lighting.ts`: `adaptiveSwitch(area, states, registries, config.alAreas)` is `alFor` (configured lights, the config's map, the switch's area, a group sharing the instance's name); `alMode(area, switchId, states): {alOn, nightSwitch: string | null, nightOn, manual, auto, mode: 'Night' | 'Auto' | 'Manual' | ''}` is `lightMode`; `hasManualControlService(services)` reads `hass.services.adaptive_lighting` (the one `hass.services` read, through the store's `services`); `alCurve(switchConfigs, sun, now)` gives the min and max kelvin and the parabola's inputs for the strip.
- `kelvinRGB` (Tanner Helland's fit) moves to `src/core/color.ts` beside the OKLab blend (spec 20), with a test at 2700 K and 6500 K.

### Order, state, model

- `order.ts`: `applyLinks(areas, pairs)` moves the second of a pair beside the first and marks `link: {other, first}`; `applyOrder(areas, order)` sorts the units (a pair as one) by the saved order with unknown tiles last; `linkPairs(sysdata, configLinks, states)` is `lightLinkList` (system data wins; the config's pairs count while their switch is on).
- `state.ts`: `areaState(area, states)` is `lightState` (the on list, availability, the mean brightness in percent, the colour range in 50 K steps with the mean or the midpoint, the tint rule).
- `lightsModel(inputs, deps)` → `{summary (the pane's sub-line and the More word), tiles: TileView[] (key, name, sub (short on the phone), on, available, tint, linked: {name} | null, pairFirst, pairTint), strip: StripView | null (title, right text, the gradient stops, the now mark, the sun marks with labels, the hour marks), allOff: {show, count}, arrange: {editing, canReset}}`; `sheetModel(area, inputs, deps)` → the sheet's view (title, sub, power, brightness {value, off}, colour {k, min, max, night, label, subLabel} | null, modes: {auto: SwitchView, night: SwitchView | null} | null, bulbs: ChipView[] | null, link: {show, enabled (admin), text} , picker: {options: {key, name, sub, checked, nowWith}[]}).

### Commands as data

Every command of `lightCmd` and `linkTo` is a pure function returning `Command[]` (several calls for one intent, run in order by `runCommand` through `runCommands(api, host, overlay, cmds)` added to the kit for this feature):

- `allOff(areas)`: one `light.turn_off` with every lit id. `toggleOne(id)`: `light.toggle`. `toggleArea(area)`: `turn_off` or `turn_on` on the pair's ids.
- `setAuto(pair, on, services)`: on: for each area with a switch, `switch.turn_on` when off and `adaptive_lighting.set_manual_control` with `manual_control: false` when the service exists; off: `switch.turn_off` on the switch and on Night when on; the toast `lights.autoOn/autoOff`.
- `setNight(pair, on)`: `switch.turn_on/off` on each night switch; on also resumes Auto.
- `setBrightness(pair, pct, modes, services)` and `setColorTemp(pair, kelvin, …)`: first the "leave Auto" calls for the areas under Auto or Night (Night off; manual control on, or the switch off without the service), then `light.turn_off` under one percent or `light.turn_on` with `brightness_pct` on the lit ids (or all when none), or `turn_on` with `color_temp_kelvin` on the bulbs that support it; the toast `lights.setByHand` when Auto was left.
- `link(area, partner, areas, pairs)`: the new pair list (the two rooms' old pairs removed), the system-data write (`light_links`), then the copy: if nothing lit in this room, turn the partner off when lit; else `turn_on` the partner's colour-capable bulbs with brightness and kelvin when this room's colour was set by hand, the rest with brightness. `unlink(area, pairs)`.

Each has a test as a table of inputs → calls; this is user story 11.

### The elements

- **`<hp-lights-pane>`**: `active`; `StoreController({ids: s => lightIds(s)})`; `SystemDataController(api, 'home_panel')` for `light_order` and `light_links` (read on connect and when the generation changes with `stale: false`, as `loadLightOrder` does; `set()` writes through and notifies); `<hp-pane-header icon="bulb" color="var(--warn)">` with the actions slot holding `<hp-light-arrange-bar>`? No: the bar is two `.more` buttons (Reset order, Arrange) rendered by the pane into the header's `actions` slot (the pane-header element of #167 exposes it); `<hp-al-strip>` when any area has a switch; the `.lrows` (tablet) or `.ltiles` grid (phone) of `<hp-light-tile>` and `<hp-light-pair>` (`repeat` by key); `editing` as element state toggles the `ledit` class and the bar's text.
- **`<hp-light-tile>`**: the `.lcell` with `role="button"`, the `--lc` tint, the `button.lbulb[role=switch]` (dispatches `area-toggle`), the text and the link tag, the chevron and the grip; a tap on the tile (not the bulb) dispatches `SheetRequestEvent('lights.room', {key})`; Enter and Space on the tile open the sheet; taps are blocked while arranging (the pane sets `editing` on each tile).
- **`<hp-al-strip>`**: the `.top` line and the `.alstrip` with the gradient from `alStripLayout`, the now mark, the sun marks (labels hidden on the phone), the hour marks; `TickController(60_000)` moves the now mark.
- **`<hp-light-sheet>`** (pull request 2): `<hp-sheet id="lights.room">` with the power button in the header (`.lpwr[role=switch]`, dispatching `area-toggle`), the `Done` close, the `.lpills` with two `<hp-light-slider>` (brightness 0 to 100 in percent; colour in kelvin between the range's min and max in 50 K steps, with the `night` look when Night is on), the `.lgrp` of Auto and Night rows with `<hp-switch>`, the bulb chips (`aria-pressed`, `toggleOne`), the Linked with row (disabled for a non-admin) that swaps the body for `<hp-link-picker>` (the radio list with Back, focus moved as `lightCmd('pick')` does).
- **`<hp-light-slider>`**: `role="slider"` with `aria-valuemin/max/now/text`, `value`, `min`, `max`, `step`, `kind: 'brightness' | 'kelvin'`, `off`, `night`, `disabled`; pointer capture on `pointerdown`, the finger's height as the value (`lpVal`), the fill `--v` and the big value painted locally during the drag (`lpPaint`) without a store update, `change` dispatched once on `pointerup` with the value (a tap is a down and up at one point); arrow keys step by ten percent or 100 K and dispatch `change`; the host runs the command. During a drag the sheet's `StoreController` is paused so a `hass` update cannot redraw under the finger (today's `lightDrag` flag), and resumed 60 ms after the drop as the class does.
- **`DragReorderController`** (pull request 3, `src/ui/controllers/drag-reorder.ts`): `constructor(host, {container: () => HTMLElement, enabled: () => boolean, keyOf: (unit) => string, onReorder: (keys: string[]) => void})`; `pointerdown` on a unit lifts it (the `lifted` class, pointer capture), `pointermove` moves the dragged unit before or after the unit under the pointer (`elementFromPoint` through the host's shadow root) and translates it under the finger, auto-scrolls near the top and bottom, `pointerup`/`pointercancel` drop it and call `onReorder` with the keys when they changed; arrow keys move the focused unit and call `onReorder`; while enabled, clicks inside units are stopped in the capture phase. The pane uses it with `enabled: () => this.editing` and `onReorder: keys => sysdata.set({light_order: keys})` (the toast `lights.orderSaved`), and Reset writes `light_order: null` (`lights.orderReset`). The controller is the kit's first drag-and-drop and is tested by `lights-arrange.spec.ts` (checks 37 to 39) through the harness.

### Styles and strings

- `src/css/lights.css` (591 lines) becomes `src/features/lights/styles.css`, split per element where the element adopts it (`.lcell`, `.lbulb`, `.lchev`, `.lgrip`, `.llink`, `.lrows`, `.ltiles` for the tiles; `.lpwr`, `.ldone`, `.lsbody`, `.lpills`, `.lpc`, `.lpill` and its parts, `.lpv`, `.lgrp`, `.lgr`, `.lgi`, `.lchip`, `.lchips`, `.lcl`, `.lpkh`, `.lback`, `.lopt`, `.lck`, `.lnow`, `.lfoot` for the sheet; `.alstrip`, `.algrad`, `.alnow`, `.almark`, `.alh` for the strip, from `extra.css` ~621 to 720 and `tabs.css`); `.app.cp` → `:host([compact])`, `.app.gl` → `:host([glass])`, `.ledit .lcell .lchev` → `:host([editing]) .lchev`. The file leaves the legacy set in pull request 3 (the footprint drops by one).
- About sixty `lights.*` keys (`title`, `noLights`, `allOff`, `lightsOn` plural, `on` (`{n} of {total} on`), `unavailable`, `off`, `brightness`, `colourTemperature`, `night`, `nightDesc`, `warmWhite`, `coolWhite`, `neutralWhite`, `auto`, `autoDesc`, `bulbs`, `linkedWith`, `linkedDesc`, `adminOnly`, `movesWith`, `none`, `noneDesc`, `nowWith`, `linkWith`, `linkFoot`, `back`, `done`, `arrange`, `resetOrder`, `orderSaved`, `orderReset`, `roomsLinked`, `roomUnlinked`, `couldNotSaveOrder`, `couldNotSaveLink`, `autoOn`, `autoOff`, `nightOn`, `nightOff`, `setByHand`, `adaptiveToday`, `nowKelvin`, `onEverywhere`, `onIn` (`on in {n} of {total}`), `offEverywhere`, `sunrise`, `noon`, `sunset`, `otherLights`), French from the map's entries (`src/i18n/fr.js` ~760 to 800, 1195 to 1210, 1278 to 1290), listed in `test/unit/fixtures/moved/lights.json`.

### Deletion and grep gates

Pull request 1 deletes `lightAreas`, `lightLinkList`, `loadLightOrder`, `saveLightOrder`, `saveLightLinks`, `setLightEdit`, `renderLights`, `lightGrid`, `lightState`, `lightMode`, `lightSub`, `lightCell`, `lightTint`, `linkTag`, `linkPair`, `renderLightTiles`, `renderAlBar`, `kelvinRGB`, `shortNames`, `fold`, `LIGHT_ORDER_KEY`, the `'renderLights'` entry of `renderLive`, the `'renderLightTiles'` entry of `renderCompact`, the `'renderAlBar'` entry of `renderTabs`, the `mv('lights', 'lhost')` line, the `#lights` card in `.cols` and its `LAYOUT` entry, `this.lightOrder`, `this.sysData`, `this.lightOrderAsked`, `this.lightEdit`, the `#ledit`/`#lreset` listeners; the sheet and the drag listeners stay. Pull request 2 deletes `openLight`, `renderLightSheet`, `lightPicker`, `lightCmd`, `linkTo`, the sheet's pointer and keyboard listeners (~2000 to 2080), the `sh-light` markup and its `renderLive` branch, `this.lightSel`, `this.lightPick`. Pull request 3 deletes the Arrange drag listeners (~2093 to 2200), `this.lightDrag` and every `lightDrag` check, `pending`, `pend`, `call`, `sw` (no reader remains), `src/css/lights.css`, the French entries.

Gates (after pull request 3): `grep -nE '^  (lightAreas|lightLinkList|loadLightOrder|saveLightOrder|saveLightLinks|setLightEdit|renderLights|lightGrid|lightState|lightMode|lightSub|lightCell|lightTint|linkTag|linkPair|renderLightTiles|renderAlBar|openLight|renderLightSheet|lightPicker|lightCmd|linkTo|pend|call|sw)\(|kelvinRGB|shortNames|LIGHT_ORDER_KEY|lightDrag|this\.pending|sh-light|data-l=' src/home-panel.js` is empty; `ls src/css/lights.css` fails; `grep -nE '\.(alstrip|algrad|alnow|almark|alh)\b' src/css/*.css` is empty; `npm run lint` prints a footprint one lower; the French map lost the listed entries; the class shrinks by about 700 lines, quoted.

### Performance, by construction

- The pane subscribes to the lights, the groups, the switches and the sun; a thermostat change gives zero mutations in its root.
- A slider drag paints locally and sends one call; the sheet's store subscription is paused during the drag and resumed after, so a `hass` update during a drag costs nothing and cannot move the finger's value.
- The tiles are `repeat`-keyed by area key, so a brightness change updates one tile's text and tint; the class rebuilt the whole grid.
- The system data is read once per generation and written through; the class re-read it on every load.

## Acceptance Criteria

Pull request 1, the providers, the model and the tiles:

1. `src/providers/{light-areas,adaptive-lighting}.ts`, `src/features/lights/{README.md,index.ts,ids.ts,inputs.ts,order.ts,state.ts,model.ts,al-strip-layout.ts,lights-pane.ts,light-tile.ts,light-pair.ts,al-strip.ts,styles.css}`, `src/ui/controllers/system-data.ts` exist with headers; `FEATURES` has `lightsFeature`; `kelvinRGB` is in `src/core/color.ts`.
2. Vitest: `lightAreas` against the test house (one tile per kitchen group, the Sink bulb's own lights, no split → one tile, "Other lights" last, hidden and diagnostic exclusions, a device's area), `shortNames`, `adaptiveSwitch` (the four matching rules in order), `alMode` (Auto, Night, Manual, none), `applyLinks` (a pair moved beside, a room in two pairs keeps the first), `applyOrder` (a pair as one unit, unknown tiles last, an empty order), `linkPairs` (system data wins; a config pair's switch), `areaState` (the mean brightness, the 50 K steps, the tint rules), `alStripLayout` (the parabola at sunrise, noon and sunset; the night mix), `lightsModel` in `en` and `fr`; 100 percent statements.
3. Playwright: `lights-tiles.spec.ts` (22 to 25) and `lights-links.spec.ts` (32, 35 for the tiles' part) pass; the Arrange bar shows in the header's actions slot for an admin and is hidden otherwise (check 39); a thermostat change gives zero mutations in `hp-lights-pane`'s root; axe clean.
4. Every baseline identical (`lights-*` eight, `bare-lights-*`); the French equivalence test passes for `test/unit/fixtures/moved/lights.json`; `npm run check`, `npm test -- --coverage`, `npm run lint` green; changeset (patch): "The Lights tab is redrawn with the same look. Nothing visible changes."

Pull request 2, the sheet:

5. `<hp-light-sheet>`, `<hp-light-slider>`, `<hp-link-picker>`, `commands.ts` exist; Vitest covers every command as a table (the resume and leave-Auto side rules, the copy onto a partner with and without a hand-set colour, the under-one-percent rule, the colour-capable filter); `runCommands` in the kit runs a list in order and releases the list's holds on a failure.
6. Playwright: `lights-sheet.spec.ts` (26 to 31) and `lights-links.spec.ts` (33, 34, 36) pass unchanged; a `hass` update during a slider drag does not move the slider (a new case: `window.house.setState` on the room's light mid-drag, the value stays the finger's); the `light-sheet-*` baselines identical; axe clean on the sheet (the sliders' roles and names).

Pull request 3, Arrange and the deletion:

7. `src/ui/controllers/drag-reorder.ts` exists with its header; `lights-arrange.spec.ts` (37 to 39) passes unchanged, plus a keyboard case (ArrowDown moves the focused tile and saves); the grep gates hold; `src/css/lights.css` is gone and the footprint dropped by one; `grep -n 'this.pending\|pend(\|call(\|sw(' src/home-panel.js` is empty; the styles-split test passes; the French map lost the listed entries; every baseline identical; all suites green; changeset (patch): "Internal tidying of the Lights controls. Nothing visible changes."

## Testing Decisions

The seams are the two of ADR 0005. The four Lights suites are the richest behaviour tests in the panel and they pass unchanged, which is the proof of the move; the providers, the order, the state, the commands table and the strip layout are the pure seam. New in kind: the mid-drag `hass` update case (the pause rule as a test), and commands as tables. Prior art: `lights-sheet.spec.ts` for "one call per drag", `climate.spec.ts` for the dial's pointer tests.

## Out of Scope

- Scenes and routines (Media's), the Home pane's Lights tile (spec 24 reads `lightsSummary`), the stack's "Lights unreachable" card (spec 24 reads the provider).
- Colour (hue and saturation) control: the sheet has brightness and colour temperature only, as today.
- Promoting `<hp-light-slider>` to the kit: one user; the note says what would promote it.

## Notes

- **Why the areas are a provider and Adaptive Lighting another.** The Home pane's Lights tile and the stack's "Lights unreachable" card (spec 24) need the areas; the area grouping names no integration but turns registry data into generic inputs, which the glossary's definition covers; the Adaptive Lighting rules name an integration and sit on their own.
- **Why `<hp-light-slider>` stays in the feature.** It is Apple Home's tall pill, used twice in one sheet and nowhere else; a generic vertical slider would need a second shape (the volume? no, that is a stepper) to be a kit element.
- **Why the order stays in system data and not in the settings module.** The settings module is per device (`localStorage`); the order is for every screen in the house and only admins may write it, which is what `frontend/set_system_data` gives. `SystemDataController` is the kit's wrapper because the links share it and a later feature (the scenes' order) will too.
- **Why `pending` leaves here.** Lights was its last reader only in name: `lightCmd` never held a value; after spec 21 nothing reads the bag, and this spec deletes it with the file that still declared it.
- **Reading**: Apple HIG, _Sliders_ and _Drag and drop_; Lit docs, _Events_ (pointer capture, composed paths); Home Assistant developer docs, _Light entity_ (`brightness_pct`, `color_temp_kelvin`, `supported_color_modes`), light groups, `frontend/get_system_data`; Adaptive Lighting's `set_manual_control` and `configured_lights`.
