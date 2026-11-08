// Prints the body of one version's section of CHANGELOG.md: the lines under `## <version>` up to the next `## `.
// The release workflow (.github/workflows/release.yml) uses it for the notes of the GitHub release.
//   node scripts/changelog-section.mjs 2.11.1 [path/to/CHANGELOG.md]
// Exits 1, printing nothing to stdout, when the version has no section or the section is empty, so a release can
// never go out with blank notes.
import {readFileSync, realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

/**
 * The body of the `## <version>` section of a changelog, without the heading and without the blank lines around it.
 * The heading may carry a suffix after the version (`## 2.0.0 (unreleased)`), but `## 2.1.0-beta.1` is not `2.1.0`.
 * Returns null when there is no such section or it has no text.
 */
export function changelogSection(text, version) {
  if (!version) return null;
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex(line => {
    if (!line.startsWith('## ')) return false;
    const heading = line.slice(3);
    return heading === version || heading.startsWith(version + ' ');
  });
  if (start === -1) return null;
  const length = lines.slice(start + 1).findIndex(line => line.startsWith('## '));
  const body = lines
    .slice(start + 1, length === -1 ? undefined : start + 1 + length)
    .join('\n')
    .trim();
  return body === '' ? null : body;
}

// run directly (also through a symlink), not when a test imports it
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [version, file = fileURLToPath(new URL('../CHANGELOG.md', import.meta.url))] = process.argv.slice(2);
  const section = changelogSection(readFileSync(file, 'utf8'), version);
  if (section === null) {
    console.error(`No text under "## ${version ?? '<version>'}" in ${file}`);
    process.exit(1);
  }
  console.log(section);
}
