// loadApex (src/core/apex.ts): one promise per page, however many charts ask. What the library draws is the chunk's and chunks.spec.ts's.
import {expect, test} from 'vitest';
import {loadApex} from '../../../src/core/apex.ts';

test('gives every caller the same promise, so the library is fetched once', async () => {
  const first = loadApex();
  expect(loadApex()).toBe(first);
  // the library needs a document to load; a Node run only needs the promise to be settled before the test ends
  await first.catch(() => undefined);
});
