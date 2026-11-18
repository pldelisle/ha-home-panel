// climateRoomAreas, climateItemsIn, climateChip: the Climate tab's thermostats cut to one area, for a room view (ADR 0039).
// Pattern: pure functions over what the tab already reads (`readClimate`) and words (`climateItems`): a room view filters the tab's own items by the area of
// each thermostat (`areaOf`, the entity's area else its device's), so a tile is worded once, by one function, whichever screen draws it.
// Must not: read an entity or the DOM, word a string of its own (`climateItems` and the formatters do), or name the heat pump: the tab's house and heat pump
// items belong to no room.
import type {ResolvedConfig} from '../../core/config.ts';
import type {Registries} from '../../core/hass.ts';
import type {Formatters} from '../../core/i18n/format.ts';
import {areaOf} from '../../core/registry.ts';
import type {RoomPower} from '../../providers/power.ts';
import type {ClimateInputs} from './inputs.ts';
import {averageTemperature, climateItems, degreesOf, type ClimateItem, type ClimateItemsDeps} from './items.ts';

/** The areas the configured thermostats sit in, each once, in the config's order; a thermostat with no area is in no room. */
export function climateRoomAreas({rooms}: Pick<ResolvedConfig, 'rooms'>, registries: Registries): string[] {
  const areas = rooms.map(({climate}) => areaOf(climate, registries));
  return [...new Set(areas.filter(Boolean))];
}

/** The rooms of the Climate tab whose thermostat is in the area. */
export const roomsIn = (rooms: readonly RoomPower[], areaId: string, registries: Registries): RoomPower[] =>
  rooms.filter(({climate}) => areaOf(climate, registries) === areaId);

/** The tab's items for the thermostats in the area, in the tab's order: no house item and no heat pump. */
export function climateItemsIn(
  inputs: ClimateInputs,
  areaId: string,
  registries: Registries,
  deps: ClimateItemsDeps,
): ClimateItem[] {
  const keys = new Set(roomsIn(inputs.rooms, areaId, registries).map(({key}) => key));
  return climateItems(inputs, deps).filter(({id}) => keys.has(id));
}

/** The room's temperature for its header ("21.5°"): the mean of its thermostats' readings, null when none reads. */
export const climateChip = (
  inputs: ClimateInputs,
  areaId: string,
  registries: Registries,
  fmt: Formatters,
): string | null => degreesOf(fmt, averageTemperature(roomsIn(inputs.rooms, areaId, registries)));
