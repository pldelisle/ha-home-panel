// The Material design's colours as a pure function: the Tonal Spot scheme of a seed, mapped onto the panel's colour roles.
// Pattern: functional core (Bernhardt, Boundaries): a seed, the theme and a contrast level in, a map of custom properties out,
// so the shell applies it and nothing here reads the DOM. The scheme is Material 3's (HCT and Tonal Spot, Google's
// @material/material-color-utilities); the role mapping is the Material design system's "Colour" table (ADR 0037).
// Must not: touch the DOM, hold a seed (the caller passes it), or return a colour for the chart series or the illustrations,
// which are the same in both designs.
import {
  argbFromHex,
  DynamicColor,
  Hct,
  hexFromArgb,
  MaterialDynamicColors,
  SchemeTonalSpot,
} from '@material/material-color-utilities';

/** The default seed: House, the panel's own `c-home` blue. */
export const DEFAULT_SEED = '#4a7dba';

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
};

const kebab = (name: string): string => name.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

// every Material colour role the library defines, but the palettes' key colours, which are inputs and not roles
const MATERIAL_ROLES: [string, DynamicColor][] = Object.entries(MaterialDynamicColors).filter(
  (entry): entry is [string, DynamicColor] => entry[1] instanceof DynamicColor && !entry[0].endsWith('PaletteKeyColor'),
);

/**
 * The custom properties of the Material look for a seed (`#rrggbb`), light or dark, at a contrast level (0 standard, 1 high):
 * the panel's roles (`--bg`, `--card`, `--well`, `--control`, `--on-control`, `--fg`, `--fg2`, `--line`, `--focus`, and the older
 * names that stand for them) and every Material role as `--md-<role>`.
 */
export function materialScheme(seedHex: string, dark: boolean, contrast: number): Record<string, string> {
  const scheme = new SchemeTonalSpot(Hct.fromInt(argbFromHex(seedHex)), dark, contrast);
  const hex = (role: DynamicColor): string => hexFromArgb(role.getArgb(scheme));
  const out: Record<string, string> = {};
  for (const [name, role] of MATERIAL_ROLES) out[`--md-${kebab(name)}`] = hex(role);
  for (const [name, [light, night]] of Object.entries(ROLES)) {
    out[`--${name}`] = out[`--md-${kebab(dark ? night : light)}`];
  }
  for (const [alias, name] of Object.entries(ALIASES)) out[`--${alias}`] = out[`--${name}`];
  return out;
}
