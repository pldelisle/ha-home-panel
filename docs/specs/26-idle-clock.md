# Spec 26: The idle clock, the last move: the shell's idle screen composed from the clock feature and the smart stack, then the class is deleted

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 3.
Depends on: [14 Lit shell](14-lit-shell.md) step D (the `IdleTimer` controller owns idle; the guest draws the clock), [15 Weather](15-weather.md) (`weatherIcon`, `sunTimes`, the weather provider's condition), [19 Energy](19-energy.md) (`powerNow` for the inside temperature), [24 Home](24-home.md) (`features/stack/` and `<hp-smart-stack>`). Blocks: the phase gate (#188).
Ships as: two pull requests, each a patch release, each pixel-identical. ADR 0029 (the guest is gone) lands with the second.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

The idle clock is what a wall tablet shows most of the day: after five minutes without a touch the shell's `IdleTimer` (spec 14 D) sets `idle`, and the guest draws into `#iwrap` (`renderIdle`, ~1364): the time in the profile's format (`16 h 07` in French), the long date, the inside and outside temperatures, the weather icon for the condition by day or night, the next sunrise or sunset, and, when the config's smart stack is on, one stack card beside the clock (a `.ss` shell with `#iclk` and `#istk`) or the clock alone (`.solo`); the block drifts by up to 20 px sideways and 15 px up or down on every tick so the screen never shows the same pixels for hours; a 20-second interval redraws it. The stack's cards (`stackCards`) and their rotation (`pickStack` in `src/stack.js`) are the Home move's (spec 24, `features/stack/`), so this spec consumes them.

After specs 15 to 25 the class holds the idle clock, the guest's plumbing (`connect`, `disconnect`, the five lifecycle methods, `build()` with the containers, `set`, `$`, `css`, `dark`, the French observer's start and stop, `toast`, `swipeToClose`, `tick` and `renderLive` with an empty list, `wire()` with the idle overlay's listeners), `src/legacy/globals.js`, `src/styles.js`'s concatenation of what is left of `src/css/`, `src/fonts.js`, `src/stack.js` (moved by spec 24), `src/types.d.ts`, `src/env.d.ts`, `src/i18n/fr.js` (phase 4's), `src/charts/` (the ApexCharts chunk loader, replaced by `<hp-chart>`'s). The last move is the clock; then the class, the guest interface and the methods-exist test are deleted, which is the gate's audit (#188).

## Solution

In two pull requests:

1. **The clock feature and the idle screen.** `src/features/clock/` draws the clock, the date, the temperatures, the weather icon and the next sun event from `clockModel` over the providers; `src/shell/idle-screen.ts` composes `<hp-idle-screen>` from `<hp-clock>` and `<hp-smart-stack>` (spec 24) with the drift as a shell rule, rendered by the shell inside the `.idle` overlay that `IdleTimer` already toggles; the guest's `renderIdle`, its 20-second interval and `idleChanged` go.
2. **The guest is deleted.** `src/home-panel.js`, `src/legacy/`, `src/charts/`, `src/styles.js`'s legacy concatenation (what remains of `src/css/` is either moved into the kit or deleted as dead), `src/types.d.ts`, `src/shell/guest.ts` with `registerGuest` and the `.guest` container, `test/unit/methods.test.mjs`, the legacy-only entries of `.dependency-cruiser.cjs` and `scripts/legacy-set.cjs`; `src/main.js` defines the element and nothing else; the French rewrite layer (`src/i18n/fr.js` and its observer) is kept for phase 4 but has no DOM to observe until then, so its start is removed from the shell and the module is listed as phase 4's; ADR 0029 records the end of the strangler fig.

Each pull request leaves every baseline identical (`idle-stack-*`, and every other).

## User Stories

1. As a household member, I want the idle clock, its date and temperatures, the weather icon, the next sun event and the stack card beside it to look exactly as before, and the block to keep drifting, so that the move is invisible.
2. As a French-speaking user, I want the clock in `16 h 07` and the date as `samedi 7 novembre`, from the catalog's formatters, so that the last French strings leave the map.
3. As a maintainer, I want the idle screen to be a composition in the shell (the clock feature beside the stack feature), so that ADR 0017's rule holds at the end as it did for Home.
4. As a maintainer, I want the clock's text as a pure model at a given instant, tested in both languages, so that the one view the tablet shows all day is pinned.
5. As a maintainer, I want the drift to be a pure function of a seed and the tick, so that the "never further than 20 px" rule of `idle.spec.ts` is a unit fact too.
6. As a maintainer, I want the class, the guest interface, the registration and the methods-exist test deleted in one pull request, with the legacy footprint at zero, so that phase 3's gate is reachable.
7. As a learner, I want ADR 0029 to tell the story of the strangler fig in numbers (the footprint on each release, the lines deleted per move), so that the method is recorded with its outcome.

## Implementation Decisions

### The folder

```
src/features/clock/
  README.md
  index.ts                 exports <hp-clock>; no descriptor (the idle screen, not a pane)
  ids.ts                   clockIds(store): the sun, the two sun sensors, the weather and condition entities, every room's temperature source
  model.ts                 clockModel(inputs, deps): ClockViewModel
  clock.ts                 <hp-clock>
  styles.css               .iclock, .idate, .itemps, .iclk2, .isun, .iwx (from tabs.css ~1436 to 1475)
src/shell/
  idle-screen.ts           <hp-idle-screen>: the .idle overlay's content; composes <hp-clock> and <hp-smart-stack>; the drift
  drift.ts                 drift(tick: number, seed: number): {x, y} (|x| ≤ 20, |y| ≤ 15), pure
test/unit/features/clock/model.test.ts, test/unit/shell/drift.test.ts
test/e2e/idle.spec.ts (unchanged), smart-stack.spec.ts (unchanged)
```

### The model

```ts
export interface ClockInputs {
  now: number;
  sunUp: boolean; sunrise: number | null; sunset: number | null; tomorrowSunrise: number | null; // from sunTimes(lat, lon, isoDay) today and tomorrow, as sunDay(0) and sunDay(1) did
  inside: number | null; // the mean of the rooms' temperatures (powerNow)
  outside: number | null; // the weather entity's temperature, else the outdoor sensor (the weather provider's inputs)
  condition: string | null; // the condition sensor's state, else the weather entity's
}
export interface ClockViewModel {
  time: {main: string; suffix: string}; // "4:07" + "pm" in English (fmt.time split on the space), "16 h 07" + "" in French (fmt.time24)
  date: string; // fmt.dateLong
  temps: string | null; // "20.8° inside · 3.1° outside"
  icon: {condition: string; day: boolean} | null; // weatherIcon(condition, 120, day)
  nextSun: {label: string; time: string} | null; // "Sunrise 7:02 am"
}
export function clockModel(inputs: ClockInputs, deps: {t: Translate; fmt: Formatters; isFrench: boolean}): ClockViewModel;
```

- The French rule (`time24` and the profile's long date) is the formatters' (spec 11); the model only picks which formatter, as `renderIdle` does with `fr ? this.fmt : this.fmtEn`. The equivalence test over `test/unit/fixtures/moved/clock.json` covers the words (`inside`, `outside`, `Sunrise`, `Sunset`).

### The elements and the composition

- **`<hp-clock>`**: `StoreController({ids: s => clockIds(s)})`; `TickController(20_000)` (the clock's minute changes come from the tick, as today's 20-second interval; the store notifies the rest); renders the `.iclk2` with the icon (`weatherIcon` from the kit) and the `.iclock.num` (main and small suffix), the `.idate`, the `.itemps`, the `.isun`. Paused when the overlay is hidden (the idle screen sets `active`).
- **`<hp-idle-screen>`** (`src/shell/idle-screen.ts`): property `idle: IdleState` from the shell; renders the `.ss` layout (`.ssc` with `<hp-clock>` and `.ssk` with `<hp-smart-stack mode="idle">`) when the stack has a card, else the clock alone (the `solo` class), with the `.scw`, `.speek` and `.sdots` the stack element draws for itself; the **drift**: on every clock tick the shell applies `transform: translate(x, y)` to the `.iwrap` box from `drift(tick, seed)`, a pure function (a small LCG over the tick and a per-connection seed) bounded to ±20 and ±15, replacing `Math.random()` so `idle.spec.ts`'s check 40 holds and a unit test proves the bounds; the composition rule from ADR 0017 is in the header: the shell imports `features/clock` and `features/stack` and lays them out; neither imports the other.
- The shell's template: the `.idle` overlay (`hidden` and `wake` from `IdleTimer`, spec 14 D) holds `<hp-idle-screen .idle=${state}>`; `#iwrap` and the guest's `idleChanged` go.
- A tap on the stack's card wakes the panel and opens what the card is about (`stackGo`, spec 24's `<hp-smart-stack>` dispatches `tab-select`, `SheetRequestEvent` or a sensor history request; the idle timer's `waking` state swallows the tap that woke the screen, as today: check 9 and check 19 of the specs).

### The deletion (pull request 2)

- `src/home-panel.js`: deleted. Before the deletion the pull request lists what the file still held (the clock's render, the guest's lifecycle, `build()`'s remaining containers, `set`, `$`, `css`, `dark`, `frStart`/`frStop`, `toast`, `swipeToClose`, `tick`, `renderLive`, `wire()`'s idle listeners) and where each went: the toast is `<hp-toast>` in the kit (the shell renders it from `ToastEvent`; its `.toast` rules move; the sticky and dismiss rules as today; this is the one new element of the pull request, with `toast()`'s 3.5-second rule as a tested pure schedule), `swipeToClose` is the sheet host's (spec 14 E) already or is added there (a phone's swipe down on a sheet closes it), the French observer's start moves to… nowhere: phase 4 replaces the rewrite layer with the catalogs, and until then the layer has nothing to observe (every string is a catalog's); `src/i18n/fr.js` stays in the repository as phase 4's input and is excluded from the build (`src/main.js` no longer imports it; the equivalence tests import it directly), so the shipped bundle shrinks by its size, quoted.
- `src/legacy/globals.js` (`ok`, `esc`, `plural`, `tile`, `cap`): deleted; any remaining use was moved into the core (`ok` is `isAvailable` in `src/core/hass.ts` already) or became a key.
- `src/charts/` (the legacy ApexCharts loader): deleted; `<hp-chart>` has its own.
- `src/styles.js` and `src/css/`: what remains in `src/css/` after the moves is checked rule by rule: a rule the kit or a feature needs was moved by its spec; what is left is dead and is deleted with the file; `src/styles.js` goes; the shell's `static styles` is the kit's sheets only. `src/fonts.js` moves to `src/ui/fonts.ts` (the Montserrat `@font-face` rules; `fonts.test.mjs` adjusted).
- `src/shell/guest.ts`, `registerGuest`, `createGuest`, the `.guest` container and every `guest.*` call in the shell, `legacy-feature.ts` (no legacy descriptor remains), the `LegacySheet` registration in the sheet host: deleted. `src/main.js`: `import {HomePanel} from './shell/home-panel.ts'; if (!customElements.get('home-panel')) customElements.define('home-panel', HomePanel);` and the version log line.
- `test/unit/methods.test.mjs`, `tsconfig.legacy.json`, `scripts/legacy-set.cjs` (the set is empty; the lint's footprint line prints 0 from an empty set, then the script and the line go in the gate), the legacy rules of `.dependency-cruiser.cjs` (`not-to-legacy`, the legacy-to-providers and legacy-to-automations allowances), `test/unit/architecture.test.mjs`'s legacy half: deleted or reduced; `scripts/arch-graph.mjs`'s legacy collapse: removed.
- ADR 0029, "The guest is gone": the date, the footprint by release (from the changelog), the lines of `src/home-panel.js` at the start of phase 3 and after each move (quoted from the pull requests), the bundle size before and after, what the strangler fig cost (the bridge, the allowances, the duplicated rules listed per spec) and what it bought (a panel that never went dark, baselines that never changed except by approval).

### Strings and styles

- About ten `clock.*` keys (`inside`, `outside`, `sunrise`, `sunset`) and the toast's `common.dismiss`; French from the map's last entries, listed in `test/unit/fixtures/moved/clock.json`; after this spec the equivalence fixtures cover every catalog entry introduced in phase 3, which is what phase 4 starts from.
- `src/features/clock/styles.css` receives the `.idle .iclock`, `.idate`, `.itemps`, `.iclk2`, `.isun`, `.iwx` rules; `src/shell/idle-screen.css` receives `.idle`, `.idle[hidden]`, `.idle.wake`, `.iwrap`, `.ss`, `.ssc`, `.ssk` (`tabs.css` ~1415 to 1490); the stack's rules are spec 24's; `.toast` goes to `src/ui/styles/toast.css`.

### Deletion gates

After pull request 2: `ls src/home-panel.js src/auto.js src/legacy src/charts src/styles.js src/shell/guest.ts src/shell/legacy-feature.ts test/unit/methods.test.mjs` fails for every path; `grep -rn 'innerHTML\|insertAdjacentHTML' src/` is empty; `grep -rn 'registerGuest\|GuestRenderer\|LegacySheet' src/` is empty; `npm run lint` prints `legacy footprint: 0 modules`; `du -b dist/home-panel.js` is quoted beside the start-of-phase figure; the French map is not in `dist/`.

### Performance, by construction

- The idle screen subscribes to the clock's ids (the sun, the weather, the rooms' temperatures) and the stack's; the rest of the house changes nothing on an idle tablet.
- The clock ticks every twenty seconds; the stack rotates on its own `STACK_TURN_MS`; the drift is one transform write per tick; nothing else runs while idle, which the class could not say (`renderLive` ran every second with an empty `.app.idle` behind the overlay).
- With the class gone, the shell's `hass` update is: the store diffs, the subscribers for the changed ids update, nothing else. The pull request quotes the mutation count of a thermostat change across the whole root (the spec 14 observer with the selector `home-panel`): the Climate pane's and nothing else.

## Acceptance Criteria

Pull request 1, the clock feature and the idle screen:

1. `src/features/clock/{README.md,index.ts,ids.ts,model.ts,clock.ts,styles.css}`, `src/shell/idle-screen.ts`, `src/shell/drift.ts` exist with headers; the shell renders `<hp-idle-screen>` inside the `.idle` overlay; `renderIdle`, the 20-second interval, `#iwrap`'s guest write and `idleChanged` are gone from the class and the guest interface.
2. Vitest: `clockModel` at a known instant in `en` and `fr` (the time split, the French `16 h 07`, the long date, the temps line, the icon's day flag, the next sun event across the three cases), `drift` (bounds over ten thousand ticks, determinism per seed); 100 percent statements.
3. Playwright: `idle.spec.ts` checks 8, 9 and 40 and `smart-stack.spec.ts` checks 18 to 21 pass unchanged; the `idle-stack-*` baselines identical; axe clean on the idle screen (`aria-hidden` on the overlay as today).
4. Every baseline identical; the French equivalence test passes for `test/unit/fixtures/moved/clock.json`; `npm run check`, `npm test -- --coverage`, `npm run lint` green; changeset (patch): "The idle clock is redrawn with the same look. Nothing visible changes."

Pull request 2, the guest is deleted:

5. The deletion gates hold; `<hp-toast>` exists in the kit with the 3.5-second and sticky rules tested; `src/main.js` is the two lines above; `src/fonts.js` became `src/ui/fonts.ts`; `src/i18n/fr.js` is out of the bundle and still read by the equivalence tests.
6. Every baseline identical; every behaviour suite green; the two-panel spec green; `npm run lint` prints a footprint of 0; `npm run check` has no legacy tsconfig; the bundle size is quoted against the phase's start.
7. ADR 0029 accepted with its numbers; the programme spec's status line says the shell is complete and the class is gone; `docs/architecture.md`'s layer table has no legacy row and its strangler section is past tense; changeset (patch): "Internal: the last of the old code is gone. Nothing visible changes."

## Testing Decisions

The seams are the two of ADR 0005. New in kind: nothing; the clock is the simplest model of the phase, and the deletion is proven by the whole suite and the gates. The drift becoming deterministic per seed is a test improvement that the baselines cannot see (the screenshot of the idle screen was taken at a fixed tick; the pull request checks that the fixture's seed reproduces today's offset or re-records `idle-stack-*` as a new baseline if the offset differs, saying so). Prior art: `idle.spec.ts` check 40 for the bounds, `smart-stack.spec.ts` for the rotation.

## Out of Scope

- The French rewrite layer's deletion: phase 4 (spec 27) replaces the map with the catalogs; this spec only stops shipping it.
- A redesign of the idle screen, a screensaver mode, or a photo frame.
- The gate's audit itself: #188 verifies this spec's result and closes the phase.

## Notes

- **Why the clock is a feature and the idle screen a shell composition.** The clock reads the weather, the sun and the rooms, which are three providers; the stack is another feature; ADR 0017 says two features meet at the root. The idle screen is the second composition after Home, and the shape is the same.
- **Why the drift becomes deterministic.** `Math.random()` in a render is a hidden input; a seeded function has the same effect on the screen and a provable bound, and it keeps the baselines stable by construction instead of by a fixed clock alone.
- **Why the French map stays in the repository.** It is phase 4's input: the catalogs' French came from it, the equivalence tests prove they still agree, and spec 27 deletes it when the catalogs are the only source. Shipping it is what stops here.
- **Reading**: Fowler, _Strangler Fig Application_ (the end state); Meszaros, _xUnit Test Patterns_ (the humble object, now the whole panel); Apple HIG, _Always-on displays_ (the drift's purpose).
