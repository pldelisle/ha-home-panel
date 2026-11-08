// Montserrat ships with the panel: eight woff2 files, weights 400 to 700 in Fontsource's latin and latin-ext subsets,
// which vite.config.ts copies from @fontsource/montserrat into dist/fonts/ under their own names. The tablet never asks
// Google for anything, and the font is there when the house has no internet (docs/specs/08-bundled-font.md).

/** The weights the stylesheet uses. Automations labels ask for 800, which draws with the 700 file, as it did from Google. */
export const FONT_WEIGHTS = [400, 500, 600, 700];

/**
 * Fontsource's subsets with the unicode-range its CSS gives each (the weight files, 400.css and the rest, and
 * unicode.json; test/unit/fonts.test.mjs fails when the installed package says otherwise). latin has ASCII, Latin-1
 * (every French accent, « », the no-break space), Œ œ and the punctuation; latin-ext has the rest of Latin (Ÿ among
 * them), and a browser fetches its file only when a page shows one of those characters. The order is Fontsource's:
 * where the ranges overlap (three combining marks) the face declared last, latin, is the one used.
 * @type {Array<[string, string]>}
 */
export const FONT_SUBSETS = [
  [
    'latin-ext',
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
  ],
  [
    'latin',
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  ],
];

/** Fontsource's name for one file, kept as it is in dist/fonts/ */
const fontFile = (/** @type {string} */ subset, /** @type {number} */ weight) =>
  `montserrat-${subset}-${weight}-normal.woff2`;

/** The eight files in dist/fonts/; vite.config.ts copies exactly these. */
export const FONT_FILES = FONT_SUBSETS.flatMap(([subset]) => FONT_WEIGHTS.map(w => fontFile(subset, w)));

// dist/fonts/, beside the module Home Assistant loaded: /local/home-panel/home-panel.js?v=2.11.1 gives
// /local/home-panel/fonts/, without the query (the names are stable, so a cached font outlives an update). The module's
// URL is held in a variable first: Vite reads `new URL('fonts/', import.meta.url)` as a file to bundle, finds no
// src/fonts/ and warns on every build; through a variable it is a plain URL, resolved in the browser.
const here = import.meta.url;
const FONTS_URL = new URL('fonts/', here).href;

/** The @font-face rules for the eight files under `base` (a URL ending in a slash). */
export const fontFaces = (base = FONTS_URL) =>
  FONT_SUBSETS.flatMap(([subset, range]) =>
    FONT_WEIGHTS.map(
      w =>
        `@font-face{font-family:'Montserrat';font-style:normal;font-weight:${w};font-display:swap;src:url("${base}${fontFile(subset, w)}") format('woff2');unicode-range:${range}}`,
    ),
  ).join('\n');

/**
 * Declares Montserrat in the document, once. Chromium does not apply @font-face rules inside a shadow root, so they go
 * into document.head, where the panel's shadow root (and the charts and flows drawn in it) find the family by name.
 */
export function ensureFonts() {
  if (document.getElementById('home-panel-fonts')) return;
  const style = document.createElement('style');
  style.id = 'home-panel-fonts';
  style.textContent = fontFaces();
  document.head.appendChild(style);
}
