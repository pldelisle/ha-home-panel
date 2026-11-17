// DragReorderController's order rules, the pure half of the kit's drag and drop: where a dragged unit lands, a key's step, and the drag's
// order applied to what the owner draws. The pointer and the keys themselves are covered end to end (lights-arrange.spec.ts, 37 and 62).
import {describe, expect, test} from 'vitest';
import {inOrder, moveBy, moveTo} from '../../../src/ui/controllers/drag-reorder.ts';

describe('the order of a drag', () => {
  test('the dragged unit takes the place of the unit under the pointer, forward and back', () => {
    expect(moveTo(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
    expect(moveTo(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });

  test('an arrow key moves a unit one place, and nothing past either end', () => {
    expect(moveBy(['a', 'b', 'c'], 'a', 1)).toEqual(['b', 'a', 'c']);
    expect(moveBy(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(moveBy(['a', 'b', 'c'], 'c', 1)).toBeNull();
    expect(moveBy(['a', 'b', 'c'], 'a', -1)).toBeNull();
  });

  test("the owner's units follow the drag's order, and one that appeared meanwhile goes last", () => {
    const units = [{key: 'a'}, {key: 'b'}, {key: 'new'}, {key: 'c'}];
    expect(inOrder(units, u => u.key, ['c', 'a', 'b']).map(u => u.key)).toEqual(['c', 'a', 'b', 'new']);
    expect(inOrder(units, u => u.key, undefined)).toEqual(units);
  });
});
