// The ten-minute check: when the car reaches its limit or a challenge ends, the pill shows "Charged to 90%" or "Challenge done" for ten minutes.
// Pattern: a pure state transition (the reducer of Elm's architecture): the element keeps `LiveState` and hands it back with each reading;
// the rule is the legacy `liveActs()`'s `laSeen` and `laDone` (#256 deletes them), its order kept: a check is made, then cleared at once if anything runs.
// Must not: read the clock (`inputs.now` is the instant), keep module state (the state is the element's), or word anything.
import {MINUTE_MS} from '../../core/figures.ts';
import {seenOf, type Activity, type Seen} from './activities.ts';
import type {LiveInputs} from './inputs.ts';

/** A finished activity: the car charged to `soc`, or a challenge done; `at` is when, `until` when the check goes. */
export type Done = ({kind: 'charged'; soc: number} | {kind: 'challenge'}) & {at: number; until: number};

/** What the pill remembers between readings: what ran last time, and the check it shows. */
export interface LiveState {
  seen: Seen;
  done: Done | null;
}

export const INITIAL_LIVE_STATE: LiveState = {seen: {}, done: null};

/** How long a finished activity keeps its check. */
export const DONE_MS = 10 * MINUTE_MS;

/** A challenge is still running in any of these states. */
const CHALLENGE_RUNNING: readonly string[] = ['pre_heat', 'reduction', 'recovery', 'on'];

/** The state after this reading: the car that stopped at or above its limit less one, or the challenge that ended, makes a check; one runs out after ten minutes or as soon as an activity runs. */
export function nextDone(previous: LiveState, activities: readonly Activity[], inputs: LiveInputs): LiveState {
  const {now, car} = inputs;
  const challenge = inputs.hilo.challenge;
  const seen = seenOf(activities);
  const was = previous.seen;
  let done = previous.done;
  if (was.car && !seen.car && car && car.soc !== null && car.soc >= (was.car.limit || 100) - 1)
    done = {kind: 'charged', soc: Math.round(car.soc), at: now, until: now + DONE_MS};
  if (was.hilo && !seen.hilo && challenge && !CHALLENGE_RUNNING.includes(challenge.state))
    done = {kind: 'challenge', at: now, until: now + DONE_MS};
  if (done && (done.until < now || activities.length)) done = null;
  return {seen, done};
}
