// Supply-chain rules for .github/workflows (docs/specs/05): every action is pinned to a commit with its version in a
// comment, and every workflow declares its permissions at the top level. Checked on the file text, as there is no YAML parser here.
import {test, expect} from 'vitest';
import {readdirSync, readFileSync} from 'node:fs';

const dir = new URL('../../.github/workflows/', import.meta.url);
const files = readdirSync(dir).filter(f => /\.ya?ml$/.test(f));
const read = f => readFileSync(new URL(f, dir), 'utf8');

// every `uses:` value, as [workflow, value-with-comment]; comment-only lines and local actions (./) are not actions to pin
const usesOf = f =>
  read(f)
    .split('\n')
    .map(line => line.match(/^\s*(?:-\s+)?uses:\s*(.*?)\s*$/))
    .filter(Boolean)
    .map(m => m[1])
    .filter(v => !v.startsWith('./'));

test('there are workflows to check', () => {
  expect(files).toContain('ci.yml');
  expect(files).toContain('codeql.yml');
});

test('every action is pinned to a 40-character commit with a version comment', () => {
  let total = 0;
  for (const f of files) {
    for (const value of usesOf(f)) {
      total++;
      expect(value, `${f}: ${value}`).toMatch(/^[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40} # v\d+\.\d+\.\d+$/);
    }
  }
  expect(total).toBeGreaterThan(0);
});

test('every workflow declares permissions at the top level', () => {
  for (const f of files) {
    expect(read(f), f).toMatch(/^permissions:\n(?: {2}[\w-]+: (?:read|write|none)(?: #.*)?\n)+/m);
  }
});

test('the CodeQL init and analyze steps are the same release', () => {
  const [init, analyze] = ['init', 'analyze'].map(step => {
    const m = read('codeql.yml').match(new RegExp(`github/codeql-action/${step}@([0-9a-f]{40}) # (v\\S+)`));
    expect(m, `codeql-action/${step} step`).not.toBeNull();
    return m.slice(1);
  });
  expect(analyze).toEqual(init);
});
