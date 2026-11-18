// The Material design's seven seeds: the id the settings store and the colour each stands for.
// Pattern: a closed table parsed at the edge (King, Parse, don't validate), so a stored value that is not a seed becomes the default
// before anything reads it; the colours are the Material design system's Seeds component (ADR 0037).
// Must not: build a scheme (shell/material-scheme.ts does), know the DOM, or hold the person's choice (the settings do).

/** The seeds in the order the Settings popup lists them; the same names as the wallpapers, and the House blue first. */
export const SEEDS = {
  house: '#4a7dba',
  dawn: '#faba96',
  lake: '#609cf4',
  meadow: '#a0e0c4',
  ember: '#fa9678',
  aurora: '#64dcc8',
  sand: '#ecce96',
} as const;

export type SeedId = keyof typeof SEEDS;

export const SEED_IDS = Object.keys(SEEDS) as readonly SeedId[];

/** The seed a new browser has: House, the panel's own `c-home` blue. */
export const DEFAULT_SEED_ID: SeedId = 'house';

/** A stored value as a seed id; anything that is not one is House. */
export function parseSeed(value: string | null | undefined): SeedId {
  return SEED_IDS.find(id => id === value) ?? DEFAULT_SEED_ID;
}
