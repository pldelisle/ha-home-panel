// askChecks: what the house says against the `ask` block, as the config card's problems. The schema's own refusals are config-check.test.ts's;
// these three are the ones that need the house: the entity is not in it, an excluded id is not, the catalog was cut.
import {describe, expect, test} from 'vitest';
import {createMessages} from '../../../../src/core/i18n/messages.ts';
import type {Catalog} from '../../../../src/features/ask/catalog.ts';
import {askChecks} from '../../../../src/features/ask/checks.ts';

const states = {'ai_task.model': {}, 'sensor.office_temperature': {}};
const catalog = (omitted = 0): Catalog => ({entries: [], entityOf: new Map(), omitted});

describe('askChecks', () => {
  test('a house with no ask block has nothing to check', () => {
    expect(askChecks(null, states, catalog(5))).toEqual([]);
  });

  test('an entity in the house, exclusions in the house and a catalog under the cap are fine', () => {
    expect(askChecks({entity: 'ai_task.model', exclude: ['sensor.office_temperature']}, states, catalog())).toEqual([]);
  });

  test('an AI Task entity that is not in the house is named, where it is written', () => {
    expect(askChecks({entity: 'ai_task.gone', exclude: []}, states, catalog())).toEqual([
      {path: 'ask.entity', key: 'config.askMissingEntity', values: {path: 'ask.entity', entity: 'ai_task.gone'}},
    ]);
  });

  test('each excluded id the house does not have is named by its place in the list', () => {
    const problems = askChecks(
      {entity: 'ai_task.model', exclude: ['sensor.office_temperature', 'sensor.gone', 'sensor.typo']},
      states,
      catalog(),
    );
    expect(problems).toEqual([
      {
        path: 'ask.exclude[1]',
        key: 'config.askUnknownExclude',
        values: {path: 'ask.exclude[1]', entity: 'sensor.gone'},
      },
      {
        path: 'ask.exclude[2]',
        key: 'config.askUnknownExclude',
        values: {path: 'ask.exclude[2]', entity: 'sensor.typo'},
      },
    ]);
  });

  test('a catalog the cap cut says how many sensors it left out and what the cap is', () => {
    expect(askChecks({entity: 'ai_task.model', exclude: []}, states, catalog(13))).toEqual([
      {path: 'ask', key: 'config.askOverCap', values: {path: 'ask', cap: 60, omitted: 13}},
    ]);
  });

  test('every problem fills its message, in both languages', () => {
    const problems = askChecks({entity: 'ai_task.gone', exclude: ['sensor.gone']}, {}, catalog(1));
    expect(problems).toHaveLength(3);
    for (const language of ['en', 'fr']) {
      const {t} = createMessages({language, tag: language});
      for (const problem of problems) expect(t(problem.key, problem.values)).toContain('ask');
    }
    expect(
      createMessages({language: 'en', tag: 'en'}).t('config.askOverCap', {path: 'ask', cap: 60, omitted: 13}),
    ).toBe('ask: the catalog is limited to 60 sensors, and 13 sensors were left out. Exclude some under ask.exclude.');
  });
});
