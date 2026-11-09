// The stylesheet is minified by Lightning CSS at build time (src/styles.js imports src/css/*.css with `?inline`;
// vite.config.ts sets `build.cssMinify` and `build.cssTarget`, for Safari and iOS 26 and current Chrome, Edge and
// Firefox: docs/specs/06-vite-build.md, "As built (#69)"). The screenshot baselines catch what looks different; this
// test catches what a minifier can lose without a pixel moving in the test house: an effect dropped, a block merged
// away, a rule that is no longer there.
//
// The expected figures come from the source files (a regex over src/css/*.css, comments removed), never from the
// output. The output is built here into a scratch folder, through Vite's own API and the repository's vite.config.ts:
// once as the whole entry (what ships) and once from src/styles.js alone, which gives the stylesheet as a string apart
// from the JavaScript around it (the entry has a few `backdrop-filter` and `color-mix(` of its own in inline styles).
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
const count = (text, pattern) => (text.match(pattern) ?? []).length;

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

test('the minified stylesheet is the one inside the entry, and it is smaller than the source', () => {
  expect(css.length).toBeGreaterThan(100_000);
  expect(css.length).toBeLessThan(source.length * 0.9);
  // the entry carries the string either between double quotes or in a template; compare a piece from the middle,
  // which has no quote or backslash of its own to escape differently
  const middle = css.slice(60_000, 60_200);
  expect(middle).not.toMatch(/["'`\\\n]/);
  expect(entry).toContain(middle);
});

test('the stylesheet is minified: no comment, no run of spaces', () => {
  expect(css).not.toContain('/*');
  expect(entry).not.toContain('Live activities (2.5.0)'); // a comment in src/css/live.css
  expect(css).not.toMatch(/ {2}|\n/);
});

test('every rule with a backdrop-filter keeps the unprefixed one, the glass', () => {
  // for these targets the `-webkit-` copy is no longer needed and Lightning CSS drops it; what must stay is the
  // unprefixed line. A rule that writes `backdrop-filter` before `-webkit-backdrop-filter` loses it: Lightning CSS merges
  // the pair into the second, which Chromium does not implement (the idle stack card lost its blur). So the source
  // writes the prefixed line first, always, and the count of unprefixed lines is the same before and after.
  const unprefixed = text => count(text, /(?<!-)backdrop-filter/g);
  expect(unprefixed(source)).toBeGreaterThan(15);
  expect(unprefixed(css)).toBe(unprefixed(source));
  expect(source).not.toMatch(/(?<!-)backdrop-filter:[^;]+;\s*-webkit-backdrop-filter/);
});

test('every color-mix() the source writes is still in the stylesheet, as written', () => {
  // by distinct expression, not by count: Lightning CSS merges two adjacent rules with the same declarations into one
  // selector list (`.pod.on` and `.mtvscreen.on` in glass.css), which is one `color-mix(` fewer and the same style
  const expressions = text => new Set([...text.matchAll(/color-mix\([^;}]*/g)].map(m => m[0].replace(/\s+/g, '')));
  const have = expressions(css);
  const want = expressions(source);
  expect(want.size).toBeGreaterThan(50);
  expect([...want].filter(e => !have.has(e))).toStrictEqual([]);
});

test('@supports, @container, @layer, nesting, :is(), :where() and :has() are still there', () => {
  const kinds = {
    '@supports': /@supports\b/g,
    '@container': /@container\b/g,
    '@layer': /@layer\b/g,
    ':is(': /:is\(/g,
    ':where(': /:where\(/g,
    ':has(': /:has\(/g,
    'nested rule (& selector)': /[{;]\s*&/g,
  };
  for (const [name, pattern] of Object.entries(kinds))
    expect(count(css, pattern), `${name}: ${count(source, pattern)} in the source`).toBeGreaterThanOrEqual(
      count(source, pattern),
    );
});
