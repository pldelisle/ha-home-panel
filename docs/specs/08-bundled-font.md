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
