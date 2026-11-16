// Hydro-Québec's account balance, its critical-peak flags and whether its sensors report, read into inputs.
// Pattern: an adapter below the features (ADR 0025): the header's peak chip, the upcoming list, the energy card and the live pill
// read one answer; the flags are the legacy `hqPeak` and `hqUpcoming` reads (`state === 'on'`), deleted in #241; the Status
// checks' reads (the balance's age, the peak sensor's value) are the legacy `attention()`'s, which #256 deletes.
// Must not: word anything a person reads, read the registry (the config's keys are the discovery), or read the clock.
import type {ResolvedConfig} from '../core/config.ts';
import type {HassEntities} from '../core/hass.ts';
import {hasState, isAvailable, numberOf, textOf} from '../core/states.ts';

export interface HydroQuebecInputs {
  /** The balance sensor as a number; null when it is unset, unavailable or not a number. */
  balance: number | null;
  /** A critical peak is in progress. */
  peakNow: boolean;
  /** One has been announced. */
  peakUpcoming: boolean;
  /** The balance sensor is in the states, whatever its state: an unavailable one is a Status check's warning, a missing one is none. */
  balancePresent: boolean;
  /** When the balance sensor last updated, in milliseconds; null when it has no value (unset, missing, unavailable or unknown). */
  balanceUpdated: number | null;
  /** The peak sensor has a value, so "No critical peak" can be said. */
  peakReporting: boolean;
}

/** What the three sensors say, or null when none of them is in the states (the house has no Hydro-Québec integration). */
export function hydroQuebec(states: HassEntities, config: ResolvedConfig): HydroQuebecInputs | null {
  const {hq, hqPeak, hqUpcoming} = config.entities;
  if (![hq, hqPeak, hqUpcoming].some(id => hasState(states, id))) return null;
  const balanceState = hq ? states[hq] : undefined;
  return {
    balance: numberOf(states, hq),
    peakNow: textOf(states, hqPeak) === 'on',
    peakUpcoming: textOf(states, hqUpcoming) === 'on',
    balancePresent: balanceState !== undefined,
    balanceUpdated: isAvailable(balanceState) ? Date.parse(balanceState.last_updated) : null,
    peakReporting: textOf(states, hqPeak) !== null,
  };
}
