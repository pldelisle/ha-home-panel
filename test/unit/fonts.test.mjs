// src/ui/fonts.ts declares the bundled faces, Manrope, Roboto Flex and JetBrains Mono (spec 08, ADR 0037). Their file names and unicode ranges must
// be the ones the installed Fontsource packages ship and declare, so that a bump which renames a file or moves a range
// fails here rather than on a tablet; and the rules go into the document once, however often the panel redraws itself.
import {test, expect, afterEach} from 'vitest';
import {existsSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {
  FONT_FACES,
  FONT_FILES,
  FONT_SOURCES,
  FONT_SUBSETS,
  FONT_WEIGHTS,
  fontFaces,
  ensureFonts,
} from '../../src/ui/fonts.ts';

const require = createRequire(import.meta.url);
// Roboto Flex is Fontsource's variable package; the other two are its static ones
const scopeOf = face => (face.variable ? '@fontsource-variable' : '@fontsource');
const pkgDir = face => dirname(require.resolve(`${scopeOf(face)}/${face.pkg}/package.json`));
const pkgFile = (face, f) => readFileSync(join(pkgDir(face), f), 'utf8');
const noSpace = s => s.replaceAll(/\s/g, '');

test("the files are Fontsource's: Manrope 400 to 700, Roboto Flex's variable weight axis and JetBrains Mono 400, in the latin and latin-ext subsets", () => {
  expect(FONT_FACES.map(f => [f.family, f.weights])).toEqual([
    ['Manrope', [400, 500, 600, 700]],
    ['Roboto Flex', [100, 1000]],
    ['JetBrains Mono', [400]],
  ]);
  expect(FONT_WEIGHTS).toEqual([400, 500, 600, 700]);
  expect(FONT_FILES.toSorted()).toEqual([
    'jetbrains-mono-latin-400-normal.woff2',
    'jetbrains-mono-latin-ext-400-normal.woff2',
    'manrope-latin-400-normal.woff2',
    'manrope-latin-500-normal.woff2',
    'manrope-latin-600-normal.woff2',
    'manrope-latin-700-normal.woff2',
    'manrope-latin-ext-400-normal.woff2',
    'manrope-latin-ext-500-normal.woff2',
    'manrope-latin-ext-600-normal.woff2',
    'manrope-latin-ext-700-normal.woff2',
    'roboto-flex-latin-ext-wght-normal.woff2',
    'roboto-flex-latin-wght-normal.woff2',
  ]);
  for (const [pkg, f] of FONT_SOURCES)
    expect(existsSync(join(dirname(require.resolve(`${pkg}/package.json`)), 'files', f)), f).toBe(true);
});

test('each subset has the unicode-range Fontsource declares for it, in the order its CSS declares them, in every package', () => {
  for (const face of FONT_FACES) {
    const {pkg, weights, variable} = face;
    const ranges = JSON.parse(pkgFile(face, 'unicode.json'));
    // the weight files (400.css …) name each weight's files; the variable package's wght.css names the one file of the whole axis
    const sheets = variable ? ['wght'] : weights.map(String);
    for (const [subset, range] of FONT_SUBSETS) {
      expect(range, `${pkg} ${subset}`).toBe(noSpace(ranges[subset]));
      // the sheet declares the same range on the block for this subset's file
      for (const w of sheets) {
        const block = pkgFile(face, `${w}.css`)
          .split('@font-face')
          .find(b => b.includes(`/${pkg}-${subset}-${w}-normal.woff2`));
        expect(noSpace(block.match(/unicode-range:([^;]+);/)[1]), `${pkg} ${w}.css, ${subset}`).toBe(range);
      }
    }
    // latin last: where two ranges overlap, the face declared last is used
    const [w] = sheets;
    const css = pkgFile(face, `${w}.css`);
    const at = subset => css.indexOf(`/${pkg}-${subset}-${w}-normal.woff2`);
    expect(FONT_SUBSETS.map(([subset]) => subset).toSorted((a, b) => at(a) - at(b))).toEqual(
      FONT_SUBSETS.map(([subset]) => subset),
    );
  }
});

// the subset whose range holds a character: the last declared one, as the browser picks it
const subsetOf = char => {
  const cp = char.codePointAt(0);
  const covers = range =>
    range.split(',').some(part => {
      const [lo, hi = lo] = part.slice(2).split('-');
      return cp >= parseInt(lo, 16) && cp <= parseInt(hi, 16);
    });
  return FONT_SUBSETS.findLast(([, range]) => covers(range))?.[0] ?? null;
};

test('French needs only the latin file; latin-ext is fetched for the rarer Latin letters', () => {
  // every accent, œ and Œ, the guillemets, the typographic apostrophe, the ellipsis, the euro and the no-break spaces
  // (U+00A0, and U+202F that fr-CA number formatting writes) are in latin
  for (const c of 'éèêëàâîïôûùüçÉÈÊÀÇœŒ«»’…€°  ')
    expect(subsetOf(c), `U+${c.codePointAt(0).toString(16)}`).toBe('latin');
  for (const c of 'Ÿłā') expect(subsetOf(c), c).toBe('latin-ext');
  // no subset has it: drawn from a system font, as with Google's stylesheet
  expect(subsetOf('₂')).toBe(null);
});

test('the rules: one face per file, swap, each file under the base URL it is given', () => {
  const base = 'https://ha.local/hacsfiles/ha-home-panel/fonts/';
  const rules = fontFaces(base).split('\n');
  expect(rules).toHaveLength(FONT_FILES.length);
  const re =
    /^@font-face\{font-family:'([^']+)';font-style:normal;font-weight:(\d+(?: \d+)?);font-display:swap;src:url\("([^"]+)"\) format\('woff2'\);unicode-range:([^}]+)\}$/;
  const seen = rules.map(rule => {
    const [, family, weight, url, range] = rule.match(re) ?? [];
    expect(url, rule).toBeDefined();
    const file = url.slice(base.length);
    expect(url).toBe(base + file);
    const [, pkg, subset, w] = file.match(
      /^(manrope|roboto-flex|jetbrains-mono)-(latin(?:-ext)?)-(\d+|wght)-normal\.woff2$/,
    );
    const face = FONT_FACES.find(f => f.pkg === pkg);
    expect(family).toBe(face.family);
    // Roboto Flex is one file for the whole weight axis, and its rule says the axis once: `font-weight:100 1000`
    expect(weight).toBe(face.variable ? '100 1000' : w);
    if (face.variable) expect(w).toBe('wght');
    expect(range).toBe(FONT_SUBSETS.find(([s]) => s === subset)[1]);
    return file;
  });
  expect(seen).toEqual(FONT_FILES);
});

// a document with just what ensureFonts touches
function fakeDocument() {
  const head = [];
  return {
    head: {children: head, appendChild: e => head.push(e)},
    getElementById: id => head.find(e => e.id === id) ?? null,
    createElement: tagName => ({tagName, id: '', textContent: ''}),
  };
}

// the tokens: the Apple design is set in Manrope, the Material one in Roboto Flex, and each names a face this module declares
test('the frame sets the Apple design in Manrope and the Material design in Roboto Flex, both faces declared here', () => {
  const tokens = readFileSync(new URL('../../src/ui/styles/tokens.css', import.meta.url), 'utf8');
  const rule = selector => tokens.slice(tokens.indexOf(`${selector} {`)).match(/\{([^}]*)\}/)[1];
  const first = (css, prop) => css.match(new RegExp(`--${prop}:\\s*'([^']+)'`))[1];
  const declared = FONT_FACES.map(f => f.family);
  for (const prop of ['f-num', 'f-body']) {
    const apple = first(rule('.app'), prop);
    const material = first(rule(".app[data-design='material']"), prop);
    expect([apple, material], prop).toEqual(['Manrope', 'Roboto Flex']);
    expect(declared).toEqual(expect.arrayContaining([apple, material]));
  }
  // Roboto Flex is one variable face: one rule per subset, each saying the whole weight axis
  const rules = fontFaces('https://ha.local/fonts/')
    .split('\n')
    .filter(r => r.includes("'Roboto Flex'"));
  expect(rules).toHaveLength(FONT_SUBSETS.length);
  for (const r of rules) expect(r).toContain('font-weight:100 1000');
});

afterEach(() => {
  delete globalThis.document;
});

test('ensureFonts puts the rules into the document once, pointing beside the module', () => {
  const doc = (globalThis.document = fakeDocument());
  ensureFonts();
  ensureFonts(); // a redraw (a language or config change) calls it again
  expect(doc.head.children).toHaveLength(1);
  const [style] = doc.head.children;
  expect(style).toMatchObject({tagName: 'style', id: 'home-panel-fonts'});
  // here the module is src/ui/fonts.ts, so its fonts/ is src/ui/fonts/; built, it is dist/home-panel.js and dist/fonts/
  expect(style.textContent).toBe(fontFaces(new URL('../../src/ui/fonts/', import.meta.url).href));
});
