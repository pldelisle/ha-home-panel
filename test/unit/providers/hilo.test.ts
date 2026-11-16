// hiloRates, hiloChallenge, hiloRewards, hiloPresent and hiloGateway: the tier the current rate is, the challenge, the rewards,
// whether the house has Hilo, and its gateway. The test house has none; literal houses give the tiers; the recorded house is read when the owner has
// one (#170).
import {describe, expect, test} from 'vitest';
import {entity, fakeHass} from '../fake-hass.ts';
import {fullHouse, houseOf, recorded, storeOf} from '../features/media/support.ts';
import {
  hiloChallenge,
  hiloGateway,
  hiloPresent,
  hiloRates,
  hiloRewards,
  type HiloTier,
} from '../../../src/providers/hilo.ts';

const CFG = {
  entities: {
    hilo_rate: 'sensor.rate',
    hilo_rate_low: 'sensor.low',
    hilo_rate_medium: 'sensor.medium',
    hilo_rate_reward: 'sensor.reward',
    hilo_challenge: 'sensor.challenge',
    hilo_rewards: 'sensor.rewards',
  },
};
type Rates = {current?: string; low?: string; medium?: string; reward?: string};
/** A house with Hilo's sensors at the states given; a rate left out is a sensor the house lacks. */
const hilo = ({current, low, medium, reward}: Rates, extra: ReturnType<typeof entity>[] = []) =>
  houseOf(
    [],
    [
      ...Object.entries({rate: current, low, medium, reward})
        .filter(([, state]) => state !== undefined)
        .map(([key, state]) => entity(`sensor.${key}`, state as string)),
      ...extra,
    ],
  );
const read = (hass: ReturnType<typeof houseOf>) => {
  const {config} = storeOf(hass, CFG);
  return {
    rates: hiloRates(hass.states, config),
    challenge: hiloChallenge(hass.states, config),
    rewards: hiloRewards(hass.states, config),
    present: hiloPresent(hass.states, config),
  };
};
const tierOf = (rates: Rates): HiloTier => read(hilo(rates)).rates.tier;

describe('the test house', () => {
  test('has no Hilo: nothing reads, the tier is unknown and the card is absent', () => {
    const {config} = storeOf(fullHouse);
    expect(hiloRates(fullHouse.states, config)).toEqual({
      current: null,
      low: null,
      medium: null,
      reward: null,
      tier: 'unknown',
    });
    expect([hiloChallenge(fullHouse.states, config), hiloRewards(fullHouse.states, config)]).toEqual([null, null]);
    expect(hiloPresent(fullHouse.states, config)).toBe(false);
  });
});

describe('the recorded house', () => {
  if (!recorded) {
    test.skip('main.json is not recorded yet (the owner records it, #170): the rules are tested on literal houses', () => {});
    return;
  }

  test('the tier agrees with the rates, and Hilo is present when the current rate is in the states', () => {
    const hass = fakeHass.fromFixture('main');
    const {config} = storeOf(hass);
    const {current, low, medium, reward, tier} = hiloRates(hass.states, config);
    expect(tier === 'unknown').toBe(current === null);
    if (tier === 'low') expect(current).toBe(low);
    if (tier === 'medium') expect(current).toBe(medium);
    if (tier === 'challenge') expect(current).toBe(reward);
    expect(hiloPresent(hass.states, config)).toBe(
      config.entities.rate !== null && hass.states[config.entities.rate] !== undefined,
    );
  });
});

describe('the tier', () => {
  const rates = {low: '0.06', medium: '0.1', reward: '0.5'};

  test.each([
    ['0.06', 'low'],
    ['0.1', 'medium'],
    ['0.5', 'challenge'],
    ['0.2', 'current'],
  ] as const)('a current rate of %s is %s', (current, tier) => {
    expect(tierOf({...rates, current})).toBe(tier);
  });

  test('the reward rate wins over the medium and the medium over the low when they are equal', () => {
    expect(tierOf({current: '0.1', low: '0.1', medium: '0.1', reward: '0.1'})).toBe('challenge');
    expect(tierOf({current: '0.1', low: '0.1', medium: '0.1'})).toBe('medium');
    expect(tierOf({current: '0.1', low: '0.1'})).toBe('low');
  });

  test('a rate the sensors do not give is the current rate, and no current rate is unknown whatever the others read', () => {
    expect(tierOf({current: '0.3'})).toBe('current');
    expect(tierOf({low: '0.06', medium: '0.1', reward: '0.5'})).toBe('unknown');
    expect(tierOf({current: 'unavailable', low: '0.06'})).toBe('unknown');
  });

  test('the rates are numbers, in dollars per kWh as the sensors give them', () => {
    expect(read(hilo({current: '0.0642', low: '0.0642', medium: '0.1', reward: '0.5'})).rates).toEqual({
      current: 0.0642,
      low: 0.0642,
      medium: 0.1,
      reward: 0.5,
      tier: 'low',
    });
  });
});

describe('the challenge, the rewards and the presence', () => {
  const sensors = (challenge: string) => [entity('sensor.challenge', challenge), entity('sensor.rewards', '42.5')];

  test('a challenge is active unless the sensor says off; one that reads nothing is none', () => {
    expect(read(hilo({}, sensors('reduction'))).challenge).toEqual({state: 'reduction', active: true, nextEvent: null});
    expect(read(hilo({}, sensors('off'))).challenge).toEqual({state: 'off', active: false, nextEvent: null});
    expect(read(hilo({}, sensors('unavailable'))).challenge).toBeNull();
    expect(read(hilo({})).challenge).toBeNull();
  });

  test('the challenge carries its next event: the phases’ times as text, the energy used and allowed as numbers', () => {
    const event = (attributes: Record<string, unknown>) =>
      read(hilo({}, [entity('sensor.challenge', 'pre_heat', {next_events: [attributes, {phases: {other: 'x'}}]})]))
        .challenge;
    expect(
      event({
        phases: {preheat_start: '2026-11-15 05:00:00', reduction_start: 7, bad: null},
        used_kWh: '1.5',
        allowed_kWh: 4,
      }),
    ).toEqual({
      state: 'pre_heat',
      active: true,
      nextEvent: {phases: {preheat_start: '2026-11-15 05:00:00'}, used: 1.5, allowed: 4},
    });
    expect(event({used_kWh: '', allowed_kWh: 'soon'})?.nextEvent).toEqual({phases: {}, used: null, allowed: null});
    expect(event({phases: null})?.nextEvent?.phases).toEqual({});
    const none = (next_events: unknown) =>
      read(hilo({}, [entity('sensor.challenge', 'off', {next_events})])).challenge?.nextEvent;
    expect([none([]), none('soon'), none(undefined)]).toEqual([null, null, null]);
  });

  test('the rewards are the sensor’s number, null when it reads none', () => {
    expect(read(hilo({}, sensors('off'))).rewards).toBe(42.5);
    expect(read(hilo({}, [entity('sensor.rewards', 'unknown')])).rewards).toBeNull();
  });

  test('Hilo is present when the current rate is in the states, even unavailable, and not for the other sensors alone', () => {
    expect(read(hilo({current: '0.06'})).present).toBe(true);
    expect(read(hilo({current: 'unavailable'})).present).toBe(true);
    expect(read(hilo({low: '0.06'}, sensors('off'))).present).toBe(false);
  });
});

describe('the gateway', () => {
  const gateway = (...states: ReturnType<typeof entity>[]) => {
    const hass = houseOf([], states);
    return hiloGateway(hass.states, storeOf(hass).config);
  };

  test('is on only when its sensor says on, and disconnected when the attribute is set', () => {
    expect(gateway(entity('sensor.hilo_gateway', 'on'))).toEqual({on: true, disconnected: false});
    expect(gateway(entity('sensor.hilo_gateway', 'on', {disconnected: true}))).toEqual({on: true, disconnected: true});
    expect(gateway(entity('sensor.hilo_gateway', 'unavailable'))).toEqual({on: false, disconnected: false});
  });

  test('is null where the house has no gateway sensor', () => {
    expect(gateway()).toBeNull();
    expect(hiloGateway(fullHouse.states, storeOf(fullHouse).config)).toBeNull();
  });
});
