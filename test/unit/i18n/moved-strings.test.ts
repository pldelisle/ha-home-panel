// The French of a moved string: for every English message a move introduced, the French catalog renders what the rewrite layer
// (src/i18n/fr.js) makes of the English text, so moving a feature into the catalog cannot change a French pixel. A string
// whose French would differ is a visible change and needs an approved baseline, not an edit here.
// The list of messages is a fixture the move writes (test/unit/fixtures/moved/<move>.json); this file and the fixtures are
// deleted with the layer in phase 4.
import {readFileSync} from 'node:fs';
import {describe, expect, test} from 'vitest';
import {en} from '../../../src/core/i18n/en.ts';
import {createMessages, type MessageValues} from '../../../src/core/i18n/messages.ts';
import {createFrench} from '../../../src/i18n/fr.js';
import {fakeHass} from '../fake-hass.ts';

interface Moved {
  key: keyof typeof en;
  /** The sample values the English message is rendered with. */
  values?: MessageValues;
  /** The values the French message takes where the language writes them differently (a time: `1:30 pm`, `13 h 30`). */
  fr?: MessageValues;
}

const english = createMessages({language: 'en', tag: 'en-CA'});
const french = createMessages({language: 'fr', tag: 'fr-CA'});
const layer = createFrench({hass: fakeHass({locale: {language: 'fr'}}), isFrench: true, names: {name: key => key}});

/** A sample as French writes it: the decimal point of an English number is a comma, unless the fixture says otherwise. */
const inFrench = (moved: Moved): MessageValues => ({
  ...Object.fromEntries(
    Object.entries(moved.values ?? {}).map(([name, value]) => [
      name,
      typeof value === 'string' ? value.replace(/(\d)\.(\d)/g, '$1,$2') : value,
    ]),
  ),
  ...moved.fr,
});

const read = (move: string) =>
  (JSON.parse(readFileSync(new URL(`../fixtures/moved/${move}.json`, import.meta.url), 'utf8')) as {messages: Moved[]})
    .messages;

describe.each([['weather', 'weather.']])('the %s move', (move, prefix) => {
  const moved = read(move);

  test.each(moved.map(m => [`${m.key} ${JSON.stringify(m.values ?? {})}`, m] as const))('%s', (_name, m) => {
    const text = english.t(m.key, m.values);
    // the layer is untyped JavaScript
    expect(french.t(m.key, inFrench(m))).toBe(layer.text(text) as string);
  });

  test('lists every message the move introduced, and only messages that exist', () => {
    const introduced = Object.keys(en).filter(key => key.startsWith(prefix));
    expect([...new Set(moved.map(m => m.key))].sort()).toEqual(introduced.sort());
  });
});
