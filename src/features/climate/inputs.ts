// readClimate: the rooms, the heat pump and the outside temperature of the house, read into the inputs the model takes.
// Pattern: a composition of readers (ADR 0025): the rooms from `powerNow`, the unit from the heat-pump provider, the outside from the
// weather entity's attribute else the outside sensor (the legacy panel's rule), so the feature knows no integration's naming.
// Must not: word anything a person reads, read the clock, or touch the DOM or `hass`.
import type {ResolvedConfig} from '../../core/config.ts';
import type {HassEntities, Registries} from '../../core/hass.ts';
import type {RoomIcon} from '../../core/room-icons.ts';
import {numberAttributeOf, numberOf} from '../../core/states.ts';
import {heatPump, type HeatPumpInputs} from '../../providers/heat-pump.ts';
import {powerNow, type RoomPower} from '../../providers/power.ts';

/** A room's reading with the glyph the config gives it. */
export interface ClimateRoom extends RoomPower {
  icon: RoomIcon;
}

export interface ClimateInputs {
  rooms: ClimateRoom[];
  /** Null when the config has no heat pump. */
  heatPump: HeatPumpInputs | null;
  /** The weather entity's temperature, else the outside sensor's; null when neither reads. */
  outside: number | null;
  /** The rooms' power in kW. */
  heat: number;
  /** The heat pump is heating or cooling now. */
  heatPumpOn: boolean;
}

/** The inputs of the house at these states. */
export function readClimate(
  states: HassEntities,
  registries: Registries,
  config: Pick<ResolvedConfig, 'entities' | 'rooms'>,
): ClimateInputs {
  const flow = powerNow(states, config);
  const {entities} = config;
  return {
    rooms: flow.rooms.map((room, i) => ({...room, icon: config.rooms[i].icon})),
    heatPump: heatPump(states, registries, config),
    outside: numberAttributeOf(states, entities.weather, 'temperature') ?? numberOf(states, entities.outT),
    heat: flow.heat,
    heatPumpOn: flow.heatPump?.on ?? false,
  };
}
