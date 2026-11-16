// overlayKey: the key a held value is stored under.
import {describe, expect, test} from 'vitest';
import {overlayKey} from '../../../src/core/overlay-key.ts';

describe('overlayKey', () => {
  test('is the id and the suffix of a kind, so two kinds of one entity never share a key', () => {
    const mode = overlayKey('mode');
    const level = overlayKey('lvl');
    expect(mode('fan.den')).toBe('fan.den:mode');
    expect(level('fan.den')).toBe('fan.den:lvl');
    expect(mode('fan.den')).not.toBe(mode('fan.bed'));
  });
});
