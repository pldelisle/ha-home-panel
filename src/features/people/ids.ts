// peopleIds: the entity ids Who's home reads, so the store tells its elements only when one changes.
// Pattern: the provider's `presenceIds` over the store's public members, after the store's per-element subscription (ADR 0012).
// Must not: read a state's value or the clock, import a feature or the shell, or name an entity id (the house does).
import {registriesOf} from '../../core/registry.ts';
import type {PanelStore} from '../../core/store.ts';
import {presenceIds} from '../../providers/people.ts';

/** The configured people's person entities and their iPhones and watches. */
export function peopleIds({hass, config}: Pick<PanelStore, 'hass' | 'config'>): string[] {
  return hass ? presenceIds(hass.states, registriesOf(hass), config.people) : [];
}
