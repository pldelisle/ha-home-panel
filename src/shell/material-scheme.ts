// The Material design's colours as a pure function: the Tonal Spot scheme of a seed, mapped onto the panel's colour roles.
// Pattern: functional core (Bernhardt, Boundaries): a seed, the theme and a contrast level in, a map of custom properties out,
// so the shell applies it and nothing here reads the DOM. The scheme is Material 3's (HCT and Tonal Spot, Google's
// @material/material-color-utilities); the role mapping is the Material design system's "Colour" table (ADR 0037).
// The status colours `ok` and `warn` are Material custom colour groups (Material 3, Custom colors): harmonized toward the seed with
// Blend.harmonize, then a tonal palette read at the tones the design system's tokens.json lists for each theme and contrast level.
// Must not: touch the DOM, hold a seed (the caller passes it), or return a colour for the chart series or the illustrations,
// which are the same in both designs.
import {DEFAULT_SEED_ID, SEEDS} from '../core/seeds.ts';
import {
  argbFromHex,
  Blend,
  DynamicColor,
  Hct,
  hexFromArgb,
  MaterialDynamicColors,
  SchemeTonalSpot,
  TonalPalette,
} from '@material/material-color-utilities';

/** The default seed: House, the panel's own `c-home` blue. */
export const DEFAULT_SEED = SEEDS[DEFAULT_SEED_ID];

// the panel's two status colours, the Apple design's light values: the design colour each group is made from
const STATUS_COLOURS = {ok: '#758671', warn: '#b27c43'} as const;

// the tones of a custom group's four roles (colour, on-colour, container, on-container), per theme and contrast level
const STATUS_TONES = {
  light: [40, 100, 90, 10],
  dark: [80, 20, 30, 90],
  'light-hc': [25, 100, 35, 100],
  'dark-hc': [92, 0, 70, 0],
} as const;

// the panel's roles, per theme, as the Material role each takes: `[light, dark]`
const ROLES: Record<string, readonly [string, string]> = {
  bg: ['surfaceContainer', 'surface'],
  card: ['surfaceContainerLowest', 'surfaceContainerHigh'],
  well: ['surfaceContainerHigh', 'surfaceContainerHighest'],
  control: ['secondaryContainer', 'secondaryContainer'],
  'on-control': ['onSecondaryContainer', 'onSecondaryContainer'],
  fg: ['onSurface', 'onSurface'],
  fg2: ['onSurfaceVariant', 'onSurfaceVariant'],
  line: ['outlineVariant', 'outlineVariant'],
  focus: ['secondary', 'secondary'],
};

// the names the panel's stylesheets already read, each the role it stands for, so the Apple rules recolour without a rewrite
const ALIASES: Record<string, string> = {
  card2: 'well',
  'ctl-bg': 'control',
  'bg-glow': 'bg',
  chipbg: 'card',
  ring: 'line',
  fg3: 'fg2',
  label: 'fg2',
  'tile-off': 'well',
  'tile-off-sub': 'fg2',
  'nav-sel-bg': 'control',
  'nav-sel-fg': 'on-control',
  // the text-sized status colours read the groups' own, which hold 4.5:1 on the card (7:1 at high contrast)
  't-ok': 'ok',
  't-warn': 'warn',
};

const kebab = (name: string): string => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

// every Material colour role the library defines, but the palettes' key colours, which are inputs and not roles
const MATERIAL_ROLES: [string, DynamicColor][] = Object.entries(MaterialDynamicColors).filter(
  (entry): entry is [string, DynamicColor] => entry[1] instanceof DynamicColor && !entry[0].endsWith('PaletteKeyColor'),
);

// the `ok` and `warn` groups for a seed: `--ok`, `--on-ok`, `--ok-container`, `--on-ok-container`, and the same for `warn`
function statusGroups(seedArgb: number, dark: boolean, contrast: number): Record<string, string> {
  // the panel asks for 0 or 1; anything from halfway up is the high-contrast tones
  const tones = STATUS_TONES[`${dark ? 'dark' : 'light'}${contrast >= 0.5 ? '-hc' : ''}`];
  const out: Record<string, string> = {};
  for (const [name, hex] of Object.entries(STATUS_COLOURS)) {
    const palette = TonalPalette.fromInt(Blend.harmonize(argbFromHex(hex), seedArgb));
    const [colour, on, container, onContainer] = tones.map(tone => hexFromArgb(palette.tone(tone)));
    Object.assign(out, {
      [`--${name}`]: colour,
      [`--on-${name}`]: on,
      [`--${name}-container`]: container,
      [`--on-${name}-container`]: onContainer,
    });
  }
  return out;
}

/**
 * The custom properties of the Material look for a seed (`#rrggbb`), light or dark, at a contrast level (0 standard, 1 high):
 * the panel's roles (`--bg`, `--card`, `--well`, `--control`, `--on-control`, `--fg`, `--fg2`, `--line`, `--focus`, and the older
 * names that stand for them) and every Material role as `--md-<role>`, and the status groups `ok` and `warn` (`--ok`, `--on-ok`, `--ok-container`, `--on-ok-container`, ...).
 */
export function materialScheme(seedHex: string, dark: boolean, contrast: number): Record<string, string> {
  const seed = argbFromHex(seedHex);
  const scheme = new SchemeTonalSpot(Hct.fromInt(seed), dark, contrast);
  const hex = (role: DynamicColor): string => hexFromArgb(role.getArgb(scheme));
  const out: Record<string, string> = {};
  for (const [name, role] of MATERIAL_ROLES) out[`--md-${kebab(name)}`] = hex(role);
  Object.assign(out, statusGroups(seed, dark, contrast));
  for (const [name, [light, night]] of Object.entries(ROLES)) {
    out[`--${name}`] = out[`--md-${kebab(dark ? night : light)}`];
  }
  for (const [alias, name] of Object.entries(ALIASES)) out[`--${alias}`] = out[`--${name}`];
  return out;
}

type Swatch = readonly [string, string, string, string];

// the popup draws seven swatches on every render and a scheme costs a few milliseconds: each is built once, by seed, theme and contrast
const SWATCHES = new Map<string, Swatch>();

/**
 * The four colours of a seed's swatch in Settings: the scheme's primary, primary container, secondary container and card (the
 * surface the panel's cards sit on: the background in light, where the card itself is white, and the card in dark). Computed from
 * `materialScheme` itself (at the contrast the panel is at), so the swatch cannot disagree with the panel; remembered, as it is pure.
 */
export function seedSwatch(seedHex: string, dark: boolean, contrast = 0): Swatch {
  const key = `${seedHex}/${dark}/${contrast}`;
  const known = SWATCHES.get(key);
  if (known) return known;
  const s = materialScheme(seedHex, dark, contrast);
  const swatch: Swatch = [
    s['--md-primary'],
    s['--md-primary-container'],
    s['--md-secondary-container'],
    dark ? s['--card'] : s['--bg'],
  ];
  SWATCHES.set(key, swatch);
  return swatch;
}
