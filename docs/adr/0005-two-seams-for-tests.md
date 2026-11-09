# 0005: Two seams for tests: the hass boundary and pure functions, the fake hass reused in Vitest

Status: accepted (2026-11-08)

## Context

The old smoke test reached into the panel: it called `idleStart`, `renderLive`, `setTab`, `openLight` and read `.tab` and `.open`. Every one of those disappears when the class is rewritten, so the test would break on a correct refactor. The programme spec of 2026-11-07 set out the rule that tests state what a household member or Home Assistant would observe, and named two seams (Feathers's term for a place where behaviour can be changed without editing the code). On 2026-11-08, when the phase-2 specs were written, the owner decided that the first seam is also used in Vitest, so that the new store and API client could reach full statement coverage by a command rather than by browser runs only.

## Decision

Tests cross the panel at two seams and nowhere in between.

1. **The `hass` boundary.** A test house builds a `hass` object (states, registries, config, user, locale, `callService`, `callWS`, `connection`) and hands it, with `panel.config` and `narrow`, to `<home-panel>`, as Home Assistant does. Playwright drives Chromium against it for baselines, behaviour tests and axe. Vitest uses a fake `hass` of the same shape (`test/unit/fake-hass.ts`) for the store and the API client in Node. This is a second adapter at the same seam, not a new seam.
2. **Pure functions.** The config resolver and schema, the smart-stack rules, models, providers, catalogs and formatters are called by Vitest with recorded fixtures and literal inputs.

The panel exposes no test-only methods, no test reads a private field, and no socket is mocked. There are no tests of Lit component internals, of the store's subscription mechanics in isolation, or of the API client against a mocked socket.

## Consequences

- A test breaks only when observable behaviour breaks, so a correct internal rewrite does not break the suite.
- The same `hass` shape serves the browser and Node, so the phase-2 gate ("core at full statement coverage in Vitest") is a command.
- The fake `hass` in Vitest must be kept in step with the harness's `hass`, or the two adapters drift.
- Internals are covered only through what feeds them, so a bug in the store that no model fixture or harness run exercises is not caught by a test of the store alone.
- Behaviour that only appears with a real Home Assistant (see 0007) is not covered until a real instance stands behind the same seam.

## Read

`docs/specs/production-grade-refactor.md`, "Testing Decisions", "The two seams" and its 2026-11-08 amendment.
