// moveTo and tabStop: where the keys of a radio group go, and which option holds its one tab stop (the WAI-ARIA Authoring Practices' radio group).
import {describe, expect, test} from 'vitest';
import {moveTo, tabStop} from '../../../src/ui/seg-keys.ts';

const four = [{}, {}, {}, {}];

describe('moveTo', () => {
  test('Right and Down go forward, Left and Up go back, each wrapping round the ends', () => {
    expect(moveTo(four, 1, 'ArrowRight')).toBe(2);
    expect(moveTo(four, 1, 'ArrowDown')).toBe(2);
    expect(moveTo(four, 1, 'ArrowLeft')).toBe(0);
    expect(moveTo(four, 1, 'ArrowUp')).toBe(0);
    expect(moveTo(four, 3, 'ArrowRight')).toBe(0);
    expect(moveTo(four, 0, 'ArrowLeft')).toBe(3);
  });

  test('Home and End go to the ends', () => {
    expect(moveTo(four, 2, 'Home')).toBe(0);
    expect(moveTo(four, 1, 'End')).toBe(3);
  });

  test('a disabled option is passed over, in either direction and at either end', () => {
    const options = [{disabled: true}, {}, {disabled: true}, {}, {disabled: true}];
    expect(moveTo(options, 1, 'ArrowRight')).toBe(3);
    expect(moveTo(options, 3, 'ArrowLeft')).toBe(1);
    expect(moveTo(options, 3, 'ArrowRight')).toBe(1);
    expect(moveTo(options, 3, 'Home')).toBe(1);
    expect(moveTo(options, 1, 'End')).toBe(3);
  });

  test('a key the group does not handle, or a group with nothing to choose, goes nowhere', () => {
    expect(moveTo(four, 1, 'Enter')).toBeNull();
    expect(moveTo(four, 1, 'a')).toBeNull();
    expect(moveTo([{disabled: true}, {disabled: true}], 0, 'ArrowRight')).toBeNull();
    expect(moveTo([{disabled: true}], 0, 'End')).toBeNull();
    expect(moveTo([], 0, 'ArrowRight')).toBeNull();
    expect(moveTo([], 0, 'Home')).toBeNull();
  });

  test('a single option moves to itself', () => {
    expect(moveTo([{}], 0, 'ArrowRight')).toBe(0);
  });
});

describe('tabStop', () => {
  test('is the chosen option, else the first that can be chosen', () => {
    expect(tabStop([{checked: false}, {checked: true}, {checked: false}])).toBe(1);
    expect(tabStop([{checked: false}, {checked: false}])).toBe(0);
    expect(tabStop([{checked: false, disabled: true}, {checked: false}])).toBe(1);
  });

  test('a chosen option that is disabled does not hold it, and a group with nothing to choose has none', () => {
    expect(tabStop([{checked: false}, {checked: true, disabled: true}])).toBe(0);
    expect(tabStop([{checked: true, disabled: true}])).toBeNull();
    expect(tabStop([])).toBeNull();
  });
});
