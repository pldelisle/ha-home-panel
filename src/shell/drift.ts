// The idle clock's drift: where the block sits on each tick of the clock, so a wall screen never holds the same pixels for hours.
// Pattern: a pure function of a seed and a tick (a seeded PRNG, Mulberry32 by T. Ettinger, over the two mixed together), which replaced
// the legacy `renderIdle`'s `Math.random()` (#276): the same tick of the same seed is the same place, and the bounds are a unit fact.
// Must not: read the clock or `Math.random`, or touch the DOM (the idle screen writes the transform).

/** How far the block may move from where it sits: sideways, and up or down. */
export const DRIFT_X = 20;
export const DRIFT_Y = 15;

/** The offset at `tick` (0 when the clock shows, then one per tick of the clock): none at tick 0, else within ±20 and ±15 px. */
export function drift(tick: number, seed: number): {x: number; y: number} {
  if (tick === 0) return {x: 0, y: 0};
  const next = mulberry32((seed ^ Math.imul(tick, 0x9e3779b1)) >>> 0);
  return {x: Math.round(next() * 2 * DRIFT_X - DRIFT_X), y: Math.round(next() * 2 * DRIFT_Y - DRIFT_Y)};
}

// Mulberry32: a 32-bit state, a uniform number in [0, 1) per call
function mulberry32(state: number): () => number {
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 15), z | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}
