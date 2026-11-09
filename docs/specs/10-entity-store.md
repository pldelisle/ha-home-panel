# Spec 10: Entity store, and the module globals leave the old class

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 2.
Depends on: [09 architecture foundations](09-architecture-foundations.md). Blocks: [11 catalogs and formatters](11-catalogs-and-formatters.md), [12 API client](12-api-client.md), [13 config schema](13-config-schema.md).
Ships as: three pull requests in the expand, migrate, contract order below, each a patch release or no release, no visible change. ADR 0012 lands with the first.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

Everything one panel knows about its house is kept in variables at module scope, shared by every `<home-panel>` on the page and reachable from any function:

- In the class file: `E` (the entity map, 54 keys, read 275 times), `ROOMS` (30 reads), `HOUSEHOLD`, `SCENE_ORDER`, `MODES`, `AL_AREAS`, `SPLIT_AREAS`, `LIGHT_LINKS` and `CFG`, all filled in place by `applyConfig()` each time the panel config changes, and `LP`, a cache of date parts keyed by hour.
- In the legacy globals module (spec 06's scaffolding): `hass` and the time zone `TZ`, read through `getHass()` and `getTZ()` 74 times in the class, 7 times in the Automations module and once in the French layer, plus the helpers `st`, `num`, `attr`, `kw`, `fmtTime`, `fmtDate`, `localDay` and `hourNow` that read them.
- In the French layer: the `FR` flag (a live binding set from the class) and the cache of names the house gave in Home Assistant, kept for a minute.
- In five methods of the class: the per-browser settings, read from `localStorage` under five keys, each read wrapped in its own `try`, each default repeated at the read site.

Two panels on one page would overwrite each other's entity map and rooms. Any function can change any of it, so nothing can be reasoned about locally. Every new `hass` object, which Home Assistant hands over on every state change in the house, calls `tick()`, which runs thirteen render functions once a second whether or not anything they read has changed. The French layer's unit tests reset the module registry between tests because its cache is module state. Phase 3 cannot start: a Lit component needs a store to subscribe to, and "a thermostat change doesn't redraw the car" needs the store to know which entity ids changed.

In the vocabulary of the reading list: the element is doing everything at once, with its dependencies created rather than accepted, so nothing in it can be tested without a browser; the structure has no functional core.

## Solution

Give each `<home-panel>` element its own **store**: a small, deep module (Ousterhout) that receives `hass` and the panel config, resolves the config once per change, exposes states, registries, the user, the time zone and the language, and offers subscriptions by entity id that fire only when one of those ids has a new state object, by the reference-equality rule Home Assistant's own frontend documents. The store is the first piece of the **functional core**: no DOM, no `hass` methods, dependencies accepted as arguments; the element becomes the **humble object** (Meszaros, Fowler) that only forwards what Home Assistant gives it. A **settings** module owns the five `localStorage` keys behind a `Storage` parameter. The French layer becomes a factory that takes the store, so its cache belongs to the panel that made it.

The removal of the globals is a **wide refactor** (a few hundred call sites in one 8,300-line file), so it is sequenced as Fowler's **Parallel Change**: expand (the store exists beside the globals and the class is given accessors), migrate (call sites move in batches, CI green between batches), contract (the globals are deleted). The screenshot baselines, the **characterization tests** of this rewrite (Feathers), prove nothing visible changed at each step; a new behaviour test mounts two panels with two configs on one page and checks that each shows its own house.

## User Stories

1. As a maintainer, I want every piece of per-panel state to live on the element or its store, so that I can find what a method reads by following `this`.
2. As a maintainer, I want two `<home-panel>` elements on one page to show two houses, so that the panel is a well-behaved web component and a test can mount two.
3. As a maintainer, I want the store to tell a subscriber which entity ids changed between two `hass` objects, so that phase 3 can redraw a card only when something it reads changed.
4. As a maintainer, I want the store to compare state objects by reference, the way Home Assistant's own cards do, so that a `hass` update with ten thousand entities costs one pass and no deep comparison.
5. As a maintainer, I want notification cost to grow with the number of changed ids, not with the number of cards, so that a wall tablet with fifty cards and one changing sensor does fifty times less work than today.
6. As a maintainer, I want one typed description of the `hass` object the panel uses, so that a wrong property name is a type error and not `undefined` on a tablet.
7. As a maintainer, I want the registries (entities, devices, areas) and the entity-to-area lookup in one place, so that the six copies of that lookup in the class become one.
8. As a maintainer, I want the per-browser settings read and written by one module with one default per key, so that a malformed value cannot throw inside a render and a new setting is one line.
9. As a household member, I want my theme, text size, wallpaper, glass level and last tab kept exactly as before an update, so that the tablet does not reset on me.
10. As an agent thread, I want the store and settings covered by Vitest with a fake `hass` and a fake `Storage`, so that I can change them with a fast test and no browser.
11. As an agent thread, I want the French layer to take the store it works on, so that its tests no longer reset the module registry to isolate a cache.
12. As a maintainer, I want the globals removed in batches with CI green between them, so that other threads can keep merging into the class while the migration runs.
13. As a maintainer, I want the legacy globals module to export only pure helpers, so that its export list stops being an inventory of state to remove.
14. As a maintainer, I want the phase-2 gate "no module-level mutable variable left in the old class" to be a grep I can run, so that the gate is a command result.
15. As CI, I want the store, settings and the typed `hass` description at full statement coverage, so that the gate is enforced on every pull request.
16. As a learner, I want the store's header and ADR to name the patterns it applies (functional core, humble object, observer, reference equality) and where to read them, so that the first core module teaches the shape of the rest.
17. As a household member, I want the panel to look and behave exactly as before, so that a structural release is invisible to me.
18. As a maintainer, I want the lazy chunk loaders (ApexCharts, Mermaid) to stay as they are, so that a library still loads once per page and not once per panel.

## Implementation Decisions

### The store

`src/core/store.ts`, TypeScript in strict mode, exports a factory that returns one store per element. The element creates its store in its constructor and keeps it as `this.store`. Nothing imports a store as a singleton; nothing at module scope in `src/core/` is mutable. The header names the patterns: functional core (Bernhardt), observer with reference-equality change detection (Home Assistant frontend data docs), dependencies accepted not created (Ousterhout, _A Philosophy of Software Design_, on deep modules and information hiding).

The interface is the contract specs 11, 12 and 13 build on. The shape below fixes the decision; names may be refined, roles may not:

```ts
interface PanelStore {
  readonly hass: PanelHass | null;
  readonly config: ResolvedConfig;        // resolveConfig() of the panel config, today's shape (spec 13 types it)
  readonly generation: number;            // +1 on every config change; the stale-reply guard of spec 12
  readonly timeZone: string;              // hass.config.time_zone, else the one passed to the factory
  readonly language: string;              // hass.locale.language, else hass.language, else 'en'
  readonly isFrench: boolean;             // /^fr\b/i.test(language); phase 4 deletes it with the rewrite layer
  readonly isAdmin: boolean;
  readonly userName: string;
  setHass(h: PanelHass): HassChange;      // notifies subscribers synchronously, then returns what changed
  setPanelConfig(raw: unknown): boolean;  // true when the config changed (JSON-equal configs do not)
  state(id: string | null | undefined): HassEntity | undefined;
  num(id: string | null | undefined): number | null;   // today's num(): null when unavailable/unknown/not a number
  attr(id: string | null | undefined, name: string): unknown;
  kw(id: string | null | undefined): number | null;    // today's kw(): W to kW
  entity(id: string): EntityRegistryEntry | undefined;
  device(id: string): DeviceRegistryEntry | undefined;
  area(id: string): AreaRegistryEntry | undefined;
  areaOf(entityId: string): string;        // entity's area, else its device's area, else ''
  subscribe(ids: readonly string[] | '*', cb: (change: HassChange) => void): () => void;
}
interface HassChange {
  ids: ReadonlySet<string>;   // entity ids whose state object is a different reference, added or removed
  registries: boolean;        // entities, devices or areas is a different reference
  locale: boolean;            // language or time zone changed
  user: boolean;
}
```

- **Change detection.** `setHass(next)` walks `next.states` once: an id whose state object is not the same reference as in the previous `hass` (or is new) goes into `ids`; it then walks the previous states for ids no longer present. Registries, locale and user are compared by reference or by value as fits each. No deep comparison anywhere. This is the rule Home Assistant's frontend documents ("a new version of the objects that changed are created, so you can see if something changed by doing a strict equality check") and that its cards apply in `hasConfigOrEntityChanged`.
- **Subscriptions, indexed by id.** Subscribers are kept in a map from entity id to the set of callbacks that read it, plus one set for `'*'`. Notification iterates the changed ids and the sets they map to, so its cost is proportional to the number of changed ids and their readers, not to the number of subscribers (Home Assistant's `hui-root` instead sets `hass` on every card and lets each decide; the index is the panel's improvement, and the ADR records the trade-off: a subscriber whose ids change must unsubscribe and resubscribe). `registries`, `locale` and `user` changes notify everyone. Notification is synchronous inside `setHass`; throttling and scheduling stay the subscriber's business. Subscribers added or removed during a notification take effect on the next one. In this spec the legacy class is the only subscriber, with `'*'`, and it does what `set hass` does today (`tick()`), so update timing is unchanged; the per-id path exists for phase 3 and is tested here.
- **Config.** `setPanelConfig(raw)` runs the resolver (spec 13 replaces the resolver's internals; its output shape is unchanged here), compares the raw config by its JSON text as `configure()` does today, bumps `generation` when it changed and returns whether it did. The resolver needs `hass.states` for discovery; a config set before the first `hass` is resolved against empty states and resolved again when the first `hass` arrives, which is what `set panel` and `set hass` do between them today.
- **Accepted dependencies.** The factory takes `{defaultTimeZone}` (the element passes the browser's) so a test can pin it; the store itself never reads `Intl`, `Date` or the DOM.
- **Locale.** `language` and `timeZone` are plain fields here; spec 11 adds the formatters, `t()` and the display-name resolver on top of them.

### The `hass` description

`src/core/hass.ts` declares `PanelHass`: the subset of the Home Assistant frontend's `hass` object the panel reads or calls. Entity, config and user types come from `home-assistant-js-websocket` (a dev dependency, types only, `import type`). The frontend-only parts it does not type (`locale` with `language`, `number_format`, `time_format`; the `entities`, `devices` and `areas` registries; `callWS`; `language`) are declared here from what the panel uses, in the shape the harness already builds. Spec 12 refines `callWS` and `connection`. This file is the panel's **anti-corruption layer** (Evans) in type form: the rest of the panel speaks `PanelHass`, never "whatever the frontend happens to pass".

### Parallel Change: expand, migrate, contract

The programme's rule is that the class changes minimally, through a thin accessor that goes away with the class. The sequence keeps `main` green and mergeable throughout (Fowler, _Parallel Change_; the same shape the tickets skill calls expand–contract for a wide refactor).

**Expand (PR 1, patch release).** The store, `PanelHass`, the settings module and the fake `hass` exist and are fully tested. The class creates `this.store` and `this.settings` in its constructor; `set hass`, `set panel` and `configure()` feed the store **and** still set the globals, so every existing read keeps working. The class gets getters `E`, `ROOMS`, `HOUSEHOLD`, `SCENE_ORDER`, `MODES`, `AL_AREAS`, `SPLIT_AREAS`, `LIGHT_LINKS`, `CFG` returning `this.store.config.…`, `get hass()` returning `this.store.hass`, and methods `st`, `num`, `attr`, `kw` delegating to the store; a `'*'` subscription calls `tick()` and the old `tick()` call in `set hass` is removed (one path, same timing). The French layer gains `createFrench(store)` beside the old module functions. The two-panel harness mode and its spec land here and must already pass (the globals are still written, so the two panels still clash: the spec is written and marked `fixme` until contract; Playwright's `test.fixme` keeps it visible). ADR 0012 lands here.

**Migrate (PR 2, no release, or one patch).** Call sites move to the accessors in batches by region of the class, one commit each, with `npm run check` and the behaviour suites green after each: the module-level reads `\bE\.` → `this.E.`, `\bROOMS\b` → `this.ROOMS` and so on; `getHass()` → `this.hass`; `st(`/`num(`/`attr(`/`kw(` → `this.st(` and so on (free functions at module scope that read one of them take it as a parameter or become methods); the five `localStorage` sites → `this.settings`; the French layer's call sites → the instance from `createFrench`; `LP`/`localParts` → an instance field and a method (`this.lp`; spec 11 replaces them); the Automations module's `auClock` and `auHM` take the time zone as a parameter. The type checker (loose pass) and the methods-exist test catch a missed site (a `get X()` counts as defined). A batch may ship alone; the baselines must pass after every batch.

**Contract (PR 3, patch release).** The module-level `E`, `ROOMS`, `HOUSEHOLD`, `SCENE_ORDER`, `MODES`, `AL_AREAS`, `SPLIT_AREAS`, `LIGHT_LINKS`, `CFG`, `applyConfig()`, `getHass`, `setHass`, `getTZ`, `setTZ`, the `hass`- and time-zone-dependent legacy helpers, `FR`, `setFR`, the module-level French cache and the old French functions are deleted. The legacy globals module keeps only pure helpers (`VERSION`, `ok`, `esc`, `ampm`, `tile`, `plural`, `cap`) and its header says so. The two-panel spec loses its `fixme` and passes. The grep gates below hold.

- The lazy chunk promises (`chunk` in the ApexCharts loader, `mermaidP` in the Automations module) stay at module scope: a library loads once per page, not once per panel, and the promise is a cache of an import, not state about a house. This is the one named exception to the gate, and a comment at each says so.

### Settings

`src/core/settings.ts` owns the five keys and their defaults: `home-panel-theme` (`auto`), `home-panel-text` (`auto`), `home-panel-glass` (`dawn`), `home-panel-glass-t` (`50`, clamped to 0 to 100), `home-panel-tab` (`home`). It exports a factory taking a `Storage`-like object (the element passes `localStorage`; tests pass a `Map`-backed fake) that returns a complete settings object and a writer per key. A missing, malformed or throwing storage (private browsing, a full quota) yields the default and never throws. The module writes a schema-version key (`home-panel-settings`, value `1`) on its first write, so a later change of shape can migrate; this spec adds no migration. The keys and values written are byte-identical to today's, so an existing tablet keeps its settings. The header names the pattern: the `Storage` parameter is the seam; the `Map` fake and `localStorage` are its two adapters (one adapter is a hypothetical seam, two make it real).

### TypeScript, lint and coverage

- Files under `src/core/` are TypeScript, checked strictly; the dependency rule and the no-DOM rule of spec 09 apply to them. The legacy JavaScript imports them with the `.ts` extension (`allowImportingTsExtensions`, since every config has `noEmit`); Vite resolves them, the import lint already knows `.ts`. `npm run typecheck` covers `src/core/**/*.ts` strictly; the loose legacy pass still covers the class and sees the store's types through the imports.
- `vitest.config.ts` adds `src/core/**` to coverage with a threshold of 100 percent statements for that glob; CI already runs `npm test -- --coverage`, so the phase-2 gate fails the build when a statement in the core is untested. The legacy files stay out of coverage.
- A fake `hass` for unit tests, `test/unit/fake-hass.ts`, builds the same object shape the harness builds (`states`, `entities`, `devices`, `areas`, `config`, `user`, `locale`, `callService`, `callWS`, `connection`) from a short literal, with `next(patch)` returning a new `hass` whose changed states are new objects and whose unchanged ones are the same references, as Home Assistant does. It is the one fake the core tests share; spec 12 extends its `callWS`.
- `npm run bench` runs `vitest bench` on `test/bench/store.bench.ts`: `setHass` with 5,000 entities and one changed state, 50 subscribers of 10 ids each. Not run in CI (timings are noise there); the numbers from one machine go into ADR 0012's consequences, as the record of why the index exists.

### The harness

`harness.html` gains `?two=1`: it mounts a second `<home-panel>` after the first with a different config (the full house with `rooms` limited to two of the four thermostats and `people` set to one name) and hands both the same `hass`; `window.house.setState` and `setLanguage` re-assign `hass` on both. The test's side of the boundary is allowed to grow; the panel exposes nothing new.

## Acceptance Criteria

1. After contract: `grep -nE '^(let|const|var) [A-Za-z_]+ = (\{\}|\[\]|null|new Map)' src/home-panel.js src/auto.js src/i18n/fr.js src/legacy/globals.js` returns nothing; `grep -rnE 'getHass|setHass|getTZ|setTZ|setFR|\bFR\b' src/` returns nothing; `grep -rn localStorage src/` matches only `src/core/settings.ts`.
2. `src/legacy/globals.js` exports exactly `VERSION`, `ok`, `esc`, `ampm`, `tile`, `plural`, `cap`. As built (#132): `ampm` went with the old date and time formatting (the English day-period rule is the formatter's now), so the list is six: `VERSION`, `ok`, `esc`, `tile`, `plural`, `cap`.
3. The visual project passes with no baseline updated after every PR and every migrate batch; the behaviour suites pass; the `two-panels` spec is `fixme` after expand and passes after contract (each panel's Climate tab lists its own rooms; a state change through `window.house.setState` reaches both; the first panel's header shows two people and the second one).
4. Vitest covers `src/core/**` at 100 percent statements and the run fails below it; the store tests include: a changed state object notifies a subscriber of that id and not another; the same `hass` object twice notifies nobody but `'*'`; a removed id is in `ids`; a replaced `areas` object sets `registries`; a language change sets `locale`; `setPanelConfig` with JSON-equal input returns false and keeps `generation`; `areaOf` resolves through the device; `num` of `unavailable` is null; a subscriber removed during notification is not called on the next `setHass`; the settings reader returns defaults for a missing key, a non-number glass level, a level of 250 (clamped to 100) and a storage whose `getItem` throws.
5. `npm run typecheck` fails on a deliberate type error in `src/core/store.ts` (checked once and reverted) and passes otherwise; `npm run lint` (dependency rules included) and `npm run format:check` pass.
6. The French unit tests construct the layer through `createFrench` with the fake store and no longer call `vi.resetModules`.
7. `docs/adr/0012-per-element-store.md` exists (accepted), with the bench numbers in its consequences; `src/core/store.ts`, `hass.ts` and `settings.ts` open with the header convention of spec 09.
8. `npm run size` output is quoted in each PR (for information).
9. Changesets: expand (patch) "The panel keeps its house in one place inside each copy of itself, ready for the next steps of the rewrite. Nothing visible changes."; contract (patch) "Two panels on one page no longer share rooms or entities. Nothing visible changes."

## Testing Decisions

The store and the settings module are tested in Vitest at the `hass` seam with the shared fake `hass` (ADR 0005): a test hands the store objects shaped as Home Assistant hands them and asserts what a subscriber sees and what the accessors return. The interface is the test surface; no test reads a private field, counts internal calls or drives the class's methods. The two-panel Playwright spec is the user-level proof that the globals are gone; the baselines are the characterization tests that nothing else moved, after every batch. Prior art: the config tests (pure functions with literal inputs), the French tests (a fake `hass` handed in, now through the factory), the Playwright `fixtures.ts` house (the fake `hass` shape to mirror).

## Out of Scope

- Per-card rendering and skipping a render when nothing a card reads changed (phase 3; the store offers the subscription, nobody uses the per-id path yet).
- Providing the store through `@lit/context` or exposing it as signals (`@lit-labs/signals` is experimental; the shell spec of phase 3 decides, and there is no consumer before it).
- Memoised selectors over the store (Reselect-style): they belong to the model layer of phase 3; the ADR notes them as the next step for derived data.
- The API client (spec 12), the config schema (spec 13), the catalogs, formatters and display names (spec 11).
- Any change to what is stored in `localStorage` or to the keys.
- Converting the class, the Automations module or the French layer to TypeScript.

## Notes

- Home Assistant may set `hass`, `panel` and `narrow` before the element is upgraded; the class's `connectedCallback` replay loop stays, and the store is created in the constructor so it exists before any setter runs.
- The harness sets `locale: {language}` only; the store's `language` reads `hass.locale?.language ?? hass.language ?? 'en'`, the same chain `set hass` uses today.
- The methods-exist test (`methods.test.mjs`) keeps working: it matches `get X()` and `set X()` as definitions. It stays until the class is deleted.
- Why synchronous notification: the store is a value holder with observers, not a scheduler. Batching, throttling (today's one-second `tick`) and render scheduling (Lit's own microtask batching in phase 3) are decisions of the subscriber; putting them in the store would make it a shallow copy of what Lit does.
- Reading: Bernhardt, _Boundaries_ (SCNA 2012); Fowler, _Parallel Change_ and _Humble Object_ (bliki); Meszaros, _xUnit Test Patterns_, Humble Object; Feathers, _Working Effectively with Legacy Code_, chapters on seams and characterization tests; Ousterhout, _A Philosophy of Software Design_, chapters 4 to 5; Home Assistant developer docs, _Frontend data_.
