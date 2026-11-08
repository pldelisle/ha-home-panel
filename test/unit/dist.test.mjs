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

const VENDORED = ['apexcharts.css', 'apexcharts.min.js', 'leaflet.css', 'leaflet.js', 'mermaid.min.js'];

test('dist/ holds the bundle, its source map and the vendored libraries, and nothing else', () => {
  expect(readdirSync(DIST).sort()).toStrictEqual([...VENDORED, 'home-panel.js', 'home-panel.js.map'].sort());
});

test('the vendored libraries are copied as they are', () => {
  for (const f of VENDORED)
    expect(readFileSync(join(DIST, f)).equals(readFileSync(join(ROOT, 'vendor', f))), f).toBe(true);
});

test('the bundle parses as an ES module', () => {
  expect(() => execFileSync(process.execPath, ['--check', BUNDLE], {stdio: 'pipe'})).not.toThrow();
});

test('the bundle carries the package version once and no placeholder', () => {
  const js = readFileSync(BUNDLE, 'utf8');
  // The version as a string of its own is the VERSION constant of src/legacy/globals.js, so it is there exactly once:
  // twice would mean that module, and the hass it holds, is bundled twice. The minifier may also fold the version into
  // a longer string where it is used (mermaid.min.js?v=…); those copies are not counted.
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
