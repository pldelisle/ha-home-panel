// What the house says against the `ask` block: the entity is not in it, an excluded id is not, the catalog was cut at its cap.
// Pattern: a check as a pure function returning values, the shape of the config card's problems (ConfigProblem, src/core/config.ts), so the card
// words them in the panel's language; the schema's own refusal (an entity outside `ai_task.`) is the core's, because it needs no house.
// Must not: throw, word a problem (the catalog does), or read anything but the ids it is given.
import type {ConfigProblem, ResolvedConfig} from '../../core/config.ts';
import {ASK_CATALOG_CAP, type Catalog} from './catalog.ts';

/** The problems of an `ask` block against a house, whose entity ids are the keys of `states`; none without the block. */
export function askChecks(
  ask: ResolvedConfig['ask'],
  states: Record<string, unknown>,
  catalog: Pick<Catalog, 'omitted'>,
): ConfigProblem[] {
  if (!ask) return [];
  const problems: ConfigProblem[] = [];
  const missing = (path: string, key: ConfigProblem['key'], entity: string) =>
    problems.push({path, key, values: {path, entity}});
  if (!Object.hasOwn(states, ask.entity)) missing('ask.entity', 'config.askMissingEntity', ask.entity);
  ask.exclude.forEach((id, i) => {
    if (!Object.hasOwn(states, id)) missing(`ask.exclude[${i}]`, 'config.askUnknownExclude', id);
  });
  if (catalog.omitted > 0)
    problems.push({
      path: 'ask',
      key: 'config.askOverCap',
      values: {path: 'ask', cap: ASK_CATALOG_CAP, omitted: catalog.omitted},
    });
  return problems;
}
