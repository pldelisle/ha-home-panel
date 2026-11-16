// The OKLab blend at the pure seam (ADR 0005): known colours in, the legacy heatmap's own output compared (it was run once and its literals pasted here).
import {describe, expect, test} from 'vitest';
import {fromOklab, linear, oklabBlend, toOklab} from '../../../src/core/color.ts';

describe('linear', () => {
  test('is the sRGB curve: a straight segment near black, a power curve above', () => {
    expect(linear(0)).toBe(0);
    expect(linear(10)).toBeCloseTo(0.003035269835488375, 12);
    expect(linear(255)).toBe(1);
  });
});

describe('toOklab and fromOklab', () => {
  test('a known colour reads as the legacy lab and returns as itself, in lower case', () => {
    const lab = toOklab('#24467F');
    expect(lab[0]).toBeCloseTo(0.400168519727933, 12);
    expect(lab[1]).toBeCloseTo(-0.017885420123232854, 12);
    expect(lab[2]).toBeCloseTo(-0.10260344805466609, 12);
    expect(fromOklab(lab)).toBe('#24467f');
  });

  test('every stop of both heat scales survives the round trip', () => {
    const stops = ['#3F7DBF', '#8DBAD8', '#E6D9A2', '#EE9A52', '#CF592B', '#87210F', '#3561A8'];
    expect(stops.map(hex => fromOklab(toOklab(hex)))).toEqual(stops.map(hex => hex.toLowerCase()));
  });

  test('a lab outside what a display shows is clamped, and a dark channel keeps its leading zero', () => {
    expect(fromOklab([2, 0, 0])).toBe('#ffffff');
    expect(fromOklab([0, 0, 0])).toBe('#000000');
    expect(fromOklab(toOklab('#050403'))).toBe('#050403');
  });
});

describe('oklabBlend', () => {
  test('the halfway colour of two stops is the legacy output', () => {
    expect(oklabBlend('#24467F', '#3F7DBF', 0.5)).toBe('#31619e');
  });

  test('0 is the first colour and 1 the second', () => {
    expect(oklabBlend('#E6D9A2', '#EE9A52', 0)).toBe('#e6d9a2');
    expect(oklabBlend('#E6D9A2', '#EE9A52', 1)).toBe('#ee9a52');
  });
});
