import {describe, expect, it} from 'vitest';
import {
  TEXT_SCALES,
  TEXT_STEPS,
  appearanceAfterAuto,
  nearestTextStep,
  stepOfText,
  textAfterAuto,
  textAtStep,
  toggleAppearance,
} from '../../../src/core/settings-choices.ts';

describe('toggleAppearance', () => {
  it('flips a fixed theme', () => {
    expect(toggleAppearance('light', false)).toBe('dark');
    expect(toggleAppearance('dark', true)).toBe('light');
  });
  it('on Auto sets the opposite of what shows, so Auto ends', () => {
    expect(toggleAppearance('auto', true)).toBe('light');
    expect(toggleAppearance('auto', false)).toBe('dark');
  });
});

describe('appearanceAfterAuto', () => {
  it('turning Auto on writes auto; turning it off keeps what shows', () => {
    expect(appearanceAfterAuto(true, true)).toBe('auto');
    expect(appearanceAfterAuto(false, true)).toBe('dark');
    expect(appearanceAfterAuto(false, false)).toBe('light');
  });
});

describe('the text steps', () => {
  it('are the sizes the settings keep above auto, in order, with their scales', () => {
    expect(TEXT_STEPS).toEqual(['smaller', 'normal', 'large', 'larger']);
    expect(TEXT_SCALES.get('normal')).toBe(1);
  });
  it('map a slider position to a size and back', () => {
    expect(textAtStep(0)).toBe('smaller');
    expect(textAtStep(1)).toBe('normal');
    expect(textAtStep(3)).toBe('larger');
    expect(textAtStep(-3)).toBe('smaller');
    expect(textAtStep(9)).toBe('larger');
    expect(stepOfText('larger', 1)).toBe(3);
    expect(stepOfText('smaller', 1.3)).toBe(0);
  });
  it('place a size that follows the device at the step nearest its scale', () => {
    expect(nearestTextStep(1)).toBe('normal');
    expect(nearestTextStep(0.2)).toBe('smaller');
    expect(nearestTextStep(1.6)).toBe('larger');
    expect(nearestTextStep(1.1)).toBe('large'); // 1.15 is nearer than 1
    expect(nearestTextStep(1.075)).toBe('normal'); // a tie goes to the smaller
    expect(stepOfText('auto', 1.3)).toBe(3);
  });
  it('the Auto switch writes auto, or the step nearest the scale in force', () => {
    expect(textAfterAuto(true, 1.3)).toBe('auto');
    expect(textAfterAuto(false, 1)).toBe('normal');
    expect(textAfterAuto(false, 1.3)).toBe('larger');
  });
});
