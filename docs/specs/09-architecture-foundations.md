# Spec 09: Architecture foundations: layers you cannot break, decisions you can read

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 2.
Depends on: phase 1 complete ([06](06-vite-build.md), [07](07-npm-packages-replace-vendor.md), [08](08-bundled-font.md)). Blocks: [10 entity store](10-entity-store.md), [11 catalogs and formatters](11-catalogs-and-formatters.md), [12 API client](12-api-client.md), [13 config schema](13-config-schema.md).
Ships as: one pull request, no release needed (documentation and tooling; no changeset, `no-changeset` label).

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

The programme spec draws six layers (shell, features, UI kit, models, core, providers) and one rule between them: features draw, models compute, only the core talks to Home Assistant. Today nothing enforces that rule and nothing teaches it. The phase-2 modules are the first code written under it, and phase 3 will add eleven feature folders written by several threads over weeks. Without a check, the first `import` from a feature into another feature, or from a model into `hass`, lands quietly and the layering is a drawing again. Without a record, the decisions already taken (TypeScript and Lit, rewrite in place, ApexCharts frozen at 3.x, screenshots as the contract, two test seams, the browser floor, HACS deferred) live in a 49 KB spec, a few `As built` sections and chat threads, so a new contributor or agent re-argues them. The repository's own agent docs point at a `CONTEXT.md` glossary and a `docs/adr/` folder that do not exist yet. And the owner wants the code base to teach the practices it uses, which means every structural choice should name the pattern it applies and where to read about it.

## Solution

Lay the foundations once, before the first core module:

1. **The dependency rule, as a test.** The layers and the allowed imports between them are written as rules for a dependency linter, run by `npm run lint` and CI; a forbidden import or a cycle fails the build. The same tool draws the module graph into the docs so the architecture is a picture generated from the code, not from a slide.
2. **Architecture Decision Records.** `docs/adr/` with Nygard's five-part template, the decisions already taken backfilled as numbered records, and the rule that every later spec records its decision as an ADR in the same pull request.
3. **A glossary and an architecture guide.** `CONTEXT.md` defines the words the panel and its code use (the domain words from the README and changelog, the architecture words from the programme). `docs/architecture.md` explains the layers, the one-way flow of data, where a new piece of code goes, how the old class is being strangled, the coding conventions, and an annotated reading list.
4. **Conventions for teaching code.** Every module under the new layers opens with a short header that says what it is, the pattern it applies and the one source to read; the convention is written down where agents and people read it.

## User Stories

1. As a maintainer, I want an import that crosses a layer the wrong way to fail `npm run lint`, so that the layering survives a dozen parallel threads.
2. As a maintainer, I want an import cycle to fail the build, so that modules stay deletable and testable one at a time.
3. As a maintainer, I want the module graph drawn from the code into the docs on every change, so that the architecture picture is never stale.
4. As a new contributor, I want to read why TypeScript and Lit were chosen over Vue in a two-minute record, so that I do not reopen the question in a pull request.
5. As an agent thread, I want each architecturally significant decision in one short file with its consequences, so that I apply it instead of rediscovering it.
6. As a maintainer, I want the decision behind each phase-2 module recorded in the same pull request that builds it, so that the record and the code never drift.
7. As a learner (the owner), I want each pattern used in the code base named and linked to its source, so that working on the panel teaches me the practice, not just the code.
8. As an agent thread, I want one glossary of the panel's words (tab, pane, sheet, tile, smart stack, live-activity pill, test house, store, provider, model), so that issue titles, tests and code use the same term.
9. As a maintainer, I want a "where does this go?" table, so that a new piece of logic lands in the right layer the first time.
10. As a maintainer, I want the old class's shrinking footprint measurable (which modules still import it), so that the strangler-fig progress is a number in CI output.
11. As CI, I want the architecture checks in the existing lint job, so that no new job and no new runner are needed.
12. As a maintainer, I want these foundations to add no code to the shipped bundle, so that this pull request needs no release.

## Implementation Decisions

### Layers and the dependency rule

The layers are the programme's, named as folders under `src/`. Dependencies point inward, toward the core (Robert C. Martin's Dependency Rule in _Clean Architecture_, 2017; the same shape as Cockburn's hexagonal architecture, 2005, and Bernhardt's functional core, imperative shell, 2012):

| Layer                         | Folder                                                                                                                                                           | May import                                      | Must not import                                                                                   |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Core (functional core)        | `src/core/`                                                                                                                                                      | `src/core/`, npm packages                       | anything else in `src/`; the DOM (`document`, `window`, `localStorage`, `navigator`)              |
| Providers                     | `src/providers/` (phase 3)                                                                                                                                       | `src/core/`                                     | features, UI kit, shell, legacy                                                                   |
| UI kit                        | `src/ui/` (phase 3)                                                                                                                                              | `src/core/` (tokens, types), `lit`              | features, providers, shell, legacy                                                                |
| Features (one folder each)    | `src/features/<name>/` (phase 3)                                                                                                                                 | `src/core/`, `src/ui/`, `src/providers/`, `lit` | another feature's folder, the shell, legacy                                                       |
| Shell (imperative shell)      | `src/shell/` (phase 3), `src/main.js`                                                                                                                            | everything                                      | nothing forbidden; it is the composition root                                                     |
| Legacy (the strangler's host) | `src/home-panel.js`, `src/auto.js`, `src/i18n/fr.js`, `src/legacy/`, `src/charts/`, `src/styles.js`, `src/css/`, `src/fonts.js`, `src/config.js`, `src/stack.js` | `src/core/`, legacy                             | features, UI kit, shell, providers. Nothing imports legacy except `src/main.js` and legacy itself |

- **Tool.** `dependency-cruiser` (dev dependency, pinned exactly) with `.dependency-cruiser.cjs` holding the table above as `forbidden` rules, plus `no-circular` (any cycle, anywhere under `src/`), `no-orphans` (a module nothing imports, except `src/main.js` and declaration files) and `not-to-unresolvable`. `npm run lint` runs `eslint .` then `depcruise src --config`; CI's lint job runs `npm run lint` already, so nothing changes in the workflow. Why dependency-cruiser and not ESLint zones: it checks the whole graph (cycles, orphans, reachability) where ESLint sees one file at a time, it draws the graph, and one tool holding the rules means one place to read them. The existing `import-x/no-unresolved` and `import-x/named` stay for what they do well (a misspelled import).
- **Core has no DOM.** An ESLint block for `src/core/**` sets `no-restricted-globals` on `document`, `window`, `localStorage`, `sessionStorage`, `navigator`, `location` and `customElements`. A core module that needs the browser's time zone, its locale or a `Storage` takes it as a parameter ("accept dependencies, don't create them"). This is what makes the core testable in Node with no browser.
- **The legacy footprint.** A unit test lists the modules outside the legacy set that import a legacy module and expects the list to be empty; a second line in the lint output (`depcruise --output-type metrics` or a small script over its JSON) prints how many modules the legacy set still contains, which is the phase-3 progress number. The move order of phase 3 shrinks it from the edges inward.
- **The graph in the docs.** `npm run arch:graph` writes `docs/architecture/dependency-graph.md` as a Mermaid diagram from dependency-cruiser's `mermaid` reporter, folded to folders (`--collapse` on the layer depth) so the picture shows layers, not every file. A unit test fails when the committed graph is stale, the way `licenses.test.mjs` guards `LICENSES.md`. GitHub renders Mermaid, so the architecture page shows the live graph.

### Architecture Decision Records

- `docs/adr/NNNN-slug.md`, Nygard's template (_Documenting Architecture Decisions_, 2011): **Title**, **Status** (proposed, accepted, superseded by NNNN), **Context**, **Decision**, **Consequences**, plus one line **Read** pointing at the source the decision leans on. One decision per record; a record is never edited after acceptance except to change its status; a reversal is a new record that supersedes it.
- `docs/adr/README.md` lists the records with a one-line hook each and says when to write one: a decision a future reader could reasonably argue with, or that constrains how later code is written.
- **Backfilled in this pull request**, from the programme spec and its `As built` sections, each with its date of decision: 0001 Record architecture decisions; 0002 TypeScript and Lit, not Vue, Svelte, React or plain JavaScript; 0003 Rewrite in place as a strangler fig, one release per step, pixel-identical structural phases; 0004 Screenshot baselines are the characterization tests (Feathers) and the contract of the rewrite; 0005 Two seams for tests, the `hass` boundary and pure functions, the fake `hass` reused in Vitest; 0006 ApexCharts frozen at the 3.x major for licence reasons; 0007 The HACS integration is deferred; 0008 Browser floor is Safari and iOS 26 and current Chrome, Edge and Firefox (and the `es2025` target); 0009 GitHub-hosted runners; 0010 No size budget, size for information; 0011 Layered architecture with the dependency rule enforced by a linter (this spec).
- **Each later phase-2 spec records its own**: 0012 a per-element store, no singletons, reference-equality change detection (spec 10); 0013 locale from the Home Assistant profile with three house rules carried from the rewrite layer, catalogs with typed keys (spec 11); 0014 one typed client as the only caller of the WebSocket, replies parsed at the edge, stale replies rejected (spec 12); 0015 the config is parsed, not validated, by one schema that is also the type (spec 13). Numbers are provisional; they are assigned in the order the pull requests merge.

### Glossary and architecture guide

- `CONTEXT.md` at the repo root (the layout `docs/agents/domain.md` already expects), in two parts. **The house, as the panel shows it**: tab and pane, sheet, tile, card, chip, pill and the live-activity pill, the attention pill and Status checks, the smart stack and the idle clock, Arrange, linked rooms, split light areas, Auto and Night (Adaptive Lighting), who's home, the full and bare test houses, the household changelog voice; Hilo challenge, pre-heat and recovery; the heat pump; the departure schedule. **The code, as the programme names it**: shell, feature, model, provider, UI kit, core, store, API client, catalog and message key, formatter and house rule, legacy class, baseline, harness, seam, adapter, deep module. Each entry: the term, one definition, the words to avoid (for example _pane_ not _page_; _sheet_ not _modal_ or _dialog_; _store_ not _state manager_; _seam_ not _boundary_). Terms come from the README, the changelog and the programme spec; nothing is invented here.
- `docs/architecture.md`: (1) the layer table and the dependency rule, with the generated graph; (2) the one-way flow: Home Assistant hands `hass` to the shell, the shell feeds the store, models compute view models from the store, features render them, a tap becomes a call through the API client, Home Assistant answers with a new `hass` (the Elm and Flux shape of unidirectional data flow, and why the panel never writes to `hass`); (3) a "where does this go?" table (a rule about a thermostat's state → a model; a Hilo-specific entity name → a provider; a WebSocket message → the core API client; a colour → UI kit tokens; a string → the catalog; a DOM event → the feature's element); (4) the strangler fig: how the legacy set shrinks, what the move order is and why, what the footprint number means; (5) coding conventions: the module header, "parse, don't validate" at the edges, pure models with `now` passed in, no `innerHTML` outside legacy, strings through `t()`, formats through the formatters; (6) the reading list below, annotated with what each source gave the panel.
- **Reading list** (each entry says what it contributed): Ousterhout, _A Philosophy of Software Design_ (deep modules; why the store and client have small interfaces); Bernhardt, _Boundaries_ (functional core, imperative shell; the core/shell split and why models take values); Cockburn, _Hexagonal Architecture_ (ports and adapters; the API client as the port, `hass` as the adapter); Martin, _Clean Architecture_ (the Dependency Rule, the Humble Object for the element); Fowler, _Strangler Fig Application_ and _Parallel Change_ (the migration shape; expand, migrate, contract for the globals); Feathers, _Working Effectively with Legacy Code_ (seams, characterization tests; the baselines); Meszaros, _xUnit Test Patterns_ (Humble Object; the element as the humble object, the store as the testable core); Nygard, _Documenting Architecture Decisions_ (the ADR template); King, _Parse, don't validate_ (the config schema); Evans, _Domain-Driven Design_ (ubiquitous language, the glossary; the anti-corruption layer, the providers); Dodds, _The Testing Trophy_ (why most tests run at the `hass` seam); Home Assistant developer docs, _Frontend data_ (reference equality on state objects; the store's change detection); Lit docs, _Context_ and _Signals_ (how the store reaches components in phase 3); Unicode CLDR and ICU MessageFormat, FormatJS docs (the catalogs and formatters).

### Conventions for teaching code

- Every module under `src/core/`, `src/providers/`, `src/ui/`, `src/features/` and `src/shell/` MUST open with a header comment of three to six lines: what the module is, the pattern it applies with its source in one phrase (for example "the functional core: no DOM, no `hass` methods; Bernhardt, Boundaries"), and what it must not do. The legacy files are exempt. The convention is stated in `docs/architecture.md` and, in one line, in `CLAUDE.md` so agents follow it.
- A pattern named in code uses the glossary's term, and the glossary's term uses the literature's name where one exists (seam, adapter, humble object, strangler fig, parse not validate).
- `docs/README.md` gains the architecture guide and the ADR index in its table.

## Acceptance Criteria

1. `npm run lint` fails on a deliberately added import from `src/core/` to `src/home-panel.js`, on a two-module cycle under `src/`, and on `document` used in a `src/core/` file (each checked once in the PR and reverted); and passes on `main`.
2. `.dependency-cruiser.cjs` encodes the layer table with a `comment` on each rule saying why; `npm run lint` runs it; CI's lint job is otherwise unchanged.
3. `docs/architecture/dependency-graph.md` exists, renders on GitHub, is regenerated by `npm run arch:graph`, and a unit test fails when it is stale.
4. `docs/adr/0001` to `0011` exist in the template, each with Status, Context, Decision, Consequences, Read and the decision's date; `docs/adr/README.md` indexes them.
5. `CONTEXT.md` defines every term listed above with its avoided synonyms; `docs/architecture.md` has the six sections and the annotated reading list; `docs/README.md` links both.
6. `CLAUDE.md` names the module-header convention in one line and points at `docs/architecture.md`.
7. The legacy-footprint test exists and passes (no module outside the legacy set imports a legacy module); the footprint count is printed by `npm run lint`.
8. `npm run build` output is byte-identical before and after (no source file under `src/` changes except for nothing; this PR touches no `src/` file), so the visual project needs no run.
9. No changeset; the PR carries the `no-changeset` label.

## Testing Decisions

The architecture rules are tests: the dependency linter is the test of the layering, run where lint runs; the graph-drift and legacy-footprint tests are Vitest tests over the repository, in the style of `licenses.test.mjs` and `workflows.test.mjs`. Nothing here runs in a browser. The deliberate-violation checks in the acceptance criteria are done once by hand in the PR, as spec 06 did for the import lint.

## Out of Scope

- Any change under `src/` (the first is spec 10).
- Creating `src/providers/`, `src/ui/`, `src/features/` or `src/shell/` folders now; the rules name them so they are enforced from their first file.
- An ESLint "zones" copy of the rules; one tool holds them.
- Converting the programme spec into ADRs wholesale; only decisions are recorded, the spec stays the narrative.
- Architecture fitness functions beyond dependencies (bundle size, performance budgets): size stays informational by ADR 0010.

## Notes

- Why a dependency linter is worth it for one panel: the rule it enforces is the one the whole phase-3 plan depends on ("a thermostat change doesn't redraw the car" needs features that do not reach into each other or into `hass`). A rule that fails a build costs nothing to remember.
- Dependency-cruiser's Mermaid reporter and folder collapsing mean the docs show the layers and their arrows in a few dozen nodes; the full file-level graph is one command away for a review.
- Nygard's template is kept to the five sections on purpose: an ADR that takes more than two minutes to read is a spec, and the spec already exists.
- The glossary follows Evans's ubiquitous language: one word per concept, used in code, tests, issues and the changelog. The `docs/agents/domain.md` instructions already tell agents to use it; this spec gives them the file.
