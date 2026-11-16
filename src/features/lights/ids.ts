// lightIds: the entity ids the Lights pane (#260) will read, so the store tells it only when one changes.
// Pattern: the union of what `readLights` and the tiles read (every light, the Adaptive Lighting switches and their sleep-mode twins, the
// switches of the config's linked pairs) with no id twice, after the store's per-element subscription (ADR 0012).
// Must not: read a state's value or the clock, import a feature or the shell, or name an entity id (the house does).
import type {PanelStore} from '../../core/store.ts';
import {alSwitches, sleepSwitchOf} from '../../providers/adaptive-lighting.ts';

/** The ids the Lights tab reads: a walk of the states' keys, since which lights the house has is the answer. */
export function lightIds({hass, config}: Pick<PanelStore, 'hass' | 'config'>): string[] {
  const states = hass?.states ?? {};
  const switches = alSwitches(states);
  return [
    ...new Set([
      ...Object.keys(states).filter(id => id.startsWith('light.')),
      ...switches,
      ...switches.map(sleepSwitchOf).filter(id => id in states),
      ...config.lightLinks.map(l => l.sw).filter((id): id is string => !!id),
    ]),
  ];
}
