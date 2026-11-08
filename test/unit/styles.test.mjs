// The stylesheet is minified by Lightning CSS at build time (src/styles.js imports src/css/*.css with `?inline`, and
// vite.config.ts sets `build.cssMinify` and `build.cssTarget`). The Chromium screenshot baselines cannot see what
// Safari needs, so this test counts it instead: every `-webkit-`/`-moz-` property, value and selector the source
// writes must still be in the output, above all `-webkit-backdrop-filter`, which iOS and macOS Safari before 18 need
// for the glass. Without browser targets Lightning CSS drops 16 of the 19 (spec 06, As built #69).
//
// The expected figures come from the source files (a regex over src/css/*.css, comments removed), never from the
// output. The output is built here, into a scratch folder, through Vite's own API and the repository's
// vite.config.ts: once as the whole entry (what ships) and once from src/styles.js alone, which gives the stylesheet
// as a string, apart from the 468 kB of JavaScript around it (the entry has a few `backdrop-filter` and `color-mix(`
// of its own in inline styles).
import {test, expect, beforeAll, afterAll} from 'vitest';
import {readFileSync, readdirSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'vite';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
const source = stripComments(
  readdirSync(join(ROOT, 'src/css'))
    .filter(f => f.endsWith('.css'))
    .map(f => readFileSync(join(ROOT, 'src/css', f), 'utf8'))
    .join('\n'),
);

// how many times each vendor-prefixed name (-webkit-backdrop-filter, -moz-range-thumb, -webkit-scrollbar, …) is in text
const prefixes = text => {
  const counts = new Map();
  for (const [token] of text.matchAll(/-(?:webkit|moz|ms)-[a-z-]+/g)) counts.set(token, (counts.get(token) ?? 0) + 1);
  return counts;
};
// `backdrop-filter` that is not the tail of `-webkit-backdrop-filter`
const unprefixedBackdrop = text => (text.match(/(?<!-)backdrop-filter/g) ?? []).length;

let scratch, entry, css;
beforeAll(async () => {
  scratch = mkdtempSync(join(tmpdir(), 'hp-styles-'));
  const configFile = join(ROOT, 'vite.config.ts');
  const common = {configFile, root: ROOT, logLevel: 'silent'};
  // the whole entry, as `npm run build` writes it (no source map: this test does not read it)
  await build({
    ...common,
    build: {outDir: join(scratch, 'entry'), emptyOutDir: true, sourcemap: false, lib: {entry: 'src/main.js'}},
  });
  entry = readFileSync(join(scratch, 'entry/home-panel.js'), 'utf8');
  // src/styles.js alone, with the same CSS settings: its `CSS` export is the minified stylesheet
  await build({
    ...common,
    build: {
      outDir: join(scratch, 'styles'),
      emptyOutDir: true,
      sourcemap: false,
      lib: {entry: 'src/styles.js', formats: ['es'], fileName: () => 'styles.js'},
    },
  });
  css = (await import(pathToFileURL(join(scratch, 'styles/styles.js')).href)).CSS;
}, 120_000);
afterAll(() => rmSync(scratch, {recursive: true, force: true}));

test('the minified stylesheet is the one inside the entry', () => {
  expect(css.length).toBeGreaterThan(100_000);
  // the entry carries the string either between double quotes or in a template; compare a piece from the middle,
  // which has no quote or backslash of its own to escape differently
  const middle = css.slice(60_000, 60_200);
  expect(middle).not.toMatch(/["'`\\\n]/);
  expect(entry).toContain(middle);
});

test('the source has the vendor prefixes this test guards (so the comparison below cannot pass on an empty list)', () => {
  const want = prefixes(source);
  expect(want.get('-webkit-backdrop-filter')).toBeGreaterThanOrEqual(19);
  expect(want.get('-moz-range-thumb')).toBeGreaterThanOrEqual(3);
  expect(want.size).toBeGreaterThanOrEqual(15);
});

test('every -webkit- and -moz- name in the source is in the minified stylesheet at least as often', () => {
  const have = prefixes(css);
  // reported as one list of names that lost some, with the source's count and the output's
  const lost = [...prefixes(source)]
    .filter(([token, n]) => (have.get(token) ?? 0) < n)
    .map(([token, n]) => `${token}: ${have.get(token) ?? 0} in the output, ${n} in the source`);
  expect(lost).toStrictEqual([]);
});

test('every rule keeps its unprefixed backdrop-filter, written after the prefixed one', () => {
  // Lightning CSS merges `backdrop-filter` written before `-webkit-backdrop-filter` into the second alone, which
  // Chromium ignores (the idle stack card lost its blur): the source writes the prefixed line first, always
  expect(unprefixedBackdrop(css)).toBe(unprefixedBackdrop(source));
  expect(source).not.toMatch(/(?<!-)backdrop-filter:[^;]+;\s*-webkit-backdrop-filter/);
});

test('every color-mix() the source writes is still in the stylesheet, as written, not computed away', () => {
  // by distinct expression, not by count: Lightning CSS merges two adjacent rules with the same declarations into one
  // selector list (`.pod.on` and `.mtvscreen.on` in glass.css), which is one `color-mix(` fewer and the same style
  const expressions = text => new Set([...text.matchAll(/color-mix\([^;}]*/g)].map(m => m[0].replace(/\s+/g, '')));
  const have = expressions(css);
  const want = expressions(source);
  expect(want.size).toBeGreaterThan(50);
  expect([...want].filter(e => !have.has(e))).toStrictEqual([]);
});

test('the stylesheet is minified: no comment, no run of spaces', () => {
  expect(css).not.toContain('/*');
  expect(entry).not.toContain('Live activities (2.5.0)'); // a comment in src/css/live.css
  expect(entry).not.toMatch(/\.app\.gl \{\s{2,}/);
  expect(css).not.toMatch(/ {2}|\n/);
  expect(css.length).toBeLessThan(source.length * 0.9);
});
