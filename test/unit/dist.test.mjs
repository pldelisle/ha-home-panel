// The build output: dist/ has the shape the install instructions and the release zip assume, and nothing from one
// particular house is inside (the bundle, its source map, and the source files and tests they come from).
// dist/ is the result of `npm run build` (CI and the release workflow run it first); when it is missing or older than
// a file it is built from, this test runs the build itself, so `npm test` works on a fresh checkout and never checks a
// stale bundle.
import {test, expect, beforeAll} from 'vitest';
import {readFileSync, readdirSync, existsSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

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
    ...['package.json', 'package-lock.json', 'vite.config.ts', ...walk('src'), ...walk('vendor')].map(
      f => statSync(join(ROOT, f)).mtimeMs,
    ),
  );

beforeAll(() => {
  if (existsSync(BUNDLE) && statSync(BUNDLE).mtimeMs >= newestInput()) return;
  execFileSync('npm', ['run', 'build'], {cwd: ROOT, stdio: 'pipe'});
}, 120_000);

const VENDORED = ['apexcharts.css', 'apexcharts.min.js', 'leaflet.css', 'leaflet.js'];

// every file under dist/, as paths relative to it ('chunks/x.js'), sorted
const distFiles = () =>
  walk('dist')
    .map(f => f.slice('dist/'.length))
    .sort();
// the lazy chunks the entry loads with import(): chunks/<name>-<hash>.js, with their source maps
const chunks = () => distFiles().filter(f => /^chunks\/.+\.js$/.test(f));
const text = f => readFileSync(join(DIST, f), 'utf8');

test('dist/ holds the bundle, its source map, the lazy chunks and the vendored libraries, and nothing else', () => {
  const names = distFiles();
  const rest = names.filter(f => !chunks().some(c => f === c || f === c + '.map'));
  expect(rest).toStrictEqual([...VENDORED, 'home-panel.js', 'home-panel.js.map'].sort());
  for (const c of chunks()) {
    expect(c).toMatch(/^chunks\/[\w.-]+-[\w-]{8}\.js$/); // [name]-[hash].js
    // a chunk names its map at its end, and the map is there; Rolldown writes none for a chunk with no code from a
    // source file (one that only re-exports another, or its own runtime helpers)
    const named = text(c)
      .trimEnd()
      .endsWith(`//# sourceMappingURL=${c.slice('chunks/'.length)}.map`);
    expect(names.includes(c + '.map'), `${c} and its map`).toBe(named);
  }
});

test('the vendored libraries are copied as they are', () => {
  for (const f of VENDORED)
    expect(readFileSync(join(DIST, f)).equals(readFileSync(join(ROOT, 'vendor', f))), f).toBe(true);
});

test('Mermaid is a lazy chunk with its map, not in the entry, which fetches no chunk as it loads', () => {
  // `mermaidAPI`, a property of Mermaid's default export that minifying keeps, is in its core only
  const mermaid = chunks().filter(c => text(c).includes('mermaidAPI'));
  expect(mermaid, 'chunks holding Mermaid').toHaveLength(1);
  // a stack trace from a flow chart points at Mermaid's sources
  expect(distFiles()).toContain(mermaid[0] + '.map');
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
  for (const c of chunks()) expect(text(c).includes('home-panel.js'), c).toBe(false);
});

test('the bundle parses as an ES module', () => {
  expect(() => execFileSync(process.execPath, ['--check', BUNDLE], {stdio: 'pipe'})).not.toThrow();
});

test('the bundle carries the package version once and no placeholder', () => {
  const js = readFileSync(BUNDLE, 'utf8');
  // The version as a string of its own is the VERSION constant of src/legacy/globals.js, so it is there exactly once:
  // twice would mean that module, and the hass it holds, is bundled twice. The minifier may also fold the version into
  // a longer string where it is used (apexcharts.min.js?v=…); those copies are not counted.
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
