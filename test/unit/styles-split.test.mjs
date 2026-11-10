// One rule, one file (ADR 0019): a selector the kit, the shell or a feature writes is written nowhere else, so the legacy
// sheet and the elements read one source and a rule cannot drift into two copies. The legacy files (src/css/) are
// concatenated into one sheet and may still repeat a selector among themselves; it is a selector in a file of a new layer
// that must be alone. And a file of the kit must be imported by src/styles.js, so the legacy sheet never silently loses it.
import {readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, test} from 'vitest';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const LEGACY = 'src/css';
const KIT = 'src/ui/styles';

/** every `.css` file under a folder, as paths from the repository root; a folder that does not exist yet has none */
function cssFiles(folder) {
  let entries;
  try {
    entries = readdirSync(join(ROOT, folder), {withFileTypes: true});
  } catch {
    return [];
  }
  return entries.flatMap(e =>
    e.isDirectory() ? cssFiles(`${folder}/${e.name}`) : e.name.endsWith('.css') ? [`${folder}/${e.name}`] : [],
  );
}

/**
 * The selectors a stylesheet writes, each on one line: the text before every `{`, split on commas. The comments go first
 * (they may hold braces); an at-rule's own line is not a selector, and neither are the steps of a keyframes rule.
 */
function selectorsOf(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out = [];
  const blocks = []; // what each open `{` is: 'at', 'keyframes' or 'rule'
  let line = '';
  for (const ch of text) {
    if (ch === '{') {
      const prelude = line.trim().replace(/\s+/g, ' ');
      const kind = prelude.startsWith('@')
        ? /^@(-\w+-)?keyframes\b/.test(prelude)
          ? 'keyframes'
          : 'at'
        : blocks.includes('keyframes')
          ? 'step'
          : 'rule';
      if (kind === 'rule') out.push(...prelude.split(',').map(s => s.trim()));
      blocks.push(kind === 'step' ? 'step' : kind);
      line = '';
    } else if (ch === '}') {
      blocks.pop();
      line = '';
    } else line += ch;
  }
  return out;
}

/** The selectors that a file of a new layer shares with another file: selector to the files that write it. */
function sharedSelectors(files) {
  const where = new Map();
  for (const [file, css] of Object.entries(files))
    for (const selector of new Set(selectorsOf(css))) where.set(selector, [...(where.get(selector) ?? []), file]);
  return [...where]
    .filter(([, list]) => list.length > 1 && list.some(f => !f.startsWith(`${LEGACY}/`)))
    .map(([selector, list]) => `${selector}   in ${list.join(', ')}`);
}

describe('the parser of selectors', () => {
  test('reads a list, a rule in an at-rule and a rule after a comment with a brace in it', () => {
    const css = '/* { */ .a,\n.b > .c { x: 1 } @media (max-width: 1px) { .d { y: 2 } } .e::before { z: 3 }';
    expect(selectorsOf(css)).toEqual(['.a', '.b > .c', '.d', '.e::before']);
  });

  test('skips the steps of keyframes and the at-rules themselves', () => {
    const css = '@keyframes k { from { x: 1 } 50% { x: 2 } to { x: 3 } } @font-face { font-family: f } .after { y: 1 }';
    expect(selectorsOf(css)).toEqual(['.after']);
  });
});

describe('the one-rule-one-file check', () => {
  test('lists a selector a new layer shares with the legacy sheet, and one two kit files both write', () => {
    expect(
      sharedSelectors({
        [`${LEGACY}/phone.css`]: '.stile { x: 1 } .only-here { y: 1 }',
        [`${KIT}/stat-tile.css`]: '.stile { x: 1 } .tile-only { y: 1 }',
        [`${KIT}/sheet.css`]: '.tile-only { z: 1 }',
      }),
    ).toEqual([
      `.stile   in ${LEGACY}/phone.css, ${KIT}/stat-tile.css`,
      `.tile-only   in ${KIT}/stat-tile.css, ${KIT}/sheet.css`,
    ]);
  });

  test('lets two legacy files repeat a selector between them, as they still do', () => {
    expect(sharedSelectors({[`${LEGACY}/base.css`]: '.x { a: 1 }', [`${LEGACY}/phone.css`]: '.x { b: 1 }'})).toEqual(
      [],
    );
  });
});

describe('the files as written', () => {
  const folders = [LEGACY, KIT, 'src/shell', 'src/features'];
  const files = Object.fromEntries(
    folders.flatMap(folder => cssFiles(folder)).map(file => [file, readFileSync(join(ROOT, file), 'utf8')]),
  );

  test('no selector of a new layer is written in a second file', () => {
    expect(sharedSelectors(files)).toEqual([]);
  });

  test('every file of the kit is in the legacy sheet: src/styles.js imports it', () => {
    const imported = readFileSync(join(ROOT, 'src/styles.js'), 'utf8');
    const missing = cssFiles(KIT).filter(file => !imported.includes(`'./${file.replace(/^src\//, '')}?inline'`));
    expect(missing).toEqual([]);
  });
});
