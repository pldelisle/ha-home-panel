// scripts/sync-version.mjs: the ?v= snippets, the lockfile version and the changelog tidy-up after `changeset version`
import {test, expect, beforeEach, afterEach} from 'vitest';
import {execFileSync} from 'node:child_process';
import {cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cleanChangelog, syncLockfile, syncSnippet, syncVersion} from '../../scripts/sync-version.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const real = file => readFileSync(join(repo, file), 'utf8');

let dir;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'sync-version-'));
});
afterEach(() => rmSync(dir, {recursive: true, force: true}));

test('syncSnippet rewrites every ?v= to the new version, prerelease suffixes included', () => {
  expect(syncSnippet('a /home-panel.js?v=2.7.0 b\nc ?v=10.0.12-beta.1 d', '2.12.0')).toBe(
    'a /home-panel.js?v=2.12.0 b\nc ?v=2.12.0 d',
  );
  expect(syncSnippet('no version here, ?v=latest stays', '2.12.0')).toBe('no version here, ?v=latest stays');
});

test('the README and the example carry a ?v= for syncSnippet to find', () => {
  expect(real('README.md')).toMatch(/\?v=\d+\.\d+\.\d+/);
  expect(real('examples/configuration.yaml')).toMatch(/\?v=\d+\.\d+\.\d+/);
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

test('syncVersion rewrites the files under a root and says which changed', () => {
  mkdirSync(join(dir, 'examples'));
  const put = (file, text) => writeFileSync(join(dir, file), text);
  put('package.json', JSON.stringify({name: 'x', version: '2.12.0'}));
  put('package-lock.json', JSON.stringify({name: 'x', version: '2.11.1', packages: {'': {version: '2.11.1'}}}));
  put('README.md', 'module_url: /local/home-panel/home-panel.js?v=2.7.0\n');
  put('examples/configuration.yaml', 'module_url: /local/home-panel/home-panel.js?v=2.12.0\n');
  put('CHANGELOG.md', written);

  expect(syncVersion(dir)).toEqual([
    'README.md: ?v=2.12.0',
    'examples/configuration.yaml: already current',
    'package-lock.json: 2.12.0',
    'CHANGELOG.md: tidied',
  ]);
  expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe('module_url: /local/home-panel/home-panel.js?v=2.12.0\n');
  expect(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')).not.toContain('### ');
  // a second run has nothing left to do
  expect(syncVersion(dir).every(line => line.endsWith('already current'))).toBe(true);
});

// The real thing: what `changeset version` writes with our formatter, then our tidy-up. This is the check that
// "### Minor Changes" really comes from the CLI and that the bump, the title line and the old entries behave.
test('changeset version plus syncVersion on two changesets: 2.11.1 becomes 2.12.0 in the house shape', () => {
  mkdirSync(join(dir, 'examples'));
  mkdirSync(join(dir, '.changeset'));
  cpSync(join(repo, '.changeset/config.json'), join(dir, '.changeset/config.json'));
  cpSync(join(repo, '.changeset/changelog.cjs'), join(dir, '.changeset/changelog.cjs'));
  const oldChangelog = '# Changelog\n\n## 2.11.1\n\n- Light tiles show a chevron.\n';
  const put = (file, text) => writeFileSync(join(dir, file), text);
  put('package.json', JSON.stringify({name: 'ha-home-panel', version: '2.11.1', private: true}, null, 2) + '\n');
  put(
    'package-lock.json',
    JSON.stringify({name: 'ha-home-panel', version: '2.11.1', packages: {'': {version: '2.11.1'}}}),
  );
  put('README.md', 'js?v=2.7.0\n');
  put('examples/configuration.yaml', 'js?v=2.7.0\n');
  put('CHANGELOG.md', oldChangelog);
  put('.changeset/a.md', "---\n'ha-home-panel': patch\n---\n\nRooms that are on show a small dot.\n");
  put(
    '.changeset/b.md',
    "---\n'ha-home-panel': minor\n---\n\nThe Lights tab remembers the last room.\n\nIt scrolls back to it.\n",
  );

  execFileSync(process.execPath, [join(repo, 'node_modules/@changesets/cli/bin.js'), 'version'], {
    cwd: dir,
    stdio: 'pipe',
  });
  expect(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')).toContain('### Minor Changes');
  syncVersion(dir);

  expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).version).toBe('2.12.0');
  expect(readFileSync(join(dir, 'README.md'), 'utf8')).toBe('js?v=2.12.0\n');
  expect(readFileSync(join(dir, 'examples/configuration.yaml'), 'utf8')).toBe('js?v=2.12.0\n');
  expect(JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8')).packages[''].version).toBe('2.12.0');
  expect(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8')).toBe(`# Changelog

## 2.12.0

- The Lights tab remembers the last room.

  It scrolls back to it.
- Rooms that are on show a small dot.

## 2.11.1

- Light tiles show a chevron.
`);
});
