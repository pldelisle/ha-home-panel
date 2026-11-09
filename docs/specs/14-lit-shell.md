# Spec 14: The Lit shell: one element, one shadow root, a registry of features, and the old class as its guest

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 3.
Depends on: phase 2 complete (the gate of [#120](https://github.com/pldelisle/ha-home-panel/issues/120): the globals gone from the class, `t()` and the formatters on the store, one API client, the config parsed). Step A (axe) and step F (the fixture recorder) depend on nothing and may start now.
Blocks: [15 Weather](15-weather.md) and every later move.
Ships as: six pull requests (A to F below), each a patch release or no release, each pixel-identical to the release before it. ADRs 0016 to 0019 land with steps B, C, D and E.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

The panel's element is the old class. Its shadow root is written once as a 200-line HTML string by `build()`, and everything that is not a pane is a method on the same class: the ten rail tabs and the phone's bar (`renderTabs`, `renderMoreTab`, `renderMore`, `gateTabs`, `setTab`, `placePanels`), the theme, the glass wallpaper and the text size (`applyTheme`, `applyGlass`, `applyText`, `skyWp`, `pageBg`), the settings popup (`renderSettings`), the idle clock's timer (`idleArm`, `idleStart`), the sheets (`show`, `hide`, `buildSheet`, `openInline`, the Escape handler on `window`), the toast, and a 520-line `wire()` that dispatches every click in the panel by `data-*` attribute. Adding a subject means editing `TABS`, `PHONE_TABS`, `TAB_COLOR`, `TAB_SHEET`, `LAYOUT`, `build()`, `renderTabs`, `renderCompact`, `renderPaneSubs`, `gateTabs` and `wire()`.

Phase 3 moves one feature at a time into a Lit element of its own. For that to be possible, something must exist that is neither the old class nor a feature:

- a place for a feature's element to mount, with the store, the API client, the settings and the formatters reaching it without a global and without threading `hass` through every level;
- a rail and a tab bar that switch between panes whether a pane is drawn by the old class or by a new element, and that hide a tab whose house lacks the subject;
- a theme, a compact and a narrow state that reach into a child element's shadow root, where the old class's `.app.cp` and `.narrow` selectors cannot;
- one owner for the sheets, so that Escape, focus return and "one modal at a time" keep working while some sheets are old markup and some are new elements;
- and the old renderer still drawing everything it has not yet given up, into the same root, pixel for pixel.

Two more things must be in place before the first move. The programme requires axe on every tab and open sheet from the first shell release, and it requires each move to pin today's logic with unit tests against recorded fixtures; neither the axe run nor a fixture recorder exists.

## Solution

Build the shell in six steps, each a pull request and a release, each leaving every baseline untouched:

- **A. axe in the end-to-end run.** `@axe-core/playwright` runs on every shown tab and every opened sheet and popup, on the tablet and the phone; a serious or critical finding fails the run. Any finding on today's panel is fixed or documented before step B.
- **B. The Lit host and its guest.** `<home-panel>` becomes a `LitElement` in `src/shell/home-panel.ts` with reactive `hass`, `narrow` and `panel` properties. It creates the store, the settings, the API client, and provides them through `@lit/context`. The old class stops being an element: it becomes a `GuestRenderer` that the shell constructs and drives, and it draws into a container inside the shell's shadow root. Nothing visible changes.
- **C. The feature registry and the frame.** The shell renders the frame from a registry of feature descriptors: the `.app` wrapper, the header's frame, the rail, the phone's bar and its More sheet, and one `<section class="pane">` per feature, whose content is either a new element or the markup the guest still fills. Tab state, the compact media query, tab availability and the hidden-pane rule move to the shell.
- **D. Appearance and the idle timer.** Theme (light, dark, follows the sun and the device), glass wallpaper and transparency, text size, the page background, the `live` class and the five-minute idle timer become reactive controllers on the shell; the settings popup becomes `<hp-settings-popup>`, the first element whose strings come from the catalog. The idle clock's drawing stays with the guest until its own move.
- **E. The sheet host.** One mediator owns which sheet is open, Escape, focus return, the inline-in-pane placement on the tablet, and the modal placement on the phone. The old sheets register with it as legacy sheets; new features request a sheet by dispatching an event, and the UI kit's `<hp-sheet>` draws it.
- **F. The fixture recorder and one test house.** A script exports states and registries from a real Home Assistant, anonymises them with a mapping kept outside the repository, and writes a fixture every model test can load; the made-up test house's data moves out of `harness.html` into a module that the harness and Vitest share.

Every piece names the pattern it applies and where to read about it, because the owner wants to learn the practice as much as to own the panel. The patterns here are the composition root (Seemann), the humble object (Meszaros), the strangler fig (Fowler), the registry and plugin (Fowler, _Patterns of Enterprise Application Architecture_), the mediator (Gamma et al.), and Lit's own reactive controllers and context.

## User Stories

Actors as in the programme: household member, admin, maintainer, agent thread, adopter, CI, and the owner as a learner.

### Continuity

1. As a household member, I want every tab, sheet, popup, the idle clock and the toast to look and behave exactly as before after each of the six releases, so that the shell's arrival is invisible to me.
2. As a household member, I want my current tab, theme, wallpaper, glass level and text size to survive the release that moves them into the shell, so that the tablet does not reset.
3. As a household member, I want a sheet I have open and a slider I am dragging to stay put when the theme follows the sun at dusk, so that appearance changes never interrupt me.
4. As a maintainer, I want the old class to keep drawing everything it has not given up, through the same ids and the same CSS, so that a move is a deletion from the class and an addition to a folder, never a rewrite of both.

### Mounting and data

5. As a maintainer, I want a feature's element to receive the store, the API client, the settings and the formatters by asking for them, not by importing a module or receiving `hass` from its parent, so that a card three levels deep redraws only when an entity it reads changes.
6. As a maintainer, I want an element to declare the entity ids it reads and be told only about those, so that a thermostat change never touches the weather pane.
7. As a maintainer, I want an element whose pane is hidden to do no work until its pane is shown again, so that a wall tablet on the Home tab does not compute nine other panes all day.
8. As a maintainer, I want the theme, the compact and the narrow state to reach a feature element's shadow root as attributes it can style on, so that the feature's CSS needs no knowledge of the shell's class names.
9. As a maintainer, I want one typed context per service with one provider at the root, so that a test or a storybook-like harness can provide a fake by providing a context value.

### Features as plug-ins

10. As a maintainer, I want adding a subject to the panel to be one folder and one line in a registry, so that no list in the shell has to be edited by hand.
11. As a maintainer, I want the registry to hold what the rail, the phone's bar, the More sheet and the pane header need (key, title key, icon, colour, phone-bar membership, availability), so that the frame is drawn from data.
12. As a household member, I want the Climate and Car tabs hidden in a house without thermostats or a car, exactly as today, so that the panel fits my house.
13. As a maintainer, I want the Home pane and the idle screen to be compositions of feature cards assembled at the composition root, so that no feature imports another and the dependency rule holds.
14. As a maintainer, I want a feature to talk upward only by dispatching events (open a sheet, show a toast) and to receive downward only properties and context, so that a feature never imports the shell.

### Appearance and idle

15. As a household member, I want the theme to follow the device and the sun, the glass to follow my wallpaper choice and the sky, and the text size to follow my iOS setting, as today, so that the shell changes no habit.
16. As a household member, I want the settings popup to read in French when my profile is French, with no English flash, so that the first element with catalog strings is as good as the rest.
17. As a household member, I want the idle clock to come after five minutes without a touch on the tablet and never on the phone, and any touch to wake the panel without pressing what is underneath, as today.
18. As a learner, I want the idle timer written as a small state machine with named states, so that I can read how it behaves without running it.

### Sheets

19. As a household member, I want Escape to close the open sheet, then the Status checks, then the settings popup, as today, so that the keyboard keeps working.
20. As a household member, I want focus to return to the tile that opened a sheet when it closes, so that keyboard and switch access keep working.
21. As a household member, I want the five detail panels inline in their panes on the tablet and modal on the phone, as today, so that the tablet never shows a modal where a pane will do.
22. As a maintainer, I want one owner of "which sheet is open", so that a new element and an old sheet can never both be open.

### Accessibility and tests

23. As a maintainer, I want axe to check every tab and every opened sheet and popup in every end-to-end run, so that a regression in roles, labels or contrast fails CI.
24. As a maintainer, I want a finding that axe makes today either fixed or documented with a reason, so that the gate "axe finds no serious issue" means something.
25. As a maintainer, I want a fixture of my real house, anonymised, in the repository, so that a model test pins what the panel shows for a real day's data.
26. As a maintainer, I want the recorder to refuse to write a fixture that still contains any string from my mapping, so that a real name cannot slip into a public repository.
27. As a maintainer, I want the made-up test house to be one module read by the harness and by Vitest, so that a model test and a screenshot see the same house.
28. As a maintainer, I want a behaviour test that proves a thermostat change causes no mutation in a pane that does not read it, so that the performance claim is a test, not a promise.

### Teaching

29. As a learner, I want each shell module to open with a header naming its pattern and source, and each decision in an ADR, so that reading the shell teaches the composition root, the humble object, the mediator, the registry and reactive controllers.
30. As an agent thread, I want the interface between the shell and the old class written down as a TypeScript interface that only shrinks, so that I know what a move must delete.

## Implementation Decisions

### The shape: one element, one shadow root, two renderers (step B, ADR 0016)

`src/shell/home-panel.ts` defines `HomePanel extends LitElement`, the one element Home Assistant mounts. It is the **composition root** (Seemann, _Dependency Injection Principles, Practices, and Patterns_): the only place that constructs services and wires them together. Its header says so and names the **humble object** (Meszaros): the element holds no logic of its own, it forwards what Home Assistant gives it to the store and renders what the registry says.

- **Properties.** `@property({attribute: false}) hass`, `@property({type: Boolean}) narrow`, `@property({attribute: false}) panel`. In `willUpdate`, when `hass` changed, `store.setHass(hass)`; when `panel` changed, `store.setPanelConfig(panel?.config)`. Lit saves instance properties set before the element is upgraded and replays them, so the replay loop of the old `connectedCallback` is deleted.
- **Services.** The constructor creates `this.store = createStore({defaultTimeZone, resolve: resolveConfig, hour12Default, numberLocaleDefault})`, `this.settings = createSettings(storage)`, `this.api = createApi(this.store)`, exactly as the class does after spec 10 and 12, and provides them: `new ContextProvider(this, {context: storeContext, initialValue: this.store})`, likewise `apiContext` and `settingsContext`. The contexts are declared once in `src/shell/contexts.ts` with `createContext<PanelStore>(Symbol('home-panel.store'))` and so on. The browser's time zone, locale and `localStorage` are read here and nowhere below (the core's rule).
- **The one shadow root.** The shell renders into its own shadow root (Lit's default). Its `static styles` is the legacy stylesheet as a constructed sheet (in step B its text arrives through `registerGuest(factory, css)`, because the shell may not import `src/styles.js` under ADR 0011), then the UI kit's sheets plus what remains of the legacy sheet as the moves split it. Constructed sheets replace the `<style>` tag the class writes today; the rules are the same text, so the pixels are the same.
- **The guest.** The old class becomes `LegacyPanel`, a plain class in `src/home-panel.js` that implements `GuestRenderer` (below) and draws into `<div class="guest" style="display:contents"></div>` that the shell's template holds. `this.shadowRoot` becomes `this.root` (the shell's shadow root, handed in `connect`), `this.$(id)` stays `this.root.getElementById(id)`, `this.isConnected` becomes `this.ctx.host.isConnected`, `connectedCallback`/`disconnectedCallback` become `connect`/`disconnect`, and `set hass`/`set panel`/`set narrow` become `hassChanged`/`panelChanged`. In step B the guest's `build()` still writes everything it writes today, into its container; `display: contents` gives the container no box, so the layout is the same.
- **Why one root and not an element inside an element.** The stylesheet is one sheet with selectors that span the frame and the panes (`.app.cp .pane`, `.tabsv .rail`); the class looks up ids across the whole frame; the French observer watches one root; `placePanels` moves the five detail panels between panes and sheets. Two roots would mean two copies of the sheet, a bridge for every id and two observers. One root means one rule, stated in the header of both files: **Lit binds nothing inside a guest container, and the guest writes nothing outside its containers.** Lit creates the static nodes of a template once and only touches its bound parts afterwards, so nodes the guest inserts into a static container survive every render. The guest containers are listed in `src/shell/guest.ts` and the list only shrinks.
- **Registration without an import.** The architecture test forbids any module but `src/main.js` from importing legacy code, and the shell may not either. So the shell does not import the class: `src/shell/guest.ts` exports `registerGuest(factory: () => GuestRenderer)` and `createGuest()`, and `src/main.js` calls `registerGuest(() => new LegacyPanel())` before defining the element. This is the one piece of module-level mutable state in the shell, it exists for the guest alone, and it is deleted with the guest; its header says so.
- **The guest interface**, in `src/shell/guest.ts`, is the contract the move pull requests shrink. The class implements it structurally (it is JavaScript; the loose type pass checks the shape where `main.js` registers it):

  ```ts
  export interface GuestContext {
    root: ShadowRoot; // the shell's; the guest draws into its containers inside it
    host: HTMLElement; // the <home-panel> element, for isConnected and composed events
    store: PanelStore;
    api: PanelApi;
    settings: PanelSettings;
    shell: ShellForGuest;
  }
  export interface GuestRenderer {
    connect(ctx: GuestContext): void; // once per connection; the guest builds its markup here
    disconnect(): void; // timers, observers, subscriptions down
    hassChanged(change: HassChange): void; // after the store took the new hass
    panelChanged(): void; // after the store took the new config
    // step C
    tabChanged(tab: FeatureKey): void;
    compactChanged(compact: boolean): void;
    availability(): Partial<Record<FeatureKey, boolean>>; // which tabs this house lacks, from lacking()
    moreLine(key: FeatureKey): string | null; // the word under a section in the phone's More sheet
    // step D
    appearanceChanged(a: Appearance): void;
    idleChanged(idle: boolean): void; // the guest draws the clock while the idle feature is its own
    // step E
    sheetOpened(id: LegacySheetId): void; // buildSheet
    sheetClosed(id: LegacySheetId): void;
  }
  export interface ShellForGuest {
    readonly tab: FeatureKey;
    readonly compact: boolean;
    readonly appearance: Appearance;
    setTab(key: FeatureKey): void;
    toast(message: string, sticky?: boolean): void;
    sheets: SheetHost; // step E
    idle: IdleTimer; // step D: start(), arm()
    requestFrame(): void; // the guest's lacking() changed: redraw the rail from availability()
  }
  ```

  Each method's comment says which step adds it and which move deletes it. When the last move lands the interface, the registration and the container are deleted together, and `src/shell/guest.ts` goes with them.

- **The tick.** The guest keeps its `'*'` subscription and its one-second `tick()` in step B; the shell does not throttle anything of its own. New elements have no throttle: Lit batches property changes into one render per microtask, and the store tells an element only about its own ids.

### How the store reaches an element: context and reactive controllers (step B, ADR 0018)

- **Context, not properties down the tree.** Home Assistant's dashboard hands `hass` to every card as a property on every change, and every card decides whether to redraw. The panel's store already decides that per entity id, so the panel provides the store once at the root through `@lit/context` (Lit's implementation of the context protocol: a provider at the root, consumers anywhere below, resolved by a DOM event at connection time) and elements subscribe to ids. The cost: a consumer learns its store at connection, so a store is per element tree, which is what ADR 0012 wants.
- **Not signals.** `@lit-labs/signals` is a labs package (0.3 at the time of writing) and the store is already an observer with its own change detection; wrapping it in signals would be a second mechanism for the same thing. Recorded in the ADR with the condition to revisit: the package leaves labs.
- **`StoreController`**, in `src/ui/controllers/store-controller.ts`, is a Lit **reactive controller** (Lit docs, _Reactive Controllers_: reusable, composable lifecycle logic for a host element, the role hooks play elsewhere). Controllers over mixins is a decision: composition, not inheritance, so an element can hold a store controller, a forecast controller and an appearance consumer without a class hierarchy. The shell's own `StoreController` passes `store` itself (a provider never answers its own element) and `ids: () => []`; `pause`/`resume` and the context path get their first caller in the first feature move (spec 15).

  ```ts
  export interface StoreControllerOptions {
    /** the entity ids this host reads; called again when the config generation changes */
    ids: (store: PanelStore) => readonly string[] | '*';
    /** called before the host's update with what changed; optional, most hosts just re-render */
    onChange?: (change: HassChange) => void;
  }
  export class StoreController implements ReactiveController {
    constructor(host: ReactiveControllerHost & HTMLElement, options: StoreControllerOptions);
    readonly store: PanelStore; // resolved through storeContext when the host connects
    /** a hidden pane pauses its subscriptions; resume() re-subscribes and requests one update */
    pause(): void;
    resume(): void;
  }
  ```

  Behaviour: `hostConnected` resolves the store from context (`ContextConsumer`, `subscribe: false`: a store never changes for a given tree), subscribes to `ids(store)`, and remembers `store.generation`; on a change it calls `onChange` and `host.requestUpdate()`; when `generation` moved since the subscription, it unsubscribes and subscribes again with the new ids (the store's index is keyed by the ids a subscriber gave, ADR 0012). `hostDisconnected` unsubscribes. The controller is the one place a feature element touches the store's subscription mechanics, so it is where the test seams meet: the controller is exercised by the harness (the second adapter of the `hass` seam) and never unit-tested alone.

- **`MediaQueryController`**, in `src/ui/controllers/media-query.ts`: one `matchMedia` list per instance, `matches` as a reactive value, used by the shell for the compact threshold (`(max-width:599px)`), the device's dark mode and reduced motion, and by `<hp-chart>` for reduced motion. Replaces the four `matchMedia` branches of the class with one tested module.
- **`ActivePaneController`** is not a controller: `active` is a boolean property on every pane element, set by the shell when the tab is selected; a pane's `StoreController` is paused while `active` is false (`updated(changed)`: `if (changed.has('active')) active ? ctl.resume() : ctl.pause()`). This is the hidden-pane rule of user story 7, and it is where "a wall tablet does no work for what it does not show" is implemented.

### The registry and the frame (step C, ADR 0017)

`src/shell/features.ts` is a **registry** (Fowler, PoEAA, _Registry_) of **plug-ins** (PoEAA, _Plugin_: the configuration, not the code, decides which implementation is linked). The frame is drawn from it:

```ts
export type FeatureKey =
  | 'home'
  | 'lights'
  | 'climate'
  | 'weather'
  | 'car'
  | 'energy'
  | 'air'
  | 'media'
  | 'cams'
  | 'auto';

// FeatureEnv is {store: PanelStore; guest: GuestAnswers}: the store, and the guest's two answers (`availability`, `moreLine`)
// until a subject is a feature of its own; the registry is shared by every panel, so a descriptor is handed its panel's.
export interface FeatureDescriptor {
  key: FeatureKey;
  title: MessageKey; // 'weather.title'; the rail label, the pane heading and the More list
  shortTitle?: MessageKey; // the phone's fifth slot: 'auto.short' is "Rules"
  icon: IconName; // from src/ui/icons.ts
  color: string; // a token: 'var(--m-blue)'
  phoneBar: boolean; // one of the four tabs of the phone's bar; the rest sit under More
  available?: (env: FeatureEnv) => boolean; // the tab is shown; default true
  summary?: (env: FeatureEnv) => string | null; // the word under the section in More
  pane: () => TemplateResult; // html`<hp-weather-pane></hp-weather-pane>`
}
export const FEATURES: readonly FeatureDescriptor[]; // in rail order, the ten keys above
```

- **Legacy-backed descriptors.** While a feature is still drawn by the guest, its descriptor is built by `legacyFeature(key, {header, hosts})` in `src/shell/legacy-feature.ts`, which returns the same static markup the class writes for that pane today (`<div class="ph">` with the badge, `<h2>` and the `.sub` with its id, then the host divs) and takes `available` and `summary` from the guest (`guest.availability()[key]`, `guest.moreLine(key)`). A move replaces the line `legacyFeature('weather', …)` with `weatherFeature` exported from `src/features/weather/index.ts`. Adding a feature is one folder and one line; deleting one is the reverse.
- **What the shell renders in step C.** The `.app` wrapper with `classMap({narrow, cp: compact, tabsv: true, live, idle, gl, txl})` and `data-theme`, `data-wp`; the `<header class="head">` with the menu button, the gear and the guest containers it still fills (`#hello`, `#chips`, `#clock`, the two popups); `#err`; `.tabview` with the rail (`repeat(FEATURES, f => f.key, …)`, `?hidden=${!available}`, `aria-selected`), the phone's More button, and the `.panes` with one `<section class="pane pane-${key}" id="pane-${key}" ?hidden>` per descriptor containing `descriptor.pane()`; and the guest container, into which the guest now writes only the `.cols` parking lot (the old cards view that `placePanels` still moves cards through), the sheets, the idle overlay, the toast and the text probe. The phone's More sheet (`#sh-more`) moves to the shell as `<hp-more-sheet>` drawn from the registry (`summary` per feature), opened through the sheet host once step E lands; in step C it is still toggled by the shell's own `hidden`.
- **Tab state.** `@state() tab: FeatureKey` on the shell, read from the settings on first render (`home-panel-tab`, as today) and written on change; `setTab(key)` sets `aria-selected`, `hidden` on panes, `active` on the pane elements, writes the setting, calls `guest.tabChanged(key)`, and re-arms the idle timer (step D). The rail's click handler is Lit's `@click`, not a delegated `data-tab` branch in `wire()`; that branch is deleted.
- **Availability.** The shell computes `shown[key] = descriptor.available?.(env) ?? true` in `willUpdate`; a legacy descriptor's `available` reads `guest.availability()`, which the guest recomputes from `lacking()` and signals through `shell.requestFrame()` when it changes (the one upward call the guest has; it replaces `gateTabs`). When a hidden tab is the current one, the shell falls back to Home, where today's `setTab` did so only for an unknown key and left a lacking tab's empty pane open.
- **Compact and narrow.** `compact` comes from a `MediaQueryController` on `(max-width:599px)`; `narrow` is Home Assistant's property. Both are reflected into the appearance context (step D) and told to the guest.
- **Composition at the root.** The Home pane and the idle screen compose cards from several features (weather, lights, climate, energy, car, the people, the smart stack). Under ADR 0011 a feature never imports another, so these two are not features: `src/shell/home-pane.ts` and `src/shell/idle-screen.ts` are shell modules that import feature cards (`features/weather/weather-card.ts`, `features/lights/light-tiles.ts`, …) and lay them out. The programme's "Home" and "Idle clock" moves become: the layout packing in the shell, the who's-home card in `features/people/`, the smart stack in `features/stack/`, the clock in `features/clock/`. When two features both need to read the same thing (the live pill reads the car and the water heater), the reading goes down into a provider, never sideways. This is the rule of the ADR: **compose at the root, share reads in providers, share drawing in the kit.**

### Appearance and the idle timer (step D)

- **`AppearanceController`**, `src/shell/appearance.ts`, a reactive controller on the shell that owns what `applyTheme`, `applyGlass`, `applyText`, `skyWp`, `pageBg`, `glassT`, `glassMode`, `textMode` and `themeMode` do today, reading the settings module instead of `localStorage` and the store instead of `st(E.sun)`. It provides `appearanceContext` with a frozen value replaced on change, so a consumer compares by reference:

  ```ts
  export interface Appearance {
    theme: 'light' | 'dark';
    compact: boolean; // under 600 px: the phone shape
    narrow: boolean; // Home Assistant's sidebar is collapsed
    glass: {on: boolean; wallpaper: string | null; density: number}; // --g-m, from the transparency setting
    textScale: number; // --tx
    reducedTransparency: boolean;
    live: boolean; // a touch in the last minute
  }
  ```

  The theme rule is unchanged: dark when the setting says dark, or when it says auto and the device is dark or the sun is below the horizon. The sky wallpaper is a pure function `skyWallpaper(condition, day, now)` in `src/shell/sky.ts` with a unit test (`day` is the sun's rise, set, first and last light from `src/core/sun.ts`: the original's branches need them, which an hour of the day cannot give); today it is `skyWp()`. The other rules (dark or light, which wallpaper, the density, the text scale) are pure functions in `src/shell/appearance-rules.ts`, so the controller only gathers their inputs. The `Appearance` interface is declared in `src/ui/contexts.ts` beside `appearanceContext`, because the kit's consumer needs the type and the kit may not import the shell. The controller reacts to a settings write through `PanelSettings.subscribe`, which step D adds to the settings module. The text probe stays (`#txprobe`), read in `applyText`, re-read on `visibilitychange`. The document's background (`pageBg`) is written by the shell, the one place that touches `document` outside the kit, and it is removed in `disconnectedCallback` as today.

- **`AppearanceConsumer`**, `src/ui/controllers/appearance-consumer.ts`: a controller a feature element adds to receive the context and reflect `theme`, `compact` and `narrow` as attributes on its host (`this.host.toggleAttribute('compact', a.compact)`, `dataset.theme`), so the element's CSS says `:host([compact]) .wxtiles` where the class's CSS says `.app.cp .wxtiles`. Custom properties (the tokens on `.app[data-theme]`) inherit into a child shadow root on their own; only selectors need the attributes.
- **`<hp-settings-popup>`**, `src/shell/settings-popup.ts`: the Control-Center layout of `renderSettings` as a Lit template, in its own shadow root, with the kit's sheets adopted; theme toggle and auto, Sleep now, text size and glass radio groups, the transparency range, the version line. Every string is a catalog key (`settings.theme.dark`, `settings.text.larger`, …; the French text is the map's text, mined, and the map entries are deleted). It writes through the settings module and dispatches `appearance-change`; the shell's controller applies. The popup is the first element with catalog strings, so it is also the proof that a French element inside the English-rendering frame reads French from the first paint (its shadow root is outside the rewrite layer's observer).
- **`IdleTimer`**, `src/shell/idle-timer.ts`, a reactive controller written as a **state machine** with three states, `active`, `idle` and `waking`, and four events, `touch`, `timeout`, `sleepNow` and `compactChanged`:

  | State    | touch                                          | timeout | sleepNow | compact becomes true |
  | -------- | ---------------------------------------------- | ------- | -------- | -------------------- |
  | `active` | restart the 5-minute timer (unless compact)    | `idle`  | `idle`   | stop the timer       |
  | `idle`   | `waking` (swallow this tap), 400 ms later back | –       | –        | `active`             |
  | `waking` | –                                              | –       | –        | –                    |

  The shell toggles `.app.idle` and the overlay's `hidden` and `wake` class from the state, and calls `guest.idleChanged(idle)` so the guest draws the clock into `#iwrap` as `renderIdle` does today; the 20-second clock interval that redraws the idle clock stays the guest's until the clock moves. The touch events are the same four as today (`pointerdown`, `wheel`, `keydown` on the root, `scroll` on `window`, capture), registered once in `hostConnected`. The table is in the module's header, so the behaviour is readable without running it.

### The sheet host (step E, ADR 0019)

- **`SheetHost`**, `src/shell/sheet-host.ts`, is the **mediator** (Gamma et al., _Design Patterns_): the one object that knows which sheet is open, so sheets never know about each other.

  ```ts
  export type SheetId = LegacySheetId | string; // a feature's sheet id is '<feature>.<name>': 'weather.history'
  export interface SheetHost {
    readonly current: SheetId | null; // the modal sheet, if one is open
    readonly inline: SheetId | null; // the detail panel shown inside the current pane (tablet)
    open(id: SheetId, detail?: unknown): void; // closes the current modal first
    close(): void; // Escape, the Close button, a tap on the backdrop
    isOpen(id: SheetId): boolean;
    registerLegacy(sheet: LegacySheet): () => void; // the guest's sheets, in step E
  }
  export interface LegacySheet {
    id: LegacySheetId; // 'sh-energy' … 'sh-more'
    element: HTMLElement; // the .sheet div the guest wrote
    inlinePane?: FeatureKey; // TAB_SHEET: the pane that hosts the panel inline on a tablet
  }
  ```

  Behaviour, unchanged from `show`, `hide`, `openInline` and `placePanels`: on a tablet, opening a sheet that has an `inlinePane` switches to that tab instead; on a phone it is a modal; one modal at a time; `lastFocus` is saved on open and restored on close; the Close button receives focus on open; Escape on `window` (the reason stays as today: a redraw can drop focus out of the root, so the host would miss the key) closes the modal first, then the Status checks, then the settings popup. For a legacy sheet the host toggles `hidden` and calls `guest.sheetOpened(id)` and `guest.sheetClosed(id)`; the guest's `buildSheet`, `destroyCharts` and `radarStop` run from those. `show()`, `hide()`, `onKey` and the `[data-sheet]` branch of `wire()` are deleted from the class.

- **Events up, properties down.** A feature element never imports the shell. It asks for a sheet by dispatching `new SheetRequestEvent('weather.history', {key: 'wind'})`, a `CustomEvent` with `bubbles: true, composed: true` defined in `src/ui/events.ts` beside `ToastEvent`; the shell listens on its root and calls the host. This is Lit's rule (Lit docs, _Events_: "communicate up with events, down with properties"), and it is what keeps `src/features/` free of `src/shell/` imports under the dependency rule.
- **`<hp-sheet>`**, `src/ui/sheet.ts`: the kit's sheet, drawn with the same markup and classes as the guest's (`.sheet > .grab + .panel[role=dialog][aria-modal]` with `.ph`, the badge, `h2`, `.sub`, the tabs slot and the Close button), `open` reflected, slots `header-tabs` and default, and the modal-or-inline placement decided by the host through a property. The first user is Weather's history sheet (spec 15).

### The UI kit's shared sheets and the one-source rule for CSS (steps C to E, ADR 0019)

A feature element has its own shadow root (Lit's default, and what Home Assistant's cards do). The gain is isolation: the French rewrite layer's observer cannot see inside it, so a feature renders French from `t()` without the layer re-parsing it (spec 11's bare-number rule would otherwise mangle a French number), and a feature's styles cannot leak. The cost is that the legacy sheet's rules do not apply inside, so every rule an element needs must be adopted. The rule that keeps this from becoming a copy: **a CSS rule lives in one file.** `src/ui/styles/` holds the kit's sheets, split out of `src/css/` as the moves need them (`tokens.css`, `card.css`, `tile.css`, `sheet.css`, `header.css`, `motion.css`, …), each exported as a `CSSResult` from `src/ui/styles/index.ts` and imported `?inline` by Vite as today; `src/styles.js` builds the legacy sheet by concatenating the kit's files in their former positions plus what is left of `src/css/`, so the legacy frame and the new elements see the same rule text in the same cascade order. A unit test asserts that no selector appears in both `src/css/` and `src/ui/styles/`. Lightning CSS minifies both the same way (spec 06). Step C splits out what the frame needs (`tokens`, the rail and bar, the pane header, `motion`); the first feature move splits what it needs.

### axe in the end-to-end run (step A)

- `@axe-core/playwright` (4.14 at the time of writing), pinned exactly, as a dev dependency. `test/e2e/a11y.spec.ts` runs in the `tablet` and `phone` projects, in the full house in English and French and the bare house: for every shown tab, `new AxeBuilder({page}).include('home-panel').analyze()`; then, with the sheets and popups opened as a person opens them (the fixture's helpers: a tile tap for the light sheet, the gear for settings, the attention pill for the Status checks, a weather tile for its history), the same analysis with the open dialog in view. axe follows shadow roots on its own.
- Findings with `impact` `serious` or `critical` fail the test; `moderate` and `minor` are attached to the report (`testInfo.attach`) and do not fail. A rule may be disabled only with `disableRules([...])`, a comment with the reason, and an issue, and the list is expected to be empty.
- Step A runs axe against today's panel first. Every serious or critical finding is fixed in the same pull request when it is a label, a role or a name, or listed in the pull request with an issue when it is a design question (a contrast ratio on glass, say) that the HIG work owns; the gate of phase 3 is "no serious or critical finding", so a listed finding must be resolved by the end of the phase.

### The fixture recorder and one test house (step F)

- **`scripts/record-fixture.mjs`**: Node, run by the owner against the real house, never by CI. It connects with `home-assistant-js-websocket` (already a dev dependency) over Node's global `WebSocket`, using `HASS_URL` and `HASS_TOKEN` (a long-lived access token) from the environment, never from a file in the repository. It fetches `get_states`, `config/entity_registry/list`, `config/device_registry/list`, `config/area_registry/list`, and, when `--statistics <ids>` is given, one `recorder/statistics_during_period` reply per period the panel asks for. It anonymises with a mapping file outside the repository (`--map ~/.config/home-panel/anonymise.json`): a JSON object of `from → to` for entity ids (the domain is kept), names, areas, device names, person names, plates and towns, applied to ids, attribute values and registry rows, with latitude and longitude rounded to one decimal, `access_token`, `entity_picture`, `id`, `user_id`, `mac`, `connections`, `serial_number` and `sw_version` dropped. It then scans the output for every `from` string and every pattern in the repository's personal-data scan and **refuses to write** if one remains. Output: `test/unit/fixtures/houses/<name>.json` with `{recordedAt, states, entities, devices, areas, statistics?}` and a `README.md` line saying what the fixture is for. The repository's personal-data test already covers `test/**`; the fixture files are under it.
- **One test house.** The made-up house's `S`, `ENT`, `DEV`, `AREAS` and the automations of `harness.html` move to `test/houses/full.mjs` and `test/houses/bare.mjs` (plain ES modules exporting the objects), served by `test/e2e/server.mjs` and imported by the harness with `import {house} from '/houses/full.js'`; Vitest imports them directly. `test/unit/fake-hass.ts` gains `fakeHass.fromHouse(house)` and `fakeHass.fromFixture(name)`, so a model test can start from the same house a screenshot shows, or from the recorded house. The harness exposes nothing new.

### What a move must do (the recipe, written into `docs/architecture.md`)

Step C adds a section "Anatomy of a feature" to the architecture guide, finished by spec 15 with Weather as the worked example. The recipe each move follows: (1) providers for what is integration-specific; (2) `ids(config)` and `model(inputs, deps)` in the feature folder, pure, with tests from the test house and the recorded fixture; (3) the elements, humble, with `StoreController`, `AppearanceConsumer`, `repeat` keyed by id, strings through `t()`, formats through `fmt`; (4) the feature's own CSS split out of `src/css/` and the shared rules it needs moved into the kit, one rule in one file; (5) the descriptor replaces `legacyFeature(key)` in the registry; (6) the class's methods, the `wire()` branches, the sheet markup, the `WX_DEF`-style constants and the French map entries for that feature are deleted, the legacy set in `scripts/legacy-set.cjs` is unchanged until a whole file goes; (7) baselines unchanged, behaviour specs moved to the feature's spec with user-level actions, a mutation test for an unrelated change, and the French equivalence test over the catalog entries the move introduced.

### TypeScript, lint and packaging

- `lit` (3.3 at the time of writing) and `@lit/context` (1.1) become production dependencies, pinned exactly, in `LICENSES.md` (BSD-3-Clause). The main chunk grows by about 6 KB gzipped for Lit and about 1 KB for context; the number is quoted in the pull request, informational by ADR 0010.
- Decorators: `experimentalDecorators` off; Lit 3 supports standard decorators with TypeScript 5.x, and the repository is on TypeScript 6 (`accessor` keyword on decorated fields: `@property() accessor hass`). `useDefineForClassFields` stays at TypeScript's default for the target. `tsconfig.check.json` gains `src/shell/**/*.ts`, `src/ui/**/*.ts`, `src/features/**/*.ts`, `src/providers/**/*.ts`, all strict; `lit-analyzer` is added to `npm run check` (`lit-analyzer src --strict`) to type-check template bindings, as the programme's tooling table says.
- `eslint-plugin-lit` is already configured (`flat/recommended`); `src/core/**`'s no-DOM rule stays; a new rule forbids `innerHTML` and `insertAdjacentHTML` in `src/shell/`, `src/ui/` and `src/features/` (`no-restricted-properties`), the "no `innerHTML` outside legacy" convention of the architecture guide as a lint.
- The dependency rules already name `src/shell/`, `src/ui/`, `src/features/`, `src/providers/`; the first file in each folder is what makes them bite. `scripts/arch-graph.mjs` collapses the new folders like the others.
- Vitest coverage includes `src/shell/**/*.ts` that is not an element (`features.ts`, `sky.ts`, `idle-timer.ts`'s pure transition table, `legacy-feature.ts`), `src/ui/controllers/**` excluded (exercised by the harness), `src/providers/**` and `src/features/**/{model,ids,sources,history}.ts` at 100 percent statements. Elements are not covered by Vitest: they are humble objects proven by the harness, per ADR 0005.

## Acceptance Criteria

Step A, axe:

1. `test/e2e/a11y.spec.ts` exists, runs in the `tablet` and `phone` projects, analyses every shown tab and every sheet and popup the fixture can open, in English and French and in the bare house; serious and critical findings fail, moderate and minor are attached.
2. Every serious or critical finding on today's panel is fixed in the pull request or listed with an issue number; `disableRules` is empty or each entry has a comment and an issue.
3. No baseline changes unless a fix changed a pixel, in which case the fix is its own pull request with an approved baseline (ADR 0003).

Step B, host and guest:

4. `src/shell/home-panel.ts` defines `<home-panel>` as a `LitElement` with `hass`, `narrow`, `panel`; `src/main.js` registers the guest and defines the element; `src/home-panel.js` exports `LegacyPanel` implementing `GuestRenderer` and no longer extends `HTMLElement`.
5. The store, settings and API client are created once in the shell and provided through `storeContext`, `apiContext`, `settingsContext`; the class reaches them through `GuestContext` and holds no `createStore`/`createSettings`/`createApi` call: `grep -n 'createStore\|createSettings\|createApi' src/home-panel.js` is empty.
6. `grep -c 'this.shadowRoot' src/home-panel.js src/auto.js` is 0; every lookup goes through `this.root`.
7. Every baseline identical; every behaviour spec green; the two-panel spec green (two shells, two stores); `npm run check`, `npm test -- --coverage` green; the legacy footprint printed by `npm run lint` is unchanged (no file left the set yet).
8. ADR 0016 (one element, one shadow root, the guest renderer) and ADR 0018 (context and reactive controllers, not signals or properties down the tree) accepted. `lit` and `@lit/context` in `LICENSES.md`; the main chunk's size quoted in the pull request.

Step C, registry and frame:

9. `src/shell/features.ts` lists the ten descriptors; the rail, the phone's bar, the More sheet, the pane sections and their availability are rendered from it; `TABS`, `PHONE_TABS`, `TAB_COLOR`, `renderTabs`'s tab part, `renderMoreTab`, `renderMore`, `gateTabs` and the `[data-tab]`, `[data-more]` branches of `wire()` are deleted from the class.
10. The shell owns `tab`, `compact` (through `MediaQueryController`) and `narrow`; the guest reads them through `ShellForGuest` and holds no `matchMedia` for the phone threshold.
11. `StoreController`, `MediaQueryController` and `active` pausing exist under `src/ui/controllers/`, with module headers, used by the shell (the controllers are not orphans).
12. `docs/architecture.md` gains "Anatomy of a feature" (the recipe) and its layer table marks the shell and the kit as built; the dependency graph is regenerated.
13. Every baseline identical, behaviour specs green, `npm run lint` passes the dependency rules with the new folders present. ADR 0017 (registry, composition at the root, shared reads in providers) accepted.

Step D, appearance and idle:

14. `AppearanceController`, `skyWallpaper` (unit-tested), `IdleTimer` (its transition table unit-tested) and `<hp-settings-popup>` exist; `applyTheme`, `applyGlass`, `applyText`, `skyWp`, `pageBg`, `themeMode`, `textMode`, `glassMode`, `glassT`, `idleArm`, `idleStart`, `renderSettings`, `toggleSettings` and the settings branches of `wire()` are deleted from the class; `grep -n 'localStorage' src/home-panel.js` is empty.
15. The settings popup's strings are catalog keys in both languages; the corresponding French map entries are deleted; the settings baselines (`settings-tablet-light-en`, `settings-tablet-dark-en`) are identical; a new behaviour test opens the popup in French and reads `Taille du texte`.
16. The idle behaviour specs are green unchanged (five minutes, wake on tap, Sleep now, phones never idle).

Step E, sheet host:

17. `SheetHost`, `SheetRequestEvent`, `ToastEvent` and `<hp-sheet>` exist; the class's `show`, `hide`, `onKey`, `openInline`, `placePanels`'s sheet part and the `[data-sheet]` branch are deleted and its sheets are registered as legacy sheets; Escape order, focus return and inline-on-tablet are proven by the existing specs plus one new spec for focus return.
18. ADR 0019 (feature elements in their own shadow roots, the kit's adopted sheets, one rule in one file, events up and properties down) accepted; the no-duplicate-selector unit test exists and passes.

Step F, fixtures:

19. `scripts/record-fixture.mjs` exists with `--map`, `--out`, `--statistics`, refuses to write when a mapping source or a banned pattern remains (tested with a fake connection and a literal mapping in Vitest), and is documented in `docs/architecture.md`'s testing section.
20. `test/houses/full.mjs` and `bare.mjs` feed both the harness and `fakeHass.fromHouse`; `harness.html` holds no state literal; every baseline identical.
21. The owner has recorded one fixture (`test/unit/fixtures/houses/main.json`) and the personal-data test passes over it. (A human step; the ticket says so.)

Phase 3 as a whole, checked at the end of the last move, not here: the class file, `src/auto.js`, the guest interface and the methods-exist test deleted; axe clean; screenshots identical except approved changes.

## Testing Decisions

The seams are the two of ADR 0005 and nothing new: the harness hands `hass` to `<home-panel>` and drives it as a person does, and pure functions are called with literal inputs. The shell adds no test-only method and no private field is read. What is new is what the harness can observe:

- **Mutation counting**, in the style of `tabs.spec.ts`'s `lackingShown`: an init script wraps `attachShadow` and installs a `MutationObserver` per root that counts mutations under a selector; a test sets a thermostat's state through `window.house.setState` and asserts zero mutations inside a pane that does not read it. It lands with the first feature (spec 15) because the shell alone has no such pane.
- **axe**, step A, run at the `hass` seam like every other end-to-end check.
- **Pure shell modules** (`features.ts`'s ordering and availability fallback, `sky.ts`, the idle transition table, `legacy-feature.ts`'s markup, the recorder's anonymiser and refusal) in Vitest with literal inputs. Prior art: `stack.test.mjs`, `config.test.mjs`.
- **Nothing in between**: no test mounts a Lit element in Node, no test of `StoreController` with a fake host, no test of the sheet host's state alone. They are covered by the specs that open sheets, switch tabs and change states in the harness; if one of them cannot be reached that way, the design is wrong, not the test.
- The baselines stay the contract: every step passes `npm run test:visual:docker` with no update.

## Out of Scope

- Moving any pane's content (spec 15 is the first); the Home pane's layout packing and the idle clock's drawing stay with the guest until their turn.
- Any change of look: the glass, the rail, the sheets keep their pixels. The HIG audit's refactors come after the frame exists and are their own pull requests.
- Lazy-loading feature code as chunks (the registry's `pane()` would allow `import()`); charts, Mermaid and the radar card stay the only lazy chunks, by ADR 0010 there is no size budget to force more.
- Signals, `@lit-labs/*`, or a state library; the store is the state.
- Replacing the French rewrite layer (phase 4) or moving strings the shell does not own; the settings popup is the one exception, because the element has its own root.
- A storybook or component gallery.
- WebKit in the Playwright run (the programme names it for phase 3; it is scheduled with the last move, when no legacy markup is left to double the matrix).

## Notes

- **Why the guest is a class and not a function.** The 214 methods of the class share state through `this`; making it a function would mean threading that state, which is the work the moves do piece by piece. A class behind an interface the shell owns is the strangler fig's host (Fowler): the new code grows around it, and the host is removed when nothing is left inside.
- **Why `display: contents` on the guest container.** The guest's markup is positioned relative to the shadow root today (`.sheet` is fixed, `.idle` is fixed, `.app` is the flow root). A wrapper with a box would be a new containing block only if it had a transform or a filter; `display: contents` removes even the risk, and the pixels are the same by construction.
- **Why the registry holds message keys, not strings.** The rail labels are the first English strings the shell owns; `'weather.title'` makes the French rail come from the catalog at step C, inside the French observer's root. The observer finds nothing to rewrite in a French label, and the entries for the rail labels leave the map in step C.
- **Why controllers and not mixins.** Lit supports both. A mixin changes the class hierarchy of every element that uses it and composes poorly past two or three; a controller is an object the element owns, so an element can hold as many as it needs and a test can hold one without an element (though this spec chooses not to). Lit's docs make the same recommendation.
- **Reading**: Seemann, _Dependency Injection Principles, Practices, and Patterns_ (composition root); Meszaros, _xUnit Test Patterns_ (humble object); Fowler, _Strangler Fig Application_ and _Patterns of Enterprise Application Architecture_ (registry, plugin); Gamma, Helm, Johnson, Vlissides, _Design Patterns_ (mediator, observer, state); Lit docs: _Reactive Controllers_, _Context_, _Events_, _Styles_ (adopted stylesheets); the W3C Community Group _Context Protocol_; axe-core rule descriptions; Home Assistant developer docs, _Frontend data_.
