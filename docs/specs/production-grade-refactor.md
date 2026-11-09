# Spec: production-grade refactor of the home panel

Status: draft, written 2026-11-07 from [docs/production-grade-plan.md](../production-grade-plan.md) and a survey of `main` at 2.11.1.
Scope: the migration to TypeScript and Lit in phases 0 to 4. Each phase ships as its own release and the panel never stops working.
Decisions taken after review on 2026-11-07: ApexCharts stays (its replacement by ECharts is dropped), and the HACS integration (phase 5) is deferred, not scheduled.
Phase 2 specified on 2026-11-08 (specs 09 to 13), with the owner's two additions of that day: the code base must teach the practices it uses (patterns named and sourced, decisions recorded as ADRs, the layering enforced by a linter), and the names people gave in Home Assistant follow the panel's language (`Salon` reads `Living room` in English), which reverses the "names are never translated" rule below; see the amendments in the phase-2 section.

## Child specs

This document is the programme: the why, the architecture and the rules every pull request obeys. Work is done from child specs, each one pull request, each pointing back here. Phases 0 and 1 are specified now; phases 2 to 4 are written only once phase 1 has shipped and the decision to continue is taken.

| #   | Spec                                                                                 | Phase | Depends on     | Why this order                                                                          |
| --- | ------------------------------------------------------------------------------------ | ----- | -------------- | --------------------------------------------------------------------------------------- |
| 01  | [Playwright Test replaces the smoke script](01-playwright-test.md)                   | 0     | nothing        | The test runner must exist before baselines can be recorded                             |
| 02  | [Screenshot baselines](02-screenshot-baselines.md)                                   | 0     | 01             | Baselines are recorded on untouched code so every later change is measured against them |
| 03  | [ESLint, Prettier and the reflow of long lines](03-lint-and-format.md)               | 0     | 02             | The reflow touches nearly every line; the baselines prove it changed nothing            |
| 04  | [Vitest and type checks on the pure modules](04-vitest-and-checkjs.md)               | 0     | 03             | Formatting first, so the JSDoc additions are a clean diff                               |
| 05  | [Changesets, Renovate, pinned Actions and CodeQL](05-changesets-renovate-codeql.md)  | 0     | 01             | Independent of 03 and 04; lands any time after the CI shape is set                      |
| 06  | [Vite build, ES modules replace text splicing](06-vite-build.md)                     | 1     | 02, 03, 04, 05 | The first change to how the panel is built; needs every guard rail in place             |
| 07  | [npm packages replace the committed vendor files](07-npm-packages-replace-vendor.md) | 1     | 06             | Needs a module build to emit lazy chunks                                                |
| 08  | [Montserrat ships with the panel](08-bundled-font.md)                                | 1     | 06             | Needs the module build to copy assets; the one approved visual change of phase 1        |
| 09  | [Architecture foundations](09-architecture-foundations.md)                           | 2     | phase 1        | The layer rules, ADRs, glossary and conventions must exist before the first core module |
| 10  | [Entity store, module globals leave the old class](10-entity-store.md)               | 2     | 09             | The store is what every other core module hangs off; expand, migrate, contract          |
| 11  | [Catalogs, formatters and display names](11-catalogs-and-formatters.md)              | 2     | 10             | Needs the store's language and time zone; new text (spec 13's card) needs the catalog   |
| 12  | [One typed API client](12-api-client.md)                                             | 2     | 10             | Needs the store's `hass` and config generation; independent of 11 and 13                |
| 13  | [Config schema and the config-error card](13-config-schema.md)                       | 2     | 10, 11         | The card's text comes from the catalog; the `names:` key is read by 11 and parsed here  |

Written later, one at a time: phase 3 as one spec per feature in the move order, written when that feature's turn comes (the shell first); phase 4 as one spec, the deletion of the French rewrite layer.

---

## Problem Statement

The panel works and is used every day on a wall tablet and on phones, but the way it is built makes every change slow, risky and prone to collide with other work:

- Almost everything lives in one 3,310-line class with about 200 methods and 95 instance fields. Every feature, from the Lights tab to the Automations flow charts, is edited in the same file, so two threads of work conflict in merges and renumber each other's releases (the install snippet in the README still says `?v=2.7.0` while the package is at 2.11.1).
- The panel draws HTML by string and sets `innerHTML` in about 52 places, escaping values by hand nearly 200 times. One missed escape on a media title or a calendar event is a script injection. Redrawing a container also throws away focus and slider state, which forced workarounds such as hand-tracked light drags and an Escape handler on `window`.
- Shared state (`hass`, the time zone, the French flag, the entity map, the rooms) lives in module-level variables. Two panels on one page would overwrite each other, and anything can change anything.
- Any change in `hass` re-runs thirteen render functions, throttled to once a second, on a tablet that runs all day.
- French is produced after the fact: a MutationObserver rewrites every text node by matching regular expressions over the English text (a 431-line map). A reworded English string silently stops translating; a third language would need a second rewrite layer. Dates are formatted as `en-CA` for everyone.
- There are no types and no lint. A regex test checks that called methods exist, and nothing else catches a wrong attribute name or a changed WebSocket reply shape.
- The build splices source files into placeholders as text. The 571 KB bundle is not minified, has no source maps and no tree shaking, so a stack trace points into a 4,386-line file.
- ApexCharts, Leaflet and Mermaid (2.5 MB) are committed as minified files that nothing watches for security fixes. ApexCharts is frozen at 3.45.2 because later majors changed licence.
- The Montserrat font loads from Google Fonts at runtime, so every wall tablet calls Google and the font fails offline.
- Unit tests cover the config resolver and the smart-stack rules. The logic inside the class (live activities, the energy split, lights) has no tests, and the smoke test (since replaced by the Playwright suite) checked that panes appear, not what they show.
- Versions are picked by hand in each branch. Installing means copying files, editing `?v=` and restarting Home Assistant.

For the person who owns the house, this shows up as: fixes take longer than they should, a release sometimes breaks something unrelated, updates are a chore, and French occasionally lapses back into English.

## Solution

Rewrite the panel in place, in TypeScript with Lit, over six phases that each land as a normal release:

0. **Guard rails.** Lint, format, type-check the pure modules, move unit tests to Vitest, record screenshot baselines for every tab in both sizes, both themes and both languages, and let Changesets pick version numbers. No visible change.
1. **Vite and TypeScript build around the same code.** Source files become ES modules, npm packages replace the committed vendor files, the font ships in the release, the main chunk is minified with source maps, heavy libraries stay lazy chunks. Every baseline screenshot stays identical.
2. **Typed core.** An entity store with per-card subscriptions, a typed WebSocket client, a config schema with readable errors, message catalogs with typed keys, `Intl` formatting from the user's Home Assistant profile. Module globals move into the store.
3. **Lit shell, then one feature per release.** The panel becomes a `LitElement`; the old renderer mounts inside it and shrinks as each feature moves out into its own folder with a pure model and tests. Order: Weather, Media, Security, Air, Energy, Climate, Car, Lights, Home, Automations, Idle clock. The old class is deleted at the end.
4. **Translations.** The French rewrite layer is deleted once every string comes from the catalog. ApexCharts 3.45.2 stays as the chart library.

Deferred: **install as an integration from HACS** (the plan's phase 5). It is kept at the end of this spec for the record and is not scheduled; for one house, a script that bumps `?v=` and restarts Home Assistant is enough.

From the user's side the panel looks and behaves the same through phases 0 to 3, gets lighter and faster, stops calling Google, speaks French everywhere by design, and shows a readable error when the configuration has a typo.

## User Stories

Actors: **household member** (anyone using the tablet or phone), **French-speaking user** (a household member whose HA profile is in French), **admin** (the HA user who configures the house), **maintainer** (the person who writes and reviews panel code), **agent thread** (one of several parallel Claude Code or human branches), **adopter** (someone installing the panel in another house), **CI**.

### Continuity during the migration

1. As a household member, I want the panel to keep working on the wall tablet through every release of the migration, so that the house never loses its dashboard.
2. As a household member, I want each tab to look pixel-identical before and after a release that only restructures code, so that I am not surprised by drift I did not ask for.
3. As a household member, I want a release that changes how a tab looks to be a deliberate decision I approved, so that the screenshots in the repository always match what I see.
4. As a household member, I want my current tab, theme, wallpaper and text-size choices to survive every update, so that the tablet does not reset itself.
5. As a household member, I want taps, swipes, drags and keyboard shortcuts to keep behaving exactly as today in every moved feature, so that I do not have to relearn the panel.
6. As a household member, I want the phone layout (four bottom tabs plus More) and the tablet layout (rail of ten tabs) to stay as they are, so that both devices stay familiar.
7. As a maintainer, I want every phase to end in a working, released panel, so that a stalled migration never leaves the house with two half-finished renderers.

### Structure and parallel work

8. As a maintainer, I want each feature (Lights, Climate, Weather, Energy, Car, Air, Media, Security, Automations, Home, Idle clock, Live pill) in its own folder, so that a change to one feature touches only that folder.
9. As an agent thread, I want to fix a bug in one feature without touching the file another thread is editing, so that our pull requests merge without conflicts.
10. As an agent thread, I want a documented, announced order in which features move, so that I know whether to put new work in the old class or in the new feature folder.
11. As a maintainer, I want pure model functions that take states, registries and config and return a view model, so that the logic of a feature can be read, tested and reviewed apart from its markup.
12. As a maintainer, I want integration-specific knowledge (Hilo, Hydro-Québec, Environment Canada, FordPass, Wallbox, Mila, UniFi Protect, Adaptive Lighting) in providers separate from the features that display it, so that an adopter can swap a provider without touching a feature.
13. As a maintainer, I want only one small core module to touch the `hass` object and the WebSocket connection, so that a change in Home Assistant's API is fixed in one place.
14. As a maintainer, I want no module-level mutable state, so that two panels on one page, or a panel re-created during tests, cannot bleed into each other.
15. As a maintainer, I want lines short enough to read in a diff, so that a reviewer can see what changed.

### Safety and correctness

16. As a household member, I want a media title, calendar event or area name containing `<`, `&` or quotes to display as text, so that no device name can inject markup into the panel.
17. As a household member, I want a slider I am dragging, a sheet I have open and the element I have focused to stay put when a thermostat or sensor changes, so that live updates never interrupt what I am doing.
18. As a maintainer, I want the type checker to fail the build when code reads an attribute that does not exist on a state object or mis-shapes a WebSocket request, so that this class of bug never reaches a tablet.
19. As a maintainer, I want lint to fail a pull request on an unused variable, an unescaped template, a missing `await` or an accessibility slip in a template, so that reviews focus on behaviour.
20. As a maintainer, I want the methods-exist regex test replaced by real type checking, so that a renamed method is caught along with every other kind of mistake.
21. As CI, I want the personal-data scan to cover every source, test and fixture file, so that a real name, address, IP or house entity id can never be committed.

### Performance and offline behaviour

22. As a household member, I want a change to one thermostat to redraw only the cards that read that thermostat, so that the tablet stays cool and responsive all day.
23. As a household member, I want the first paint of the panel to be as fast as today or faster, so that the tablet is usable as soon as Home Assistant loads.
24. As a household member, I want the chart, map and Mermaid libraries to load only when a tab needs them, so that the Home tab does not pay for the Automations tab.
25. As a household member, I want the Montserrat font to come from the panel's own files, so that the tablet never calls Google and the font works when the internet is down.
26. As a maintainer, I want CI to fail a pull request that grows the main chunk past a budget, so that the bundle does not creep.
27. As a maintainer, I want the production bundle minified with source maps, so that a stack trace from a tablet points at a real source line.

### Language and locale

28. As a French-speaking user, I want every string in the panel in French the moment it is drawn, so that nothing flashes English first and nothing is left untranslated.
29. As a French-speaking user, I want dates, times, numbers and units in Québec French form (16 h 07, 12,5, 1 234), so that the panel reads naturally.
30. As a household member, I want times shown in 12-hour or 24-hour form according to my Home Assistant profile, so that the panel matches the rest of Home Assistant.
31. As a household member, I want the names I gave to areas, scenes, lights, sensors and people in Home Assistant to appear untranslated, so that "Salon" stays "Salon" and "Living room" stays "Living room".
32. As a maintainer, I want a typed message key for every string and a test that fails when French lacks a key English has, so that a reworded English string cannot silently fall back to English.
33. As an adopter, I want to add a third language by adding one catalog file, so that the panel can speak German or Spanish without a rewrite layer.
34. As a maintainer, I want plurals and placeholders handled by the catalog (one thing needs attention, two things need attention), so that grammar does not live in string concatenation.

### Configuration

35. As an admin, I want a misspelt key in the panel's `config:` block to show a card naming the key and the line that is wrong, so that I do not hunt for a silently missing section.
36. As an admin, I want every option in `examples/configuration.yaml` to keep working with the same meaning, so that the migration does not change my configuration.
37. As an admin, I want both spellings of an entity key (snake_case and the short key) to keep working, so that an existing config does not break.
38. As an admin, I want the panel to keep finding what it can by itself (the weather entity, thermostats, people, lights, a FordPass car, Environment Canada sensors by town prefix, the Hilo gateway) when the config leaves it out, so that a minimal config still gives a full panel.
39. As a maintainer, I want the config schema to be the single source of truth that produces both the runtime validation and the TypeScript type, so that they cannot drift apart.

### Settings and shared state

40. As a household member, I want my theme, wallpaper, glass intensity, text size and last tab remembered per browser, as today, so that the tablet and my phone each keep their own look.
41. As a maintainer, I want per-browser settings versioned, so that a renamed or removed setting migrates or is dropped instead of crashing on read.
42. As an admin, I want the house-wide light order and the linked-room pairs to keep living in Home Assistant's frontend system data under the `home_panel` key, so that every screen agrees and nothing is lost in the move.
43. As a non-admin household member, I want Arrange and Linked with to stay read-only for me, so that only an admin changes the shared order.

### Tests

44. As a maintainer, I want screenshot baselines for every tab, on tablet and phone, light and dark, English and French, so that any visual change is seen and either fixed or approved.
45. As a maintainer, I want the made-up test house to stay the one place the panel is exercised end to end, so that a test reads like Home Assistant handing the panel a house.
46. As a maintainer, I want the end-to-end tests to drive the panel the way a person does (taps, drags, keys, the clock advancing) and never by calling panel methods, so that a rewrite of the internals does not break the tests.
47. As a maintainer, I want unit tests for each feature model with recorded, anonymised fixtures from a real house, so that today's behaviour is pinned before it moves.
48. As a maintainer, I want a fixture script that exports states and registries from a real Home Assistant and replaces names, places and ids with made-up ones, so that fixtures are realistic and safe to publish.
49. As a maintainer, I want an accessibility check on every tab and open sheet in every end-to-end run, so that a regression in roles, labels or contrast fails CI rather than waiting for a manual review.
50. (Deferred with phase 5.) As a maintainer, I want a nightly job that installs the panel into a real Home Assistant (stable and beta) with demo entities, signs in and opens every tab, so that a frontend change in Home Assistant is caught before an update reaches the house.
51. As CI, I want the pipeline ordered lint and types, then unit tests, then build and size check, then end to end, screenshots and accessibility, so that cheap failures stop the run early.
52. As a maintainer, I want the vendored-file test, the placeholder test and the methods-exist test retired when the things they protect are gone, so that the suite describes the current code.

### Build, dependencies and releases

53. As a maintainer, I want a single `npm run build` that produces the release files from ES modules with Vite, so that there are no placeholders to keep in sync.
54. As a maintainer, I want ApexCharts, Leaflet, Mermaid and Lit as npm dependencies with their licences recorded, so that Renovate and CodeQL watch them.
55. As a maintainer, I want ApexCharts pinned to its 3.x major with Renovate told to ignore its major updates, so that the MIT version stays and nobody upgrades into the dual licence by accident.
56. As a maintainer, I want each pull request to say whether it is a patch, minor or major change and the version and changelog to be computed at merge, so that two threads never both ship 2.9.0.
57. As a maintainer, I want the changelog to keep its current voice (plain sentences about what the household sees), so that it stays readable by the people who use the panel.
58. As a maintainer, I want GitHub Actions pinned by commit and dependencies kept current by Renovate, so that the supply chain is watched.
59. As a maintainer, I want the release workflow to keep attaching a zip for people who install by hand, so that the old install path still works until the HACS integration is the default.

### Installation and updates (deferred with phase 5)

60. As an admin, I want to install the panel from HACS and then add it from Settings, Add integration, so that I never copy files or edit YAML to get started.
61. As an admin, I want updates to come from HACS and a restart, with no `?v=` edit, so that the cache busting is automatic.
62. As an admin, I want my existing `panel_custom:` YAML and `config:` block to keep working during the transition and to be importable into the integration, so that I switch when I choose to.
63. As an admin, I want the integration to serve the panel's files itself, so that the panel version shown in the settings popup is the one Home Assistant is running.
64. As an adopter, I want the HACS and hassfest validation actions to pass on every pull request, so that the integration is accepted by HACS and stays accepted.
65. As an admin, I want the infrastructure repository for my own house to pin an integration version instead of copying a bundle, so that updating is one version bump.

### Reviewing and observing

66. As a maintainer, I want a pull request's screenshot diffs attached as artifacts when they fail, so that I can approve or reject a visual change from the PR.
67. As a maintainer, I want the test house's console service calls and WebSocket writes still captured by the tests, so that a behaviour test can assert what the panel sent to Home Assistant.
68. As a maintainer, I want the plan's six gates each expressed as a check I can run, so that "phase done" is a command result and not an opinion.

## Implementation Decisions

Decisions are grouped by phase. A decision that spans phases is stated where it first applies. Vocabulary follows the README and changelog: _tab_ and _pane_ (the ten subjects on the tablet rail), _sheet_ (a detail view opened from a pane), _tile_, _card_, _chip_, the _live-activity pill_, the _smart stack_, the _idle clock_, _Arrange_, _linked rooms_, _Status checks_, _who's home_, the _test house_.

### Global decisions

- **Language and framework.** TypeScript in strict mode, Lit 3.x. No Vue, Svelte, React or Preact. Types for `hass`, states, registries and the connection come from `home-assistant-js-websocket`; anything it does not type (panel properties, frontend system data, trace replies, forecast subscriptions) is typed in the core's own declaration file.
- **Rewrite in place, not a parallel version 3.** The `main` branch stays releasable at every merge. There is no long-lived migration branch.
- **Gates.** A phase is complete when its gate check passes on `main`. Gates: (0) lint, types and screenshot baselines green; (1) every baseline screenshot identical to the pre-phase release; (2) core modules at full statement coverage by unit tests and every module global gone from the old class; (3) old class deleted and axe reports no serious or critical issue on any tab or sheet; (4) main chunk under the size budget set in phase 1 and the French rewrite layer deleted.
- **Charts.** ApexCharts stays at its 3.x major (3.45.2 today, the last plain-MIT line). Later majors are dual-licensed, so Renovate ignores ApexCharts major updates and a future upgrade needs a licence review first. The chart wrapper in the UI kit still hides the library from features, so a swap stays possible, but none is planned.
- **No behaviour change inside a structural phase.** Phases 0, 1, 2 and each phase-3 move are pixel-identical refactors. Any deliberate visual change is its own pull request with an approved baseline update, and it is never bundled with a move.
- **Parallel work rule.** Until a feature has moved in phase 3, fixes and new work for it go into the old class as today; the move pull request rebases on top. After a feature has moved, work for it goes into its folder. The move order is fixed and announced in the changelog of the release that starts phase 3. One feature moves per pull request.
- **Personal data.** The existing banned-pattern scan extends to every file under the source, test and fixture directories, including recorded fixtures.
- **Browser support.** Chromium-class browsers (the wall tablet's kiosk browser, Chrome, Edge) and Safari on iOS and iPadOS. The Liquid Glass SVG lens stays Chromium-only as today. Playwright runs Chromium in CI; WebKit is added to the smoke run (not the screenshot run) in phase 3.

### Phase 0: guard rails

- **Lint and format.** ESLint with typescript-eslint and eslint-plugin-lit, plus Prettier, configured once at the root. The existing JavaScript is linted as JavaScript with checks off that would require a rewrite (the rules are tightened per file as files move to TypeScript). Lines are capped at a readable width; the 111 lines over 300 characters are reflowed, which is a format-only change verified by identical screenshots.
- **Type checking of the pure modules.** `tsc --checkJs` with JSDoc types on the config resolver and the smart-stack module, since they are already pure and tested. The main class is not type-checked yet.
- **Vitest replaces `node:test`.** The existing unit tests move as-is. The config and stack tests stop evaluating source text with `new Function` once those files become modules in phase 1; in phase 0 they keep the current loader.
- **Playwright Test replaces the smoke script.** The smoke script becomes Playwright Test spec files, one per subject. The fake-house HTTP server becomes a Playwright web server. The test house stays as it is.
- **Screenshot baselines.** One screenshot per tab per matrix cell: viewport (tablet 1180×820, phone 393×852) × theme (light, dark) × language (en, fr) × house (full; bare for the subset of tabs it shows). Plus: the idle clock with a smart-stack card, the light sheet open, the live-activity popup open, the Status checks open, the settings popup open. Screenshots are taken with reduced motion on, a fixed clock, a fixed timezone (America/Toronto) and fonts served locally (Google Fonts blocked). Baselines are stored in the repository and compared with a small per-pixel tolerance to absorb anti-aliasing. Any diff fails the run and uploads the actual, expected and diff images as artifacts.
- **End-to-end tests drive the panel as a person does.** The smoke test, now replaced by the Playwright suite, reached into the panel (`idleStart`, `idleArm`, `renderLive`, `renderHome`, `renderIdle`, `setTab`, `stackGo`, `openLight`, reading `.tab` and `.open`). These are replaced: the idle clock is reached by advancing the fake clock past five minutes; a sheet is opened by tapping its tile; a tab by tapping its button; a state change by the harness mutating its `hass` and re-assigning the property, which is what Home Assistant does. The panel exposes no test-only methods. The harness may expose helpers on `window` (set a state, advance time), since the harness is the test's side of the boundary.
- **Changesets.** Every pull request adds a changeset (patch, minor, major) with the changelog line in the current voice. A release pull request accumulates them; merging it bumps the version, writes the changelog and tags. The release workflow stays tag-driven. The first changeset bootstraps from 2.11.1.
- **Renovate** for npm and GitHub Actions, with Actions pinned by commit SHA. **CodeQL** on JavaScript and TypeScript.

### Phase 1: Vite and TypeScript build around the same code

- **ES modules replace text splicing.** The CSS files, the French layer, the Automations module, the config resolver and the stack module become imports. The placeholder build and its test are deleted. CSS is imported as text and adopted as a constructed stylesheet in the shadow root in the current order (motion last).
- **Vite in library mode** produces one ES module entry plus lazy chunks for ApexCharts, Leaflet and Mermaid, minified, with source maps shipped beside the bundle. The version is injected from the package at build time. The entry file name and the chunk directory are stable so the panel's lazy loader can find them relative to its own URL, as it does today.
- **npm packages replace committed vendor files.** ApexCharts is installed at 3.45.2 and pinned to the 3.x major. Leaflet and Mermaid move to current releases that Renovate then tracks. The licences file lists packages and versions instead of files. The vendored-files test is retired.
- **The font ships in the release.** Montserrat (OFL) in the weights used today is bundled as woff2 and declared with `@font-face` pointing at the panel's own URL. The Google Fonts link is removed. The end-to-end run asserts that no request leaves for `fonts.googleapis.com` or `fonts.gstatic.com`.
- **Size budget.** `size-limit` fails a pull request whose main chunk (gzipped) exceeds the budget. The budget is set at the first phase-1 measurement plus ten percent and is lowered, never raised, without a changeset that says why.
- **Mixed JavaScript and TypeScript.** `allowJs` lets the old class stay JavaScript while new files are TypeScript. The old class is typed as `any`-heavy and excluded from strict checks until deleted.
- **Gate check.** Every baseline screenshot identical to the pre-phase release, no outbound font request, source maps present, size budget recorded.

### Phase 2: typed core

- **Entity store.** The shell receives `hass` from Home Assistant and feeds a store. The store holds the current `hass`, the resolved config, the user's locale and the formatters, and offers subscriptions keyed by entity id (and by registry: areas, devices, entities). A subscriber is notified only when one of its entity ids changed between two `hass` objects, by reference comparison of state objects, which is how Home Assistant's own cards skip work. The store is handed down through `@lit/context`; nothing imports it as a singleton.
- **Module globals move into the store.** `hass`, `TZ`, `FR`, `E`, `ROOMS`, `HOUSEHOLD`, `SCENE_ORDER`, `MODES`, `AL_AREAS`, `SPLIT_AREAS`, `LIGHT_LINKS`, `CFG` and the French name set are deleted from module scope. The old class reads them from the store through a thin accessor so its code changes minimally; the accessor goes away with the class.
- **Typed API client.** One module wraps every WebSocket call the panel makes, with a typed request and reply for each: history during a period, statistics during a period, frontend system data get and set under the `home_panel` key, trace list and get, automation config, lovelace resources (for the radar card), weather forecast subscriptions (daily and hourly), camera thumbnails, and service calls. Callers never build a WebSocket message themselves. In-flight requests carry the config generation they started under, so a reply for a stale config is dropped, keeping today's behaviour.
- **Config schema.** A schema library produces both the runtime validator and the TypeScript type of the panel's config. The schema encodes everything `examples/configuration.yaml` documents, both spellings of entity keys, the room shorthand (a bare climate entity id) and the long form, light links as pairs or objects, the idle stack block and the car block. Unknown keys and wrong types produce errors that name the path (for example `rooms[1].icon`) and the accepted values. On an invalid config the panel renders a readable config-error card at the top of the Home tab and otherwise runs with the valid parts and defaults. Discovery (weather entity, Environment Canada sensors by town, Hilo gateway, thermostats, people, FordPass car) stays in the resolver and keeps its current rules, now typed and tested with fixtures.
- **Message catalogs.** An English catalog is the source of keys; a French catalog must have every key. Keys are namespaced by feature (for example `lights.auto`, `energy.today`). Messages use ICU-style placeholders and plurals through `intl-messageformat`, the library Home Assistant uses. A `t(key, values)` function with typed keys is provided through context; a missing key is a compile error, a missing French translation is a test failure. Québec French conventions from the current map (16 h 07, decimal comma, narrow no-break space thousands separator) are carried by the formatters, not by string rewriting.
- **Formatters from the Home Assistant profile.** Dates, times and numbers go through `Intl` with the user's HA language, the HA profile's 12/24-hour choice and number format, and the HA configured time zone. The `en-CA` hard coding is removed. The names people gave in Home Assistant are never passed through the catalog.
- **Per-browser settings.** Theme, text size, wallpaper, glass intensity and last tab stay in `localStorage` under the current keys so nothing resets, wrapped in a settings module with a schema version. Reads tolerate missing or malformed values and fall back to the defaults.
- **Gate check.** Store, API client, config schema, catalogs, formatters and settings at full statement coverage in Vitest; no module-level mutable variable left in the old class; screenshots identical.

Amended 2026-11-08, when the phase-2 specs were written (each item says which spec holds the reasoning):

- **Foundations first (spec 09).** The six layers and the dependency rule are enforced by `dependency-cruiser` in `npm run lint` from the first core module; the decisions already taken are backfilled as ADRs in `docs/adr/`; `CONTEXT.md` and `docs/architecture.md` are written; every new module opens with a header naming the pattern it applies and its source. The owner wants the code base to teach the practices it uses.
- **The store is not provided through `@lit/context` in phase 2 (spec 10).** There is no consumer before the shell, and `lit` is not a dependency until phase 3; the shell spec adds the provider. The store is still per element and never a singleton. The globals removal is sequenced as expand, migrate, contract (Fowler's Parallel Change) so `main` stays mergeable for the other threads throughout.
- **`en-CA` leaves the class for one module, but the class keeps formatting in English until phase 4 (spec 11).** The rewrite layer parses English dates, times and numbers out of text before it matches the map's templates; French output from the class would stop them matching. The class uses the formatter module pinned to English; new code and each moved feature use the locale-aware set. The three Québec conventions become explicit "house rules" in the formatter, tested against the layer.
- **Names follow the panel's language (spec 11), reversing "the names people gave in Home Assistant are never passed through the catalog".** They still do not pass through the catalog (they are data, not code strings); they pass through a display-name resolver: the house's `names:` block in the config, then a built-in dictionary of common room words, then the name as given. `Salon` reads `Living room` in English and `Salon` in French.
- **The locale tag is the profile's language plus the Home Assistant country (spec 11)**, `CA` when unset, so today's output is the fallback and a German house gets `de-DE`. `time_format` and `number_format` are mapped as Home Assistant's own utilities map them.
- **No camera WebSocket call (spec 12).** The panel builds a `camera_proxy_stream` URL and never calls `camera_thumbnail`; the client has no camera method.
- **Stale replies are a typed rejection (spec 12).** Reads reject with `StaleReply` when the config generation moved; writes and subscriptions never do.
- **The config is parsed, not validated (spec 13).** `superstruct`, the library Home Assistant's frontend uses for card configs, is the single source of the type and the parser; problems are values, the panel is a tolerant reader, and the error card is admin-only.

### Phase 3: Lit shell, then one feature per release

- **Shell.** The `home-panel` element becomes a `LitElement` with reactive `hass`, `narrow` and `panel` properties. It owns the rail and phone tab bar, the sheet host, the theme (light, dark, follows the sun), the idle clock arming, the settings popup and the header (greeting, chips, live-activity pill). On the first shell release the old renderer mounts into a slot inside the shell and still draws every pane; the shell only replaces the outermost frame.
- **Feature folders.** Each feature folder holds a pure model, one or more Lit elements, and its styles. The model's signature is `model(states, registries, config, now) → view model`, synchronous and without DOM or `hass` methods. Service calls are made by the elements through the API client. Providers (Environment Canada, Hilo, Hydro-Québec, FordPass, Wallbox, Mila, UniFi Protect, Adaptive Lighting) are pure functions that turn integration-specific entities into the generic inputs the models expect, so that a model never matches on an integration's entity naming.
- **UI kit.** Card, tile, sheet, dial, ring, pill, chip, dimmer slider, chart wrapper and the design tokens become small Lit elements and shared styles. The existing CSS files are split by feature as the features move; the base, glass, phone and motion styles become the kit's shared sheets.
- **Move order and what each move carries.** Weather (now card, forecast, season, alerts, radar card loading), Media (TV, speakers, scenes and routines tiles), Security (sensors, cameras, camera sheet), Air (purifiers, room air, air sheet, air controls), Energy (flow, summary, water heater, Hilo, energy sheet and charts, Sankey), Climate (tiles, list, gauge, house series, dial, controls), Car (card, sheet, sessions, controls, departure schedule), Lights (tiles, sheet with two sliders, Auto and Night, linked rooms picker, Arrange, saved order), Home (layout packing, who's home, home smart stack), Automations (trace list, Mermaid flow), Idle clock (clock, weather icon, smart stack rotation, wake). The live-activity pill and the Status checks move with the shell's header and are extracted as their own feature after Energy and Car, which they read.
- **Each move.** Extract the model with unit tests against recorded fixtures that pin today's output; write the Lit elements; subscribe only to the entity ids the model reads; delete the corresponding methods from the old class; the screenshot baselines for that feature must not change. Behaviour tests for the feature (for example the light sheet's drag sending one brightness call, Arrange saving the order to system data) move from the smoke script into the feature's Playwright spec with user-level actions.
- **Rendering rules.** Templates are Lit templates; `innerHTML` and the hand escaper are not used in new code. Lists use `repeat` keyed by entity id so DOM nodes survive updates. Focus, open sheets and drags are never reset by a `hass` update.
- **Accessibility.** The current roles, labels, keyboard handling, 44-point targets and reduced-motion behaviour are kept. axe-core runs on every tab and every opened sheet in the end-to-end run from the first shell release; a serious or critical finding fails the run.
- **Gate check.** The old class file deleted along with its accessor and the methods-exist test; axe clean; screenshots identical except for approved changes.

### Phase 4: translations

- **The French rewrite layer is deleted.** By the end of phase 3 every string comes from the catalog; the MutationObserver, the token regexes and the name set are removed. A test asserts that the English catalog has no key unused by the code and the French catalog has no key missing. This is one deletion pull request plus one test, and it closes phase 3 in practice.
- **Charts are untouched.** ApexCharts stays; see the global charts decision.
- **Gate check.** Main chunk under the phase-1 budget; no French rewrite code.

### Phase 5 (deferred): install as an integration from HACS

Not scheduled. Kept so the reasoning stays on record; revisit if another house adopts the panel or if the `?v=` edit becomes a real chore. Until then the install stays the release zip plus the `panel_custom:` block, and a small script in the house's infrastructure repository bumps `?v=` and restarts Home Assistant.

- **Integration.** A `home_panel` custom integration (about a hundred lines of Python) with a manifest, a config flow with no fields (one instance), and HACS metadata. On setup it registers a static path for the built frontend and calls `panel_custom.async_register_panel` with the module URL carrying the frontend version, so a new release is a new URL and no cache busting is needed. The sidebar title, icon and `require_admin` keep today's defaults.
- **Configuration during the transition.** The integration accepts the existing `config:` block as YAML under its own domain and passes it to the panel as the panel config, so an admin's configuration moves by indentation only. A documented path from the old `panel_custom:` block to the new one is in the README. Storing settings in the integration's own storage, editable from the gear menu, is a later spec.
- **Repository layout.** The built frontend is committed into the integration's folder by the release workflow (as HACS integrations with frontends do), or built in the release job and attached, with the layout HACS requires. The release zip for manual installs stays as a second asset.
- **Validation.** The HACS validation action and hassfest run on every pull request. CodeQL covers Python.
- **Nightly real Home Assistant.** A workflow starts Home Assistant stable and Home Assistant beta in Docker with demo entities and the integration installed, signs in with Playwright, opens every tab and sheet, and fails on a page error or a missing pane. It runs nightly and on every release tag. It does not take screenshots (demo data is not the test house).
- **Gate check.** Nightly green on both channels; HACS and hassfest green; an install from a fresh HACS shows the panel in the sidebar with no YAML.

### Interfaces that stay fixed

- The element name `home-panel` and the properties Home Assistant sets on it: `hass`, `narrow`, `panel` (with `panel.config`).
- The `config:` block's keys and meanings as documented in `examples/configuration.yaml`.
- The frontend system data key `home_panel` and the shape of `light_order` and `light_links` stored under it.
- The `localStorage` keys for per-browser settings.
- The console protocol the test house uses to observe the panel: service calls logged as `SERVICE <domain>.<service> <json>` and system-data writes as `WS <json>`. This belongs to the harness, not the panel, and stays as the way behaviour tests observe outbound calls.

## Testing Decisions

### What makes a good test here

A good test states what a household member or Home Assistant would observe, not how the panel got there. It sets up a house (states, registries, config, time), performs what a person does (tap, drag, press a key, wait), and asserts what is visible (text, a screenshot, an attribute) or what left for Home Assistant (a service call, a system-data write). It never calls a panel method, reads a private field, or asserts on the DOM structure beyond stable, labelled elements. A test that would break under a correct refactor is a bad test.

### The two seams

1. **The hass boundary (primary).** The test house in the harness builds a `hass` object (states, entities, devices, areas, config, user, locale, `callService`, `callWS`, `connection`) and hands it, with `panel.config` and `narrow`, to `<home-panel>`, exactly as Home Assistant does. Playwright Test drives Chromium against it for screenshot baselines, behaviour tests and axe. If phase 5 is ever scheduled, a real Home Assistant in Docker replaces the fake at the same boundary for a nightly job. The harness gains `window` helpers to set a state and to advance time; the fake `callWS` gains replies as new API calls are typed. Everything the panel does is testable at this seam.
2. **Pure models (secondary).** The config resolver and schema, the smart-stack rules, each feature's model, each provider, the catalogs and the formatters are plain functions. Vitest calls them with recorded fixtures and literal inputs. These tests pin today's logic before a feature moves and document edge cases (a thermostat without an area, a car with no time-to-full, a Hilo challenge in recovery).

Nothing in between: no tests of Lit component internals, of the store's subscription mechanics in isolation, or of the API client against a mocked socket. The store and client are covered by the models' fixtures feeding them and by the harness exercising them.

Amended 2026-11-08 (decision taken with the owner when the phase-2 specs were written; ADR 0005): the first seam is also used in Vitest. A fake `hass` object of the same shape the harness builds (`test/unit/fake-hass.ts`) is handed to the store and the API client in Node, and a test asserts what a subscriber sees, what message left and what typed value came back. This is a second adapter at the same seam, not a new seam, and it is what makes the phase-2 gate ("full statement coverage in Vitest") a command. No socket is mocked and no private field is read.

### What is tested where

| Subject                                                                                                                        | Seam                       | Notes                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------ |
| Every tab on every matrix cell (viewport × theme × language × house)                                                           | Harness, screenshot        | The contract for phases 0 to 3                                           |
| Idle clock, smart stack rotation, wake on tap                                                                                  | Harness                    | Fake clock advanced past 5 minutes and in 20-second steps                |
| Live-activity pill, Status checks, attention pill                                                                              | Harness                    | State mutation through the harness, then re-assigning `hass`             |
| Light tiles, sheet sliders (drag, tap, arrows), Auto and Night, linked rooms picker, Arrange, saved order, admin-only controls | Harness                    | Asserts the service calls and system-data writes observed on the console |
| TV and speaker controls, scenes, Pause charging                                                                                | Harness                    | Asserts service calls                                                    |
| Optional sections hidden in the bare house                                                                                     | Harness                    | Water heater, Hilo, Car tab, Climate tab                                 |
| No outbound font request; no page error; nothing covering the Home tab button                                                  | Harness                    | Kept from the smoke test                                                 |
| axe on every tab and open sheet                                                                                                | Harness                    | Serious and critical fail                                                |
| Config resolution, discovery, aliases, schema errors                                                                           | Vitest                     | Prior art: the config tests                                              |
| Smart-stack picking, hour windows, reminders                                                                                   | Vitest                     | Prior art: the stack tests                                               |
| Each feature model and provider                                                                                                | Vitest                     | New, written during each phase-3 move, with recorded fixtures            |
| Catalog completeness, placeholder parity, plural forms, Québec French formatting                                               | Vitest                     | Prior art: the French tests                                              |
| Store change detection and subscriptions, settings defaults, API client messages and replies, display names                    | Vitest, fake `hass`        | Phase 2; the fake is the harness's `hass` shape in Node                  |
| Layer rules, import cycles, graph drift, legacy footprint                                                                      | dependency-cruiser, Vitest | Phase 2 (spec 09); runs in the lint job                                  |
| Settings migration                                                                                                             | Vitest                     | Malformed and missing values                                             |
| Build output: version present, source maps present, size budget, no personal data                                              | Vitest and size-limit      | Prior art: the build test                                                |

### Fixtures

A script exports states, the entity, device and area registries and a sample of history and statistics replies from a real Home Assistant, replaces names, places, ids and coordinates with made-up ones by a mapping table kept outside the repository, and writes the result under the test fixtures directory. The personal-data scan runs over the fixtures. The test house in the harness stays hand-written and small; fixtures feed the model tests.

### Prior art in the repository

The config resolver tests and the stack tests show the pure-function style. The smoke script shows the house set-ups, the console protocol for observing service calls and system-data writes, the viewports, the fixed clock and the reduced-motion setting; its checks are carried over one by one into Playwright specs with user-level actions. The build test shows the personal-data scan.

## Out of Scope

- Any visual or interaction redesign, including the fifteen refactors in the Apple HIG audit and the ideas backlog. Those are separate specs that run on top of the new structure; a structural phase changes no pixel.
- New features, tabs, cards or integrations, and new configuration options beyond what the schema needs to express today's config.
- Vue, Svelte, React or Preact; Rust, Elm or Dart compiled to the web.
- Replacing ApexCharts with ECharts or any other chart library (decided 2026-11-07: keep ApexCharts 3.x).
- The HACS integration, the nightly real-HA Docker job, hassfest and HACS validation (deferred with phase 5).
- Storing the panel's configuration in the integration and editing it from the gear menu (named as a later spec).
- Self-hosted CI runners (GitHub-hosted runners were decided on 7 Nov).
- Replacing Leaflet or the Weather Radar Card dependency, or Mermaid.
- Supporting browsers other than Chromium-class and Safari.
- Changes to Home Assistant itself or to the other integrations the panel reads.

## Further Notes

- The plan measured `main` at 2.8.1 (3,274 lines); at 2.11.1 the class is 3,310 lines and the git clone holds no tags yet, so Changesets starts from 2.11.1 and the first tag the release workflow sees will be the phase-0 release.
- The README's install snippet (`?v=2.7.0`) is itself an example of the hand-picked-version problem; phase 0 fixes it by having Changesets write the version into the README snippet, and phase 5 removes the snippet's reason to exist.
- The size budget is measured, not guessed: phase 1's first minified build sets it. Lit adds about 6 KB gzipped; ApexCharts (135 KB gzipped), Leaflet (43 KB) and Mermaid (746 KB) load lazily so they do not count against the main chunk.
- ApexCharts licence: 3.x is plain MIT. Later majors are dual-licensed (a free Community tier under MIT or a Community agreement, and a paid Commercial tier for organisations above a revenue threshold). The exact major where this started was not confirmed from an official changelog; read the agreement before any upgrade past 3.x.
- Québec French conventions worth preserving exactly: `16 h 07`, no `h` suffix when minutes are `00` in some places and `16 h` in others, decimal comma, narrow no-break space as thousands separator, `¢/kWh`, degree sign spacing. The current French map is the reference for every catalog entry and should be mined, not discarded, when writing the French catalog.
- Home Assistant hands the panel a new `hass` object on every state change; the store must compare state objects by reference per entity id, not deep-compare, to keep the per-card update cheap.
- Two things the smoke test does today that the new tests should keep doing: route Google Fonts requests to abort (until phase 1 removes them, then assert none happen), and record the whole console so a test can quote the service calls when an assertion fails.
- The move order in phase 3 starts with the features that have the least shared state (Weather, Media, Security, Air) and ends with the ones that read everything (Home, Automations, Idle clock), so the old class shrinks from its edges inward.
- The plan's four open decisions (framework, start now, HACS integration, parallel features during phase 3) are taken here as: TypeScript and Lit; start phase 0 now; HACS integration deferred; keep shipping features in parallel under the parallel-work rule.
- Recommended pacing from the review: ship phases 0 and 1 now, then live with the result for a month before committing to phases 2 and 3. If merge conflicts and French lapses continue, start phase 3 with Lights alone and decide the rest after one feature has moved. Taken on 2026-11-08: the owner chose to specify phase 2 right after phase 1 shipped, with the architecture allowed to go further than the minimum where it teaches something (ADRs, enforced layering, a reading list), since learning the practices is a goal of the project alongside the panel itself.
