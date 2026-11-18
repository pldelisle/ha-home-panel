// Shape and motion are tokens (#459, docs/design.md "Shape and motion"): a corner radius is a `--shape-*` and an easing a `--motion-*`,
// declared once on `.app` in src/ui/styles/tokens.css, so a second design language redefines them in one place. This test keeps it so:
// it reads every stylesheet under src/ (the .css files and the css`` templates in .ts files, comments removed) and fails on a literal
// pixel `border-radius` (0, 50% and `inherit` are not shape: they are "square", "a circle" and "the parent's"), on a `cubic-bezier(...)`
// or a `linear(...)` spring outside tokens.css, on a bare `0.2s ease` (a duration and a curve are `--motion-fade-ms` and `--motion-fade`), on a
// press `scale(0.9x)` that is not a token (the Material design scales nothing), and on a `var(--shape-x)` or `var(--motion-x)` that tokens.css does
// not declare (a typo would leave the rule without a radius or a transition, and no screenshot would say which). The Material design (#463)
// redefines the role tokens in its own block of tokens.css; the test reads the Apple tokens (the first declarations) as the role set.
import {test, expect} from 'vitest';
import {readFileSync, readdirSync} from 'node:fs';
import {join, relative} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const TOKENS = 'src/ui/styles/tokens.css';
const stripComments = css => css.replace(/\/\*[\s\S]*?\*\//g, '');

const walk = dir =>
  readdirSync(dir, {withFileTypes: true}).flatMap(entry =>
    entry.isDirectory() ? walk(join(dir, entry.name)) : [join(dir, entry.name)],
  );
const files = walk(join(ROOT, 'src')).map(f => relative(ROOT, f));

// every stylesheet: a .css file whole, a .ts file's css`...` templates
const sheets = files.flatMap(file => {
  const text = readFileSync(join(ROOT, file), 'utf8');
  if (file.endsWith('.css')) return [{file, css: stripComments(text)}];
  if (!file.endsWith('.ts')) return [];
  return [...text.matchAll(/\bcss`([^`]*)`/g)].map(m => ({file, css: stripComments(m[1])}));
});

const lineOf = (css, index) => css.slice(0, index).split('\n').length;
const find = (pattern, skip = () => false) =>
  sheets
    .filter(({file}) => !skip(file))
    .flatMap(({file, css}) =>
      [...css.matchAll(pattern)].map(m => `${file} (line ${lineOf(css, m.index)}): ${m[0].trim()}`),
    );

test('the scan sees the panel: the stylesheets are found, and tokens.css declares the shape scale', () => {
  expect(sheets.length).toBeGreaterThan(60);
  const tokens = readFileSync(join(ROOT, TOKENS), 'utf8');
  expect(tokens).toMatch(/--shape-card: 22px;/);
  expect(tokens).toMatch(/--motion-standard: cubic-bezier\(/);
});

test('no border-radius is a literal pixel value: it is a --shape-* token (0, 50% and inherit stay)', () => {
  // a literal in any corner of the shorthand counts: `30px 30px 0 0` must be `var(--shape-sheet) var(--shape-sheet) 0 0`
  expect(
    find(
      /border(?:-(?:top|bottom|start|end)-(?:left|right|start|end))?-radius:[^;}]*\b\d*\.?\d+(?:px|rem|em)\b[^;}]*/g,
    ),
  ).toEqual([]);
});

test('no cubic-bezier literal stays outside the token declarations', () => {
  expect(find(/cubic-bezier\(/g, file => file === TOKENS)).toEqual([]);
});

const MATERIAL_BLOCK = /\.app\[data-design='material'\]\s*\{[^}]*\}/g;
const tokenNames = css => [...css.matchAll(/^\s*(--(?:shape|motion)-[a-z0-9-]+):/gm)].map(m => m[1]);

test('no linear() spring and no bare duration with a curve stays outside the token declarations', () => {
  expect(find(/\blinear\(/g, file => file === TOKENS)).toEqual([]);
  expect(find(/\b0\.2s ease\b(?!-)/g, file => file === TOKENS)).toEqual([]);
});

test('a press never writes a literal scale: it is a --press-scale token, which Material sets to 1', () => {
  expect(find(/(?<!translateY\([^)]*\) )transform:\s*scale\(0\.[89]\d*\)/g)).toEqual([]);
  expect(readFileSync(join(ROOT, TOKENS), 'utf8')).toMatch(/--press-scale: 1;/);
});

test('every --shape-* and --motion-* a rule reads is declared in tokens.css, each role once on .app', () => {
  const tokens = stripComments(readFileSync(join(ROOT, TOKENS), 'utf8'));
  const material = (tokens.match(MATERIAL_BLOCK) ?? []).join('\n');
  const apple = tokens.replace(MATERIAL_BLOCK, '');
  const roles = tokenNames(apple);
  expect(new Set(roles).size).toBe(roles.length);
  // the Material block redefines roles and adds its own scale and springs
  const declared = [...roles, ...tokenNames(material)];
  const used = new Set(
    sheets.flatMap(({css}) => [...css.matchAll(/var\((--(?:shape|motion)-[a-z0-9-]+)\)/g)].map(m => m[1])),
  );
  expect([...used].filter(name => !declared.includes(name))).toEqual([]);
  // and no role is declared for nothing: a token no rule reads is a role that was never drawn
  expect(roles.filter(name => !used.has(name))).toEqual([]);
  // Material answers for every role the Apple look declares and no rule reads from the scale (a role it leaves alone is the same in both designs)
  const redefined = new Set(tokenNames(material));
  const kept = roles.filter(name => !redefined.has(name));
  expect(kept.every(name => /^--shape-(?:track|bar)/.test(name))).toBe(true);
});
