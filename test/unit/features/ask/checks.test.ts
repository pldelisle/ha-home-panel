// askChecks: what the catalog says against the `ask` block: sensors were left out at the cap. The checks that need only the house's states
// (the entity, an excluded id) are config-check.test.ts's, beside the core's `checkHouse`.
import {describe, expect, test} from 'vitest';
import {createMessages} from '../../../../src/core/i18n/messages.ts';
import {askChecks} from '../../../../src/features/ask/checks.ts';

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
