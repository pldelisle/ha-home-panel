// The French of a moved string: for every English message a move introduced, the French catalog renders what the rewrite layer
// (src/i18n/fr.js) makes of the English text, so moving a feature into the catalog cannot change a French pixel. A string
// whose French would differ is a visible change and needs an approved baseline, not an edit here. A move that also deleted
// the map's entry records the layer's old output as `was`, since the layer can no longer say it.
// The list of messages is a fixture the move writes (test/unit/fixtures/moved/<move>.json); this file and the fixtures are
// deleted with the layer in phase 4.
import {readdirSync, readFileSync} from 'node:fs';
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
  /**
   * The sentence the message is read in, when the layer translates it only there (`Range, 12 months` is `Écart, 12 mois`, the
   * bare `12 months` is left as it is): the layer's output for `en + english` must be `fr + the French message`.
   */
  frame?: {en: string; fr: string};
  /**
   * The French the layer made of the English text before the move deleted its entry from the map (src/i18n/fr.js), as the
   * byte comparison found it. The layer is no oracle for a deleted entry, so this text is: the catalog must say it, and the layer
   * must no longer translate the text, or the entry was not deleted and `was` is stale.
   */
  was?: string;
  /**
   * What the layer makes of the English text now that its entry is gone, when that is not the text itself (a pattern of the layer,
   * `(.+) air` → `Air : …`, still reads it). Nothing shows it: the text is no longer drawn by the guest.
   */
  after?: string;
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

// the rail's label for the subject is the shell's (src/shell/features.ts says it), not a message the move introduced
const ofMove = (prefix: string) => Object.keys(en).filter(key => key.startsWith(prefix) && key !== `${prefix}title`);

// a move: its fixture, the prefix of the keys it introduced and the folder that says them
describe.each([
  ['weather', 'weather.', ['src/features/weather/', 'src/providers/']],
  ['ranges', 'range.', ['src/ui/']],
  ['settings', 'settings.', ['src/shell/']],
])('the %s move', (move, prefix, folders) => {
  const moved = read(move);

  test.each(moved.map(m => [`${m.key} ${JSON.stringify(m.values ?? {})}`, m] as const))('%s', (_name, m) => {
    const text = english.t(m.key, m.values);
    // the layer is untyped JavaScript
    if (m.was !== undefined) {
      expect(layer.text(text), 'the map entry is deleted').toBe(m.after ?? text);
      expect(french.t(m.key, inFrench(m))).toBe(m.was);
    } else if (m.frame) expect(m.frame.fr + french.t(m.key, inFrench(m))).toBe(layer.text(m.frame.en + text) as string);
    else expect(french.t(m.key, inFrench(m))).toBe(layer.text(text) as string);
  });

  test('lists every message the move introduced, and only messages that exist', () => {
    const introduced = ofMove(prefix);
    expect([...new Set(moved.map(m => m.key))].sort()).toEqual(introduced.sort());
  });

  test('has no dead message: the feature says every one, by its key or by the prefix of a computed key', () => {
    const source = folders
      .map(where => new URL(`../../../${where}`, import.meta.url))
      .flatMap(folder =>
        readdirSync(folder)
          .filter(file => file.endsWith('.ts'))
          .map(file => readFileSync(new URL(file, folder), 'utf8')),
      )
      .join('\n');
    const dead = ofMove(prefix).filter(
      key => !source.includes(`'${key}'`) && !source.includes(`\`${key.replace(/[^.]+$/, '')}$\{`),
    );
    expect(dead).toEqual([]);
  });
});
