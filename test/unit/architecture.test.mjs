// The layers of docs/specs/09-architecture-foundations.md are enforced by `npm run lint` (dependency-cruiser). Two
// things need a test of their own. The legacy set must stay a dead end: no module outside it may import it, or the
// strangler could never finish. And docs/architecture/dependency-graph.md is drawn from the imports, so a change to the
// imports that does not redraw it turns the pull request red, the way licenses.test.mjs guards LICENSES.md.
import {test, expect, beforeAll} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {cruise, renderGraph} from '../../scripts/arch-graph.mjs';
import legacy from '../../scripts/legacy-set.cjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const {isLegacy} = legacy;

let modules;
beforeAll(() => {
  modules = cruise().modules;
}, 60_000);

// the entry, src/main.js, composes the app and is the one module outside the set that may import it
test('no module outside the legacy set, but the entry, imports a legacy module', () => {
  const offenders = modules
    .filter(({source}) => source.startsWith('src/') && source !== 'src/main.js' && !isLegacy(source))
    .flatMap(({source, dependencies}) =>
      dependencies.filter(({resolved}) => isLegacy(resolved)).map(({resolved}) => `${source} → ${resolved}`),
    );
  expect(offenders).toEqual([]);
});

test('docs/architecture/dependency-graph.md is exactly what npm run arch:graph writes', () => {
  const committed = readFileSync(`${ROOT}docs/architecture/dependency-graph.md`, 'utf8');
  expect(committed === renderGraph(), 'the graph is out of date: run npm run arch:graph and commit it').toBe(true);
});
