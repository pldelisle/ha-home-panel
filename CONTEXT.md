# Glossary

The words the panel and its code use. One word per concept: use it in issues, tests, code and the changelog, and not the words under Avoid. An entry with no Avoid line has no rival word in the sources. Sources: `README.md`, `CHANGELOG.md`, `docs/specs/` and `docs/adr/`.

## The house, as the panel shows it

**Tab** — A button on the tablet's rail or the phone's bottom bar that picks a subject (Home, Lights, Climate and so on). Avoid: page (and the document's background is "the document" in code, `claimDocument`, never "the page").

**Pane** — What a tab shows: the content of one of the ten subjects on the tablet rail. Avoid: page.

**Pane header** — The block a pane opens with: a badge in the subject's colour, the title, a line under it and, on Lights, the Arrange buttons; the kit's `<hp-pane-header>`, with the line and the buttons as slotted nodes the guest still fills. The summary panes' header (Climate, Weather, Car, Energy, Air) shows on the phone only, since a tablet's pane opens on a detail with its own; Home's shows on a tablet only.

**Sheet** — A detail view opened from a pane by tapping a tile or card, such as a room's light sheet; it slides up on a phone and is a narrow panel on a tablet. Avoid: modal, dialog.

**Tile** — A compact tappable block for one thing, such as a room on the Lights tab (the bulb switches the room, the rest of the tile opens its sheet) or a scene. Avoid: row (the sideways dimmer row that tiles replaced).

**Card** — A glass surface that groups one subject's content, such as the Home card, a smart-stack card or a live-activity card.

**Chip** — A small rounded label, in the header (weather, the people) or in a sheet (a single bulb, with a check mark when on).

**Pill** — The glass capsule in the header that stands for something happening or needing a look; under Reduce Transparency it is solid.

**Mercury drop** — The glass material since v1.19.0: almost no tint, a soft inner glow, a 15 px blur and, in Chromium, the `#glass-distortion` filter the guest appends. Avoid: Liquid Glass.

**Live-activity pill** — The pill shown while something runs: the car charging, the water heater heating or a Hilo challenge. A further activity sits beside it as a small ring, and tapping it opens one card per activity above the Status checks. Avoid: status chip (the "All clear" chip it replaced).

**Attention pill** — The amber pill (red when critical) that appears when a status check has a problem, and opens the Status checks.

**Status checks** — The list of things that need attention, opened from the attention pill or from the live-activity pill's popup. Avoid: status block (removed from the Home card).

**Settings popup** — The popup behind the gear in the header: the theme (Dark or Light, and Auto), Sleep now, the text size, the glass and its transparency, and the version. Each choice is written to the browser's settings, and the shell applies it. Avoid: settings sheet (a sheet is a detail view of a tile), settings dialog.

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

**Fixture** — A house in the recorder's format under `test/unit/fixtures/houses/` (states, the three registries and, when asked, statistics), normally recorded from the real Home Assistant and anonymised with the owner's mapping; a model test starts from one with `fakeHass.fromFixture(name)`. The made-up houses of `test/houses/` are not fixtures; `sample.json`, a slice of the full test house written by the recorder from a fake connection so that the loader can be tested, is the one exception. Avoid: snapshot (the screenshot baselines).

**Household changelog voice** — The way a changelog line is written: plain sentences about what the household sees, as one paragraph.

**Hilo challenge** — A Hilo event that the live-activity pill follows with its phase and a countdown, from pre-heat until recovery ends; the smart stack's Critical peak card also appears for one.

**Pre-heat** — The first phase of a Hilo challenge, before the reduction; the countdown in the pill starts here.

**Recovery** — The last phase of a Hilo challenge, after the reduction; the pill's countdown ends when recovery ends, then shows a check for 10 minutes.

**Heat pump** — The climate entity named by `entities.heat_pump`, left out of the Climate tab's rooms by default and hidden in a house that has none.

**Departure schedule** — The car's departure times, which the Car pane lists with its controls (see the move order in the programme spec); its times go through the formatters.

## The code, as the programme names it

**Shell** — The layer in `src/shell/` and `src/main.js` that is the composition root: it receives `hass` from Home Assistant, feeds the store, and owns the rail, tab bar, sheet host, theme, idle-clock arming, settings popup and header. Also called the imperative shell.

**Feature** — One folder in `src/features/<name>/` for one subject (Weather, Lights, Car and so on), holding a pure model, its Lit elements and its styles; it never imports another feature.

**Model** — A pure, synchronous function `model(states, registries, config, now) → view model` with no DOM and no `hass` methods; `now` is passed in.

**Provider** — An adapter in `src/providers/`, its `read` a pure function, that turns an integration's entities (Environment Canada, Hilo, Hydro-Québec, FordPass, Wallbox, Mila, UniFi Protect, Adaptive Lighting) into the generic inputs a model expects, so a model never matches on an integration's naming. A feature can have several, applied in a declared order (the weather entity, then Environment Canada over it).

**UI kit** — The layer in `src/ui/` of small shared Lit elements and styles: card, tile, pane header, sheet, dial, ring, pill, chip, dimmer slider, chart wrapper and the design tokens.

**Core** — The layer in `src/core/`, the functional core: it imports only itself and npm packages, has no DOM, and is where the only code that touches `hass` lives; whatever it needs from the browser (time zone, locale, storage) it takes as a parameter.

**Store** — The per-element object that holds the current `hass`, the resolved config, the locale and the formatters, and notifies a subscriber only when one of its entity ids has a new state object (reference equality). It is never a singleton. Avoid: state manager.

**API client** — The one core module that sends every WebSocket message and service call the panel makes, with a typed request and reply for each; nothing else in `src/` calls `callWS`, `callService` or `connection.subscribeMessage`; its own method for a service call is `runService`. A read rejects with `StaleReply` if the config changed before the reply came back.

**Catalog** — The set of messages for one language, keyed by message key; the English catalog is the source of keys and the French catalog must have every one, with ICU MessageFormat plurals and placeholders. Avoid: the French map (the rewrite layer's).

**Message key** — The typed, feature-namespaced name of one string, such as `lights.auto`, passed to `t(key, values)`; a missing key is a compile error and a missing French translation is a test failure.

**Formatter** — A date, time or number function built on `Intl` from the user's Home Assistant locale, time zone and 12 or 24-hour and number-format choices.

**House rule** — One of the three deliberate overrides of `Intl` in the formatters: English `am` and `pm`, French time on the hour as `16 h`, and a narrow no-break space as the French thousands separator.

**Display name** — A name given to an entity, area or device after it passes through the display-name resolver: the config's `names:` block first, then the built-in dictionary of room words, then the name as Home Assistant gives it. Names are data, never message keys. Avoid: friendly name (the raw name Home Assistant gives, the last fallback).

**Legacy class** — The `LegacyPanel` class in `src/home-panel.js` and the files around it that the strangler fig is replacing; it only shrinks, and the number of modules it still holds is printed by `npm run lint`.

**Guest** — The legacy class while the shell hosts it: not an element but a renderer that implements `GuestRenderer` (`src/shell/guest.ts`), which `src/main.js` registers, the shell constructs and drives, and which draws only into its own containers inside the shell's one shadow root. The interface only shrinks, and it is deleted with the guest. Avoid: guest renderer, legacy renderer, the old class.

**Sheet host** — The shell's one mediator (`SheetHost`, `src/shell/sheet-host.ts`) for which sheet is open, Escape, focus return and where the five detail panels sit. The guest's sheets register with it as legacy sheets; an element's sheet is opened by its owner's template. Elements ask for a sheet with a `SheetRequestEvent` rather than importing the shell.

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
