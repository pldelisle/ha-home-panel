// The Material scheme (src/shell/material-scheme.ts): the Tonal Spot scheme of a seed, mapped onto the panel's roles. The hex values
// below are the design system's tokens.json (scheme from @material/material-color-utilities 0.3.0, seed #4a7dba), so a change of the
// library or of the mapping that moves a colour fails here.
import {describe, expect, test} from 'vitest';
import {DEFAULT_SEED, materialScheme} from '../../../src/shell/material-scheme.ts';

describe('materialScheme', () => {
  test('the default seed is the House blue', () => {
    expect(DEFAULT_SEED).toBe('#4a7dba');
  });

  test('light: the panel’s roles take the Material roles the design system names', () => {
    const s = materialScheme(DEFAULT_SEED, false, 0);
    expect(s['--bg']).toBe('#ecedf4'); // surface-container
    expect(s['--card']).toBe('#ffffff'); // surface-container-lowest
    expect(s['--well']).toBe('#e7e8ee'); // surface-container-high
    expect(s['--control']).toBe('#d8e3f8'); // secondary-container
    expect(s['--on-control']).toBe('#3c4758'); // on-secondary-container
    expect(s['--fg']).toBe('#191c20'); // on-surface
    expect(s['--fg2']).toBe('#43474e'); // on-surface-variant
    expect(s['--line']).toBe('#c3c6cf'); // outline-variant
    expect(s['--focus']).toBe('#545f70'); // secondary
  });

  test('dark: the roles move one step up the surface ladder', () => {
    const s = materialScheme(DEFAULT_SEED, true, 0);
    expect(s['--bg']).toBe('#111418'); // surface
    expect(s['--card']).toBe('#272a2f'); // surface-container-high
    expect(s['--well']).toBe('#32353a'); // surface-container-highest
    expect(s['--control']).toBe('#3c4758');
    expect(s['--on-control']).toBe('#d8e3f8');
    expect(s['--fg']).toBe('#e1e2e8');
    expect(s['--fg2']).toBe('#c3c6cf');
    expect(s['--line']).toBe('#43474e');
    expect(s['--focus']).toBe('#bcc7db');
  });

  test('the panel’s older names follow their roles: card2 is the well, ctl-bg the control', () => {
    for (const dark of [false, true]) {
      const s = materialScheme(DEFAULT_SEED, dark, 0);
      expect(s['--card2']).toBe(s['--well']);
      expect(s['--ctl-bg']).toBe(s['--control']);
    }
  });

  test('every Material role is exposed as --md-<role>, the others too', () => {
    const s = materialScheme(DEFAULT_SEED, false, 0);
    expect(s['--md-primary']).toBe('#39608f');
    expect(s['--md-on-primary']).toBe('#ffffff');
    expect(s['--md-primary-container']).toBe('#d3e4ff');
    expect(s['--md-surface-container-lowest']).toBe('#ffffff');
    expect(s['--md-tertiary-container']).toBe('#f5d9ff');
    expect(s['--md-error']).toBe('#ba1a1a');
    expect(s['--md-inverse-surface']).toBe('#2e3035');
    // a palette's key colour is not a role a component paints with
    expect(Object.keys(s).filter(k => k.includes('palette-key'))).toEqual([]);
    expect(materialScheme(DEFAULT_SEED, true, 0)['--md-primary']).toBe('#a3c9fe');
  });

  test('only custom properties, each a six-digit hex', () => {
    for (const dark of [false, true])
      for (const [name, value] of Object.entries(materialScheme(DEFAULT_SEED, dark, 0))) {
        expect(name).toMatch(/^--[a-z0-9-]+$/);
        expect(value).toMatch(/^#[0-9a-f]{6}$/);
      }
  });

  test('another seed gives another palette; a higher contrast level darkens the text', () => {
    expect(materialScheme('#faba96', false, 0)['--md-primary']).not.toBe(
      materialScheme(DEFAULT_SEED, false, 0)['--md-primary'],
    );
    expect(materialScheme(DEFAULT_SEED, false, 1)['--md-primary']).toBe('#002d54'); // light-hc in tokens.json
  });
});
