// focusTo and stopAt: where the keys of the section tabs go, and which tab holds the list's one tab stop (the WAI-ARIA Authoring Practices' tabs).
import {describe, expect, test} from 'vitest';
import {focusTo, stopAt} from '../../../src/ui/tabs-keys.ts';

// Home, Lights (hidden by the house), Climate, More
const tabs = [{}, {disabled: true}, {}, {}];

describe('focusTo', () => {
  test('Down and Up move along a vertical list, wrapping and passing over a tab that is not on screen', () => {
    expect(focusTo(tabs, 0, 'ArrowDown', 'vertical')).toBe(2);
    expect(focusTo(tabs, 3, 'ArrowDown', 'vertical')).toBe(0);
    expect(focusTo(tabs, 0, 'ArrowUp', 'vertical')).toBe(3);
    expect(focusTo(tabs, 2, 'ArrowUp', 'vertical')).toBe(0);
  });

  test('Left and Right are no keys of a vertical list, and move a horizontal one beside Up and Down', () => {
    expect(focusTo(tabs, 0, 'ArrowRight', 'vertical')).toBeNull();
    expect(focusTo(tabs, 0, 'ArrowLeft', 'vertical')).toBeNull();
    expect(focusTo(tabs, 0, 'ArrowRight', 'horizontal')).toBe(2);
    expect(focusTo(tabs, 0, 'ArrowLeft', 'horizontal')).toBe(3);
    expect(focusTo(tabs, 0, 'ArrowDown', 'horizontal')).toBe(2);
  });

  test('Home and End go to the first and last tab on screen, and other keys are left alone', () => {
    const edges = [{disabled: true}, {}, {}, {disabled: true}];
    expect(focusTo(edges, 2, 'Home', 'vertical')).toBe(1);
    expect(focusTo(edges, 1, 'End', 'vertical')).toBe(2);
    expect(focusTo(tabs, 0, 'Enter', 'vertical')).toBeNull();
    expect(focusTo(tabs, 0, 'Tab', 'horizontal')).toBeNull();
  });

  test('no tab on screen, no move', () => {
    expect(focusTo([{disabled: true}], 0, 'ArrowDown', 'vertical')).toBeNull();
  });
});

describe('stopAt', () => {
  test('the chosen tab holds the tab stop', () => {
    expect(stopAt([{checked: false}, {checked: false, disabled: true}, {checked: true}, {checked: false}])).toBe(2);
  });

  test('a chosen tab that is not on screen gives it to the first that is, and none on screen gives it to none', () => {
    expect(stopAt([{checked: false, disabled: true}, {checked: false}, {checked: true, disabled: true}])).toBe(1);
    expect(stopAt([{checked: false, disabled: true}])).toBeNull();
  });
});
