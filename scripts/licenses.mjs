// Writes LICENSES.md: a table of the production dependencies with version, licence and repository, then each licence
// text. `npm run licenses` regenerates it; test/unit/licenses.test.mjs fails when it is out of date.
//
// What it reads: package-lock.json, which names every package npm installs, and for each production one the
// package.json and the licence file in its directory under node_modules. No network, no npm, no other tool: the lock
// file is the input, so the same lock file gives the same output on every machine.
//
// What it lists is the whole production tree: every package npm installs for the panel's `dependencies` (and what they
// pull in), that is every `node_modules/` entry of the lock file that is not `dev`. Vite tree-shakes part of that tree
// out of the chunks, and some packages hold only type declarations, but telling which is the build's job and would
// change with every Mermaid release; listing a package that does not ship costs a line, and leaving out one that does
// would be a licence breach, so the list errs on the long side.
//
// The output depends on the lock file and the installed packages and on nothing else: rows sorted by code point (no
// locale), line ends and trailing spaces normalised, no path, date or machine name in it. The same lock file gives the
// same file on a Mac and on Linux.
import {readdirSync, readFileSync, realpathSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

// LICENSE, LICENCE, COPYING and their variants (LICENSE.md, LICENSE-MIT, COPYING.txt); a README is not the licence text
const isLicenseFile = file => /^(licen[cs]e|copying)/i.test(file);

// the file read when a package has several: the usual names first, then the rest by code point
const PREFERRED = ['LICENSE', 'LICENSE.md', 'LICENSE.txt'];
const rank = file => (PREFERRED.includes(file) ? PREFERRED.indexOf(file) : PREFERRED.length);

// the same text on every machine: LF line ends, no trailing spaces, no blank lines around it
const clean = text =>
  text
    .replaceAll('\r\n', '\n')
    .replaceAll(/[ \t]+$/gm, '')
    .trim();

const cell = text => String(text ?? '').replaceAll('|', '\\|');

// a fence longer than any run of backticks in the text, so a licence that contains ``` cannot end its own block
const fence = text => '`'.repeat(Math.max(3, ...[...text.matchAll(/`+/g)].map(m => m[0].length + 1)));

const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// the licence as the package declares it: a string (an SPDX expression, kept as written), a {type} object, or the old
// `licenses` array of those joined with ', '; '' when it declares none
const declaredLicense = pkg => {
  const one = value => (typeof value === 'string' ? value : (value?.type ?? ''));
  const old = Array.isArray(pkg.licenses) ? pkg.licenses.map(one).filter(Boolean).join(', ') : '';
  return one(pkg.license) || old;
};

// the https URL of the repository: `git+https://…/x.git`, `git://…`, `http://…`, `github:owner/name` and `owner/name`
// all become the host's https URL without the `.git`
const repositoryUrl = pkg => {
  const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  if (!url) return '';
  const shorthand = url.match(/^(?:github:)?([\w.-]+\/[\w.-]+)$/);
  return (shorthand ? `https://github.com/${shorthand[1]}` : url)
    .replace(/^git\+/, '')
    .replace(/^(?:git|http|ssh):\/\//, 'https://')
    .replace(/\.git$/, '');
};

/**
 * The installed production packages, sorted by name then version (code points, not a locale): one row each with its
 * name, version, licence, repository and licence text. Throws when a package has no licence to read.
 * `options.root` is the directory that holds package-lock.json and node_modules (the repository by default).
 */
export async function collectLicenses(options = {}) {
  const root = options.root ?? ROOT;
  const {packages} = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));
  const rows = [];
  for (const [key, entry] of Object.entries(packages)) {
    // a key outside node_modules ("" is the project, "../x" a package above the repository) is not a dependency
    if (!key.startsWith('node_modules/') || entry.dev || entry.extraneous || entry.link) continue;
    const dir = join(root, key);
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const file = readdirSync(dir, {withFileTypes: true})
      .filter(item => item.isFile() && isLicenseFile(item.name))
      .map(item => item.name)
      .sort((a, b) => rank(a) - rank(b) || byCodePoint(a, b))[0];
    const text = file ? clean(readFileSync(join(dir, file), 'utf8')) : '';
    // no licence field: a licence file with the MIT grant is read as MIT, starred; anything else needs a person
    const licenses =
      declaredLicense(pkg) || (/Permission is hereby granted, free of charge/.test(text) ? 'MIT*' : 'UNKNOWN');
    rows.push({
      name: key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length),
      version: entry.version,
      licenses,
      repository: repositoryUrl(pkg),
      text: text || `This package ships no licence file; its package.json declares ${licenses}.`,
    });
  }
  rows.sort((a, b) => byCodePoint(a.name, b.name) || byCodePoint(a.version, b.version));
  const unknown = rows.filter(row => /UNKNOWN|UNLICENSED/.test(row.licenses));
  if (unknown.length)
    throw new Error(
      `No licence found for ${unknown.map(row => `${row.name}@${row.version}`).join(', ')}; read it and decide.`,
    );
  return rows;
}

const HEADER = [
  '# Licences',
  '',
  'Generated by `npm run licenses`; edit nothing here by hand. The libraries that ship with the panel, their versions and licences.',
  '',
  "The list is the whole production dependency tree of the panel's `dependencies` as npm installs it. The build leaves some of those packages out of the chunks " +
    '(tree shaking; some hold only type declarations), and the list does not say which: a package that might ship is listed. ' +
    'An asterisk after a licence means it was read from the licence file, not declared by the package. The panel itself is MIT, see [LICENSE](LICENSE).',
  '',
  '| Package | Version | Licence | Source |',
  '|---|---|---|---|',
];

/** The text of LICENSES.md for the rows `collectLicenses()` returns. */
export function renderLicenses(rows) {
  let markdown = HEADER.join('\n') + '\n';
  for (const row of rows)
    markdown += `| ${cell(row.name)} | ${cell(row.version)} | ${cell(row.licenses)} | ${cell(row.repository)} |\n`;
  for (const row of rows) {
    const quotes = fence(row.text);
    markdown += `\n## ${row.name} ${row.version}\n\n${quotes}\n${row.text}\n${quotes}\n`;
  }
  return markdown;
}

// run directly (also through a symlink), not when a test imports it
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  // an optional path to write to instead of LICENSES.md (to compare runs on two machines)
  const out = process.argv[2] ?? `${ROOT}LICENSES.md`;
  try {
    const rows = await collectLicenses();
    writeFileSync(out, renderLicenses(rows));
    console.log(`${out}: ${rows.length} packages`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
