// Hydro-Québec's account balance and its critical-peak flags, read into inputs.
// Pattern: an adapter below the features (ADR 0025): the header's peak chip, the upcoming list, the energy card and the live pill
// read one answer; the flags are the legacy `hqPeak` and `hqUpcoming` reads (`state === 'on'`), deleted in #241.
// Must not: word anything a person reads, read the registry (the config's keys are the discovery), or read the clock.
import type {ResolvedConfig} from '../core/config.ts';
import type {HassEntities} from '../core/hass.ts';
import {hasState, numberOf, textOf} from '../core/states.ts';

export interface HydroQuebecInputs {
  /** The balance sensor as a number; null when it is unset, unavailable or not a number. */
  balance: number | null;
  /** A critical peak is in progress. */
  peakNow: boolean;
  /** One has been announced. */
  peakUpcoming: boolean;
}

/** What the three sensors say, or null when none of them is in the states (the house has no Hydro-Québec integration). */
export function hydroQuebec(states: HassEntities, config: ResolvedConfig): HydroQuebecInputs | null {
  const {hq, hqPeak, hqUpcoming} = config.entities;
  if (![hq, hqPeak, hqUpcoming].some(id => hasState(states, id))) return null;
  return {
    balance: numberOf(states, hq),
    peakNow: textOf(states, hqPeak) === 'on',
    peakUpcoming: textOf(states, hqUpcoming) === 'on',
  };
}
