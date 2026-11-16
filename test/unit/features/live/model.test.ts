// liveModel's five pill cases in English and French (empty, a problem alone, an activity, a finished one, an activity with a
// problem's bubble), the long text on a phone and the short one on a tablet, and the popup's status block.
import {describe, expect, test} from 'vitest';
import {registriesOf} from '../../../../src/core/registry.ts';
import {DONE_MS, INITIAL_LIVE_STATE, type LiveState} from '../../../../src/features/live/done.ts';
import {readLive, type LiveInputs} from '../../../../src/features/live/inputs.ts';
import {liveModel, type LiveModelDeps} from '../../../../src/features/live/model.ts';
import {FULL_CFG} from '../../../e2e/houses.ts';
import {fullHouse, NOW, storeOf} from '../media/support.ts';

const depsOf = (language: 'en' | 'fr', compact = false): LiveModelDeps => {
  const store = storeOf({...fullHouse, locale: {...fullHouse.locale, language}}, FULL_CFG);
  return {
    t: store.t,
    fmt: store.fmt,
    names: store.names,
    language: store.language,
    compact,
    overlay: (_key, current) => current,
  };
};
const en = depsOf('en');
const fr = depsOf('fr');

const store = storeOf(fullHouse, FULL_CFG);
/** The test house: the car charging, nothing to check. */
const house: LiveInputs = readLive(fullHouse.states, registriesOf(fullHouse), store.config, store.names, NOW);
const idle: LiveInputs = {...house, car: {...house.car!, charging: false}};
const problem: LiveInputs = {...idle, wallbox: {...idle.wallbox, status: null}};
const crit: LiveInputs = {
  ...problem,
  heatPump: {...({} as NonNullable<LiveInputs['heatPump']>), present: true, available: false, brand: 'Fujitsu'},
};
const water: LiveInputs = {...house, waterHeater: {power: 4.5, temperature: 48, powerChangedAt: NOW}};

describe('the pill', () => {
  test('empty: nothing runs, nothing finished, nothing to check', () => {
    const model = liveModel(idle, null, INITIAL_LIVE_STATE, en);
    expect(model.pill).toBeNull();
    expect(model.activityCount).toBe(0);
    expect(model.popup.status).toEqual({
      label: 'Status',
      right: 'All clear',
      items: [],
      clear: ['Car locked', 'Doors closed'],
      empty: 'Everything is reporting normally.',
    });
    expect(liveModel(idle, null, INITIAL_LIVE_STATE, fr).popup.status).toMatchObject({
      label: 'État',
      right: 'Tout va bien',
      empty: 'Tout fonctionne normalement.',
    });
  });

  test('a problem alone: amber, red when a check is critical, with the count', () => {
    expect(liveModel(problem, null, INITIAL_LIVE_STATE, en).pill).toEqual({
      kind: 'attention',
      level: 'warn',
      text: '1 thing needs attention',
    });
    expect(liveModel(crit, null, INITIAL_LIVE_STATE, fr).pill).toEqual({
      kind: 'attention',
      level: 'crit',
      text: '2 éléments à vérifier',
    });
    expect(liveModel(crit, null, INITIAL_LIVE_STATE, en).popup.status).toMatchObject({
      right: '2 items need attention',
      empty: null,
    });
  });

  test('an activity: its ring and its short text on a tablet, the long one on a phone; the others as bubbles', () => {
    const model = liveModel(water, null, INITIAL_LIVE_STATE, en);
    expect(model.pill).toMatchObject({
      kind: 'activity',
      ring: {icon: 'car', color: 'var(--c-ev)', progress: 0.64},
      tint: false,
      text: {label: null, value: '64%', extra: 'charging'},
      aria: 'Car charging, 64 percent',
      bubbles: [{icon: 'drop', color: 'var(--c-wh)', progress: null, aria: 'Water heater heating'}],
      attention: null,
    });
    expect(model.activityCount).toBe(2);
    expect(model.popup.activities.map(card => [card.key, card.kind])).toEqual([
      ['car', 'car'],
      ['wh', 'wh'],
    ]);
    expect(liveModel(water, null, INITIAL_LIVE_STATE, depsOf('fr', true)).pill).toMatchObject({
      text: {label: 'Recharge', value: '64 %', extra: null},
      bubbles: [{aria: 'Chauffe-eau en chauffe'}],
    });
  });

  test('an activity with a problem: the problem is a bubble beside it', () => {
    const withProblem = {...house, wallbox: {...house.wallbox, status: null}};
    expect(liveModel(withProblem, null, INITIAL_LIVE_STATE, en).pill).toMatchObject({
      kind: 'activity',
      attention: {level: 'warn', text: '1 thing needs attention'},
    });
  });

  test('a finished one: the check and its time on a tablet, no time on a phone; the state comes back to be kept', () => {
    const charged: LiveState = {seen: {}, done: {kind: 'charged', soc: 90, at: NOW - 60_000, until: NOW + DONE_MS}};
    const model = liveModel(idle, null, charged, en);
    expect(model.pill).toEqual({kind: 'done', text: 'Charged to 90%', time: '1:59 pm', attention: null});
    expect(model.state.done).toEqual(charged.done);
    const done: LiveState = {seen: {}, done: {kind: 'challenge', at: NOW, until: NOW + DONE_MS}};
    expect(liveModel(problem, null, done, depsOf('fr', true)).pill).toEqual({
      kind: 'done',
      text: 'Défi terminé',
      time: null,
      attention: {level: 'warn', text: '1 élément à vérifier'},
    });
  });
});
