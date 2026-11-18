// The design a device starts in before anyone chooses one: Liquid Glass (`apple`) on Apple's devices and wherever nothing says
// otherwise, Material on Android, so each looks native out of the box (ADR 0037).
// Pattern: a pure function of what the browser says about itself, passed in by the shell (functional core, imperative shell:
// Bernhardt, Boundaries). The User-Agent Client Hints platform wins when the browser gives one; the user agent string is the fallback.
// Must not: read `navigator` or any global, look at the screen size, or override a design the person has chosen.

/** What the browser says about the device: `navigator.userAgentData?.platform` and `navigator.userAgent`. */
export interface DeviceHint {
  platform?: string;
  userAgent?: string;
}

/** `material` on Android, `apple` everywhere else (Apple's devices, and desktops, which keep the panel's default). */
export function deviceDesign({platform, userAgent = ''}: DeviceHint): 'apple' | 'material' {
  if (platform) return /^android$/i.test(platform) ? 'material' : 'apple';
  return /\bAndroid\b/.test(userAgent) ? 'material' : 'apple';
}
