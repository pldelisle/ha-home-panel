// The arithmetic of a stepper's tap: the value a step from `value` asks for, kept between `min` and `max`.
// Pattern: a pure function beside its element (ADR 0005: the element is a humble object, what it computes is tested in Node).
// The step's own decimals are kept, as the legacy panel's `Math.round(level * 100) / 100` did for a volume of 0.05, so a float
// error (0.35 - 0.05) never reaches the owner. Must not: read an element, a clock or the store.

/** The next value after a tap: `value` plus `delta`, rounded to the decimals of `delta` and kept in `min` to `max`. */
export function stepBy(value: number, delta: number, min: number, max: number): number {
  const decimals = (String(Math.abs(delta)).split('.')[1] ?? '').length;
  const scale = 10 ** decimals;
  return Math.min(max, Math.max(min, Math.round((value + delta) * scale) / scale));
}
