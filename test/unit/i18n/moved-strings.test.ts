// The French of a moved string: for every English message a move introduced, the French catalog renders what the rewrite layer
// (src/i18n/fr.js) makes of the English text, so moving a feature into the catalog cannot change a French pixel. A string whose
// French would differ is a visible change and needs an approved baseline, not an edit here: a `translated` one records that change
// (the layer left the English, or got it wrong); a `written` one is French the legacy
// panel wrote itself, where the layer is no oracle, and `was` records the old output of an entry the move deleted from the map.
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
   * bare `12 months` is left as it is): the layer's output for `en + english` must be `fr + the French message`. A piece the layer
   * knows only as part of a line (`55.0 of 88.0 kWh usable · battery at 20.0°`) has what follows it, `enAfter` and `frAfter`, too.
   */
  frame?: {en: string; fr: string; enAfter?: string; frAfter?: string};
  /**
   * The French the layer made of the English text before the move deleted its entry from the map (src/i18n/fr.js), as the
   * byte comparison found it. The layer is no oracle for a deleted entry, so this text is: the catalog must say it, and the layer
   * must no longer translate the text, or the entry was not deleted and `was` is stale.
   */
  was?: string;
  /**
   * The French the catalog says where the layer is no oracle and nothing visible changes: French the legacy panel wrote itself, in
   * its own code (`isFrench ? 'Désactivé' : 'Off'`), so the text never went through the layer, which says something else of the
   * English (`Éteint`); or French the layer makes only in the sentence a piece is read in (a day's abbreviation is `Lun.` alone and
   * `lun.` in a list). The catalog must say what the pane showed. Where the layer left the English or got it wrong, use `translated`.
   */
  written?: string;
  /**
   * The French the catalog writes where the layer's is the English text as it stood, or is wrong (a tire's `low` is `min`): a visible
   * change that the pane that draws the message (#251, #252) records in its baselines. The layer is no oracle, but it must differ
   * from the catalog, or the row is `written` or a plain one. Earlier moves' fixtures wrote such rows as `written`.
   */
  translated?: string;
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

// the rail's label for the subject is the shell's (src/shell/features.ts says it), not a message the move introduced; nor is one its prefix
// gained after the move (the room view's line, #506)
const AFTER_THE_MOVE = new Set(['room.empty']);
const ofMove = (prefix: string) =>
  Object.keys(en).filter(key => key.startsWith(prefix) && key !== `${prefix}title` && !AFTER_THE_MOVE.has(key));

// a move: its fixture, the prefix of the keys it introduced, the folders that say them, and the keys outside the prefix it
// also introduced (the kit's `common.failed` came with Media's command layer; the kit says it, in src/ui/)
describe.each([
  ['weather', 'weather.', ['src/features/weather/', 'src/providers/', 'src/core/i18n/'], []],
  ['media', 'media.', ['src/features/media/', 'src/providers/'], ['common.failed']],
  ['security', 'security.', ['src/features/security/'], []],
  ['air', 'air.', ['src/features/air/', 'src/providers/'], []],
  ['energy', 'energy.', ['src/features/energy/', 'src/providers/'], ['common.noReading']],
  ['climate', 'climate.', ['src/features/climate/'], []],
  ['car', 'car.', ['src/features/car/', 'src/providers/'], []],
  ['live', 'live.', ['src/features/live/'], []],
  ['automations', 'automations.', ['src/features/automations/'], []],
  ['lights', 'lights.', ['src/features/lights/'], []],
  ['people', 'people.', ['src/features/people/'], []],
  ['stack', 'stack.', ['src/features/stack/'], []],
  ['home', 'home.', ['src/shell/'], []],
  ['chart', 'chart.', ['src/ui/'], []],
  ['ranges', 'range.', ['src/ui/'], []],
  ['settings', 'settings.', ['src/shell/'], []],
  ['rooms', 'room.', ['src/core/i18n/'], []],
])('the %s move', (move, prefix, folders, extra) => {
  const moved = read(move);

  test.each(moved.map(m => [`${m.key} ${JSON.stringify(m.values ?? {})}`, m] as const))('%s', (_name, m) => {
    const text = english.t(m.key, m.values);
    // the layer is untyped JavaScript
    if (m.written !== undefined) expect(french.t(m.key, inFrench(m))).toBe(m.written);
    else if (m.translated !== undefined) {
      expect(french.t(m.key, inFrench(m))).toBe(m.translated);
      expect(layer.text(text), 'the layer makes no French of it').not.toBe(m.translated);
    } else if (m.was !== undefined) {
      expect(layer.text(text), 'the map entry is deleted').toBe(m.after ?? text);
      expect(french.t(m.key, inFrench(m))).toBe(m.was);
    } else if (m.frame) {
      const {en, fr, enAfter = '', frAfter = ''} = m.frame;
      expect(fr + french.t(m.key, inFrench(m)) + frAfter).toBe(layer.text(en + text + enAfter) as string);
    } else expect(french.t(m.key, inFrench(m))).toBe(layer.text(text) as string);
  });

  test('lists every message the move introduced, and only messages that exist', () => {
    const introduced = [...ofMove(prefix), ...extra];
    expect([...new Set(moved.map(m => m.key))].sort()).toEqual(introduced.sort());
  });

  test('has no dead message: the feature says every one, by its key or by the prefix of a computed key', () => {
    const sourceOf = (where: string[]) =>
      where
        .map(where => new URL(`../../../${where}`, import.meta.url))
        .flatMap(folder =>
          readdirSync(folder)
            .filter(file => file.endsWith('.ts'))
            .map(file => readFileSync(new URL(file, folder), 'utf8')),
        )
        .join('\n');
    const unsaid = (keys: string[], source: string) =>
      keys.filter(key => !source.includes(`'${key}'`) && !source.includes(`\`${key.replace(/[^.]+$/, '')}$\{`));
    expect([...unsaid(ofMove(prefix), sourceOf(folders)), ...unsaid(extra, sourceOf(['src/ui/']))]).toEqual([]);
  });
});
