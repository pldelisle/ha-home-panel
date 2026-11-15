// The live power flow: the grid, the water heater, the EV and each room's heating, with `rest` as what is left, in kW.
// Pattern: an adapter below the features (ADR 0025): the energy card, Climate, the header and the live pill read this one rule
// of "what is the rest of the home"; its rules are those of the legacy `live()` and `roomName()`, deleted in #241.
// Must not: word anything a person reads, read the registry (the config's keys are the discovery), or read the clock.
import type {ResolvedConfig, RoomSpec} from '../core/config.ts';
import type {HassEntities} from '../core/hass.ts';
import type {Names} from '../core/i18n/names.ts';
import {isAvailable, kilowattsOf, numberAttributeOf, numberOf, textAttributeOf} from '../core/states.ts';

/** A room whose own power sensor reads over 50 W is heating even when its thermostat says otherwise (the legacy `live()`, deleted in #241). */
const HEATING_KW = 0.05;

export interface RoomPower {
  key: string;
  /** The room's name through the resolver; in French, the thermostat's own name without "Thermostat ". */
  name: string;
  climate: string;
  /** The room's power sensor in kW; null when it has none or reports no number. */
  power: number | null;
  /** The thermostat's `current_temperature`, else the room's temperature sensor; null when neither reads. */
  temperature: number | null;
  /** The thermostat's `temperature` attribute; null when it is unavailable or has none. */
  setpoint: number | null;
  /** The thermostat says `heating`, or the room's power is over 50 W. */
  heating: boolean;
  /** False when the thermostat is missing, `unavailable` or `unknown`. */
  available: boolean;
}

export interface PowerNow {
  /** kW; null when the grid sensor is unset or reports no number. */
  grid: number | null;
  waterHeater: number | null;
  ev: number | null;
  rooms: RoomPower[];
  /** The sum of the rooms' power. */
  heat: number;
  /** What is left of the grid once the water heater, the EV and the heating are taken off, never below zero; null without a grid reading. */
  rest: number | null;
  /** The heat pump or air conditioner; null when the config has none or its entity is missing. */
  heatPump: {available: boolean; on: boolean} | null;
}

/** The room's name in English: the config's, else "<Name>'s bedroom" for a "Chambre de <Name>" thermostat, else the thermostat's name. */
function englishName(states: HassEntities, room: RoomSpec): string {
  if (room.n) return room.n;
  const friendly = textAttributeOf(states, room.climate, 'friendly_name') ?? '';
  const bedroom = friendly.match(/Chambre de (.+)$/i);
  return bedroom ? `${bedroom[1]}'s bedroom` : friendly.replace(/^Thermostat\s*/i, '') || room.k;
}

/**
 * One room's reading. In French the name is the thermostat's own ("Thermostat Salle de Séjour" is "Salle de Séjour"), which
 * the resolver then reads; the rule needs the language, so the caller says it (`isFrench`, as the store does).
 */
export function roomPower(states: HassEntities, room: RoomSpec, names: Names, isFrench: boolean): RoomPower {
  const available = isAvailable(states[room.climate]);
  const power = kilowattsOf(states, room.power);
  const own = isFrench
    ? (textAttributeOf(states, room.climate, 'friendly_name') ?? '').replace(/^Thermostat\s*/i, '')
    : '';
  const reading = available ? numberAttributeOf(states, room.climate, 'current_temperature') : null;
  return {
    key: room.k,
    name: names.name(own || englishName(states, room)),
    climate: room.climate,
    power,
    temperature: reading ?? numberOf(states, room.temp),
    setpoint: available ? numberAttributeOf(states, room.climate, 'temperature') : null,
    heating: (available && states[room.climate].attributes.hvac_action === 'heating') || (power ?? 0) > HEATING_KW,
    available,
  };
}

/** The live flow, read once for every reader: the grid, the loads, each room, the heat pump. */
export function powerNow(states: HassEntities, config: ResolvedConfig, names: Names, isFrench: boolean): PowerNow {
  const {entities} = config;
  const grid = kilowattsOf(states, entities.grid);
  const waterHeater = kilowattsOf(states, entities.whP);
  const ev = kilowattsOf(states, entities.evP);
  const rooms = config.rooms.map(room => roomPower(states, room, names, isFrench));
  const heat = rooms.reduce((total, room) => total + (room.power ?? 0), 0);
  const pump = entities.hp ? states[entities.hp] : undefined;
  return {
    grid,
    waterHeater,
    ev,
    rooms,
    heat,
    rest: grid === null ? null : Math.max(0, grid - (waterHeater ?? 0) - (ev ?? 0) - heat),
    heatPump: pump
      ? {
          available: isAvailable(pump),
          on: isAvailable(pump) && ['heating', 'cooling'].includes(String(pump.attributes.hvac_action)),
        }
      : null,
  };
}
