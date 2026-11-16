// readLights: the house's lights read into the tiles the Lights model takes: the areas, each with its Adaptive Lighting switch, linked and ordered.
// Pattern: a composition of readers (ADR 0025): the areas from the light-areas provider, the switch from Adaptive Lighting's, the pairs and the
// order from this feature's own rules, so the feature names no integration. The system data is what the pane read; null before it has.
// Must not: word anything a person reads, read the clock, or touch the DOM or `hass`.
import type {ResolvedConfig} from '../../core/config.ts';
import type {HassEntities, Registries} from '../../core/hass.ts';
import type {Names} from '../../core/i18n/names.ts';
import {adaptiveSwitch} from '../../providers/adaptive-lighting.ts';
import {lightAreas, type LightArea} from '../../providers/light-areas.ts';
import {applyLinks, applyOrder, linkPairs, type TileLink} from './order.ts';

/** One tile of the Lights tab: its area, its Adaptive Lighting switch (null when none runs it) and its partner. */
export interface LightTile extends LightArea {
  al: string | null;
  link: TileLink | null;
}

export interface LightsInputs {
  /** The tiles in the order they are drawn: a linked pair side by side, the saved order applied. */
  tiles: LightTile[];
  /** The linked pairs in force, as keys. */
  pairs: string[][];
}

/** The inputs of the house at these states, with the system data the pane read (`{light_order, light_links}`, or null). */
export function readLights(
  states: HassEntities,
  registries: Registries,
  names: Names,
  config: Pick<ResolvedConfig, 'splitLightAreas' | 'alAreas' | 'lightLinks'>,
  systemData: unknown,
): LightsInputs {
  const areas = lightAreas(states, registries, names, config).map(area => ({
    ...area,
    al: adaptiveSwitch(area, states, registries, config.alAreas),
  }));
  const pairs = linkPairs(systemData, config.lightLinks, states);
  const order = (systemData as {light_order?: unknown} | null | undefined)?.light_order;
  return {tiles: applyOrder(applyLinks(areas, pairs), order), pairs};
}
