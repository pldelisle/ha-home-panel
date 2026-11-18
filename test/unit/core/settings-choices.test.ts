import {describe, expect, it} from 'vitest';
import {
  TEXT_STEPS,
  appearanceAfterAuto,
  fixedTextStep,
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
  it('are the stored sizes above auto, in order, and the slider maps both ways', () => {
    expect(TEXT_STEPS).toEqual(['smaller', 'large', 'larger']);
    expect(textAtStep(0)).toBe('smaller');
    expect(textAtStep(2)).toBe('larger');
    expect(textAtStep(-3)).toBe('smaller');
    expect(textAtStep(9)).toBe('larger');
    expect(stepOfText('larger')).toBe(2);
    expect(stepOfText('smaller')).toBe(0);
  });
  it('keep the slider where it was while Auto holds the size', () => {
    expect(fixedTextStep('auto')).toBe('large');
    expect(fixedTextStep('auto', 'smaller')).toBe('smaller');
    expect(fixedTextStep('larger', 'smaller')).toBe('larger');
    expect(stepOfText('auto')).toBe(1);
    expect(stepOfText('auto', 'larger')).toBe(2);
  });
  it('the Auto switch writes auto, or the size the slider stood on', () => {
    expect(textAfterAuto(true, 'larger')).toBe('auto');
    expect(textAfterAuto(false, 'larger')).toBe('larger');
    expect(textAfterAuto(false, 'auto')).toBe('large');
  });
});
