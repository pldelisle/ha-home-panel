// The layers of docs/specs/09-architecture-foundations.md are enforced by `npm run lint` (dependency-cruiser). One thing
// needs a test of its own: docs/architecture/dependency-graph.md is drawn from the imports, so a change to the imports that
// does not redraw it turns the pull request red, the way licenses.test.mjs guards LICENSES.md. The legacy set's two tests
// (nothing imports it; it imports only the core and the providers) went with the set's last module (#277).
import {test, expect, beforeAll} from 'vitest';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {renderGraph} from '../../scripts/arch-graph.mjs';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

let graph;
beforeAll(() => {
  graph = renderGraph();
}, 60_000);

test('docs/architecture/dependency-graph.md is exactly what npm run arch:graph writes', () => {
  const committed = readFileSync(`${ROOT}docs/architecture/dependency-graph.md`, 'utf8');
  expect(committed === graph, 'the graph is out of date: run npm run arch:graph and commit it').toBe(true);
});
