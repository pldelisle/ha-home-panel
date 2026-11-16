// Hilo's rate, its tier, the challenge and the rewards, read into inputs: the words a person reads are the model's.
// Pattern: an adapter below the features (ADR 0025): the Hilo card, the energy card, the phone tiles and the live pill read
// one tier rule; the rules are those of the legacy `rateInfo()` and `lacking().hilo`, deleted in #241.
// `hiloChallenge`, `hiloRewards` and `hiloPresent` are exported as spec 19 names them: the challenge for the header's peak chip
// and the live pill (specs 22, 24), the rewards and the presence for the Hilo card (#237), and `hiloGateway` for the Status checks (#254).
// Must not: word the tier (`Low tier` is a key in the model), read the registry (the config's keys are the discovery), or read the clock.
import type {ResolvedConfig} from '../core/config.ts';
import type {HassEntities} from '../core/hass.ts';
import {attributeOf, hasState, numberOf, textOf} from '../core/states.ts';

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

/** The next event the challenge sensor lists: the times of its phases (`preheat_start`, `reduction_end`, …, as the sensor writes them) and the energy used and allowed, in kWh. */
export interface ChallengeEvent {
  phases: Record<string, string>;
  used: number | null;
  allowed: number | null;
}

export interface HiloChallenge {
  state: string;
  active: boolean;
  /** The first of the sensor's `next_events`; null when it lists none. */
  nextEvent: ChallengeEvent | null;
}

const numberLike = (value: unknown): number | null => {
  const n = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '') ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** The challenge sensor's state (`off`, `pre_heat`, `reduction`, `recovery`, …), whether one is scheduled (anything but `off`) and its next event; null when it reads nothing. */
export function hiloChallenge(states: HassEntities, config: ResolvedConfig): HiloChallenge | null {
  const state = textOf(states, config.entities.defi);
  if (state === null) return null;
  const events = attributeOf(states, config.entities.defi, 'next_events');
  const first = Array.isArray(events) ? (events[0] as Record<string, unknown> | null | undefined) : undefined;
  const phases: Record<string, string> = {};
  if (first && typeof first.phases === 'object' && first.phases)
    for (const [name, time] of Object.entries(first.phases)) if (typeof time === 'string') phases[name] = time;
  return {
    state,
    active: state !== 'off',
    nextEvent: first
      ? {
          phases,
          used: numberLike(first.used_kWh),
          allowed: numberLike(first.allowed_kWh),
        }
      : null,
  };
}

/** The rewards Hilo has paid, as the sensor reads them; null when it reads no number. */
export function hiloRewards(states: HassEntities, config: ResolvedConfig): number | null {
  return numberOf(states, config.entities.rewards);
}

/** The house has Hilo: its current-rate sensor is in the states, whatever it reads (the legacy `lacking().hilo` is the opposite). */
export function hiloPresent(states: HassEntities, config: ResolvedConfig): boolean {
  return hasState(states, config.entities.rate);
}

/** Hilo's gateway as the Status checks read it: on when its sensor says `on` (so `unavailable` is not), disconnected when its `disconnected` attribute is set. */
export interface HiloGateway {
  on: boolean;
  disconnected: boolean;
}

/** The gateway sensor, whatever its state; null when it is not in the states (the house has no Hilo, and no gateway check). */
export function hiloGateway(states: HassEntities, config: ResolvedConfig): HiloGateway | null {
  const id = config.entities.gateway;
  const gateway = id ? states[id] : undefined;
  if (!gateway) return null;
  return {on: gateway.state === 'on', disconnected: !!gateway.attributes.disconnected};
}
