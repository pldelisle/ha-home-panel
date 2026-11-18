// The panel's three faces: Manrope for every word and figure under the Apple design (400 to 700), Roboto Flex for the Material design (one
// variable file per subset, weight 100 to 1000) and JetBrains Mono for code (400), in Fontsource's latin and latin-ext subsets, which
// vite.config.ts copies into dist/fonts/ under their own names (docs/specs/08-bundled-font.md, ADR 0037).
// Pattern: a static table and the one function that declares it in the document (moved from src/fonts.js with the guest, #277).
// Must not: be imported through CSS (Vite would hash the names), ask Google for anything, or declare the faces twice.

/**
 * The faces: the family name the stylesheet asks for, the Fontsource package (and file prefix) it comes from, and the
 * weights the stylesheet uses. Automations labels ask for 800, which draws with the 700 file. A `variable` face comes from the
 * `@fontsource-variable` scope instead, one file per subset that holds the whole weight axis, so its `weights` are the
 * range `[min, max]` of that axis, declared once (`font-weight: 100 1000`). Roboto Flex is the `wght` file only: the browser draws it at
 * its default optical size, which is what Fontsource's smallest file keeps (34 kB, against 250 kB with every axis).
 */
export const FONT_FACES: ReadonlyArray<{family: string; pkg: string; weights: number[]; variable?: true}> = [
  {family: 'Manrope', pkg: 'manrope', weights: [400, 500, 600, 700]},
  {family: 'Roboto Flex', pkg: 'roboto-flex', weights: [100, 1000], variable: true},
  {family: 'JetBrains Mono', pkg: 'jetbrains-mono', weights: [400]},
];

/** The body face's weights, which the screenshot tests wait for. */
export const FONT_WEIGHTS = FONT_FACES[0].weights;

/**
 * Fontsource's subsets with the unicode-range its CSS gives each (the weight files, 400.css and the rest, and
 * unicode.json; test/unit/fonts.test.mjs fails when an installed package says otherwise; all three packages declare the same
 * ranges). latin has ASCII, Latin-1 (every French accent, « », the no-break space), Œ œ and the punctuation; latin-ext
 * has the rest of Latin (Ÿ among them), and a browser fetches its file only when a page shows one of those characters.
 * The order is Fontsource's: where the ranges overlap (three combining marks) the face declared last, latin, is the one used.
 */
export const FONT_SUBSETS: Array<[string, string]> = [
  [
    'latin-ext',
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  ],
  [
    'latin',
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  ],
];

/** Fontsource's name for one file, kept as it is in dist/fonts/: `manrope-latin-400-normal.woff2`, `roboto-flex-latin-wght-normal.woff2` */
const fontFile = (pkg: string, subset: string, weight: number | 'wght') => `${pkg}-${subset}-${weight}-normal.woff2`;

/**
 * Every file the panel ships, with the face it belongs to, in declaration order.
 */
const FONT_ENTRIES: Array<{
  family: string;
  pkg: string;
  scope: string;
  subset: string;
  range: string;
  /** what `font-weight` says: one weight, or the axis's range (`100 1000`) */
  weight: string;
  file: string;
}> = FONT_FACES.flatMap(({family, pkg, weights, variable}) => {
  const scope = variable ? '@fontsource-variable' : '@fontsource';
  return FONT_SUBSETS.flatMap(([subset, range]) =>
    variable
      ? [{family, pkg, scope, subset, range, weight: weights.join(' '), file: fontFile(pkg, subset, 'wght')}]
      : weights.map(weight => ({
          family,
          pkg,
          scope,
          subset,
          range,
          weight: `${weight}`,
          file: fontFile(pkg, subset, weight),
        })),
  );
});

/** The files in dist/fonts/; vite.config.ts copies exactly these. */
export const FONT_FILES = FONT_ENTRIES.map(e => e.file);

/** Each file with the Fontsource package it is copied from: `[package, file]`. */
export const FONT_SOURCES = FONT_ENTRIES.map((e): [string, string] => [`${e.scope}/${e.pkg}`, e.file]);

// dist/fonts/, beside the module Home Assistant loaded: /local/home-panel/home-panel.js?v=2.11.1 gives
// /local/home-panel/fonts/, without the query (the names are stable, so a cached font outlives an update). The module's
// URL is held in a variable first: Vite reads `new URL('fonts/', import.meta.url)` as a file to bundle, finds no
// src/fonts/ and warns on every build; through a variable it is a plain URL, resolved in the browser.
const moduleUrl = import.meta.url;
const FONTS_URL = new URL('fonts/', moduleUrl).href;

/** The @font-face rules for every file under `base` (a URL ending in a slash). */
export const fontFaces = (base: string = FONTS_URL): string =>
  FONT_ENTRIES.map(
    ({family, range, weight, file}) =>
      `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url("${base}${file}") format('woff2');unicode-range:${range}}`,
  ).join('\n');

/**
 * Declares the faces in the document, once. Chromium does not apply @font-face rules inside a shadow root, so they go
 * into document.head, where the panel's shadow root (and the charts and flows drawn in it) find the families by name.
 */
export function ensureFonts(): void {
  if (document.getElementById('home-panel-fonts')) return;
  const style = document.createElement('style');
  style.id = 'home-panel-fonts';
  style.textContent = fontFaces();
  document.head.appendChild(style);
}
