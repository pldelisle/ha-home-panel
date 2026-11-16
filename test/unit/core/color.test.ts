// The OKLab blend at the pure seam (ADR 0005): known colours in, the legacy heatmap's own output compared (it was run once and its literals pasted here).
import {describe, expect, test} from 'vitest';
import {kelvinRGB, oklabBlend} from '../../../src/core/color.ts';

describe('oklabBlend', () => {
  test('the halfway colour of two stops is the legacy output', () => {
    expect(oklabBlend('#24467F', '#3F7DBF', 0.5)).toBe('#31619e');
  });

  test('0 is the first colour and 1 the second, in lower case', () => {
    expect(oklabBlend('#E6D9A2', '#EE9A52', 0)).toBe('#e6d9a2');
    expect(oklabBlend('#E6D9A2', '#EE9A52', 1)).toBe('#ee9a52');
  });

  test('every stop of both heat scales survives the trip through OKLab', () => {
    const stops = ['#24467F', '#3F7DBF', '#8DBAD8', '#E6D9A2', '#EE9A52', '#CF592B', '#87210F', '#3561A8'];
    expect(stops.map(hex => oklabBlend(hex, '#000000', 0))).toEqual(stops.map(hex => hex.toLowerCase()));
  });

  test('black and white are the ends of the sRGB curve, and a dark channel keeps its leading zero', () => {
    expect(oklabBlend('#000000', '#ffffff', 0)).toBe('#000000');
    expect(oklabBlend('#000000', '#ffffff', 1)).toBe('#ffffff');
    expect(oklabBlend('#050403', '#ffffff', 0)).toBe('#050403');
  });

  test('a blend past the ends is clamped to what a display shows', () => {
    expect(oklabBlend('#000000', '#ffffff', 2)).toBe('#ffffff');
    expect(oklabBlend('#ffffff', '#000000', 2)).toBe('#000000');
  });
});

describe('kelvinRGB', () => {
  test('a warm white at 2700 K and a near white at 6500 K, Tanner Helland’s fit', () => {
    expect(kelvinRGB(2700)).toBe('rgb(255,167,87)');
    expect(kelvinRGB(6500)).toBe('rgb(255,254,250)');
  });

  test('a cool blue past 6600 K, red with no blue under 1900 K, clamped to 1000 to 40,000 K', () => {
    expect(kelvinRGB(1500)).toBe('rgb(255,108,0)');
    expect(kelvinRGB(500)).toBe(kelvinRGB(1000));
    expect(kelvinRGB(50000)).toBe(kelvinRGB(40000));
  });
});
