// scripts/sync-version.mjs: the ?v= snippets, the lockfile version and the changelog tidy-up after `changeset version`
import {test, expect, beforeEach, afterEach} from 'vitest';
import {execFileSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cleanChangelog, syncLockfile, syncSnippet, syncVersion} from '../../scripts/sync-version.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const real = file => readFileSync(join(repo, file), 'utf8');

// a scratch project root per test
let dir;
const put = (file, text) => writeFileSync(join(dir, file), text);
const read = file => readFileSync(join(dir, file), 'utf8');
const readJson = file => JSON.parse(read(file));
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sync-version-'));
  mkdirSync(join(dir, 'examples'));
});
afterEach(() => rmSync(dir, {recursive: true, force: true}));

test('syncSnippet rewrites every home-panel.js?v= to the new version, prerelease suffixes included', () => {
  expect(syncSnippet('a /local/home-panel/home-panel.js?v=2.7.0 b\nc home-panel.js?v=10.0.12-beta.1 d', '2.12.0')).toBe(
    'a /local/home-panel/home-panel.js?v=2.12.0 b\nc home-panel.js?v=2.12.0 d',
  );
  expect(syncSnippet('home-panel.js?v=latest stays', '2.12.0')).toBe('home-panel.js?v=latest stays');
});

test('syncSnippet leaves other ?v= URLs and longer numbers alone', () => {
  expect(syncSnippet('https://example.com/app.js?v=1.2.3', '2.12.0')).toBe('https://example.com/app.js?v=1.2.3');
  expect(syncSnippet('home-panel.js?v=2.7.0.1', '2.12.0')).toBe('home-panel.js?v=2.7.0.1');
});

test('syncSnippet keeps the full stop after a version, prerelease or not', () => {
  expect(syncSnippet('Use home-panel.js?v=2.7.0-beta.1.', '2.12.0')).toBe('Use home-panel.js?v=2.12.0.');
  expect(syncSnippet('Use home-panel.js?v=2.7.0.', '2.12.0')).toBe('Use home-panel.js?v=2.12.0.');
});

test('the README and the example carry a home-panel.js?v= for syncSnippet to find', () => {
  for (const file of ['README.md', 'examples/configuration.yaml']) {
    expect(syncSnippet(real(file), '99.0.0'), file).toContain('home-panel.js?v=99.0.0');
  }
});

const written = `# Changelog

## 2.12.0

### Minor Changes

- The Lights tab remembers the last room you opened.

  It also scrolls back to it after a restart.

### Patch Changes

- Rooms that are on show a small dot in the Lights tab.
- Chips in the sheet show a check mark.

## 2.11.1

- Light tiles show a chevron.
`;

test('cleanChangelog drops the sub-headings and the blank lines between bullets', () => {
  expect(cleanChangelog(written)).toBe(`# Changelog

## 2.12.0

- The Lights tab remembers the last room you opened.

  It also scrolls back to it after a restart.
- Rooms that are on show a small dot in the Lights tab.
- Chips in the sheet show a check mark.

## 2.11.1

- Light tiles show a chevron.
`);
});

test('cleanChangelog leaves the committed changelog byte for byte as it is', () => {
  expect(cleanChangelog(real('CHANGELOG.md'))).toBe(real('CHANGELOG.md'));
});

test('syncLockfile sets the root version in both places and nothing else', () => {
  const lock = {
    name: 'x',
    version: '2.11.1',
    lockfileVersion: 3,
    packages: {'': {name: 'x', version: '2.11.1'}, 'node_modules/y': {version: '2.11.1'}},
  };
  const out = JSON.parse(syncLockfile(JSON.stringify(lock), '2.12.0'));
  expect(out.version).toBe('2.12.0');
  expect(out.packages[''].version).toBe('2.12.0');
  expect(out.packages['node_modules/y'].version).toBe('2.11.1');
});

/** A project root whose package.json is already at 2.12.0, as after `changeset version`. */
function putProject() {
  put('package.json', JSON.stringify({name: 'x', version: '2.12.0'}));
  put('package-lock.json', JSON.stringify({name: 'x', version: '2.11.1', packages: {'': {version: '2.11.1'}}}));
  put('README.md', 'module_url: /local/home-panel/home-panel.js?v=2.7.0\n');
  put('examples/configuration.yaml', 'module_url: /local/home-panel/home-panel.js?v=2.12.0\n');
  put('CHANGELOG.md', written);
}

test('syncVersion rewrites the files under a root and says which changed', () => {
  putProject();

  expect(syncVersion(dir)).toStrictEqual([
    'README.md: ?v=2.12.0',
    'examples/configuration.yaml: already current',
    'package-lock.json: 2.12.0',
    'CHANGELOG.md: tidied',
  ]);
  expect(read('README.md')).toBe('module_url: /local/home-panel/home-panel.js?v=2.12.0\n');
  expect(read('CHANGELOG.md')).not.toContain('### ');
  // a second run has nothing left to do
  expect(syncVersion(dir).every(line => line.endsWith('already current'))).toBe(true);
});

test('running the script through a symlink still syncs (the main-module check follows links)', () => {
  mkdirSync(join(dir, 'scripts'));
  cpSync(join(repo, 'scripts/sync-version.mjs'), join(dir, 'scripts/sync-version.mjs'));
  symlinkSync(join(dir, 'scripts/sync-version.mjs'), join(dir, 'link.mjs'));
  putProject();

  const out = execFileSync(process.execPath, [join(dir, 'link.mjs')], {cwd: dir, encoding: 'utf8'});
  expect(out).toContain('README.md: ?v=2.12.0');
  expect(read('README.md')).toContain('home-panel.js?v=2.12.0');
});

// The real thing: what `changeset version` writes with our formatter, then our tidy-up. This is the check that
// "### Minor Changes" really comes from the CLI and that the bump, the title line and the old entries behave.
test('changeset version plus syncVersion on two changesets: 2.11.1 becomes 2.12.0 in the house shape', () => {
  mkdirSync(join(dir, '.changeset'));
  cpSync(join(repo, '.changeset/config.json'), join(dir, '.changeset/config.json'));
  cpSync(join(repo, '.changeset/changelog.cjs'), join(dir, '.changeset/changelog.cjs'));
  put('package.json', JSON.stringify({name: 'ha-home-panel', version: '2.11.1', private: true}, null, 2) + '\n');
  put(
    'package-lock.json',
    JSON.stringify({name: 'ha-home-panel', version: '2.11.1', packages: {'': {version: '2.11.1'}}}),
  );
  put('README.md', 'home-panel.js?v=2.7.0\n');
  put('examples/configuration.yaml', 'home-panel.js?v=2.7.0\n');
  put('CHANGELOG.md', '# Changelog\n\n## 2.11.1\n\n- Light tiles show a chevron.\n');
  put('.changeset/a.md', "---\n'ha-home-panel': patch\n---\n\nRooms that are on show a small dot.\n");
  put(
    '.changeset/b.md',
    "---\n'ha-home-panel': minor\n---\n\nThe Lights tab remembers the last room.\n\nIt scrolls back to it.\n",
  );

  execFileSync(process.execPath, [join(repo, 'node_modules/@changesets/cli/bin.js'), 'version'], {
    cwd: dir,
    stdio: 'pipe',
  });
  expect(read('CHANGELOG.md')).toContain('### Minor Changes');
  syncVersion(dir);

  expect(readJson('package.json').version).toBe('2.12.0');
  expect(read('README.md')).toBe('home-panel.js?v=2.12.0\n');
  expect(read('examples/configuration.yaml')).toBe('home-panel.js?v=2.12.0\n');
  expect(readJson('package-lock.json').packages[''].version).toBe('2.12.0');
  expect(read('CHANGELOG.md')).toBe(`# Changelog

## 2.12.0

- The Lights tab remembers the last room.

  It scrolls back to it.
- Rooms that are on show a small dot.

## 2.11.1

- Light tiles show a chevron.
`);
});
