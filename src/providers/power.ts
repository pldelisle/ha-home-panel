// The live power flow: the grid, the water heater, the EV and each room's heating, with `rest` as what is left, in kW.
// Pattern: an adapter below the features (ADR 0025): the energy card, Climate, the header and the live pill read this one rule
// of "what is the rest of the home"; its rules are those of the legacy `live()`, deleted in #241; a room's name is the
// inputs of `roomName` (src/core/i18n), worded where the language is known. `roomPower` is exported as spec 19 names it
// in this module's contract: one room's reading for a reader that does not need the whole flow (Climate, spec 20).
// Must not: word anything a person reads, read the registry (the config's keys are the discovery), or read the clock.
import type {ResolvedConfig, RoomSpec} from '../core/config.ts';
import type {HassEntities} from '../core/hass.ts';
import type {RoomNameInputs} from '../core/i18n/room-name.ts';
import type {RoomIcon} from '../core/room-icons.ts';
import {isAvailable, kilowattsOf, numberAttributeOf, numberOf, textAttributeOf} from '../core/states.ts';

/**
 * Hilo's frost guard, the lowest setpoint a thermostat takes and the default `minTemp` of one that does not say its own range;
 * a setpoint at or below `OFF_AT_OR_BELOW` is the thermostat off (the legacy wrote `sp > 5.5` for "holding"), the one line the
 * climate list, dial and gauge read. Both are the legacy panel's values, which the Climate move's last ticket (#248) deleted.
 */
export const FROST_GUARD = 5;
export const OFF_AT_OR_BELOW = 5.5;
/** A thermostat that does not say its own range goes up to 30. */
export const DEFAULT_MAX_TEMP = 30;
/** A room whose own power sensor reads over 50 W is heating even when its thermostat says otherwise (the legacy `live()`, deleted in #241). */
const HEATING_KW = 0.05;

export interface RoomPower extends RoomNameInputs {
  climate: string;
  /** The glyph's name the config gives the room: data a reader keys a drawing by, not a word. */
  icon: RoomIcon;
  /** The room's power sensor in kW; null when it has none or reports no number. */
  power: number | null;
  /** The thermostat's `current_temperature`, else the room's temperature sensor; null when neither reads. */
  temperature: number | null;
  /** The thermostat's `temperature` attribute; null when it is unavailable or has none. */
  setpoint: number | null;
  /** The thermostat's `min_temp`, else 5; the lowest setpoint its dial and stepper go to. */
  minTemp: number;
  /** The thermostat's `max_temp`, else 30. */
  maxTemp: number;
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

/** One room's reading; its name is left to `roomName`, which needs the language. */
export function roomPower(states: HassEntities, room: RoomSpec): RoomPower {
  const available = isAvailable(states[room.climate]);
  const power = kilowattsOf(states, room.power);
  const reading = available ? numberAttributeOf(states, room.climate, 'current_temperature') : null;
  return {
    key: room.k,
    configuredName: room.n,
    thermostatName: textAttributeOf(states, room.climate, 'friendly_name') ?? '',
    climate: room.climate,
    icon: room.icon,
    power,
    temperature: reading ?? numberOf(states, room.temp),
    setpoint: available ? numberAttributeOf(states, room.climate, 'temperature') : null,
    minTemp: (available ? numberAttributeOf(states, room.climate, 'min_temp') : null) ?? FROST_GUARD,
    maxTemp: (available ? numberAttributeOf(states, room.climate, 'max_temp') : null) ?? DEFAULT_MAX_TEMP,
    heating:
      (available && textAttributeOf(states, room.climate, 'hvac_action') === 'heating') || (power ?? 0) > HEATING_KW,
    available,
  };
}

/** The live flow, read once for every reader: the grid, the loads, each room, the heat pump. */
export function powerNow(states: HassEntities, config: Pick<ResolvedConfig, 'entities' | 'rooms'>): PowerNow {
  const {entities} = config;
  const grid = kilowattsOf(states, entities.grid);
  const waterHeater = kilowattsOf(states, entities.whP);
  const ev = kilowattsOf(states, entities.evP);
  const rooms = config.rooms.map(room => roomPower(states, room));
  const heat = rooms.reduce((total, room) => total + (room.power ?? 0), 0);
  const pump = entities.hp ? states[entities.hp] : undefined;
  const pumpAvailable = isAvailable(pump);
  const pumpAction = textAttributeOf(states, entities.hp, 'hvac_action');
  return {
    grid,
    waterHeater,
    ev,
    rooms,
    heat,
    rest: grid === null ? null : Math.max(0, grid - (waterHeater ?? 0) - (ev ?? 0) - heat),
    heatPump: pump
      ? {
          available: pumpAvailable,
          on: pumpAvailable && (pumpAction === 'heating' || pumpAction === 'cooling'),
        }
      : null,
  };
}
