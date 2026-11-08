# Spec 04: Vitest for unit tests and type checks on the pure modules

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 0.
Depends on: [03 lint and format](03-lint-and-format.md). Independent of [05 releases](05-changesets-renovate-codeql.md).
Ships as: one pull request, a patch release, no visible change.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

Unit tests run under `node:test` with no watch mode, no coverage and no shared setup, and they load the pure modules by reading the source text and evaluating it with `new Function`, because those files are scripts spliced into the bundle rather than modules. The two pure modules, the config resolver and the smart-stack rules, have no type information, so a caller passing the wrong shape is not caught, and the methods-exist regex test is the only thing standing in for a type checker.

## Solution

Move the unit tests to Vitest, the runner Home Assistant's frontend uses, with coverage reporting. Add TypeScript's checker in `checkJs` mode over the two pure modules with JSDoc type annotations, so their inputs and outputs are typed today and the annotations become the seed of the phase-2 schema. The loader stays as it is until spec 06 turns the files into modules.

## User Stories

1. As a maintainer, I want unit tests to run in watch mode while I edit a pure module, so that the feedback is immediate.
2. As a maintainer, I want a coverage report for the pure modules, so that the phase-2 gate (full statement coverage of the core) is measurable from the start.
3. As a maintainer, I want `resolveConfig` and `pickStack` to have typed signatures, so that a wrong call is a type error.
4. As a maintainer, I want the config's input shape written down as a type, so that the phase-2 schema starts from a definition and not from reading code.
5. As an agent thread, I want `npm test` to mean one thing (unit tests) and `npm run typecheck` another, so that I know what each failure is.

## Implementation Decisions

### Vitest

- `vitest` as a dev dependency, pinned exactly. `npm test` runs `vitest run`; `npm run test:watch` runs `vitest`; `npm run test:coverage` runs `vitest run --coverage` with the `v8` provider.
- `vitest.config.ts` sets `test.include` to `test/unit/**/*.test.{mjs,ts}` and `environment: 'node'`. No jsdom: the pure modules need no DOM.
- The five existing test files move as they are, replacing `node:test` and `node:assert/strict` imports with Vitest's `test` and `expect`. Assertions MUST be translated one to one (`assert.equal` to `toBe`, `assert.deepEqual` to `toStrictEqual`, because `node:assert/strict` made it a strict deep-equal and `toEqual` ignores `undefined` keys and prototypes, `assert.match` to `toMatch`, `assert.ok` to `toBeTruthy`, `assert.doesNotThrow` to `expect(fn).not.toThrow()`).
- The source-text loader (`new Function(readFileSync(...))`) stays in this PR; spec 06 replaces it with imports.
- Coverage thresholds are reported but not enforced in this PR. `coverage.include` is `src/config.js` and `src/stack.js`.

### Type checking with JSDoc

- `typescript` as a dev dependency, pinned exactly. A `tsconfig.check.json` with `allowJs`, `checkJs`, `noEmit`, `strict`, `target: ES2022`, `lib: ["ES2022", "DOM"]`, and `include` limited to `src/config.js` and `src/stack.js`. `npm run typecheck` runs `tsc -p tsconfig.check.json`.
- Both files gain JSDoc annotations until `typecheck` passes under `strict` with no `any` except where a comment justifies it. At minimum the following typedefs MUST exist, in a `src/types.d.ts` that the check config includes:
  - `HassState`: `{entity_id: string; state: string; attributes: Record<string, unknown>; last_changed: string; last_updated: string}`.
  - `HassStates`: `Record<string, HassState>`.
  - `PanelConfig`: the input shape of the `config:` block, with every key documented in `examples/configuration.yaml`: `people`, `house_image` (string or `{day, night}`), `car` (`{name, color, battery_kwh}`), `entities` (a record of string to string, both spellings accepted), `rooms` (array of string or `{climate, name, icon, key, temperature, target, power}`), `scenes`, `modes`, `adaptive_lighting_areas`, `split_light_areas`, `light_links` (array of `[string, string]` or `{lights: [string, string], switch?: string}`), `idle_stack` (`{enabled?, sunrise_lights_off?, reminders?: Array<{at, title?, text?, lead?}>}`). Every key optional.
  - `ResolvedConfig`: the return type of `resolveConfig`, with `entities` typed as a record over the keys of `DEFAULT_ENTITIES`, `rooms` as an array of `RoomSpec`, and the other fields as the function builds them today.
  - `StackCard`: `{k: string; tone: 'red' | 'amber' | null; filler: boolean}` plus whatever fields the class attaches, typed as an index signature for now.
- The regex methods-exist test stays; it is deleted in phase 3 with the class.

### CI

- The `test` job runs `npm run typecheck` then `npm test` after the build. Coverage is uploaded as an artifact; no service integration.

## Acceptance Criteria

1. `npm test` runs the five test files under Vitest and passes; `node --test` is no longer referenced in `package.json` or the workflows.
2. `npm run typecheck` passes with `strict` on the two pure modules, and `grep -c "any" src/types.d.ts src/config.js src/stack.js` shows only justified occurrences with a comment on the same line.
3. `npm run test:coverage` reports statement coverage for `config.js` and `stack.js`; the numbers are quoted in the PR description as the phase-2 starting point.
4. The screenshot baselines and the Playwright suite pass unchanged (the only source change is JSDoc comments).
5. The README's Develop section names `npm test`, `npm run test:watch` and `npm run typecheck`.

## Testing Decisions

The pure-model seam is what this spec sets up. Its verification is that the existing tests pass under the new runner with one-to-one assertions, and that the type checker accepts the pure modules.

## Out of Scope

- Converting any file to TypeScript or to a module.
- Type checking the main class or the Automations module.
- Enforcing coverage thresholds.
- New tests.

## Notes

- `PanelConfig` and `ResolvedConfig` written here are the first draft of the phase-2 schema; keep them honest to the code, not aspirational.
- Vitest and Playwright Test both export a `test`; the two live in different directories (`test/unit` and `test/e2e`) and are configured separately so neither runner picks up the other's files.
