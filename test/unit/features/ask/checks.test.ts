// askChecks: what the catalog says against the `ask` block: sensors were left out at the cap. The checks that need only the house's states
// (the entity, an excluded id) are config-check.test.ts's, beside the core's `checkHouse`.
import {describe, expect, test} from 'vitest';
import {createMessages} from '../../../../src/core/i18n/messages.ts';
import {askChecks, askNotes} from '../../../../src/features/ask/checks.ts';

describe('askChecks', () => {
  test('a catalog under the cap has nothing to say', () => {
    expect(askChecks({omitted: 0})).toEqual([]);
  });

  test('a catalog the cap cut says how many sensors it left out and what the cap is', () => {
    expect(askChecks({omitted: 13})).toEqual([
      {path: 'ask', key: 'config.askOverCap', values: {path: 'ask', cap: 60, omitted: 13}},
    ]);
  });

  test('the problem fills its message, in both languages, with the plural', () => {
    const [problem] = askChecks({omitted: 13});
    const en = createMessages({language: 'en', tag: 'en'});
    expect(en.t(problem.key, problem.values)).toBe(
      'ask: the catalog is limited to 60 sensors, and 13 sensors were left out. Exclude some under ask.exclude.',
    );
    const [one] = askChecks({omitted: 1});
    expect(en.t(one.key, one.values)).toContain('1 sensor was left out');
    expect(createMessages({language: 'fr', tag: 'fr'}).t(problem.key, problem.values)).toContain('13 capteurs');
  });
});

describe('askNotes', () => {
  const en = createMessages({language: 'en', tag: 'en'});
  const fr = createMessages({language: 'fr', tag: 'fr'});

  test('an admin reads one worded line when the cap left sensors out, in the panel language', () => {
    expect(askNotes({omitted: 13}, true, en.t)).toEqual([
      'ask: the catalog is limited to 60 sensors, and 13 sensors were left out. Exclude some under ask.exclude.',
    ]);
    expect(askNotes({omitted: 1}, true, fr.t)[0]).toContain('1 capteur a été laissé de côté');
  });

  test('a household member reads nothing, whatever the cap did', () => {
    expect(askNotes({omitted: 13}, false, en.t)).toEqual([]);
  });

  test('an admin reads nothing about a catalog under the cap', () => {
    expect(askNotes({omitted: 0}, true, en.t)).toEqual([]);
  });
});
