// Shape and motion are tokens (#459, docs/design.md "Shape and motion"): a corner radius is a `--shape-*` and an easing a `--motion-*`,
// declared once on `.app` in src/ui/styles/tokens.css, so a second design language redefines them in one place. This test keeps it so:
// it reads every stylesheet under src/ (the .css files and the css`` templates in .ts files, comments removed) and fails on a literal
// pixel `border-radius` (0, 50% and `inherit` are not shape: they are "square", "a circle" and "the parent's"), on a `cubic-bezier(...)`
// outside tokens.css, and on a `var(--shape-x)` or `var(--motion-x)` that tokens.css does not declare (a typo would leave the rule
// without a radius or a transition, and no screenshot would say which).
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

test('every --shape-* and --motion-* a rule reads is declared once on .app in tokens.css', () => {
  const tokens = stripComments(readFileSync(join(ROOT, TOKENS), 'utf8'));
  const declared = [...tokens.matchAll(/^\s*(--(?:shape|motion)-[a-z-]+):/gm)].map(m => m[1]);
  expect(new Set(declared).size).toBe(declared.length);
  const used = new Set(
    sheets.flatMap(({css}) => [...css.matchAll(/var\((--(?:shape|motion)-[a-z-]+)\)/g)].map(m => m[1])),
  );
  expect([...used].filter(name => !declared.includes(name))).toEqual([]);
  // and none is declared for nothing: a token no rule reads is a role that was never drawn
  expect(declared.filter(name => !used.has(name))).toEqual([]);
});
