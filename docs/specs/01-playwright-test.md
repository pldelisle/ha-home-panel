# Spec 01: Playwright Test replaces the smoke script

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 0.
Depends on: nothing. Blocks: [02 screenshot baselines](02-screenshot-baselines.md), [03 lint and format](03-lint-and-format.md).
Ships as: one pull request, a patch release, no visible change.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

The end-to-end test is a single 288-line script that opens the test house in Chromium, clicks through the tabs and runs about seventy assertions in sequence. It has three weaknesses the migration will expose:

- It drives the panel by calling its methods (`idleStart`, `idleArm`, `renderLive`, `renderHome`, `renderIdle`, `setTab`, `stackGo`, `openLight`) and reading its fields (`tab`, `open`). Every one of these disappears when the class is rewritten, so the test would break on a correct refactor.
- It is one process with hand-rolled reporting, no retries, no per-test isolation, no trace on failure and no parallelism. A failure late in the script hides anything after it.
- It has no notion of a screenshot assertion, which the next spec needs.

## Solution

Convert the script to Playwright Test: a configuration, a static server for the test house, a shared `house` fixture that sets up a page the way Home Assistant would, and one spec file per subject. Every assertion the script makes today has a counterpart. Every method call into the panel is replaced by what a person would do (tap, drag, press a key) or by what Home Assistant would do (hand the panel a new `hass`, let time pass).

## User Stories

1. As a maintainer, I want every current end-to-end check preserved, so that the conversion loses no coverage.
2. As a maintainer, I want the tests to drive the panel only through its public boundary (`hass`, `panel.config`, `narrow`, the DOM a person touches), so that the Lit rewrite does not break them.
3. As a maintainer, I want each check in its own test with its own page, so that one failure does not hide the next.
4. As a maintainer, I want a trace, a screenshot and the console log attached to every failure, so that I can see what the panel did without re-running locally.
5. As an agent thread, I want to run one spec file for the feature I am touching, so that the feedback loop is seconds, not minutes.
6. As CI, I want the suite to run in parallel workers with retries on flakes, so that the pipeline is fast and stable.
7. As a maintainer, I want the test house unchanged as a house, so that the panel is still exercised against the same entities.

## Implementation Decisions

### Dependencies and scripts

- `@playwright/test` replaces the `playwright` dev dependency, at the same version line (1.63.x) pinned exactly.
- `npm run test:e2e` MUST build and then run `playwright test`. `npm run test:e2e -- <file>` MUST run one spec.
- CI MUST run `npx playwright test` (the tablet and phone projects) and MUST upload the `test-results/` directory as an artifact when the job fails. It originally ran `npx playwright install --with-deps chromium` first; spec 02 supersedes that: the job runs inside the Playwright image for the pinned version, which already provides the browsers.

### Configuration

- A `playwright.config.ts` at the repo root (Playwright runs TypeScript configs natively, no compiler setup is needed). It MUST declare:
  - `webServer`: a static server script that serves `/panel/*` from `dist/` and everything else from `test/e2e/`, on a port Playwright chooses, with `reuseExistingServer` on locally.
  - Two projects: `tablet` with viewport 1180×820 and `phone` with viewport 393×852. Both with `deviceScaleFactor: 1`, `timezoneId: 'America/Toronto'`, `reducedMotion: 'reduce'`, `locale: 'en-CA'`.
  - `trace: 'retain-on-failure'`, `screenshot: 'only-on-failure'`, `video: 'off'`.
  - `retries: 2` in CI, `0` locally. `workers`: default locally, `2` in CI.
  - `testDir: 'test/e2e'`, `testMatch: '**/*.spec.ts'`.
- The current `smoke.mjs` MUST be deleted at the end of this PR. The `test/e2e/out/` directory and its `.gitignore` entry MUST be removed.

### The `house` fixture

A single fixture file exports `test` and `expect` extended with a `house` fixture. A spec calls `test.use({ house: { ... } })` or passes options per test. The fixture MUST:

- Accept options: `house: 'full' | 'bare'` (default `full`), `cfg` (the panel config object, default none), `lang: 'en' | 'fr'` (default `en`), `theme: 'light' | 'dark'` (default `light`), `admin: boolean` (default `true`), `time` (an ISO string; when given, the fixture installs Playwright's fake clock at that instant before navigation), `sysdata` (an object preset as the frontend system data).
- Before navigation: add an init script that sets `window.PANEL_CFG`, `window.SYSDATA` and `localStorage['home-panel-theme']`; abort any request to `fonts.googleapis.com` or `fonts.gstatic.com`; record every `pageerror` and every console `error` (except failed resource loads and the blocked font); record console lines starting with `SERVICE ` into `house.calls` and lines starting with `WS ` (parsed as JSON) into `house.ws`.
- Navigate to `/?house=<house>&lang=<lang>&admin=<0|1>` and wait until the panel's rail exists.
- Expose on `house`: `page`, `calls`, `ws`, `root()` (a locator for the panel's shadow root), `tab(name)` (taps the rail or phone-bar button for that tab and waits for its pane to be visible), `setState(entityId, patch)` (see below), `setStateSince(entityId, patch, agoMs)` (the same, with `last_changed` set `agoMs` before now on the page's own clock, which a faked clock moves), `clock` (the page clock helpers).
- After the test body: assert that no page error was recorded. This replaces the script's `errors` check and runs for every test.

### Harness helpers

`harness.html` is the test's side of the boundary and MAY change. It MUST gain a `window.house` object with:

- `setState(entityId, patch)`: shallow-merges `patch` into the state object for that entity (a new object, not a mutation of the old one), then assigns a new `hass` object to the panel element. This is exactly what Home Assistant does on a state change. The fixture's `setState` calls it through `page.evaluate`.
- Nothing else. In particular the harness MUST NOT expose panel methods or render triggers.

The panel element itself MUST NOT gain any test-only method, property or attribute in this PR, and no file under `src/` is modified.

### Replacing method calls with actions

| Script does today                                                                          | Spec does instead                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idleStart()`                                                                              | `house.clock.fastForward(5 * 60_000 + 1000)` with the fake clock installed; the idle overlay becomes visible by itself                                                                                           |
| `idleArm()` after idle                                                                     | tap the idle overlay (what a person does to wake the tablet)                                                                                                                                                     |
| mutate `hass.states[...]`, set `P.hass = {...hass}`, call `renderLive()` or `renderHome()` | `house.setState(id, patch)`, then an auto-retrying `expect(...)` on the DOM; the panel's own throttle (once a second) is covered by `expect`'s polling, or by `house.clock.runFor(1100)` when the clock is faked |
| `renderIdle()` between stack cards                                                         | `house.clock.runFor(20_000)`                                                                                                                                                                                     |
| `setTab('home')`                                                                           | `house.tab('home')`                                                                                                                                                                                              |
| `stackGo('sh-car')`                                                                        | tap the stack card                                                                                                                                                                                               |
| `openLight('office')`                                                                      | tap the Office tile                                                                                                                                                                                              |
| read `P.tab`                                                                               | assert `#pane-<tab>` is visible and the other panes are hidden                                                                                                                                                   |
| read `P.open`                                                                              | assert the sheet element (`#sh-light`) is visible or hidden                                                                                                                                                      |

### Spec files and the checks each carries

Every check below exists in the script today and MUST exist after the conversion, on the viewports listed. Selectors MAY keep using today's ids and data attributes (`[data-tab]`, `#pane-*`, `#lsheet`, `.lcell`, `.attchip`, `#attpop`, `#hstk`, `#istk`, `#ledit`, `#ledbar`), which are the stable hooks a person's tap lands on. New tests SHOULD prefer role and accessible-name locators where they exist.

`tabs.spec.ts` (tablet and phone, full and bare house)

1. Every tab button that is not hidden opens a pane that is visible and at least 50 px tall. Tablet tabs: home, lights, climate, weather, car, energy, air, media, cams, auto. Phone tabs: home, lights, climate, car.
2. The Home tab button is the topmost element at its centre (nothing invisible covers it).
3. Full house, tablet: the text "Alex" appears (who's home lists the configured people); the water heater card is visible; the Hilo card is hidden; the Car tab button is visible.
4. Bare house, both viewports: the water heater card, the Hilo card, the Car tab and the Climate tab are hidden. 41. In the bare house, both viewports: nothing the house lacks (the Climate and Car tabs and their Home tiles, the water heater and Hilo cards and the tiles that open them) is shown at the end of any task that changes the panel, from load through a light change that redraws the Home tiles and, on a phone, opening Energy, which draws its Water heater and Hilo rows.
5. French (`lang: 'fr'`), tablet: the rail text matches Accueil, Lumières or Climat. 42. French, both viewports: the Security card on Home reads "toutes les portes fermées · mouvement en cours", with no English word and no colon. 43. French, tablet: the Security pane's line reads "Aucune caméra · toutes les portes fermées · mouvement en cours", same two checks. 44. French, phone: the Security line under More reads "Portes fermées · mouvement en cours", same two checks.
6. Dark theme, tablet: loads with no error (kept as a smoke run until spec 02 makes it a screenshot). 47. Full house, both viewports, under the projects' Reduce Motion: tapping every shown tab starts no transition or animation in the tab bar (the rail on a tablet, the bar on a phone), as `transitionrun` and `animationstart` report in the frame after a tap, and as `getAnimations()` lists them right after it, so an animation still in its delay is caught too (#94, #101). 48. Full house, both viewports, under Reduce Motion: opening the light sheet leaves no animation, no transition and no transition-duration on the sheet or its panel, which on a phone includes the spring up and the spring back after a short drag (#101). 52. Full house, both viewports: every shown tab's pane opens with exactly one heading in its `hp-pane-header`, reading the subject's English title, and the line under it (`[slot=sub]`) is a child of the header in the panel's own root, where the guest writes it by id (#167). 53. The Lights line `#lsub` is such a child, is shown, and changes when a light goes off (`setState`). 54. Phone: the Car heading `#carh2` is a light-DOM child of the header (the slot the guest writes the car's name into) and reads "Car"; 55. with a name in the config it reads that name, which the one heading of the header also shows. 56. French, both viewports: the same headings read Maison, Lumières, Climat, Météo, Voiture, Énergie, Air, Médias, Sécurité and Automatisations.

`media.spec.ts` (tablet) 7. Tapping the TV mute button sends `media_player.volume_mute`; tapping power sends `media_player.turn_off`.

`idle.spec.ts` (tablet) 8. After five minutes without input the idle clock shows, and the weather icon beside the time has the accessible label "Mainly sunny". 9. Tapping the idle overlay wakes the panel and the panes are usable again. 40. With the real `Math.random`, the idle clock block's transform changes between 20-second ticks and stays within 20 px sideways and 15 px up or down (the screenshots pin `Math.random`, so this is the one check of the burn-in drift).

`live-pill.spec.ts` (tablet and phone, full house with the standard config) 10. The status chip is a pill with the `lap` class whose text contains "64%". 11. Tapping it opens the popup with exactly one activity card and the Status checks. 12. Tapping Pause charging sends `switch.turn_off` for the charger pause switch. 13. After `setState` makes the car stop charging and unplug, no status chip is present. 14. After `setState` opens the front door with `last_changed` twenty minutes ago, an attention pill with text matching "needs attention" is present. 15. The Home card's text contains "Who's home" and does not contain "Status" or "All clear". 45. With the glass look on and an attention pill showing, its inline `!` mark has a transparent background (no tinted box) and its round badge a 50% radius. 46. While the car charges and the front door is open, the attention bubble beside the pill is a 999px-radius bubble whose background is neither transparent nor the charging pill's plain glass; with transparency reduced (`prefers-reduced-transparency`) its background is the opaque card colour and it has no backdrop filter. 50. With the glass look on and transparency reduced, the tinted Hilo challenge pill (`.lmain.tint`, shown through `setState` of the challenge sensor to `on`) has no backdrop filter and an opaque background that differs from its glass value read before (#96). 51. The same for the attention pill alone (`.latt.lmain`).

`smart-stack.spec.ts` (fixed time 2026-11-07T23:30:00-05:00) 16. Tablet: the Home card's stack is visible, its card key is `car` or `music`, it shows two dots, and the Home card is no taller than the tiles beside it. 17. Tablet: tapping the stack card opens the Car or Media pane according to the card. 18. Tablet: on the idle clock, the card key alternates between `car` and `music` across two 20-second steps, with two dots, and the clock keeps its weather icon. 19. Tablet: tapping the car card on the idle clock wakes the panel with the Car pane visible. 20. Phone: there is no Home-card stack; on the idle clock the card sits below the clock and inside the viewport. 21. Config `idle_stack: {enabled: false}`: no stack card on the idle clock, and the Home-card stack is hidden.

`lights-tiles.spec.ts` 22. Tablet, config `split_light_areas: ['kitchen']`: the tiles read Island, Sink, Living room, Office in that order; tapping the Sink bulb sends `light.turn_on` naming only the sink bulb. 23. Phone, same config: loads with no error. 24. Tablet, no split: tiles read Kitchen, Living room, Office. 25. Phone: the tile grid has two columns.

`lights-sheet.spec.ts` (tablet) 26. Tapping the right part of the Office tile opens the light sheet and sends no `light.*` call. 27. A mouse drag up the brightness slider sends exactly one `light.turn_on` with `brightness_pct` of 90 or more for the office bulb, and an `adaptive_lighting.set_manual_control` with `manual_control: true`. 28. Tapping near the top of the colour slider sends a `color_temp_kelvin` above 6000. 29. ArrowDown on the focused brightness slider sends `brightness_pct: 86`. 30. The Auto switch sends `switch.turn_off` for the office Adaptive Lighting switch; the Night switch sends `switch.turn_on` for the office sleep-mode switch. 31. Done closes the sheet; Enter on a focused tile opens it.

`lights-links.spec.ts` (config with the kitchen pair on a switch and office linked to living room) 32. Tablet: tiles read Island, Sink, Office, Living room; two linked pairs are shown. 33. Tablet: tapping a linked tile's bulb sends one `light.turn_on` or `light.turn_off` naming both rooms' bulbs. 34. Tablet: the sheet's Linked with row reads "Sink"; opening it lists None, Sink (checked), Office, Living room; choosing None writes `frontend/set_system_data` with key `home_panel` and value `{light_links: [['office', 'living_room']]}` and the kitchen tiles stand apart; choosing Living room writes `light_links: [['light.kitchen_island', 'living_room']]` and sends `light.turn_on` for the living room bulb; Back returns to the room. 35. Phone: two linked blocks; tapping the Island tile's text opens the sheet with a Linked with row. 36. Non-admin (`admin: false`): the Linked with row is disabled.

`lights-arrange.spec.ts` 37. Tablet, admin: Arrange, drag Living room onto Island, and the order becomes Office, Living room, Island, Sink; the last system-data write is `{light_order: ['office', 'light.kitchen_island']}`; no `light.*` call was sent; Done leaves arranging. 38. Phone with `sysdata: {home_panel: {light_order: ['office', 'light.kitchen_island']}}`: tiles follow the saved order. 39. Tablet, non-admin: the Arrange bar is hidden.

### Determinism

- Tests that depend on the time of day MUST install the fake clock through the fixture's `time` option. Tests that do not MUST NOT read the wall clock in assertions.
- Waits MUST be auto-retrying `expect` assertions or clock advances, not fixed sleeps, except where the panel's own throttle requires `clock.runFor`.

## Acceptance Criteria

1. `npm run test:e2e` passes locally and in CI on `main`, with every check numbered 1 to 51 present as a named test.
2. `smoke.mjs` is gone; `test/e2e/out/` is gone; no spec calls a method or reads a property of the `home-panel` element other than setting `hass`, `narrow` and `panel` from the harness.
3. No file under `src/` changed.
4. A deliberately failing assertion in CI produces an uploaded trace and screenshot.
5. `grep -rn "idleStart\|idleArm\|renderLive\|renderHome\|renderIdle\|setTab\|stackGo\|openLight" test/` returns nothing.

## Testing Decisions

This spec is the test infrastructure for the harness seam. Its own verification is that the suite passes and that each old check maps to a new test (the reviewer checks the table above against the deleted script).

## Out of Scope

- Screenshot assertions (spec 02).
- WebKit or Firefox projects.
- Changes to the panel's source.
- New behaviour checks not in the script today.

## Notes

- The idle timer is a five-minute `setTimeout`, so Playwright's `clock.install()` followed by `fastForward` reaches the idle clock without touching the panel.
- The harness's `now` is read at page load; with the fake clock installed before navigation, every made-up curve and `last_changed` becomes deterministic, which spec 02 relies on.
- Playwright version 1.63 is what the repository already pins; do not move it in this PR so that any flake is attributable to the conversion and not to a browser change.
