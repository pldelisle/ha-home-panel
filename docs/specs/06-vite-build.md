# Spec 06: Vite build, ES modules replace text splicing

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 1.
Depends on: phase 0 complete ([02](02-screenshot-baselines.md), [03](03-lint-and-format.md), [04](04-vitest-and-checkjs.md), [05](05-changesets-renovate-codeql.md)). Blocks: [07 npm packages](07-npm-packages-replace-vendor.md), [08 bundled font](08-bundled-font.md).
Ships as: one pull request, a patch release, no visible change.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

The build is a script that reads the main class as text and replaces five placeholders (`/*__CONFIG__*/`, `/*__STACK__*/`, `/*__FR__*/`, `/*__AUTO__*/`, `__CSS__`, `'__VERSION__'`) with the contents of other files. The pieces share one global scope, so nothing is a module, nothing is imported, the type checker and the linter cannot follow a reference across files, and the tests load pure modules by evaluating source text. The 571 KB output is not minified, has no source map and no tree shaking, so a stack trace from a tablet points into a 4,386-line file at a line that does not exist in the source.

## Solution

Make every source file an ES module with explicit imports and exports, and build with Vite in library mode: one minified ES module entry with a source map beside it, the CSS imported as text and adopted in the same order as today, the version injected from `package.json`. The vendor libraries are still copied and lazy-loaded exactly as today; spec 07 turns them into packages. The screenshot baselines prove nothing changed.

## User Stories

1. As a maintainer, I want to open a source file and see what it imports, so that I can follow a reference without searching for a placeholder.
2. As a maintainer, I want a stack trace from the tablet to point at a source line, so that a bug report is actionable.
3. As a household member, I want the panel to download less, so that it loads faster on the tablet's first paint.
4. As a maintainer, I want unit tests to `import` the pure modules, so that the source-text loader can go.
5. As a maintainer, I want a size budget enforced from the first minified build, so that the bundle never creeps unnoticed.
6. As an agent thread, I want `npm run dev` to rebuild on save, so that I can iterate with the test house open.

## Implementation Decisions

### Module layout (JavaScript, not yet TypeScript)

- Files keep their current names and content; only module plumbing changes. `src/main.js` is the new entry: it imports the class file and defines the custom element. The class file (`home-panel.src.js`, renamed `home-panel.js`) imports what it used from the spliced files.
- `src/config.js` exports `resolveConfig`, `guessIcon`, `DEFAULT_ENTITIES`, `ENTITY_ALIAS`, `ROOM_ICONS`. `src/stack.js` exports `pickStack`, `inHours`, `reminderLeft`, `STACK_TURN_MS`.
- `src/i18n/fr.js` and `src/i18n/fr-map.js` become one module, `src/i18n/fr.js`, exporting the functions the class calls (`frText`, `frStart`-related helpers, the `FR` flag accessors) and `FR_MAP`. The French layer's module-level state (`FR`, the name cache) stays module-level in this PR; moving it into a store is phase 2.
- `src/auto.js` already builds an object of methods assigned onto the class prototype; it becomes a module exporting that object and the class file installs it with one `Object.assign(HomePanel.prototype, autoMethods)` line. Its module-level helpers that the class also uses (`auDur`, `auClock`) are exported explicitly.
- Helpers that were shared through the single global scope (`st`, `ok`, `num`, `attr`, `esc`, `TZ`, `hass`, the formatting helpers) are the hard part. They live at the top of the class file today and `auto.js` and `fr.js` read them as globals. In this PR they move to `src/legacy/globals.js`, which exports them, and every file imports what it needs. `hass` and `TZ` are mutable module variables; the module exports `getHass()`, `setHass()`, `getTZ()`, `setTZ()` and the class calls the setters where it assigned them. This is scaffolding that phase 2 deletes.
- CSS: `src/styles.js` imports each file with Vite's `?raw` suffix in the order `base, extra, tabs, phone, glass, lights, live, motion` and exports the joined string; the class injects it exactly as today.
- Version: `const VERSION = __VERSION__` with a Vite `define` that reads `package.json`. No file contains `'__VERSION__'` after this PR.

### Vite configuration

- `vite` as a dev dependency, pinned exactly. `vite.config.ts` with `build.lib: {entry: 'src/main.js', formats: ['es'], fileName: () => 'home-panel.js'}`, `build.outDir: 'dist'`, `build.emptyOutDir: true`, `build.sourcemap: true`, `build.minify: 'esbuild'`, `build.target: 'es2020'`, `build.rollupOptions.output: {chunkFileNames: 'chunks/[name]-[hash].js', assetFileNames: 'assets/[name]-[hash][extname]'}`.
- A tiny Vite plugin (or `vite-plugin-static-copy`) copies `vendor/*.js` and `vendor/*.css` into `dist/` so `loadScript(BASE + 'apexcharts.min.js')` and the Mermaid loader keep working unchanged. Spec 07 removes this.
- `define: {__VERSION__: JSON.stringify(pkg.version)}`; the release workflow builds from the checked-out `package.json`, so no CLI version argument is needed.
- Scripts: `npm run build` runs `vite build`; `npm run dev` runs `vite build --watch`; `build.mjs` is deleted.
- Source maps (`home-panel.js.map`) MUST be included in `dist/` and in the release zip. The map MUST reference original paths under `src/`, not inlined sources, and MUST NOT include `sourcesContent` from `node_modules` of any size that would matter (default settings satisfy this).

### Size budget

- `size-limit` with `@size-limit/file`, checking `dist/home-panel.js` gzipped. The budget is the first minified build's size plus ten percent, rounded up to the kilobyte, written in `package.json` with a comment line in the PR explaining the number. `npm run size` runs it; CI runs it after the build and fails on overrun.
- The budget MUST NOT be raised later without a changeset explaining why. It MAY be lowered.

### Tests

- The unit tests replace the source-text loader with `import {resolveConfig} from '../../src/config.js'` and the equivalent for `stack.js` and `fr.js`. The French tests' fake `hass` is passed through the new `setHass()` of the legacy globals module.
- `build.test.mjs` becomes `dist.test.mjs`: it asserts that `dist/home-panel.js` exists after `npm run build`, parses (`node --check`), contains the package version string once, contains no placeholder marker, has a `.map` beside it whose `sources` list includes `src/config.js`, and that the vendor files are present. The personal-data scan runs over `src/**`, `test/**` and `dist/home-panel.js`.
- The harness server serves `dist/` under `/panel/` as before, including `chunks/` and `assets/` subpaths.
- The screenshot baselines MUST pass unchanged. The Playwright behaviour suite MUST pass.

### Type checking and lint

- `tsconfig.check.json` extends its `include` to every file under `src/` with `checkJs` but **not** `strict` for the legacy files: a second config, `tsconfig.legacy.json`, with `strict: false`, `noImplicitAny: false` covers `src/home-panel.js`, `src/auto.js`, `src/i18n/fr.js` and `src/legacy/globals.js`, so that broken imports and typos in names are caught while the mass of untyped code is tolerated. `npm run typecheck` runs both.
- ESLint's `import` resolution is enabled so an unresolved import is a lint error.

## Acceptance Criteria

1. `grep -rn "__CONFIG__\|__STACK__\|__FR__\|__AUTO__\|__CSS__\|'__VERSION__'" src build.mjs` returns nothing, and `build.mjs` does not exist.
2. `npm run build` produces `dist/home-panel.js` (minified), `dist/home-panel.js.map`, and the vendor files; `dist/home-panel.js` is at least 40 percent smaller than the 571 KB produced today.
3. `npm run size` passes and the budget is recorded in `package.json`.
4. The visual project passes with no baseline updated; the Playwright behaviour suite passes; `npm test` passes with no `new Function` left under `test/`.
5. `npm run typecheck` passes (both configs) and `npm run lint` passes.
6. Opening the test house in Chromium DevTools with source maps on shows `src/home-panel.js` and `src/config.js` as original sources.
7. The release zip from the workflow contains `home-panel.js`, `home-panel.js.map` and the vendor files at its root.

## Testing Decisions

The screenshot baselines are the proof that a build-system change is invisible. The rewritten dist test is the proof that the artefact has the shape the install instructions assume. No new behaviour tests.

## Out of Scope

- Replacing vendor files with packages (spec 07).
- The font (spec 08).
- Converting any file to TypeScript.
- Removing module-level state (phase 2).
- Code splitting of the panel's own code.

## Notes

- `es2020` as the target keeps optional chaining and nullish coalescing untouched and lowers nothing the code uses today; it matches the iPad Safari versions a wall tablet is likely to run. Raise it only with a reason.
- Vite's library mode does not inject CSS; that is why the CSS is imported as raw text and injected by the class exactly as today. Phase 3 moves styles into Lit components.
- The `legacy/globals.js` module exists to make the imports honest without rewriting logic. Its exports list is the inventory of module-level state phase 2 must remove; keep it short and do not add to it.

## As built (#33)

Where the build in the repository differs from the plan above, and why. The plan stays as written; this is the record.

- **Vite 8, not 7.** `vite` is pinned at 8.3.6 (the version Vitest 5.1.0 already installs, so there is one copy) and `vite-plugin-static-copy` at 4.1.1; both accept Node `^22.12`. Vite 8 bundles with Rolldown and minifies with Oxc, so `build.rollupOptions` is `build.rolldownOptions` and `build.minify` is `'oxc'` (Vite 8's default). `minify: 'esbuild'` would need the `esbuild` package as a further dependency and is deprecated in Vite 8.
- **Library mode does not minify an ES entry's whitespace.** Vite leaves it so that the consumer's bundler can still shake the file. The entry here is the final file Home Assistant loads, so `vite.config.ts` sets `rolldownOptions.output.minify: {codegen: true}`; without it `dist/home-panel.js` is 568 KB of tab-indented code.
- **The vendor copy keeps the files at the root.** The plugin keeps the `vendor/` folder in the destination unless told otherwise; `rename: {stripBase: 1}` puts `apexcharts.min.js` and the others beside `home-panel.js`, where `BASE + 'apexcharts.min.js'` looks.
- **Size.** The 40 percent goal in the acceptance criteria is not met by minification alone: 85 percent of the bundle is text, not code (the CSS, about 154 KB, the HTML in the template literals, about 130 KB, and the French strings), and a minifier leaves text alone. `dist/home-panel.js` goes from 675,832 bytes (181,548 gzipped) to 505,406 bytes (about 145,000 gzipped), 25 percent smaller (20 percent gzipped). Getting further means changing text: minifying the CSS (Vite's `?inline` does it with Lightning CSS, but that tool also removes or adds vendor prefixes for the browsers it is told to target, which the Chromium baselines cannot show; it needs an explicit browser list and a look at an iPad) or trimming the indentation inside the template literals (a change to rendered whitespace). Neither is part of this ticket, and the size budget (`size-limit`) is its own.
- **`__VERSION__` appears twice in the bundle.** The minifier inlines the constant where it is used, so the version string is in the file twice (the constant and the Mermaid URL's `?v=`). The dist test checks that the quoted version is there and that no placeholder is.
- **`src/legacy/globals.js` is smaller than the plan's list.** It holds what `auto.js` and `fr.js` reached as globals, what depends on `hass` or the time zone, and what they need to compile: `getHass`, `setHass`, `getTZ`, `setTZ`, `VERSION`, `BASE`, `loadScript`, `st`, `ok`, `num`, `attr`, `kw`, `esc`, `ampm`, `fmtTime`, `fmtDate`, `localDay`, `hourNow`, `tile`, `plural`, `cap`. The pure helpers only the class uses (`sum`, `f1`, `f0`, `durTxt`, `fmtDay`, `ms`, `tiles`, `fold`, `shortNames`, `L0kw`, `ago`) stay in `home-panel.js`. `VERSION`, `BASE` and `loadScript` are there, not in the class file, because `auto.js` needs them and the class imports `auto.js`. The class reads `hass` and the time zone through `getHass()` and `getTZ()` everywhere; `FR` is an exported live binding in `fr.js` with a `setFR()` for the one place that assigns it.
- **`FR_ATTR`, `frNode`, `frTree`, `frApex`, `FR`, `setFR`, `frText` and `FR_MAP`** are what `fr.js` exports; `fr-map.js` is merged into it.
- **Type checking is unchanged.** `tsconfig.check.json` still covers `types.d.ts`, `config.js` and `stack.js` (they now carry `export`); `tsconfig.legacy.json` and the wider `include` come with #35. `src/env.d.ts` declares `__VERSION__`; ESLint knows it as a read-only global in `src/`.
- **Lint.** The cross-file `globals` list and `eslint.bundle.config.js` are gone: with real imports, per-file `no-undef` and `no-unused-vars` do what the bundle lint did, so `npm run check` no longer lints `dist/`. The `import/no-unresolved` rule is not added: no plugin for it is installed, and an unresolved import already fails `vite build`, `vitest` and `tsc`.
- **Tests.** `config.test.mjs` and `stack.test.mjs` import the modules instead of stripping `^export ` from their text as the ticket's minimal step had it: Vitest transforms a file that has `export` before it maps V8 coverage back to it, so a loader that evaluates the raw text no longer lines up and the report fell from 98.8 to 90.6 percent of statements. With imports the figure is 98.82 percent again. `i18n.test.mjs` imports `fr.js` and passes its fake `hass` through `setHass()` (on a fresh copy of the modules for each test, because `fr.js` caches the house's names for a minute). `dist.test.mjs` builds `dist/` itself when it is missing or older than a build input. `vitest.config.ts` defines `__VERSION__` like the Vite config does. No `new Function` or `vm.compileFunction` is left under `test/`.
- **Visual scripts build on the host.** Rolldown's native binding is installed for the host's platform, so the `:docker` and `:container` scripts run `npm run build` on the host and only `npx playwright test --project=visual` inside Linux. The CI visual job does its own `npm ci` inside the image and keeps running `npm run test:visual`.
