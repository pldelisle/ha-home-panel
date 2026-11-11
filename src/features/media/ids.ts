// mediaIds: the entity ids the Media pane and the Home cards read, so the store tells them only when one of them changes.
// Pattern: the union of what the rules read (the television and its wake button, the speakers, the scenes, the modes), with no
// id twice, after the store's per-element subscription (ADR 0012); it takes the store's public members and nothing else.
// Must not: read a state's value or the clock, import a feature or the shell, or name an entity id (the house and the config do).
import type {PanelStore} from '../../core/store.ts';
import {findTv} from '../../providers/tv-source.ts';
import {speakers} from './speakers.ts';

/** The ids of the television, its wake button, every speaker, every visible scene and every mode the house has. */
export function mediaIds({hass, names, t, config}: Pick<PanelStore, 'hass' | 'names' | 't' | 'config'>): string[] {
  if (!hass) return [];
  const {states} = hass;
  const registries = {entities: hass.entities, devices: hass.devices, areas: hass.areas};
  const tv = findTv(states, registries, {names, t});
  const scenes = Object.keys(states).filter(id => id.startsWith('scene.') && !hass.entities?.[id]?.hidden);
  const modes = config.modes.filter(id => states[id] !== undefined);
  const ids = [
    tv?.id,
    tv?.wakeButton,
    ...speakers(states, registries, names, tv?.id ?? null).map(speaker => speaker.id),
    ...scenes,
    ...modes,
  ];
  return [...new Set(ids.filter((id): id is string => !!id))];
}
