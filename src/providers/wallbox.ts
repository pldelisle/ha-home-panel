// The Wallbox charger's readings: its power and its status, in the inputs the energy card reads.
// Pattern: an adapter below the features (ADR 0025), found by the config's keys (convention over configuration), not the
// registry; the reads are those of the legacy flow and `attention()`, deleted in #241; spec 21 adds the controls' fields.
// Must not: word the status, send a command (the Car's), or read the registry or the clock.
import type {ResolvedConfig} from '../core/config.ts';
import type {HassEntities} from '../core/hass.ts';
import {hasState, kilowattsOf, textOf} from '../core/states.ts';

export interface WallboxInputs {
  /** The charger's power in kW; null when the sensor is unset or reports no number. */
  power: number | null;
  /** The status sensor's text; null when it is unset, unavailable or unknown. */
  status: string | null;
  /** The house has a charger: its power or its status sensor is in the states, whatever it reads. */
  present: boolean;
}

export function wallbox(states: HassEntities, config: ResolvedConfig): WallboxInputs {
  const {evP, wbStatus} = config.entities;
  return {
    power: kilowattsOf(states, evP),
    status: textOf(states, wbStatus),
    present: hasState(states, evP) || hasState(states, wbStatus),
  };
}
