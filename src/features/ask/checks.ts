// What the sensor catalog says against the `ask` block: it was cut at its cap, and the config card tells the admin how many sensors were left out.
// Pattern: a check as a pure function returning values, the shape of the config card's problems (ConfigProblem, src/core/config.ts), so the card
// words them in the panel's language. The checks that need only the states (the entity or an excluded id is not in the house) are the core's
// `checkHouse`; this one needs the catalog, so the sheet slice (#538) wires it into the card.
// Must not: throw, word a problem (the messages do), or read anything but the catalog it is given.
import type {ConfigProblem} from '../../core/config.ts';
import {ASK_CATALOG_CAP, type Catalog} from './catalog.ts';

/** The problems of a catalog against its cap: one when sensors were left out, else none. */
export function askChecks(catalog: Pick<Catalog, 'omitted'>): ConfigProblem[] {
  return catalog.omitted > 0
    ? [{path: 'ask', key: 'config.askOverCap', values: {path: 'ask', cap: ASK_CATALOG_CAP, omitted: catalog.omitted}}]
    : [];
}
