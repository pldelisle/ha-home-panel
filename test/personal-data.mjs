// The personal-data scan's one definition: the patterns that must appear in no tracked text, the files that are not scanned,
// and the functions that apply them. The dist test runs it over the repository; the fixture recorder scans what it is
// about to write with the same patterns, and the recorder's own test plants a leftover in a fixture folder to see it caught.
// Pattern: single source of truth (Hunt and Thomas, The Pragmatic Programmer, DRY): one list, imported by every reader.
// Must not: read the clock, run git anywhere but the root it is given, or be scanned itself (it holds the patterns).
import {execFileSync} from 'node:child_process';
import {existsSync, readdirSync, readFileSync} from 'node:fs';
import {join} from 'node:path';

/** What no tracked text, no bundle and no recorded fixture may contain. */
export const BANNED_PATTERNS = [
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

// the folders that hold no source text; the .git file of a git worktree is skipped by the same name
const SCAN_SKIP_DIRS = [
  'node_modules',
  'dist',
  '.git',
  'coverage',
  'test-results',
  'playwright-report',
  'graphify-out',
  '.claude',
  '__screenshots__',
];

/** The tracked files that are not scanned, and why. */
export const NOT_SCANNED = new Map([
  ['test/unit/dist.test.mjs', 'it runs the scan'],
  ['test/personal-data.mjs', 'it holds the patterns'],
  ['LICENSE', 'the copyright line names the licence holder, by design'],
  [
    'LICENSES.md',
    'third-party licence text generated from node_modules and checked by licenses.test.mjs: a package author who ' +
      'happens to be called Pierre must not fail this test',
  ],
]);

// every file under dir (relative to root), skipping the folders above
const walk = (root, dir) =>
  readdirSync(join(root, dir), {withFileTypes: true}).flatMap(e => {
    const rel = dir === '.' ? e.name : `${dir}/${e.name}`;
    if (SCAN_SKIP_DIRS.includes(e.name)) return [];
    return e.isDirectory() ? walk(root, rel) : [rel];
  });

// what `git ls-files` lists, so there is no directory list to keep by hand and a maintainer's untracked scratch folders
// are not scanned; a tree without .git (or one nested inside another repository, where git lists nothing) is walked instead
const trackedFiles = root => {
  try {
    const listed = execFileSync('git', ['ls-files', '-z'], {cwd: root, encoding: 'utf8', stdio: 'pipe'})
      .split('\0')
      .filter(Boolean);
    if (listed.length > 0) return listed;
  } catch {
    // no git, or not a repository: walk instead
  }
  return walk(root, '.');
};

/**
 * The text files of the tree at `root` that the scan reads, as paths relative to it: every tracked file except the
 * images, fonts and IDE module file (not text) and the ones in NOT_SCANNED. A new file needs no edit here, and a fixture
 * under test/unit/fixtures/ is read like any other.
 */
export function scannedFiles(root) {
  return trackedFiles(root).filter(
    f =>
      // tracked, but deleted in the working tree
      existsSync(join(root, f)) && !/\.(png|woff2|ico|jpe?g|webp|iml)$/i.test(f) && !NOT_SCANNED.has(f),
  );
}

/** The files of the tree at `root` that the scan reads, as `[path, text]` pairs. */
export const scannedTexts = root => scannedFiles(root).map(f => [f, readFileSync(join(root, f), 'utf8')]);

/** Every banned pattern found in the `[name, text]` pairs, one line each: the name, the pattern and the words around it. */
export function bannedHits(texts, patterns = BANNED_PATTERNS) {
  const hits = [];
  for (const [name, raw] of texts) {
    // the repository's own address holds the owner's handle; it is public by nature
    const text = raw.replaceAll('pldelisle/ha-home-panel', '<repo>');
    for (const re of patterns) {
      const m = text.match(re);
      if (m) hits.push(`${name}: found ${re}: …${text.slice(Math.max(0, m.index - 40), m.index + 40)}…`);
    }
  }
  return hits;
}
