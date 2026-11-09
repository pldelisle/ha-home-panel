// The store's cost on a house-sized hass: 5,000 entities, one state changes, 50 subscribers of 10 ids each.
// Run with `npm run bench` (not in CI: timings on a shared runner are noise); the numbers go into ADR 0012.
import {test} from 'vitest';
import {createStore} from '../../src/core/store.ts';
import {entity, fakeHass} from '../unit/fake-hass.ts';

const COUNT = 5000;
const states = Object.fromEntries(
  Array.from({length: COUNT}, (_, i) => [`sensor.s${i}`, entity(`sensor.s${i}`, String(i))]),
);

// two hass objects that differ by one state object: handing them over in turn is one change each time, and the
// 5,000-entry copy that `next` makes stays out of the timing
const a = fakeHass({states});
const b = a.next({'sensor.s0': {state: 'changed'}});

function storeWith(subscribers: number) {
  const store = createStore({defaultTimeZone: 'UTC', resolve: () => ({})});
  store.setHass(a);
  // subscriber n reads ten consecutive ids; subscriber 0 reads the one that changes
  for (let n = 0; n < subscribers; n++) {
    store.subscribe(
      Array.from({length: 10}, (_, k) => `sensor.s${n * 10 + k}`),
      () => {},
    );
  }
  let flip = false;
  return () => {
    flip = !flip;
    store.setHass(flip ? b : a);
  };
}

test('setHass, 5,000 entities, one changed state', async ({bench}) => {
  await bench('50 subscribers of 10 ids', storeWith(50)).run();
  await bench('no subscribers (the change-detection walk alone)', storeWith(0)).run();
});
