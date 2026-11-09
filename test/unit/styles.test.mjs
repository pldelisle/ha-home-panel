// The stylesheet is minified by Lightning CSS at build time (src/styles.js imports src/css/*.css with `?inline`;
// vite.config.ts sets `build.cssMinify` and `build.cssTarget`). The Chromium screenshot baselines cannot see what
// Safari needs, so this test counts it: every `-webkit-`/`-moz-` name the source writes is still in the output, above all
// `-webkit-backdrop-filter` (iOS and macOS Safari before 18 need it for the glass), and no media query was rewritten
// into a form an older Safari reads as invalid. Why, and what Lightning CSS does and does not do with the targets:
// docs/specs/06-vite-build.md, "As built (#69)".
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

// how many times each vendor-prefixed name (-webkit-backdrop-filter, -moz-range-thumb, -ms-…) is in text
const vendorPrefixed = text => {
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

test('the source has the vendor prefixes this test guards, so the comparison cannot pass on an empty list', () => {
  const want = vendorPrefixed(source);
  expect(want.get('-webkit-backdrop-filter')).toBeGreaterThanOrEqual(19);
  expect(want.get('-moz-range-thumb')).toBeGreaterThanOrEqual(3);
  expect(want.size).toBeGreaterThanOrEqual(15);
});

test('every -webkit-, -moz- and -ms- name in the source is in the minified stylesheet at least as often', () => {
  const have = vendorPrefixed(css);
  // reported as one list of names that lost some, with the source's count and the output's
  const lost = [...vendorPrefixed(source)]
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

// The at-rule preludes (`@media (…)`, `@supports (…)`, `@container (…)`), spaces removed. Lightning CSS rewrites some
// of them whatever the targets are, and Chrome 90 and Safari 15 cannot read every rewrite: it wrote
// `(max-aspect-ratio: 1/1)` as `(max-aspect-ratio:1)`, which those versions drop with the whole block.
const preludes = text =>
  new Set(
    [...text.matchAll(/@(media|supports|container)\s*([^{]+)\{/g)].map(m => `@${m[1]}${m[2].replace(/\s+/g, '')}`),
  );
// what Lightning CSS adds or rewrites, each one looked at and accepted:
const ADDED = new Set([
  // `color-scheme: light dark` (.dtime in base.css) comes with `--lightningcss-light` and `--lightningcss-dark` toggles
  // for light-dark(); the stylesheet has no light-dark(), so they feed nothing
  '@media(prefers-color-scheme:dark)',
]);
const REWRITTEN = new Map([
  // the container query's `max-height` becomes a range; @container is Safari 16+ and the rule only trims a small card
  ['@container(max-height:230px)', '@container(height<=230px)'],
]);

test('no media query lost the a/b form of an aspect ratio, which Chrome 90 and Safari 15 require', () => {
  expect(css).not.toMatch(/aspect-ratio:[\d.]+\)/);
  const ratios = [...css.matchAll(/(?:min-|max-)?(?:device-)?aspect-ratio:([^)]*)\)/g)].map(m => m[1]);
  expect(ratios.filter(r => !r.includes('/'))).toStrictEqual([]);
});

test('no media query is written in the range syntax, which Safari reads only from 16.4', () => {
  const ranges = [...preludes(css)].filter(p => p.startsWith('@media') && /[<>]/.test(p));
  expect(ranges).toStrictEqual([]);
});

test('every at-rule prelude in the output is one the source wrote, or one rewritten or added on purpose', () => {
  const want = new Set([...preludes(source)].map(p => REWRITTEN.get(p) ?? p));
  const have = preludes(css);
  expect(want.size).toBeGreaterThan(10);
  expect([...have].filter(p => !want.has(p) && !ADDED.has(p))).toStrictEqual([]);
  expect([...want].filter(p => !have.has(p))).toStrictEqual([]);
});
