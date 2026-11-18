import {describe, expect, test} from 'vitest';
import {GROUP_MAX, splitGroup} from '../../../src/ui/seg-overflow.ts';

const range = (n: number) => Array.from({length: n}, (_, i) => i);

describe('splitGroup', () => {
  test('up to five options all stay in the group', () => {
    for (const n of [0, 2, 5]) expect(splitGroup(range(n))).toEqual({shown: range(n), more: []});
  });

  test('six or seven keep the first four and put the rest behind the overflow button', () => {
    expect(splitGroup(range(6))).toEqual({shown: [0, 1, 2, 3], more: [4, 5]});
    expect(splitGroup(range(7))).toEqual({shown: [0, 1, 2, 3], more: [4, 5, 6]});
  });

  test('a smaller maximum overflows sooner', () => {
    expect(splitGroup(range(4), 3)).toEqual({shown: [0, 1], more: [2, 3]});
    expect(splitGroup(range(3), 3)).toEqual({shown: [0, 1, 2], more: []});
  });

  test('the group plus its overflow button is never wider than the maximum', () => {
    for (const n of range(12)) {
      const {shown, more} = splitGroup(range(n));
      expect(shown.length + (more.length > 0 ? 1 : 0)).toBeLessThanOrEqual(GROUP_MAX);
      expect([...shown, ...more]).toEqual(range(n));
    }
  });
});
