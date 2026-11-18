// The Material scheme (src/shell/material-scheme.ts): the Tonal Spot scheme of a seed, mapped onto the panel's roles. The hex values
// below are the design system's tokens.json (scheme from @material/material-color-utilities 0.3.0, seed #4a7dba), so a change of the
// library or of the mapping that moves a colour fails here.
import {describe, expect, test} from 'vitest';
import {SEEDS} from '../../../src/core/seeds.ts';
import {DEFAULT_SEED, materialScheme, seedSwatch} from '../../../src/shell/material-scheme.ts';

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

// the design system's tokens.json holds the House seed's four themes; these are its `ok` and `warn` groups
const STATUS = {
  light: {
    '--ok': '#4e6355',
    '--on-ok': '#ffffff',
    '--ok-container': '#d1e8d7',
    '--on-ok-container': '#0b1f15',
    '--warn': '#89502c',
    '--on-warn': '#ffffff',
    '--warn-container': '#ffdbc8',
    '--on-warn-container': '#321200',
  },
  dark: {
    '--ok': '#b5ccbb',
    '--on-ok': '#213529',
    '--ok-container': '#374b3e',
    '--on-ok-container': '#d1e8d7',
    '--warn': '#ffb68b',
    '--on-warn': '#512403',
    '--warn-container': '#6d3917',
    '--on-warn-container': '#ffdbc8',
  },
  'light-hc': {
    '--ok': '#2c4033',
    '--on-ok': '#ffffff',
    '--ok-container': '#42574a',
    '--on-ok-container': '#ffffff',
    '--warn': '#5f2e0c',
    '--on-warn': '#ffffff',
    '--warn-container': '#7b4521',
    '--on-warn-container': '#ffffff',
  },
  'dark-hc': {
    '--ok': '#d6eedc',
    '--on-ok': '#000000',
    '--ok-container': '#9ab1a1',
    '--on-ok-container': '#000000',
    '--warn': '#ffe3d4',
    '--on-warn': '#000000',
    '--warn-container': '#e29b70',
    '--on-warn-container': '#000000',
  },
} as const;

describe('contrast level 1 (More contrast)', () => {
  test('the scheme is the design system’s -hc themes', () => {
    const light = materialScheme(DEFAULT_SEED, false, 1);
    expect(light['--md-primary']).toBe('#002d54');
    expect(light['--md-primary-container']).toBe('#214b78');
    const dark = materialScheme(DEFAULT_SEED, true, 1);
    expect(dark['--md-primary']).toBe('#e9f0ff');
    expect(dark['--md-primary-container']).toBe('#9fc5fa');
  });

  test('text holds 7:1 on its grounds, for every seed in light and dark', () => {
    const luminance = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map(i => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string): number => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const seed of Object.values(SEEDS))
      for (const dark of [false, true]) {
        const s = materialScheme(seed, dark, 1);
        expect(ratio(s['--md-on-primary'], s['--md-primary'])).toBeGreaterThanOrEqual(7);
        expect(ratio(s['--md-on-surface'], s['--md-surface'])).toBeGreaterThanOrEqual(7);
        expect(ratio(s['--md-on-secondary-container'], s['--md-secondary-container'])).toBeGreaterThanOrEqual(7);
        expect(ratio(s['--ok'], s['--card'])).toBeGreaterThanOrEqual(7);
        expect(ratio(s['--warn'], s['--card'])).toBeGreaterThanOrEqual(7);
        expect(ratio(s['--on-ok'], s['--ok'])).toBeGreaterThanOrEqual(7);
      }
  });
});

describe('the status colours as Material custom colour groups', () => {
  test.each([
    ['light', false, 0],
    ['dark', true, 0],
    ['light-hc', false, 1],
    ['dark-hc', true, 1],
  ] as const)('%s: the eight values match tokens.json', (theme, dark, contrast) => {
    const s = materialScheme(DEFAULT_SEED, dark, contrast);
    for (const [name, hex] of Object.entries(STATUS[theme])) expect(s[name]).toBe(hex);
  });

  test('they are harmonized toward the seed: another seed moves them', () => {
    const house = materialScheme(DEFAULT_SEED, false, 0)['--ok'];
    const dawn = materialScheme(SEEDS.dawn, false, 0)['--ok'];
    expect(dawn).not.toBe(house);
    expect(dawn).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('the older text names follow them, and --md- carries no status group', () => {
    const s = materialScheme(DEFAULT_SEED, false, 0);
    expect(s['--t-ok']).toBe(s['--ok']);
    expect(s['--t-warn']).toBe(s['--warn']);
    expect(Object.keys(s).filter(k => k.startsWith('--md-') && /ok|warn/.test(k))).toEqual([]);
  });
});

describe('seedSwatch', () => {
  test('the four quadrants are the scheme’s primary, primary container, secondary container and card', () => {
    expect(seedSwatch(SEEDS.house, false)).toEqual(['#39608f', '#d3e4ff', '#d8e3f8', '#ecedf4']);
    expect(seedSwatch(SEEDS.house, true)).toEqual(['#a3c9fe', '#1e4876', '#3c4758', '#272a2f']);
    expect(seedSwatch(SEEDS.meadow, false)).toEqual(['#1b6b51', '#a6f2d2', '#cee9db', '#e9efea']);
    expect(seedSwatch(SEEDS.sand, true)).toEqual(['#eac16c', '#5c4200', '#53452a', '#2e2921']);
  });

  test('under More contrast the swatch is the high-contrast scheme, and a repeat is the same answer', () => {
    expect(seedSwatch(SEEDS.house, false, 1).slice(0, 2)).toEqual(['#002d54', '#214b78']);
    expect(seedSwatch(SEEDS.house, true, 1).slice(0, 2)).toEqual(['#e9f0ff', '#9fc5fa']);
    expect(seedSwatch(SEEDS.house, false, 1)).toBe(seedSwatch(SEEDS.house, false, 1));
    expect(seedSwatch(SEEDS.house, false)).not.toEqual(seedSwatch(SEEDS.house, false, 1));
  });

  test('they come from the panel’s own scheme, so the swatch cannot disagree with the panel', () => {
    for (const dark of [false, true]) {
      const s = materialScheme(SEEDS.ember, dark, 0);
      expect(seedSwatch(SEEDS.ember, dark)).toEqual([
        s['--md-primary'],
        s['--md-primary-container'],
        s['--md-secondary-container'],
        dark ? s['--card'] : s['--bg'],
      ]);
    }
  });

  test('--md-inverse-error reads on --md-inverse-surface at 3:1 or more, in light and dark, at both contrast levels', () => {
    const luminance = (hex: string): number => {
      const [r, g, b] = [1, 3, 5].map(i => {
        const c = parseInt(hex.slice(i, i + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const ratio = (a: string, b: string): number => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    for (const dark of [false, true])
      for (const contrast of [0, 1]) {
        const s = materialScheme(DEFAULT_SEED, dark, contrast);
        expect(ratio(s['--md-inverse-error'], s['--md-inverse-surface'])).toBeGreaterThanOrEqual(3);
      }
  });
});
