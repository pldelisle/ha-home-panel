// The appearance rules as pure functions: dark or light, which wallpaper, how dense the glass, how large the text.
// Pattern: functional core (Bernhardt, Boundaries): the controller gathers the settings, the media queries, the sun and
// the probe; these decide. They are the legacy class's `applyTheme`, `applyGlass` and `applyText` with the reads taken out.
// Must not: read a setting, a media query, the store or the DOM, or return anything but plain values.

/** The wallpapers the Glass setting offers besides None; `sky` is picked from the time of day and the weather. */
const WALLPAPERS: readonly string[] = ['dawn', 'lake', 'meadow', 'ember', 'aurora', 'sand', 'sky'];

// The Text size choices that fix the scale; `auto` follows the device (see `textScale`).
const FIXED_SCALES = new Map([
  ['smaller', 0.9],
  ['large', 1.15],
  ['larger', 1.3],
]);

/** The scale from which the frame is told the text is large (`txl`), so a row that no longer fits can wrap. */
export const LARGE_TEXT = 1.25;

// The text probe is set in the system body font, which is 17 px at the device's default size.
const BODY_PX = 17;
const MAX_AUTO_SCALE = 1.6;

/** Dark when the setting says dark, or when it says auto and the device is dark or the sun is below the horizon. */
export function isDark(theme: string, deviceDark: boolean, sunState: string | undefined): boolean {
  return theme === 'dark' || (theme === 'auto' && (deviceDark || sunState === 'below_horizon'));
}

/** The wallpaper the Glass setting shows, or null for glass off; `sky` asks for the sky's pick only when it is chosen. */
export function glassWallpaper(glass: string, sky: () => string): string | null {
  if (!WALLPAPERS.includes(glass)) return null;
  return glass === 'sky' ? sky() : glass;
}

/** The fill-alpha multiplier (`--g-m`) for a transparency level of 0 to 100: 0 is 1.8 times denser, 50 is 1, 100 is 0.2. */
export function glassDensity(level: number): number {
  return 1.8 - level * 0.016;
}

/** The text scale (`--tx`): fixed by the setting, or on auto the probe's size over the body size, from 1 to 1.6. */
export function textScale(text: string, probePx: number): number {
  const fixed = FIXED_SCALES.get(text);
  if (fixed !== undefined) return fixed;
  if (text !== 'auto') return 1;
  return Math.min(MAX_AUTO_SCALE, Math.max(1, (probePx || BODY_PX) / BODY_PX));
}
