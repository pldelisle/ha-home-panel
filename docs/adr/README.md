# Architecture decision records

An architecture decision record (ADR) is a short file that says what was decided, why, and what it costs. The format is Michael Nygard's, from [_Documenting Architecture Decisions_](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions) (2011). One record holds one decision and takes about two minutes to read; a longer text is a spec, and the specs already live in [docs/specs](../specs/).

## When to write one

Write a record when a decision is one a future reader could reasonably argue with, or when it constrains how later code is written. The test: would a new contributor, or an agent thread, be tempted to reopen it in a pull request? If so, it needs a record. A choice that is easy to reverse and surprises nobody does not.

Every pull request that takes such a decision lands its record in the same pull request, so the record and the code never drift.

## The template

Each record is `docs/adr/NNNN-slug.md`, numbered in the order the pull requests merge:

```markdown
# NNNN: Title

Status: accepted (YYYY-MM-DD)

## Context

## Decision

## Consequences

## Read
```

- **Title** names the decision, not the topic.
- **Status** is proposed, accepted, or superseded by NNNN, with the date of the decision.
- **Context** is the forces at play: what was true, what was asked, what the alternatives were.
- **Decision** is what was chosen, in the active voice.
- **Consequences** lists what becomes easier and what becomes harder. The negatives are required.
- **Read** is one line: the source the decision leans on (a spec section, a book, a document).

## Never edit an accepted record

Once a record is accepted, its text is not edited. If the decision is reversed or refined, write a new record that supersedes it, and change only the old record's Status line to `superseded by NNNN`. The history of why the code is the way it is stays readable, including the decisions that were later changed.

## Records

| No.                                                   | Decision                                                                                                             | Date       | In one line                                                                                                      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| [0001](0001-record-architecture-decisions.md)         | Record architecture decisions                                                                                        | 2026-11-08 | Decisions live in short numbered files, not in a spec, a changelog or a chat thread.                             |
| [0002](0002-typescript-and-lit.md)                    | TypeScript and Lit, not Vue, Svelte, React or plain JavaScript                                                       | 2026-11-07 | Lit is what Home Assistant's frontend uses, and its `hass` property is Lit's native model.                       |
| [0003](0003-rewrite-in-place-strangler-fig.md)        | Rewrite in place as a strangler fig, one release per step, pixel-identical structural phases                         | 2026-11-07 | One release per step, `main` always releasable, structural phases change no pixel.                               |
| [0004](0004-screenshot-baselines-are-the-contract.md) | Screenshot baselines are the characterization tests and the contract of the rewrite                                  | 2026-11-07 | 81 committed images, compared exactly, are the contract of the rewrite.                                          |
| [0005](0005-two-seams-for-tests.md)                   | Two seams for tests: the hass boundary and pure functions, the fake hass reused in Vitest                            | 2026-11-08 | Tests hand the panel a `hass`, or call a pure function; nothing in between.                                      |
| [0006](0006-apexcharts-frozen-at-3x.md)               | ApexCharts frozen at the 3.x major for licence reasons                                                               | 2026-11-07 | Pinned at 3.45.2; the licence changes at 5.1.0 and a bump moves the chart baselines.                             |
| [0007](0007-hacs-integration-deferred.md)             | The HACS integration is deferred                                                                                     | 2026-11-07 | The zip and a `panel_custom:` block stay until a second house or the `?v=` edit demands it.                      |
| [0008](0008-browser-floor.md)                         | Browser floor: Safari and iOS 26 and current Chrome, Edge, Firefox (the es2025 target)                               | 2026-11-08 | The `es2025` target and no prefix inventory; older browsers are not supported.                                   |
| [0009](0009-github-hosted-runners.md)                 | GitHub-hosted runners                                                                                                | 2026-11-07 | CI stays on GitHub's runners; no self-hosted runner.                                                             |
| [0010](0010-no-size-budget.md)                        | No size budget, size for information                                                                                 | 2026-11-08 | `npm run size` prints the numbers; nothing fails on them.                                                        |
| [0011](0011-layered-architecture-dependency-rule.md)  | Layered architecture with the dependency rule enforced by a linter                                                   | 2026-11-08 | Features draw, models compute, only the core talks to Home Assistant; a build fails if not.                      |
| [0012](0012-per-element-store.md)                     | A per-element store with reference-equality change detection                                                         | 2026-11-09 | Each panel owns its store; subscribers are told exactly which entity ids changed, by reference.                  |
| [0013](0013-locale-catalogs-and-names.md)             | The panel speaks the language of the user's Home Assistant profile, through formatters, catalogs and a name resolver | 2026-11-09 | Language, zone and formats come from the profile; names are data, and `Salon` reads `Living room` in English.    |
| [0014](0014-typed-api-client.md)                      | One typed API client is the only caller of Home Assistant's WebSocket                                                | 2026-11-09 | A typed port and gateway; a stale reply rejects as StaleReply; a lint error guards the door.                     |
| [0015](0015-parse-dont-validate-config.md)            | Parse, don't validate: one schema types and parses the config, and its problems are values                           | 2026-11-09 | One superstruct schema types and parses the config; what it cannot use is reported, not thrown.                  |
| [0016](0016-one-element-one-shadow-root-guest.md)     | One element, one shadow root, and the legacy class as its guest                                                      | 2026-11-09 | The Lit shell owns the root; the old class draws into one container of it behind an interface that only shrinks. |
| [0017](0017-feature-registry.md)                      | A registry of feature descriptors draws the frame, and what mixes features is composed at the root                   | 2026-11-09 | One list of ten descriptors draws the rail, the bar and the panes; Home is composed in the shell.                |
| [0018](0018-context-and-reactive-controllers.md)      | Context and reactive controllers, not properties down the tree and not signals                                       | 2026-11-09 | The shell provides the store, the API client and the settings by context; shared behaviour is a controller.      |
| [0020](0020-weather-source-strategies.md)             | Weather sources are a list of strategies, merged in order                                                            | 2026-11-09 | Two adapters behind one port, the entity and Environment Canada, merged in list order, a later one winning.      |
