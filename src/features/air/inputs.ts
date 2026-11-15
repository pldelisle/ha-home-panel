// readAir: the purifiers, the outdoor station and the AQHI of the house, read into the inputs the model takes.
// Pattern: a composition of readers (ADR 0025): the rooms and the station from the Mila provider, the AQHI from the config's
// entity, so the feature knows no integration's naming; the same inputs would come from another purifier's provider.
// Must not: rate the air (the provider does), word anything a person reads, read the clock, or touch the DOM or `hass`.
import type {ResolvedConfig} from '../../core/config.ts';
import type {HassEntities, Registries} from '../../core/hass.ts';
import type {Names} from '../../core/i18n/names.ts';
import {numberOf} from '../../core/states.ts';
import {milaAir, type AirRoomInputs, type OutsideAirInputs} from '../../providers/mila.ts';

export interface AirInputs {
  /** Every purifier, by room name. */
  rooms: AirRoomInputs[];
  /** The outdoor station; null when the house has none. */
  outside: OutsideAirInputs | null;
  /** Environment Canada's AQHI, from `config.entities.aqhi`; null when unset or unreadable. */
  aqhi: number | null;
  /** The AQHI sensor's id when the house has its state, readable or not: the outdoor chart asks the recorder for it, as the legacy sheet did. */
  aqhiId: string | null;
}

/** The inputs of the house at these states. */
export function readAir(
  states: HassEntities,
  registries: Registries,
  names: Names,
  config: Pick<ResolvedConfig, 'entities'>,
): AirInputs {
  const aqhiId = config.entities.aqhi;
  return {
    ...milaAir(states, registries, names),
    aqhi: numberOf(states, aqhiId),
    aqhiId: aqhiId && states[aqhiId] ? aqhiId : null,
  };
}
