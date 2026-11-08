# Spec 03: ESLint, Prettier and the reflow of long lines

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 0.
Depends on: [02 screenshot baselines](02-screenshot-baselines.md). Blocks: [04 Vitest and type checks](04-vitest-and-checkjs.md).
Ships as: one pull request, a patch release, no visible change.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

There is no linter and no formatter. 142 lines across the source are longer than 300 characters (111 in the main class, 15 in the Automations module, 13 in the French map, 3 in the old smoke script), the longest 855. A reviewer cannot see what changed on such a line, and a bug hides easily in one. Each thread also formats to taste, which adds noise to every diff.

## Solution

Add ESLint and Prettier with one configuration at the root, run them in CI before anything else, and reformat the whole code base once. The reformat is verified by the screenshot baselines: the panel MUST look identical. From this PR on, every file is formatted on commit and linted on push.

## User Stories

1. As a maintainer, I want every line to fit in a diff view, so that I can review what actually changed.
2. As a maintainer, I want an unused variable, an unreachable branch, a missing `await` or a shadowed name flagged before review, so that reviews are about behaviour.
3. As an agent thread, I want one formatting standard applied by a tool, so that my PR carries no formatting noise.
4. As a maintainer, I want the configuration ready for TypeScript and Lit now, so that it does not change again when files move in phases 1 to 3.
5. As a household member, I want the reformat to change nothing I can see.

## Implementation Decisions

### Tools and versions

- ESLint 9 with the flat configuration format (`eslint.config.js`), `@eslint/js`, `typescript-eslint` and `eslint-plugin-lit`, all installed now. The TypeScript and Lit rule sets are scoped to `**/*.ts` files. No Lit file exists yet, but the Playwright suite is TypeScript, so the type-checked rules already apply to `playwright.config.ts` and `test/e2e/**/*.ts`; a root `tsconfig.json` (which `typescript-eslint` reads through `projectService`) covers them, and `typescript` and `@types/node` are installed with it.
- Prettier 3 with `eslint-config-prettier` so no ESLint rule conflicts with formatting.
- Dependencies pinned exactly in `package.json`; Renovate (spec 05) moves them.

### Prettier settings

Chosen to match the existing style so the reformat changes line breaks, not idiom:

| Option           | Value       | Why                                                                                    |
| ---------------- | ----------- | -------------------------------------------------------------------------------------- |
| `printWidth`     | 120         | Fits a side-by-side diff on a laptop; the code is dense and 80 would triple its height |
| `singleQuote`    | true        | Current style                                                                          |
| `bracketSpacing` | false       | Current style: `{readFileSync, join}`                                                  |
| `arrowParens`    | `avoid`     | Current style: `x => x.id`                                                             |
| `trailingComma`  | `all`       | Smaller diffs when a list grows                                                        |
| `quoteProps`     | `as-needed` | Current style                                                                          |
| `semi`           | true        | Current style                                                                          |

Prettier MUST format `*.js`, `*.mjs`, `*.ts`, `*.css`, `*.json`, `*.md` and `*.yml`. The CSS files under `src/css/` are formatted too; the resulting one-declaration-per-line layout is accepted.

### ESLint rules

- `@eslint/js` `recommended` on every JavaScript file.
- For `src/home-panel.src.js` and `src/auto.js` only, a named override block `legacy` MAY disable rules that fire on the existing code for reasons that are not bugs (for example `no-cond-assign` on the `(m = frCap(m), ...)` idiom). Each disabled rule MUST carry a one-line comment saying why. This block MUST NOT gain entries after this PR and MUST shrink as code leaves those files; it is deleted with the old class. As built it disables one rule: `no-empty` is relaxed to `allowEmptyCatch`, for the deliberate `catch {}` of best-effort calls (storage, `JSON.parse`, a library that may not load). Unused `catch (e)` bindings are not an idiom: they were rewritten as `catch {`.
- `eqeqeq` (`always`, `null: ignore`) is on for every JavaScript file, and `globals.node` is limited to `build.mjs`, `scripts/`, the root `*.config.*` files and `test/`; `src/` gets browser globals only.
- `build.mjs` pastes `config.js`, `stack.js`, `i18n/fr.js`, `i18n/fr-map.js` and `auto.js` into `home-panel.src.js`, so they share one scope. ESLint lints them as scripts, with the names each takes from another file declared as read-only globals in `eslint.config.js` (the list #33 turns into imports) rather than `no-undef` being turned off, and `no-unused-vars` set to `vars: "local"` on those five files, because a top-level name there is how a file hands something to the others. `home-panel.src.js` itself is linted as a module (it uses `import.meta`) with the default `no-unused-vars`. Since per-file linting cannot see a dead top-level name in a spliced file, `npm run check` also lints `dist/home-panel.js` as one module (`eslint.bundle.config.js`: `no-undef` and `no-unused-vars` with `vars: "all"`); that check goes away with the splicing (#33).
- Every ESLint finding that is a real bug (an unused variable, an unreachable return, a `==` where `===` was meant) MUST be fixed in this PR if the fix is a pure cleanup verified by the baselines, or recorded as a follow-up issue if it changes behaviour.
- `typescript-eslint` `recommendedTypeChecked` and `eslint-plugin-lit` `flat/recommended` scoped to `**/*.ts`.
- `no-restricted-syntax` MUST forbid `innerHTML` assignment and `insertAdjacentHTML` in every file except the two legacy files, so new code cannot reintroduce string rendering.

### Scripts and CI

- `npm run lint` runs ESLint on the repo; `npm run format` runs Prettier in write mode; `npm run format:check` runs it in check mode.
- `npm run check` (today `node --check dist/home-panel.js`) is kept and extended to run `format:check` and `lint` first, and to lint the built bundle as one module afterwards.
- CI gains a `lint` job that runs `format:check` and `lint` before the `test` job, and the `test` job `needs` it.
- A `.editorconfig` with two-space indentation, LF line endings and a final newline.
- No git hook is installed by default (agent threads run in varied environments); the README's Develop section says to run `npm run format` before committing.

### The reflow

- The whole repository is formatted in one commit named "Format with Prettier" that contains only Prettier output, so `git blame` can skip it (the commit hash is added to `.git-blame-ignore-revs`).
- Rule fixes are separate commits in the same PR.
- The screenshot baselines MUST pass unchanged after the reflow and after the rule fixes. The Playwright behaviour suite MUST pass.

## Acceptance Criteria

1. `npm run format:check` and `npm run lint` pass on `main`, and CI runs them before the tests.
2. In `src/`, `test/` and `build.mjs`, no line exceeds 120 characters except string and template literals, regular expressions, URLs and comments, which Prettier does not wrap (Markdown is excluded); the 300-character limit applies with the same exclusions.
3. The visual project passes with no baseline updated.
4. The `legacy` override block lists every disabled rule with a reason, and the PR description lists each ESLint bug fixed or deferred.
5. `.git-blame-ignore-revs` contains the format commit.

## Testing Decisions

Verification is entirely by the existing suites: the screenshot baselines prove the reflow and cleanups are invisible; the Playwright behaviour tests prove the panel still works; `lint` and `format:check` prove the configuration applies.

## Out of Scope

- Converting any file to TypeScript.
- Type checking (spec 04).
- Rewriting long expressions for readability beyond what Prettier does mechanically.
- A pre-commit hook.

## Notes

- Expect the format commit to touch nearly every line of the main class; that is the point and is why it lands as its own commit with baselines already in place.
- Some lines will still be dense after Prettier because the code chains ternaries and comma expressions. Readability rewrites belong to phase 3, where the code moves anyway.
- After the format commit, 72 lines over 300 characters remain (63 in `src/home-panel.src.js`, 7 in `src/auto.js`, 1 in `src/i18n/fr-map.js`, 1 CSS comment in `src/css/glass.css`; counted once per file, there were 167 before). They are inline HTML and SVG template literals and one comment, which Prettier cannot break. Breaking them is phase 3 work.
