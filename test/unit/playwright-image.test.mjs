// The Playwright image tag appears in package.json (four scripts) and ci.yml (two jobs); every copy must name the pinned @playwright/test version
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json'));
const tag = `v${pkg.devDependencies['@playwright/test']}-noble`;

test('every use of the Playwright image names the pinned version', () => {
  for (const [file, expected] of [
    ['package.json', 4],
    ['.github/workflows/ci.yml', 2],
  ]) {
    const tags = [...read(file).matchAll(/mcr\.microsoft\.com\/playwright:(\S+?)(?=["\s]|$)/g)].map(m => m[1]);
    assert.equal(tags.length, expected, `${file}: number of image references`);
    for (const t of tags) assert.equal(t, tag, `${file}: image tag`);
  }
});
