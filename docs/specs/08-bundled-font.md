# Spec 08: Montserrat ships with the panel

Parent: [production-grade-refactor.md](production-grade-refactor.md), phase 1.
Depends on: [06 Vite build](06-vite-build.md). Independent of [07 npm packages](07-npm-packages-replace-vendor.md).
Ships as: one pull request, a patch release. The only approved visual change in phase 1: the baselines are re-recorded once with the real font.

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be read as in RFC 2119.

## Problem Statement

On connect, the panel appends a `<link>` to `fonts.googleapis.com` for Montserrat in weights 400, 500, 600 and 700. Every wall tablet and phone therefore calls Google on every load, which is a privacy leak from a home dashboard, and when the internet is down (the moment a home dashboard matters most) the font fails and the panel falls back to the system font with different metrics, shifting the layout. The test suite has to block the request to stay deterministic, and the screenshot baselines are recorded in the fallback font rather than the real one.

## Solution

Bundle Montserrat (SIL Open Font Licence) as woff2 files in the release, declare it with `@font-face` rules pointing at the panel's own URL, and remove the Google Fonts link. A test asserts no request leaves for Google. The screenshot baselines are regenerated once, deliberately, now showing the font the household actually sees.

## User Stories

1. As a household member, I want the panel to look the same whether or not the house has internet, so that an outage does not reshuffle the layout.
2. As a household member, I want my tablet not to contact Google every time it loads the dashboard, so that my home network tells third parties nothing.
3. As a maintainer, I want the screenshot baselines to show the real font, so that a text-layout regression is caught the way the household would see it.
4. As a maintainer, I want the font's licence recorded with the others, so that the repository's licensing stays complete.
5. As an admin installing from the zip, I want the font files to come along automatically, so that I do not fetch anything separately.

## Implementation Decisions

### Font files

- `@fontsource/montserrat` as a production dependency, pinned exactly. From it, the woff2 files for weights 400, 500, 600 and 700 in the `latin` and `latin-ext` subsets are taken (latin-ext covers `œ` and other characters Québec French can use). Italics are NOT shipped; the panel uses none.
- The build MUST emit these eight files under `dist/fonts/` with stable names (`montserrat-latin-400-normal.woff2` and so on, as Fontsource names them). They are copied by a build step from `node_modules/@fontsource/montserrat/files/`, not imported through CSS, so Vite's asset inlining and hashing do not apply and the names are predictable.
- The release zip contains `fonts/`.

### Declaring the font

- `@font-face` rules inside a shadow root are not applied by Chromium; the rules MUST be in the document. The class therefore replaces the Google `<link>` with one `<style id="home-panel-fonts">` element appended to `document.head`, created once (idempotent: if the element exists, nothing is added), containing eight `@font-face` blocks with `font-family: 'Montserrat'`, the weight, `font-style: normal`, `font-display: swap`, a `unicode-range` per subset as Fontsource declares it, and `src: url(<BASE>fonts/<file>) format('woff2')` where `<BASE>` is resolved from `import.meta.url` as the panel already does for its other files.
- The CSS variables `--f-num` and `--f-body` keep `"Montserrat", ui-sans-serif, system-ui, sans-serif`. Mermaid's `fontFamily` setting is unchanged.
- The Google `<link>` creation is deleted. No file in `src/` or `dist/` MUST contain `fonts.googleapis.com` or `fonts.gstatic.com` after this PR.

### Tests

- The `house` fixture's route that aborts Google Fonts requests is replaced by a recording that fails the test if any request to `fonts.googleapis.com` or `fonts.gstatic.com` is made.
- A Playwright behaviour test MUST assert that loading the Home tab requests at least one `/panel/fonts/*.woff2` file with a 200 response, and that `document.fonts.check("600 16px Montserrat")` is true after `document.fonts.ready`.
- The dist test asserts that `dist/fonts/` contains exactly the eight expected files.
- The licence test from spec 07 is extended: `LICENSES.md` MUST list `@fontsource/montserrat` with its version and the OFL-1.1 licence text.

### Baselines

- Every screenshot baseline changes, because the Docker image's fallback font gives way to Montserrat. This PR MUST regenerate all baselines with `npm run test:visual:update` as its last commit, and the changeset MUST say "Screenshots re-recorded with the bundled Montserrat font; the layout the household sees is unchanged." The reviewer compares a sample of before-and-after images to confirm only glyph shapes changed, not positions or colours beyond the font's metrics.
- After this PR the visual run no longer depends on the image's system fonts for any text the panel draws, which makes the baselines more robust, not less.

### Size

- Font files are not JavaScript and are not counted by `size-limit`. Their total (about 100 KB for eight woff2 files) is noted in the PR description.

## Acceptance Criteria

1. `grep -rn "googleapis\|gstatic" src test dist` returns nothing after a build.
2. Loading the test house in Playwright makes no request to Google and at least one request to `/panel/fonts/`; the font-check assertion passes.
3. `dist/fonts/` holds the eight woff2 files and the release zip includes them.
4. `LICENSES.md` lists `@fontsource/montserrat` and the licence test passes.
5. The visual project passes against the regenerated baselines, and the PR shows the before-and-after sample.
6. Offline check: with the harness server as the only network, every tab renders in Montserrat (criterion 2 proves this, since the harness server serves only local files).

## Testing Decisions

The network assertion is the point of the change and is tested directly. The baselines, once re-recorded, protect the font's layout effect from then on. The dist and licence tests protect the packaging.

## Out of Scope

- Changing the typeface or the weights used.
- Variable-font or italic files.
- Subsetting beyond what Fontsource provides.
- Serving the font from Home Assistant's own static paths (a HACS-integration concern, deferred).

## Notes

- Home Assistant serves `/local/` files with a 31-day cache. Font file names are stable across releases, so a cached font survives an update, which is the desired behaviour; only when the font files themselves change should their names change.
- Spec 06 chose `es2020` as the build target; nothing here depends on it.
- If Chromium ever applies `@font-face` from shadow roots, the head injection can be replaced, but the current approach works in every browser the panel supports.

## As built (#39)

Where the repository differs from the plan above, and what was measured. The plan stays as written; this is the record.

- **The package and the files.** `@fontsource/montserrat` 5.3.0 (published July 2026; Google Fonts' v31 of the family, modified 2025-09-05) is a production dependency at an exact version, with no dependencies of its own. Its `files/` folder has the eight files under the names the plan gives (`montserrat-latin-400-normal.woff2` … `montserrat-latin-ext-700-normal.woff2`). They are 206,328 bytes together, about twice the plan's "about 100 KB": the latin files are 18,688 to 18,824 bytes (75,040 for the four), the latin-ext files 32,272 to 33,532 (131,288). A browser fetches only the files whose characters a page shows: the test house, on every tab and in both languages, fetches the four latin files and never a latin-ext one.
- **Where the unicode ranges are.** Fontsource's per-subset files (`latin-400.css` and the rest) carry no `unicode-range`, since a subset file needs none; the ranges are in the per-weight files (`400.css` …) and in `unicode.json`, and equal the issue's snippet except for the spaces after the commas. Fontsource declares latin-ext before latin, and `src/fonts.js` keeps that order, so latin is the face used for the three combining marks both ranges list (U+0304, U+0308, U+0329); the snippet had the subsets the other way round. `test/unit/fonts.test.mjs` compares both sources with the installed package, so a Fontsource release that moves a range or renames a file fails there.
- **latin, not latin-ext, covers œ.** Œ and œ (U+0152–0153) are in the latin range, with every French accent, « », ’, …, € and both no-break spaces (U+00A0, and U+202F, which `fr-CA` number formatting writes); the unit test checks these. latin-ext has Ÿ and the rest of Latin, which the panel's own text does not use; it ships so that a name in a house's entities draws in the font. Some characters the panel draws are in neither range and come from a system font, as they did with Google's stylesheet: ₂ in CO₂, ✕ on the close buttons, the ↗ and ↘ of the climate trend, ≥ and ≤ in automation conditions. The visual run therefore still depends on the Playwright image's fonts for those glyphs, and only for those.
- **`src/fonts.js`, not the class.** The weights, the subsets, the file list, `fontFaces(base)` and `ensureFonts()` are a module of their own, checked strictly (`tsconfig.check.json` lists it); `build()` calls `ensureFonts()` where it appended the Google `<link>`. `vite.config.ts` imports `FONT_FILES` from it, so the copy and the declaration cannot name different files; `tsconfig.json` gains `allowJs` so that editors and the typed lint read that import's types (without it TypeScript reports TS7016 on `vite.config.ts`; `npm run typecheck` does not use `tsconfig.json`).
- **The URL.** `BASE` no longer exists (#37 deleted it with `loadScript`), so the module resolves `new URL('fonts/', import.meta.url)` itself, through a variable: written inline, Vite takes the expression for a file to bundle, finds no `src/fonts/` and warns "doesn't exist at build time" on every build. The URL goes into `url("…")` with quotes, where the snippet had none: an install folder with a parenthesis in its name would end an unquoted `url()`, and `URL.href` percent-encodes quotes and spaces. Checked with a scratch Playwright script that served the harness with the panel imported as `/hacsfiles/ha-home-panel/home-panel.js?v=2.11.1` and aborted every request to another host: the four latin files came from `/hacsfiles/ha-home-panel/fonts/` without the query, the 25 chunks of the Energy and Automations tabs from beside the entry, nothing from `/panel/`, nothing was aborted, and the Home tab drew in Montserrat in French.
- **Chromium does ignore `@font-face` in a shadow root.** With the eight rules in a `<style>` inside the panel's shadow root instead of `document.head`, Chromium 1248 (Playwright 1.63) requested no font file and the fonts test failed.
- **The copy.** A `ship-fonts` plugin in `vite.config.ts` emits each file with `fileName: 'fonts/<name>'`, resolved through the package's `exports` (`./files/*`), so Vite neither inlines nor hashes them. `npm run build` prints them beside the entry.
- **`document.fonts.check()` alone proves nothing.** In Chromium it returns `true` for a family no rule declares (`check('600 16px NoSuchFamilyXyz')` is `true`), so a test that only called it would pass with the font gone. `test/e2e/fonts.spec.ts` (tablet) therefore also asks `document.fonts` for the loaded Montserrat faces (400, 500, 600 and 700, all loaded once the Home tab is drawn); checks the responses under `/panel/fonts/` (the four latin files, each a 200, recorded by the fixture as `house.fonts`); checks that the rules are one `<style id="home-panel-fonts">` in the head and that no stylesheet link is; and checks that a Home heading, the Energy chart's SVG labels and the Automations flow's labels are set in Montserrat. Its second test opens every tab and checks that every request the page made (the resource timings for the load, a listener after it) went to the harness server. Checked that it fails, each by hand and then reverted: the Google link added back (both tests, and all eight tablet tests of `tabs.spec.ts`, fail with "Google Fonts request: …"), `dist/fonts/` deleted (a 404), the `ensureFonts()` call removed (no font request), and the rules moved into the shadow root (no font request).
- **Google is recorded, and aborted.** The fixture pushes "Google Fonts request: <url>" into `house.errors` for any request to either host, and still aborts it, so that a run never depends on the internet; the console filter no longer exempts it. The two host names are written in pieces (`'fonts.google' + 'apis.com'`), in the fixture and in the dist test, so that acceptance criterion 1's grep finds nothing in `test/` either; after a build, `grep -rn "googleapis\|gstatic" src test dist` returns nothing.
- **The visual specs wait for the font.** Both visual files run `fontsLoaded(house)` before each test: `document.fonts.load()` for each weight (which fetches a weight the page has not drawn yet, and rejects when a file cannot be fetched), one face each, then `document.fonts.ready` and `check()`. In the harness the Home tab already loads the four weights before the first screenshot, so the charts and the flow, drawn after a tab is tapped, measure their labels in Montserrat; the helper turns that timing into a guarantee, with no sleep.
- **The panel does not wait for the font before drawing a chart or a flow.** ApexCharts and Mermaid size axes and boxes from the text when they draw. On a tablet the Home tab loads the four weights with its first paint, well before a chart sheet or the Automations tab opens, and the files come from the house's own server. A cold load straight onto a chart sheet could still measure a label in the fallback while the font arrives; that race existed with Google's font, for longer, and is left as it is.
- **Dist and licence tests.** `dist.test.mjs` expects `dist/` to be the entry, its map, `LICENSES.md`, the chunks and exactly the eight files under `fonts/`, each byte for byte the installed package's file; the entry carries the style id and the latin range; no `.js`, `.map` or `.md` file in `dist/` names either Google host. Copying seven files fails two of its tests. `licenses.test.mjs` adds `@fontsource/montserrat` to the dependencies it expects and checks its row (`OFL-1.1`) and that its text holds the font's copyright line and "SIL OPEN FONT LICENSE Version 1.1": the generator reads the package's `LICENSE`, which is the OFL with Montserrat's copyright. `LICENSES.md` lists 149 packages (148 before) and is 266,325 bytes (261,686).
- **Baselines.** All 81 were re-recorded with `npm run test:visual:update:container`, regenerated a second time through Docker (`npm run test:visual:update`) with the same SHA-1 for every file, and compared with `test:visual:docker` and `test:visual:container`, 25 tests passing in each. The PNGs total 23,883,226 bytes (23,983,549 before), which this pull request adds to the history. Between the old and the new Home tablet light, Lights phone dark and idle-clock tablet dark images, 7.5, 8.1 and 7.9 percent of the pixels differ.
- **Geometry, fallback against Montserrat.** Measured inside the Playwright image with the same build and the same frozen house, once with the font files refused (the old baselines' fallback) and once with them: 188 boxes (header, chips, gear, clock, rail and its tabs, panes, and the open pane's cards and tiles) on seven screens and the idle clock. Fixed boxes do not move: on the tablet the Home, Lights, Climate and Energy cards and tiles are where they were. What moves follows from the text: each rail tab is 1 px shorter (rows shift by up to 0.9 px); in the tablet header the charging chip is 21 px wider and the clock 18 px, so the greeting column is 42 px narrower and the gear moves 18 px; the Lights "Arrange" button is 12.6 px wider; the Automations flow is 105 px wider, because Mermaid sizes its nodes from the label text; the idle clock's time is 63 px wider, and the centred clock and stack card each move 31.5 px outwards, at the same height. On the phone, "280 km · charging · locked" and "Kids bedtime" wrap to two lines, so the Home tiles, the security card and the scenes move down 16.8 px and the scenes row is 16.8 px taller; on the phone's Lights tab "Living room" is now cut with an ellipsis, and the header's date line wraps one word earlier. That is the layout the household has always had: it was the baselines that were in the fallback font.
- **The household's view is unchanged.** Google's stylesheet now serves one variable latin file (v31) for all four weights, where Fontsource ships a static file per weight. Measured in Chromium with `measureText` on seven strings at 16 px in each weight: weight 400 is identical; at 500 to 700 the widths differ by at most 0.26 px over a 64-character line, and ascent and descent are equal. Hence the changeset's "the layout is unchanged". Google's latin-ext range now ends at U+20C4 where Fontsource's ends at U+20C0 (four recent currency signs), which the panel does not draw.
- **The changeset is the issue's sentence**, "The Montserrat font now ships with the panel, so tablets no longer call Google and the font works offline. Screenshots were re-recorded with it; the layout is unchanged.", not the one this plan proposed; the issue was written after the plan.
- **Size.** The entry is 506,462 bytes against 505,813 on `main` (649 more: the rules and the ranges); `npm run size` gives 144.97 kB gzipped against 144.65, under the 160 kB budget. The fonts are not JavaScript, and `size-limit` does not count them.
- **The release zip.** `release.yml` needed no change: run locally, its zip holds `fonts/` with the eight files (`unzip -l`), its `find` and `unzip -Z1` lists are equal with 128 files (120 on `main`), and it is 2,583,303 bytes against 2,377,017 for `main` built the same way. A manual update that copies only `home-panel.js` and `chunks/` leaves the fonts out: the panel then draws in the system font, and nothing breaks; the README's install step names `fonts/`.
- **Caching.** The names carry no version, as this plan's note wants, so a tablet keeps a cached file for up to 31 days after a font bump that changes the files, and draws the older Montserrat meanwhile, which is harmless.
- **Renovate.** `@fontsource/montserrat` has its own group, "Montserrat font", monthly like Playwright and never in the weekly group: a release that changes the files re-records every baseline, and needs `npm run licenses` and a changeset (it is a runtime dependency, so it gets no `no-changeset` label). A Playwright bump still re-records everything too, since Chromium draws the glyphs. `changeset.yml`'s comment names the font among the shipped dependencies; its `SHIPPING` paths already cover `package.json`, the lock file, `src/` and `vite.config.ts`.
- **Documents left as they are.** `docs/production-grade-plan.md`, `production-grade-refactor.md`, specs 01 and 02 and the HIG review describe Google Fonts as it was when they were written; they are records and are not rewritten. The README's install step, Develop section, Renovate paragraph and Credits now describe the bundled font.
