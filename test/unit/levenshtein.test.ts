// editDistance(): insert, delete, substitute and swap each cost one step.
import {expect, test} from 'vitest';
import {editDistance} from '../../src/core/levenshtein.ts';

test('the same word is 0 steps, an empty word is its length', () => {
  expect(editDistance('people', 'people')).toBe(0);
  expect(editDistance('', 'rooms')).toBe(5);
  expect(editDistance('rooms', '')).toBe(5);
});

test('an extra letter, a missing letter and a wrong letter are one step each', () => {
  expect(editDistance('peoples', 'people')).toBe(1);
  expect(editDistance('climat', 'climate')).toBe(1);
  expect(editDistance('grid_powr', 'grid_power')).toBe(1);
  expect(editDistance('mode', 'node')).toBe(1);
  expect(editDistance('sceans', 'scenes')).toBe(2);
});

test('two neighbours swapped are one step, and a far word is far', () => {
  expect(editDistance('climtae', 'climate')).toBe(1);
  expect(editDistance('frobnicate', 'people')).toBeGreaterThan(2);
});
