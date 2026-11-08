// The build output: dist/ has the shape the install instructions and the release zip assume, and nothing from one
// particular house is inside (the bundle, its source map, and the source files and tests they come from).
// dist/ is the result of `npm run build` (CI and the release workflow run it first); when it is missing or older than
// a file it is built from, this test runs the build itself, so `npm test` works on a fresh checkout and never checks a
// stale bundle.
import {test, expect, beforeAll} from 'vitest';
import {readFileSync, readdirSync, existsSync, statSync} from 'node:fs';
import {basename, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {FONT_FILES} from '../../src/fonts.js';
import {GOOGLE_FONT_HOSTS} from '../google-font-hosts.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const DIST = join(ROOT, 'dist');
const BUNDLE = join(DIST, 'home-panel.js');
const read = f => readFileSync(join(ROOT, f), 'utf8');
const version = JSON.parse(read('package.json')).version;

// every file under dir (as paths relative to ROOT), skipping the folders that hold no source text
const walk = (dir, skip = []) =>
  readdirSync(join(ROOT, dir), {withFileTypes: true}).flatMap(e => {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) return skip.includes(e.name) ? [] : walk(rel, skip);
    return [rel];
  });

// the newest modification time among the inputs of the build
const newestInput = () =>
  Math.max(
    ...['package.json', 'package-lock.json', 'vite.config.ts', 'LICENSES.md', ...walk('src')].map(
      f => statSync(join(ROOT, f)).mtimeMs,
    ),
  );

beforeAll(() => {
  if (existsSync(BUNDLE) && statSync(BUNDLE).mtimeMs >= newestInput()) return;
  execFileSync('npm', ['run', 'build'], {cwd: ROOT, stdio: 'pipe'});
}, 120_000);

// every file under dist/, as paths relative to it ('chunks/x.js'), sorted; the lazy chunks the entry loads with
// import(), chunks/<name>-<hash>.js, and their text. Read once, after the build above.
let distFiles, chunks, text;
beforeAll(() => {
  distFiles = walk('dist')
    .map(f => f.slice('dist/'.length))
    .sort();
  chunks = distFiles.filter(f => /^chunks\/.+\.js$/.test(f));
  const texts = new Map(chunks.map(c => [c, readFileSync(join(DIST, c), 'utf8')]));
  text = c => texts.get(c);
});

test('dist/ holds the bundle, its source map, the lazy chunks, the fonts and the licence list, and nothing else', () => {
  // no copied library file (there is no vendor/), no assets/ folder: the stylesheets are imported as text
  // the fonts are the eight files src/fonts.js names (fonts.test.mjs pins that list to Fontsource's eight names)
  const rest = distFiles.filter(f => !chunks.some(c => f === c || f === c + '.map'));
  expect(rest).toStrictEqual(
    ['LICENSES.md', ...FONT_FILES.map(f => `fonts/${f}`), 'home-panel.js', 'home-panel.js.map'].sort(),
  );
  for (const c of chunks) {
    expect(c).toMatch(/^chunks\/[\w.-]+-[\w-]{8}\.js$/); // [name]-[hash].js
    // a chunk names its map at its end exactly when the map is there, so a stack trace from a chart or a flow points
    // at the code it came from; Rolldown writes none for a chunk with no code from a source file (one that only
    // re-exports another, or holds its own runtime helpers)
    const named = text(c)
      .trimEnd()
      .endsWith(`//# sourceMappingURL=${c.slice('chunks/'.length)}.map`);
    expect(distFiles.includes(c + '.map'), `${c} and its map`).toBe(named);
  }
});

test("the chunks' maps name the libraries' files but leave out their text", () => {
  // vite.config.ts drops each node_modules source's text from the chunk maps (9.9 MB of Mermaid alone); the panel's
  // own files keep theirs
  const maps = distFiles.filter(f => /^chunks\/.+\.js\.map$/.test(f));
  expect(maps.length).toBeGreaterThan(0);
  for (const f of maps) {
    const map = JSON.parse(readFileSync(join(DIST, f), 'utf8'));
    map.sources.forEach((s, i) => {
      if (s.includes('node_modules/')) expect(map.sourcesContent?.[i] ?? null, `${f}: ${s}`).toBe(null);
      else expect(typeof map.sourcesContent?.[i], `${f}: ${s}`).toBe('string');
    });
  }
});

test('dist/fonts/ holds the Montserrat files as Fontsource ships them, and nothing names Google', () => {
  // under Fontsource's names (src/fonts.js builds the URLs from them), byte for byte the installed package's files
  const requireFontsource = createRequire(import.meta.url);
  for (const f of distFiles.filter(f => f.startsWith('fonts/')))
    expect(
      readFileSync(join(DIST, f)).equals(
        readFileSync(requireFontsource.resolve(`@fontsource/montserrat/files/${basename(f)}`)),
      ),
      f,
    ).toBe(true);
  // the entry declares them itself: the subsets' ranges and the style element are in it
  const entry = readFileSync(BUNDLE, 'utf8');
  expect(entry).toContain('home-panel-fonts');
  expect(entry).toContain('U+0000-00FF,U+0131,U+0152-0153');
  // no text file in dist/ names Google's font hosts
  for (const f of distFiles.filter(f => /\.(js|map|md)$/.test(f))) {
    const text = readFileSync(join(DIST, f), 'utf8');
    for (const host of GOOGLE_FONT_HOSTS) expect(text.includes(host), `${f} names ${host}`).toBe(false);
  }
});

test("the generated LICENSES.md ships as it is, so the release zip carries the libraries' licences", () => {
  expect(readFileSync(join(DIST, 'LICENSES.md')).equals(readFileSync(join(ROOT, 'LICENSES.md')))).toBe(true);
});

test('every package whose code is in a chunk is listed in LICENSES.md', () => {
  // the chunks' maps name each node_modules file a chunk was built from; a package inside a pre-bundled file (svg.js
  // inside apexcharts.esm.js) has no entry of its own, and the list covers it as part of the production tree
  const rows = read('LICENSES.md')
    .split('\n')
    .filter(l => l.startsWith('| '))
    .map(l => l.split(' | ')[0].slice(2));
  const used = new Set();
  for (const f of distFiles.filter(f => /^chunks\/.+\.js\.map$/.test(f)))
    for (const s of JSON.parse(readFileSync(join(DIST, f), 'utf8')).sources) {
      const i = s.lastIndexOf('node_modules/');
      if (i < 0) continue;
      const [a, b] = s.slice(i + 'node_modules/'.length).split('/');
      used.add(a.startsWith('@') ? `${a}/${b}` : a);
    }
  expect(used.size, 'packages named in the maps').toBeGreaterThan(20);
  for (const name of used) expect(rows, name).toContain(name);
});

test('the licence notices the libraries carry stay in their chunks', () => {
  // vite.config.ts sets comments: {legal: true}; Vite 8 would strip /*! … */ and @license comments otherwise
  const all = chunks.map(text).join('\n');
  expect(all).toMatch(/@license DOMPurify \d/);
  expect(all).toContain('/*! svg.draggable.js');
  expect(all).toContain('ApexCharts v3.45.2');
});

test('ApexCharts and its stylesheet are in one lazy chunk, and not in the entry', () => {
  // the version comes from the package, and the library is recognised by a class name only its drawing code uses (its
  // banner comment stays in the chunk with the other licence comments, but says nothing about where the code is); the
  // stylesheet by one of its selectors
  const lib = 'apexcharts-xaxis-label',
    sheet = '.apexcharts-canvas ::-webkit-scrollbar';
  // 3.45.2 exactly: the charts must stay pixel-identical, and renovate.json freezes the version
  expect(JSON.parse(read('node_modules/apexcharts/package.json')).version).toBe('3.45.2');
  const withApex = chunks.filter(c => text(c).includes(lib));
  expect(withApex, `chunks holding the library (${lib})`).toHaveLength(1);
  expect(text(withApex[0]).includes(sheet), 'the stylesheet text is in that chunk').toBe(true);
  const entry = readFileSync(BUNDLE, 'utf8');
  expect(entry.includes(lib), 'the entry holds no ApexCharts code').toBe(false);
  expect(entry.includes(sheet), 'the entry holds no ApexCharts stylesheet').toBe(false);
  // the entry reaches the chunk through a dynamic import of a path beside it
  expect(entry).toMatch(/import\(\s*[`"']\.\/chunks\/apex-lib-[\w-]+\.js[`"']\s*\)/);
});

test('Mermaid is a lazy chunk with its map, not in the entry, which fetches no chunk as it loads', () => {
  // `mermaidAPI`, a property of Mermaid's default export that minifying keeps, is in its core only
  const mermaid = chunks.filter(c => text(c).includes('mermaidAPI'));
  expect(mermaid, 'chunks holding Mermaid').toHaveLength(1);
  // a stack trace from a flow chart points at Mermaid's files
  expect(distFiles).toContain(mermaid[0] + '.map');
  const entry = readFileSync(BUNDLE, 'utf8');
  expect(entry.includes('mermaidAPI'), 'the entry holds no Mermaid code').toBe(false);
  // every chunk the entry names is loaded with import(), Mermaid's core among them
  const refs = [...entry.matchAll(/(import\(\s*)?[`"']\.\/(chunks\/[^`"']+)[`"']/g)];
  for (const [, dynamic, c] of refs) expect(dynamic, `${c} imported statically`).toBeTruthy();
  expect(refs.map(r => r[2])).toContain(mermaid[0]);
});

test('no chunk imports the entry back', () => {
  // Home Assistant loads home-panel.js?v=…; a chunk importing ../home-panel.js would load a second copy without the
  // query and run the panel's modules twice
  for (const c of chunks) expect(text(c).includes('home-panel.js'), c).toBe(false);
});

test('the bundle parses as an ES module', () => {
  expect(() => execFileSync(process.execPath, ['--check', BUNDLE], {stdio: 'pipe'})).not.toThrow();
});

test('the bundle carries the package version once and no placeholder', () => {
  const js = readFileSync(BUNDLE, 'utf8');
  // The version as a string of its own is the VERSION constant of src/legacy/globals.js, so it is there exactly once:
  // twice would mean that module, and the hass it holds, is bundled twice.
  const literal = new RegExp('[`"\']' + version.replaceAll('.', '\\.') + '[`"\']', 'g');
  expect(js.match(literal) ?? [], `the version ${version} as a string`).toHaveLength(1);
  for (const m of ['__CONFIG__', '__STACK__', '__FR__', '__AUTO__', '__CSS__', '__VERSION__'])
    expect(js.includes(m), m).toBe(false);
});

test('the source map names the original files under src/', () => {
  const map = JSON.parse(readFileSync(join(DIST, 'home-panel.js.map'), 'utf8'));
  for (const f of ['src/config.js', 'src/home-panel.js', 'src/i18n/fr.js', 'src/auto.js'])
    expect(
      map.sources.some(s => s.endsWith(f)),
      f,
    ).toBe(true);
  // relative paths into src/ only: nothing from node_modules, no absolute path of the machine that built it
  expect(
    map.sources.every(s => s.startsWith('../src/')),
    map.sources.join(', '),
  ).toBe(true);
  // with their text: Home Assistant serves the panel's folder, not src/, so DevTools reads the code from the map
  expect(map.sourcesContent.every(c => typeof c === 'string' && c.length > 0)).toBe(true);
  expect(readFileSync(BUNDLE, 'utf8')).toMatch(/\n\/\/# sourceMappingURL=home-panel\.js\.map\s*$/);
});

test('no personal data: names, places, a house photo or house-specific entity ids', () => {
  // every text file under src/ and test/ is scanned (this one holds the patterns, so it is left out), so a new file
  // needs no edit here
  const files = [...walk('src'), ...walk('test', ['__screenshots__'])].filter(
    f => /\.(js|mjs|ts|css|html|json)$/.test(f) && f !== 'test/unit/dist.test.mjs',
  );
  for (const f of ['src/config.js', 'src/home-panel.js', 'src/auto.js', 'src/i18n/fr.js', 'src/css/base.css'])
    expect(files.includes(f), `scans ${f}`).toBe(true);
  for (const f of ['houses.ts', 'fixtures.ts', 'harness.html', 'automations.json'])
    expect(files.includes('test/e2e/' + f), `scans ${f}`).toBe(true);
  expect(
    files.some(f => f.endsWith('.spec.ts')),
    'scans the specs',
  ).toBe(true);
  // the source map ships in the release zip too, with the source text inside it
  const text = [...files.map(read), readFileSync(BUNDLE, 'utf8'), readFileSync(`${BUNDLE}.map`, 'utf8')].join('\n');
  const banned = [
    /pierre/i,
    /genevi[eè]ve/i,
    /\bmilan\b/i,
    /delisle/i,
    /mascouche/i,
    /montr[eé]al/i,
    /data:image\/(webp|png|jpe?g)/i,
    /\b10\.0\.\d+\.\d+\b/,
    /\b192\.168\.\d+\.\d+\b/,
    /meter00|calypso|pulsar_plus|ac_uty_|hydro_quebec_maison|thermostat_chambre/i,
  ];
  for (const re of banned) {
    const m = text.match(re);
    expect(m, `found ${re}: …${m && text.slice(Math.max(0, m.index - 40), m.index + 40)}…`).toBe(null);
  }
});
