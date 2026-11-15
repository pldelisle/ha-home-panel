// stepBy: the value a tap on a stepper asks for, kept between its bounds at the decimals of its step.
// The volume cases are the legacy panel's stepper (five percent, in 0 to 1 at two decimals) that Media's model tests held before
// <hp-stepper> took the arithmetic; the fan's are the second user's (steps of ten from ten to a hundred).
import {describe, expect, test} from 'vitest';
import {stepBy} from '../../../src/ui/steps.ts';

describe('a volume: steps of 0.05 in 0 to 1', () => {
  test.each([
    [0.35, 0.3, 0.4],
    [0.333, 0.28, 0.38],
    [0.98, 0.93, 1],
    [0.02, 0, 0.07],
    [1, 0.95, 1],
    [0, 0, 0.05],
    [0.004, 0, 0.05],
    [0.994, 0.94, 1],
  ])('from %s down to %s and up to %s', (from, down, up) => {
    expect(stepBy(from, -0.05, 0, 1)).toBe(down);
    expect(stepBy(from, 0.05, 0, 1)).toBe(up);
  });
});

describe('a fan speed: steps of 10 in 10 to 100', () => {
  test.each([
    [40, 30, 50],
    [10, 10, 20],
    [100, 90, 100],
    [95, 85, 100],
  ])('from %s down to %s and up to %s', (from, down, up) => {
    expect(stepBy(from, -10, 10, 100)).toBe(down);
    expect(stepBy(from, 10, 10, 100)).toBe(up);
  });
});

test('never gives a negative zero', () => {
  expect(Object.is(stepBy(0.046, -0.05, 0, 1), 0)).toBe(true);
});
