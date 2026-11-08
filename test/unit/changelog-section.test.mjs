// scripts/changelog-section.mjs: the release notes are the CHANGELOG.md section of the version being released
import {test, expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import {mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {changelogSection} from '../../scripts/changelog-section.mjs';

const repo = fileURLToPath(new URL('../../', import.meta.url));
const script = join(repo, 'scripts/changelog-section.mjs');
const changelog = readFileSync(join(repo, 'CHANGELOG.md'), 'utf8');

const sample = `# Changelog

## 2.1.0

- Newest line.
- Second line, with \`code\`.

  A second paragraph of the second line.

### Not a section break

- Still 2.1.0.

## 2.0.0 (unreleased)

- Oldest line.

Closing remark about the older history.
`;

test('returns the body between the heading and the next ## heading, trimmed', () => {
  expect(changelogSection(sample, '2.1.0')).toBe(
    '- Newest line.\n- Second line, with `code`.\n\n  A second paragraph of the second line.\n\n### Not a section break\n\n- Still 2.1.0.',
  );
});

test('the last section runs to the end of the file', () => {
  expect(changelogSection(sample, '2.0.0')).toBe('- Oldest line.\n\nClosing remark about the older history.');
});

test('a suffix after the version in the heading is allowed, a longer version is not the same version', () => {
  expect(changelogSection('## 2.1.0-beta.1\n\n- Beta.\n\n## 2.1.0\n\n- Final.\n', '2.1.0')).toBe('- Final.');
  expect(changelogSection('## 2.1.0-beta.1\n\n- Beta.\n', '2.1.0')).toBeNull();
  expect(changelogSection('## 2.10.0\n\n- Ten.\n', '2.1.0')).toBeNull();
  expect(changelogSection('## 2.1.0-beta.1\n\n- Beta.\n', '2.1.0-beta.1')).toBe('- Beta.');
});

test('trailing spaces after the heading are fine', () => {
  expect(changelogSection('## 2.1.0 \n\n- Text.\n', '2.1.0')).toBe('- Text.');
});

test('a missing version and an empty section give null', () => {
  expect(changelogSection(sample, '9.9.9')).toBeNull();
  expect(changelogSection('## 1.0.0\n\n\n## 0.9.0\n\n- Text.\n', '1.0.0')).toBeNull();
});

test('an empty or missing version is never a match, not even for an empty heading', () => {
  expect(changelogSection('## \n\n- Text.\n', '')).toBeNull();
  expect(changelogSection('## \n\n- Text.\n', undefined)).toBeNull();
  expect(changelogSection(sample, '')).toBeNull();
});

test('works on CRLF text, with several lines in the body', () => {
  expect(changelogSection('## 1.0.0\r\n\r\n- One.\r\n- Two.\r\n\r\n## 0.9.0\r\n\r\n- Old.\r\n', '1.0.0')).toBe(
    '- One.\n- Two.',
  );
});

test('the real CHANGELOG.md has text for the package.json version and every section stays under its heading', () => {
  const {version} = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  expect(changelogSection(changelog, version)).not.toBeNull();
  const headings = [...changelog.matchAll(/^## (\S+)/gm)].map(match => match[1]);
  expect(headings.length).toBeGreaterThan(1);
  for (const heading of headings) {
    const section = changelogSection(changelog, heading);
    expect(section, heading).not.toBeNull();
    expect(section, heading).not.toMatch(/^## /m);
  }
});

function run(...args) {
  return spawnSync(process.execPath, [script, ...args], {encoding: 'utf8'});
}

test("the command prints the package.json version's section of the real changelog and exits 0", () => {
  const {version} = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8'));
  const result = run(version);
  expect(result.status).toBe(0);
  expect(result.stdout).toBe(changelogSection(changelog, version) + '\n');
  expect(result.stdout).not.toContain('## ');
});

test('the command exits 1, with nothing on stdout, for a version without a section or without an argument', () => {
  for (const args of [['99.0.0'], []]) {
    const result = run(...args);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('No text under');
  }
});

test('the command reads the file named as the second argument', () => {
  const dir = mkdtempSync(join(tmpdir(), 'changelog-section-'));
  try {
    const file = join(dir, 'CHANGELOG.md');
    writeFileSync(file, sample);
    expect(run('2.0.0', file).stdout).toBe('- Oldest line.\n\nClosing remark about the older history.\n');
    expect(run('2.0.0', join(dir, 'missing.md')).status).not.toBe(0);
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
});
