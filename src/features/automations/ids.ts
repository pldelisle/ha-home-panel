// automationIds: the entity ids the Automations pane reads, so the store tells it only when one changes: every automation, and the
// sun whose next rising and setting place the runs still to come. Pattern: the union of what the rules read (ADR 0012).
// Must not: read a state's value or the clock, import a feature or the shell, or name an entity id (the provider does).
import type {PanelStore} from '../../core/store.ts';
import {SUN_IDS} from '../../providers/automations.ts';

/** Every `automation.*` entity, `sun.sun` and the two sun sensors `sunNext` falls back on. */
export function automationIds({hass}: Pick<PanelStore, 'hass'>): string[] {
  if (!hass) return [];
  return [...Object.keys(hass.states).filter(id => id.startsWith('automation.')), ...SUN_IDS];
}
