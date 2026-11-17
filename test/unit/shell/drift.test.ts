// The idle clock's drift (src/shell/drift.ts): no move when the clock shows, then within ±20 and ±15 px on every tick, the same
// place for the same tick and seed, and a move on almost every tick (the burn-in protection idle.spec.ts check 40 sees in the browser).
import {expect, test} from 'vitest';
import {DRIFT_X, DRIFT_Y, drift} from '../../../src/shell/drift.ts';

test('tick 0 is where the block sits, for every seed', () => {
  for (const seed of [0, 1, 2 ** 31, 2 ** 32 - 1]) expect(drift(0, seed)).toEqual({x: 0, y: 0});
});

test('ten thousand ticks stay within the bounds, reach both ends, and move on almost every tick', () => {
  const seed = 123_456_789;
  let moves = 0,
    prev = drift(0, seed);
  const xs = new Set<number>(),
    ys = new Set<number>();
  for (let tick = 1; tick <= 10_000; tick++) {
    const p = drift(tick, seed);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(DRIFT_X);
    expect(Math.abs(p.y)).toBeLessThanOrEqual(DRIFT_Y);
    xs.add(p.x);
    ys.add(p.y);
    if (p.x !== prev.x || p.y !== prev.y) moves++;
    prev = p;
  }
  expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([-20, 20, -15, 15]);
  expect(moves).toBeGreaterThan(9_950);
});

test('the same tick of the same seed is the same place; another seed is another path', () => {
  const path = (seed: number) => Array.from({length: 20}, (_, i) => drift(i + 1, seed));
  expect(path(7)).toEqual(path(7));
  expect(path(7)).not.toEqual(path(8));
});
