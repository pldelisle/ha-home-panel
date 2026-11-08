// Runs after `changeset version` (the "version-packages" script in package.json). Changesets bumps package.json and
// writes CHANGELOG.md; this script does the rest, working from the new package.json version:
//   - `home-panel.js?v=<semver>` in README.md and examples/configuration.yaml, so the install snippet names the
//     version to download
//   - the root version in package-lock.json, which Changesets leaves behind
//   - CHANGELOG.md: drops the "### Minor Changes" sub-headings and the blank lines between bullets, so the new entry
//     has the shape of the older ones, `## x.y.z` then `- ` bullets. .changeset/changelog.cjs writes the bullets in
//     that shape; the two files agree on it.
import {readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

// semver with an optional prerelease (2.12.0, 2.12.0-beta.1), only on the panel's own module URL. The lookahead leaves
// a longer number alone (?v=2.7.0.1) while a sentence's full stop after the version is not part of it.
const VERSION_QUERY = /(home-panel\.js\?v=)\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?![0-9A-Za-z-]|\.\d)/g;

/** Rewrites every `home-panel.js?v=<semver>` in the text to the given version. */
export function syncSnippet(text, version) {
  return text.replace(VERSION_QUERY, `$1${version}`);
}

/**
 * Turns what `changeset version` writes into the house shape: drops the `### (Major|Minor|Patch) Changes` headings
 * and the blank lines that separated the groups, so every `- ` bullet sits directly under the one before it. A blank
 * line stays after a `## x.y.z` heading, and inside a bullet that has more than one paragraph.
 * Text that already has this shape is returned unchanged, which keeps the older entries untouched.
 */
export function cleanChangelog(text) {
  const lines = text.split('\n').filter(line => !/^### (Major|Minor|Patch) Changes$/.test(line));
  const out = [];
  lines.forEach((line, i) => {
    if (line === '') {
      if (out.at(-1) === '') return; // one blank line is enough
      const previous = out.at(-1);
      const next = lines.slice(i + 1).find(line => line !== '');
      // a blank line between a bullet (or its indented paragraphs) and the next bullet goes; any other stays
      if (next?.startsWith('- ') && (previous?.startsWith('- ') || previous?.startsWith('  '))) return;
    }
    out.push(line);
  });
  return out.join('\n');
}

/** Sets the root version in the text of a package-lock.json. */
export function syncLockfile(text, version) {
  const lock = JSON.parse(text);
  lock.version = version;
  if (lock.packages?.['']) lock.packages[''].version = version;
  return JSON.stringify(lock, null, 2) + '\n';
}

function rewrite(root, file, fn) {
  const path = join(root, file);
  const before = readFileSync(path, 'utf8');
  const after = fn(before);
  if (after !== before) writeFileSync(path, after);
  return after !== before;
}

/** Applies all of the above to the files under root; returns one report line per file. */
export function syncVersion(root) {
  const {version} = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const report = (file, changed, what) => `${file}: ${changed ? what : 'already current'}`;
  return [
    ...['README.md', 'examples/configuration.yaml'].map(file =>
      report(
        file,
        rewrite(root, file, t => syncSnippet(t, version)),
        `?v=${version}`,
      ),
    ),
    report(
      'package-lock.json',
      rewrite(root, 'package-lock.json', t => syncLockfile(t, version)),
      version,
    ),
    report('CHANGELOG.md', rewrite(root, 'CHANGELOG.md', cleanChangelog), 'tidied'),
  ];
}

// run directly (also through a symlink), not when a test imports it
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  console.log(syncVersion(fileURLToPath(new URL('../', import.meta.url))).join('\n'));
}
