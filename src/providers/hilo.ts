// Hilo's rate, its tier, the challenge and the rewards, read into inputs: the words a person reads are the model's.
// Pattern: an adapter below the features (ADR 0025): the Hilo card, the energy card, the phone tiles and the live pill read
// one tier rule; the rules are those of the legacy `rateInfo()` and `lacking().hilo`, deleted in #241.
// Must not: word the tier (`Low tier` is a key in the model), read the registry (the config's keys are the discovery), or read the clock.
import type {ResolvedConfig} from '../core/config.ts';
import type {HassEntities} from '../core/hass.ts';
import {hasState, numberOf, textOf} from '../core/states.ts';

/** `challenge` is the reward rate; `current` is a rate that is none of the three Hilo publishes; `unknown`, no current rate. */
export type HiloTier = 'low' | 'medium' | 'challenge' | 'current' | 'unknown';

export interface HiloRates {
  /** The rates in dollars per kWh; null when a sensor is unset or reports no number. */
  current: number | null;
  low: number | null;
  medium: number | null;
  reward: number | null;
  tier: HiloTier;
}

/** The current rate against the reward rate first, then the medium, then the low: when two are equal, the first named wins. */
export function hiloRates(states: HassEntities, config: ResolvedConfig): HiloRates {
  const {rate, rateLow, rateMed, rateReward} = config.entities;
  const current = numberOf(states, rate);
  const low = numberOf(states, rateLow);
  const medium = numberOf(states, rateMed);
  const reward = numberOf(states, rateReward);
  const tier: HiloTier =
    current === null
      ? 'unknown'
      : current === reward
        ? 'challenge'
        : current === medium
          ? 'medium'
          : current === low
            ? 'low'
            : 'current';
  return {current, low, medium, reward, tier};
}

/** The challenge sensor's state (`off`, `pre_heat`, `reduction`, `recovery`, …) and whether one is scheduled (anything but `off`); null when it reads nothing. */
export function hiloChallenge(states: HassEntities, config: ResolvedConfig): {state: string; active: boolean} | null {
  const state = textOf(states, config.entities.defi);
  return state === null ? null : {state, active: state !== 'off'};
}

/** The rewards Hilo has paid, as the sensor reads them; null when it reads no number. */
export function hiloRewards(states: HassEntities, config: ResolvedConfig): number | null {
  return numberOf(states, config.entities.rewards);
}

/** The house has Hilo: its current-rate sensor is in the states, whatever it reads (the legacy `lacking().hilo` is the opposite). */
export function hiloPresent(states: HassEntities, config: ResolvedConfig): boolean {
  return hasState(states, config.entities.rate);
}
