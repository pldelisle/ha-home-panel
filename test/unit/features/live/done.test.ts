// The ten-minute check at fixed instants: the car that stops at its limit, the challenge that ends, the expiry at ten minutes,
// and an activity that clears it. The state is threaded by hand, as the pill element will thread it.
import {describe, expect, test} from 'vitest';
import {registriesOf} from '../../../../src/core/registry.ts';
import {carActivity, hiloActivity, type ActivityDeps} from '../../../../src/features/live/activities.ts';
import {DONE_MS, INITIAL_LIVE_STATE, nextDone, type LiveState} from '../../../../src/features/live/done.ts';
import {readLive, type LiveInputs} from '../../../../src/features/live/inputs.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import {fullHouse, NOW, storeOf} from '../media/support.ts';

const store = storeOf(fullHouse, FULL_CFG);
const deps: ActivityDeps = {t: store.t, fmt: store.fmt};
const house: LiveInputs = readLive(fullHouse.states, registriesOf(fullHouse), store.config, store.names, NOW);
const car = house.car!;
const charging = [carActivity(house, null, deps)!];
const stopped = (soc: number, now = NOW): LiveInputs => ({...house, now, car: {...car, charging: false, soc}});
const challenge = (state: string, now = NOW): LiveInputs => ({
  ...house,
  now,
  hilo: {...house.hilo, challenge: {state, active: state !== 'off', nextEvent: null}},
});

describe('nextDone', () => {
  const afterCharging: LiveState = nextDone(INITIAL_LIVE_STATE, charging, house);

  test('remembers the car’s limit while it charges, and makes no check yet', () => {
    expect(afterCharging).toEqual({seen: {car: {limit: 90}}, done: null});
  });

  test('the car gone at its limit less one is "charged", for ten minutes; below that, nothing', () => {
    expect(nextDone(afterCharging, [], stopped(89.4)).done).toEqual({
      kind: 'charged',
      soc: 89,
      at: NOW,
      until: NOW + DONE_MS,
    });
    expect(nextDone(afterCharging, [], stopped(88.9)).done).toBeNull();
    expect(nextDone(afterCharging, [], {...house, car: null}).done).toBeNull();
  });

  test('the challenge gone with the sensor off is "done"; still running in another state, nothing', () => {
    const during = nextDone(INITIAL_LIVE_STATE, [hiloActivity(challenge('recovery'), deps)!], challenge('recovery'));
    expect(during.seen).toEqual({hilo: true});
    expect(nextDone(during, [], challenge('off')).done).toEqual({kind: 'challenge', at: NOW, until: NOW + DONE_MS});
    expect(nextDone(during, [], challenge('on')).done).toBeNull();
  });

  test('the check stays ten minutes, then goes', () => {
    const done = nextDone(afterCharging, [], stopped(90));
    expect(nextDone(done, [], stopped(90, NOW + DONE_MS)).done).not.toBeNull();
    expect(nextDone(done, [], stopped(90, NOW + DONE_MS + 1)).done).toBeNull();
  });

  test('an activity clears it at once, even one that starts at the same reading', () => {
    const done = nextDone(afterCharging, [], stopped(90));
    expect(nextDone(done, charging, house).done).toBeNull();
  });
});
