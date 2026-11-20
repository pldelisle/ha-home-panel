// readLights: the house's lights read into what the Lights model takes: the tiles (each area with its Adaptive Lighting switch, mode and state,
// linked and ordered), the saved order and the house's Adaptive Lighting.
// Pattern: a composition of readers (ADR 0025): the areas from the light-areas provider, the switch from Adaptive Lighting's, the pairs and the
// order from this feature's own rules, so the feature names no integration. The system data is what the pane read; null before it has.
// Must not: word anything a person reads, read the clock, or touch the DOM or `hass`.
import type {ResolvedConfig} from '../../core/config.ts';
import type {HassEntities, Registries} from '../../core/hass.ts';
import type {Names} from '../../core/i18n/names.ts';
import {attributeOf, isAvailable} from '../../core/states.ts';
import {adaptiveSwitch, alMode, type AlMode} from '../../providers/adaptive-lighting.ts';
import {lightAreas, type LightArea} from '../../providers/light-areas.ts';
import {applyLinks, applyOrder, linkPairs, type TileLink} from './order.ts';
import {areaState, tintOf, type AreaState} from './state.ts';

/** A switch the sheet draws, or one of its bulbs: whether it is on and whether it has a state that means something. */
export interface SwitchReading {
  id: string;
  on: boolean;
  available: boolean;
}

/** One tile of the Lights tab: its area, its Adaptive Lighting switch (null when none runs it), its partner, and what its lights are doing. */
export interface LightTile extends LightArea {
  al: string | null;
  link: TileLink | null;
  state: AreaState;
  mode: AlMode;
  /**
   * The Adaptive Lighting switches as the sheet's Auto brightness, Auto colour and Night rows read them: the brightness and colour twins (the
   * main switch where the house has no twin) and the sleep-mode twin; null where the tile has none.
   */
  brightness: SwitchReading | null;
  colour: SwitchReading | null;
  night: SwitchReading | null;
  /** Its buttons as the sheet's chips read them, in `units`' order. */
  bulbs: SwitchReading[];
  /** The colour of a pair's lit lights, both tiles' (`tintOf`), on the pair's first tile; `''` on any other. */
  pairTint: string;
}

/** The house's Adaptive Lighting as the strip and the pane's sub-line read it; null when no tile has a switch. */
export interface AdaptiveReading {
  /** The tiles' switches, each once, and how many are on. */
  switches: number;
  on: number;
  /** The first lit switch's `color_temp_kelvin`, null when none reports one. */
  liveK: number | null;
  /** Each switch's `configuration` attribute, for the curve. */
  configurations: unknown[];
}

export interface LightsInputs {
  /** The tiles in the order they are drawn: a linked pair side by side, the saved order applied. */
  tiles: LightTile[];
  /** The linked pairs in force, as keys. */
  pairs: string[][];
  /** The saved order, as keys; empty when there is none. */
  order: string[];
  adaptive: AdaptiveReading | null;
}

const reading = (states: HassEntities, id: string): SwitchReading => ({
  id,
  on: states[id]?.state === 'on',
  available: isAvailable(states[id]),
});

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
  const saved = (systemData as {light_order?: unknown} | null | undefined)?.light_order;
  const arranged = applyOrder(applyLinks(areas, pairs), saved);
  const lit = (ids: string[]) => ids.filter(id => states[id]?.state === 'on');
  const tiles = arranged.map(tile => {
    const mode = alMode(tile, tile.al, states);
    const partner = tile.link?.first ? arranged.find(o => o.key === tile.link!.other) : undefined;
    return {
      ...tile,
      state: areaState(tile, states),
      mode,
      brightness: tile.al ? reading(states, mode.brightnessSwitch ?? tile.al) : null,
      colour: tile.al ? reading(states, mode.colourSwitch ?? tile.al) : null,
      night: mode.nightSwitch ? reading(states, mode.nightSwitch) : null,
      bulbs: tile.units.map(id => reading(states, id)),
      pairTint: partner ? tintOf(lit([...tile.ids, ...partner.ids]), states) : '',
    };
  });
  const switches = [...new Set(tiles.map(t => t.al).filter((id): id is string => !!id))];
  const switchesOn = switches.filter(id => states[id].state === 'on');
  const live = switchesOn.map(id => attributeOf(states, id, 'color_temp_kelvin')).find(v => v != null);
  return {
    tiles,
    pairs,
    order: Array.isArray(saved) ? saved.map(String) : [],
    adaptive: switches.length
      ? {
          switches: switches.length,
          on: switchesOn.length,
          liveK: live == null ? null : Number(live),
          configurations: switches.map(id => attributeOf(states, id, 'configuration')),
        }
      : null,
  };
}
