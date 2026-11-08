// .changeset/changelog.cjs: one `- ` bullet per changeset, in the voice of CHANGELOG.md
import {test, expect} from 'vitest';
import {createRequire} from 'node:module';

const {getReleaseLine, getDependencyReleaseLine} = createRequire(import.meta.url)('../../.changeset/changelog.cjs');

test('a one-line changeset becomes one bullet, with no link, hash or sub-heading', async () => {
  const line = await getReleaseLine(
    {summary: 'Rooms that are on show a small dot in the Lights tab.\n', id: 'a1b2c3'},
    'patch',
  );
  expect(line).toBe('- Rooms that are on show a small dot in the Lights tab.');
});

test('a changeset with several paragraphs stays one bullet, indented under it', async () => {
  const line = await getReleaseLine(
    {summary: 'The Lights tab remembers the last room you opened.\n\nIt also scrolls back to it after a restart.\n  '},
    'minor',
  );
  expect(line).toBe(
    '- The Lights tab remembers the last room you opened.\n\n  It also scrolls back to it after a restart.',
  );
});

test('two sample changesets give the two exact bullets', async () => {
  const lines = await Promise.all([
    getReleaseLine({summary: 'Linked rooms are two ordinary tiles again.'}, 'patch'),
    getReleaseLine({summary: 'Light tiles show a chevron.\nA ring shows under a mouse.'}, 'minor'),
  ]);
  expect(lines).toEqual([
    '- Linked rooms are two ordinary tiles again.',
    '- Light tiles show a chevron.\n  A ring shows under a mouse.',
  ]);
});

test('dependency updates add nothing to the changelog', async () => {
  expect(await getDependencyReleaseLine()).toBe('');
});
