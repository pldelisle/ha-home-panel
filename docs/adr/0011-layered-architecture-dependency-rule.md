# 0011: Layered architecture with the dependency rule enforced by a linter

Status: accepted (2026-11-08)

## Context

The programme spec draws six layers (shell, features, UI kit, models, core, providers) and one rule between them: features draw, models compute, only the core talks to Home Assistant. Nothing enforced it. Phase 3 will add eleven feature folders written by several threads over weeks, and the first import from one feature into another, or from a model into `hass`, would land quietly and turn the layering back into a drawing. The rule the phase-3 plan depends on ("a thermostat change doesn't redraw the car") needs features that do not reach into each other or into `hass`.

## Decision

The layers are folders under `src/`, and dependencies point inward, toward the core (Martin's Dependency Rule; Cockburn's hexagonal architecture; Bernhardt's functional core, imperative shell). `src/core/` imports only itself and npm packages and has no DOM; features may import the core, the UI kit and providers but never another feature, the shell or legacy code; the shell is the composition root; the legacy files are the strangler's host and nothing but `src/main.js` imports them. The rules are written once in `.dependency-cruiser.cjs` for `dependency-cruiser`, with rules against import cycles, orphans and unresolvable imports, and run by `npm run lint`, so CI's lint job is unchanged. An ESLint block forbids `document`, `window`, `localStorage` and similar globals in `src/core/**`. The tool also draws the module graph into the docs.

## Consequences

- A forbidden import or a cycle fails the build, and the architecture picture is generated from the code instead of a slide.
- Dependency-cruiser sees the whole graph (cycles, orphans, reachability) where ESLint zones see one file at a time, and one tool holds all the rules.
- A core module that needs the time zone, locale or storage takes it as a parameter, which keeps the core testable in Node without a browser.
- A dev dependency, a configuration file and a generated graph file with a staleness test must be maintained.
- Shared code between two features cannot be shared sideways. It must move down into the UI kit, the providers or the core.
- The rules name folders that do not exist yet (providers, UI kit, features, shell), so they apply from each folder's first file but are untested until then.

## Read

`docs/specs/09-architecture-foundations.md`, "Layers and the dependency rule".
