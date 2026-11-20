# Glossary

The words the panel and its code use. One word per concept: use it in issues, tests, code and the changelog, and not the words under Avoid. An entry with no Avoid line has no rival word in the sources. Sources: `README.md`, `CHANGELOG.md`, `docs/specs/` and `docs/adr/`.

## The house, as the panel shows it

**Tab** — A button on the tablet's rail or the phone's bottom bar that picks a subject (Home, Lights, Climate and so on). Avoid: page (and the document's background is "the document" in code, `claimDocument`, never "the page").

**Sidebar** — The tablet's navigation under Liquid Glass: a glass panel with a toggle and one row per section in two groups (Home and Automations, then Categories), collapsed to a strip of icons by default; `home-panel-sidebar` (`collapsed` or `open`) in the settings, `.sbo` on the frame (ADR 0038). It is the rail's markup, drawn differently; Material keeps its rail and the phone its bottom bar. Avoid: menu, drawer.

**Pane** — What a tab shows: the content of one of the ten subjects on the tablet rail. Avoid: page.

**Room view** — What a room shows: every tile the panel has for one Home Assistant area, grouped by subject (Lights first), under the room's name and icon. Under Liquid Glass on the tablet the sidebar lists each room that has a tile after its Rooms heading, and a row shows the view; the `tab` setting is then `room:<area_id>` (ADR 0039). A subject takes part through its descriptor's `room` part. Avoid: room page, area tab (a room's own light sheet is a Sheet, and the Lights tab's tile is a Tile).

**Pane header** — The block a pane opens with: a badge in the subject's colour, the title, a line under it and, on Lights, the Arrange buttons; the kit's `<hp-pane-header>`, with the line and the buttons as slotted nodes its pane fills. The summary panes' header (Climate, Weather, Car, Energy, Air) shows on the phone only, since a tablet's pane opens on a detail with its own; Home's shows on a tablet only.

**Sheet** — A detail view opened from a pane by tapping a tile or card, such as a room's light sheet; it slides up on a phone and is a narrow panel on a tablet. Avoid: modal, dialog (a dialog is the next term).

**Dialog** — A modal interruption an element owns and opens over everything (ADR 0036): a confirmation before an intentional action, such as Unlock or Start, or an editor holding a draft with Cancel and Save, such as the departure editor. A confirmation is the kit's `<hp-dialog>`. Not a detail view: that is a Sheet. Avoid: alert, popup, modal.

**Tile** — A compact block for one thing. Either a well that shows a value and does nothing (a weather figure, a total with no chart), or a control that acts: a room on the Lights tab (the bulb switches the room, the row beside it opens its sheet), a scene, or a value tile with a chevron that leads to its data. Avoid: row (the sideways dimmer row that tiles replaced).

**Well** — The surface that shows a value or a state and does nothing when tapped: flat, no rim, shadow or pointer (`.tile` as a `<div>`). A control is its opposite, raised above the wells (`docs/design.md`, "Three surfaces").

**Control** — Anything a tap acts on inside a card, drawn raised on `--ctl-bg`; a tile that opens something is one (`.tile.tilebtn`, with a chevron). A filled capsule is always a control.

**Card** — A glass surface that groups one subject's content, such as the Home card, a smart-stack card or a live-activity card.

**Status** — A fact the panel reports, written as text with a small coloured dot before it (`.status`, `src/ui/styles/status.css`): the Car's facts, an automation's date and run, Air's ratings, who is home. The dot's tone (ok, warn, bad) adds to the word and never replaces it. Never a filled capsule, which is a button's shape. Avoid: status pill, badge (the pane header's is the icon square). Not the Status checks, the list behind the attention pill.

**Range** — How far back a history reaches: Day, Week, Month or Year (`RANGES`, `src/ui/ranges.ts`), or a feature's own such as Energy's Now and Today, chosen with the pane's `<hp-range-tabs>`. A pane has one, at the top, and every card follows it or names its own fixed period; a tile that sets it sets that one. Avoid: period (the recorder's statistics period, one of `5minute`, `hour` and `day`, which a range asks for), span, timeframe.

**Chip** — A small rounded label, in the header (weather, the critical peak, the people) or in a sheet (a single bulb, with a check mark when on).

**Pill** — The glass capsule in the header that stands for something happening or needing a look; under Reduce Transparency it is solid.

**Mercury drop** — The glass material since v1.19.0: almost no tint, a soft inner glow, a 15 px blur and, in Chromium, the `#glass-distortion` filter the shell draws (`lens`). It belongs to the Apple design. Avoid: Liquid Glass.

**Design** — The panel's design language, chosen under Settings and kept per browser; until it is chosen, Material on Android and Liquid Glass elsewhere: **Liquid Glass** (labelled so in the popup and stored as `apple`: glass, the Mercury drop, a wallpaper) or **Material** (Material 3 Expressive: a tonal palette built from a seed, no glass); `design` in the settings, as a `design` attribute on every element and `data-design` on the frame (ADR 0037). Content, words, data and chart colours are the same in both. Avoid: theme (that is Light, Dark or Auto), style, skin.

**Live-activity pill** — The pill shown while something runs: the car charging, the water heater heating or a Hilo challenge. A further activity sits beside it as a small ring, and tapping it opens one card per activity above the Status checks. Avoid: status chip (the "All clear" chip it replaced).

**Attention pill** — The amber pill (red when critical) that appears when a status check has a problem, and opens the Status checks.

**Status checks** — The list of things that need attention, opened from the attention pill or from the live-activity pill's popup. Avoid: status block (removed from the Home card).

**Settings popup** — The popup behind the gear in the header: the theme (Dark or Light, and Auto), the design (Liquid Glass or Material), Sleep now, the text size, the glass and its transparency (Apple's only), and the version. Each choice is written to the browser's settings, and the shell applies it. Avoid: settings sheet (a sheet is a detail view of a tile), settings dialog.

**Smart stack** — The cards that follow the moment (a door left open, the car charging overnight, tomorrow's weather), taking turns every 20 seconds with dots for how many there are; it sits beside the idle clock and fills the Home card on a tablet. Red cards stay alone and amber cards come first.

**Idle clock** — The big clock shown after 5 minutes without a touch on a wall tablet, or by "Sleep now" in the settings; the smart stack sits beside it, or under it on a portrait screen.

**Arrange** — The admin's mode on the Lights tab for dragging tiles into the order every screen then shows; the order is saved in Home Assistant, lights added later go at the end, and Reset order returns to the order by area.

**Linked rooms** — Two rooms whose switch, brightness and colour move together, still drawn as two ordinary tiles that sit side by side and move as one in Arrange; an admin picks the partner under "Linked with" in the room's sheet. Avoid: linked cards.

**Split light areas** — The areas listed under `split_light_areas`, which show one card per light group instead of one card for the whole area.

**Auto** — The switch in a room's sheet that hands the room to Adaptive Lighting's schedule; moving a slider by hand takes the room off Auto until it is turned on again.

**Night** — The switch in a room's sheet for Adaptive Lighting's sleep mode; turning Night on turns Auto on, turning Auto off ends Night, and moving a slider by hand ends Night.

**Who's home** — The people the panel knows (the `people` option), shown as chips in the header and as the Who's home card on the Home tab; it is also a smart-stack card for 30 minutes after someone arrives or leaves.

**Full test house** — The made-up house in `test/houses/full.mjs` (plain data, read by the harness and by `fakeHass.fromHouse`) with thermostats, a car and a water heater (the Hilo card stays hidden); it is the default house for tests and baselines. Avoid: fixture (recorded, anonymised data that feeds model tests).

**Bare test house** — `test/houses/bare.mjs`, the same kind of data with almost nothing configured; it proves that a section whose entities are missing is hidden (no Climate or Car tab, no water heater or Hilo card). Avoid: fixture.

**Fixture** — A house in the recorder's format under `test/unit/fixtures/houses/` (states, the three registries and, when asked, statistics), normally recorded from the real Home Assistant and anonymised with the owner's mapping; a model test starts from one with `fakeHass.fromFixture(name)`. The made-up houses of `test/houses/` are not fixtures; `sample.json`, a slice of the full test house written by the recorder from a fake connection so that the loader can be tested, is the one exception. Automation traces in the recorder's `--traces` format (`test/unit/fixtures/traces/`: one automation's config, its `trace/list` rows and a `trace/get` reply per run) are fixtures too; the six there now are made up in Home Assistant's reply shape until the owner records real ones, and their `source` says so. Avoid: snapshot (the screenshot baselines).

**Household changelog voice** — The way a changelog line is written: plain sentences about what the household sees, as one paragraph.

**Hilo challenge** — A Hilo event that the live-activity pill follows with its phase and a countdown, from pre-heat until recovery ends; the smart stack's Critical peak card also appears for one.

**Pre-heat** — The first phase of a Hilo challenge, before the reduction; the countdown in the pill starts here.

**Recovery** — The last phase of a Hilo challenge, after the reduction; the pill's countdown ends when recovery ends, then shows a check for 10 minutes.

**Heat pump** — The climate entity named by `entities.heat_pump`, left out of the Climate tab's rooms by default and hidden in a house that has none.

**Departure schedule** — The car's departure times, which the Car pane lists with its controls (see the move order in the programme spec); its times go through the formatters.

**Health rules** — The owner's Prometheus recording rules (`home:scope_state`, `home:attention_age_seconds`) that decide when an area of the house's network or home server is Healthy, Checking, Warning, Unknown, a Problem, Recovering or in Maintenance; the panel shows what they decide, through the bridge package, and never sets a threshold of its own (specs 27 and 28). Avoid: alerts.

**Health scope** — One area the health rules judge (Internet, DNS, Pi-hole, UniFi, Synology, Containers), shown on the Network tab as one of five chips, Synology and Containers together as Home server; an issue is one condition within a scope, named by its stable `issue` id and translated from it. Avoid: category, alert.

**Bridge package** — The example Home Assistant package of `rest` sensors (`examples/packages/home-health.yaml`) that queries Prometheus for the health rules and the network's series, so that the panel reads them as sensors and never calls Prometheus. Avoid: integration (the panel's adapters are providers).

**Watched devices** — The devices named under `network.watch` in the panel's config, which the Network tab lists with whether each is online and its link speed. Avoid: favourites.

## The code, as the programme names it

**Shell** — The layer in `src/shell/` and `src/main.js` that is the composition root: it receives `hass` from Home Assistant, feeds the store, and owns the rail, tab bar, sheet host, theme, idle-clock arming, settings popup and header. Also called the imperative shell.

**Feature** — One folder in `src/features/<name>/` for one subject (Weather, Lights, Car and so on), holding a pure model, its Lit elements and its styles; it never imports another feature.

**Model** — A pure, synchronous function `model(states, registries, config, now) → view model` with no DOM and no `hass` methods; `now` is passed in.

**Provider** — An adapter in `src/providers/`, its `read` a pure function, that turns an integration's entities (Environment Canada, Hilo, Hydro-Québec, FordPass, Wallbox, Mila, UniFi Protect, Adaptive Lighting) into the generic inputs a model expects, so a model never matches on an integration's naming. A feature can have several, applied in a declared order (the weather entity, then Environment Canada over it). A reading that two features need is a provider too, named after what it reads (ADR 0025).

**UI kit** — The layer in `src/ui/` of small shared Lit elements and styles: card, tile, pane header, sheet, dial, ring, pill, chip, dimmer slider, chart wrapper and the design tokens.

**Core** — The layer in `src/core/`, the functional core: it imports only itself and npm packages, has no DOM, and is where the only code that touches `hass` lives; whatever it needs from the browser (time zone, locale, storage) it takes as a parameter.

**Store** — The per-element object that holds the current `hass`, the resolved config, the locale and the formatters, and notifies a subscriber only when one of its entity ids has a new state object (reference equality). It is never a singleton. Avoid: state manager.

**API client** — The one core module that sends every WebSocket message and service call the panel makes, with a typed request and reply for each; nothing else in `src/` calls `callWS`, `callService` or `connection.subscribeMessage`; its own method for a service call is `runService`. A read rejects with `StaleReply` if the config changed before the reply came back. `generateData` asks the AI Task entity for data of a given structure and returns the reply's data unparsed; it rejects with `Cancelled`, a sibling of `StaleReply`, when the caller's signal aborts, which only means the panel stopped waiting (Home Assistant cannot cancel the call).

**Catalog** — The set of messages for one language, keyed by message key; the English catalog is the source of keys and the French catalog must have every one, with ICU MessageFormat plurals and placeholders. Avoid: the French map (the rewrite layer's).

**Message key** — The typed, feature-namespaced name of one string, such as `lights.auto`, passed to `t(key, values)`; a missing key is a compile error and a missing French translation is a test failure.

**Formatter** — A date, time or number function built on `Intl` from the user's Home Assistant locale, time zone and 12 or 24-hour and number-format choices.

**House rule** — One of the three deliberate overrides of `Intl` in the formatters: English `am` and `pm`, French time on the hour as `16 h`, and a narrow no-break space as the French thousands separator.

**Display name** — A name given to an entity, area or device after it passes through the display-name resolver: the config's `names:` block first, then the built-in dictionary of room words, then the name as Home Assistant gives it. Names are data, never message keys. Avoid: friendly name (the raw name Home Assistant gives, the last fallback).

**Legacy class** — The `LegacyPanel` class that was `src/home-panel.js`, and the files around it, which the strangler fig replaced; deleted with the guest in #277 (ADR 0035); the lint's footprint line, which counted it, went at the phase 3 gate (#188). Historical.

**Guest** — Historical: the word for the legacy class while the shell hosted it, until #277 (ADR 0035). It was not an element but a renderer that implemented `GuestRenderer` (`src/shell/guest.ts`), which `src/main.js` registered, the shell constructed and drove, and which drew only into its own containers inside the shell's one shadow root. Interface and renderer are gone. Avoid: guest renderer, legacy renderer, the old class.

**Home-card bridge** — The rule (ADR 0024) by which the guest wrote a feature element's tag, and nothing else, into a Home container it still drew, once per draw, and heard only `hp-empty` back. The idle screen's `<hp-smart-stack mode="idle">` was the last use, until spec 26 (#276); gone with the guest (#277). Avoid: the bridge, alone (the bridge package is the Home Assistant YAML package).

**Sheet host** — The shell's one mediator (`SheetHost`, `src/shell/sheet-host.ts`) for which sheet is open, Escape, focus return and where the five detail panels sit. The guest's sheets once registered with it as legacy sheets; now every sheet is opened by its owner's template. Elements ask for a sheet with a `SheetRequestEvent` rather than importing the shell.

**Descriptor** — The data for one of the ten subjects in the shell's registry (`src/shell/features.ts`): key, title, icon, colour, whether it sits on the phone's bar, whether this house shows it, and its pane. The rail, the phone's bar and the panes are drawn from the list.

**Controller** — A Lit reactive controller: an object an element owns that hooks into its lifecycle, such as `StoreController` (subscribes the element to the entity ids it reads), `MediaQueryController`, `IdleTimer` (a state machine: active, idle, waking), the shell's `AppearanceController` and its counterpart in an element, `AppearanceConsumer`, which reflects the appearance on the element as attributes (`compact`, `glass`) its styles can test. Avoid: mixin.

**Theme** — Light or dark. Set to Dark or Light it holds; on Auto ("Theme Auto") it is exactly the device's own light or dark setting, as it changes. The sun has no part in it, though it still picks the Sky wallpaper. Not the Auto of a room's lights, which is Adaptive Lighting's. Avoid: mode, skin.

**Appearance** — How the panel looks right now, as one frozen value the shell's `AppearanceController` replaces whenever anything in it changes and provides by context: dark or light, the glass wallpaper and its density, the text scale and whether it is large text, compact, narrow, reduced transparency and `live` (a touch in the last minute). A consumer compares it by reference.

**Strangler fig** — The migration shape: rewrite in place, one feature per release, the live panel never going dark, until the legacy class is deleted. After Fowler's Strangler Fig Application.

**Baseline** — A committed reference screenshot in `test/e2e/__screenshots__/`, recorded and compared only inside the pinned Linux arm64 Playwright image, with an exact match. It is the contract of the rewrite: a restructuring pull request must not change one.

**Harness** — `test/e2e/harness.html`, the test's side of the seam: it reads the test house (`test/houses/`) into a `hass`, hands it to `<home-panel>` as Home Assistant does, offers `window.house` helpers (set a state, advance time) and logs service calls and system-data writes to the console. The panel exposes no test-only methods.

**Seam** — A place where behaviour can be changed without editing the code (Feathers). The panel has two for tests: the `hass` seam and pure functions. Avoid: boundary.

**Adapter** — What stands behind a port: at the API client, `hass` is the production adapter and the fake `hass` of the unit tests and the harness is the second.

**Humble object** — The Lit element that only forwards what Home Assistant gives it, leaving the logic in the store and the models where Node can test it (Meszaros, Fowler).

**Deep module** — A module with a small interface that hides a lot, such as the store and the API client (Ousterhout); it hides complexity callers need and takes on no policy they would have to configure.
