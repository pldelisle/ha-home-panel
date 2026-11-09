// The browser's locale defaults: its time zone, locale and 12-hour preference, read once for the element to hand over.
// Pattern: the one place that reads the browser's `Intl` defaults, called by the shell and, until the formatters move, by the guest, so the locale
// derivation stays a pure function that is given them (locale.ts) and nothing outside src/core/i18n/ touches `Intl`.
// Must not: read the clock, navigator or the DOM, or be called by a pure function.
import type {LocaleDefaults} from './locale.ts';

export function browserDefaults(): LocaleDefaults {
  // an hour field is asked for so that the resolved options say whether the browser prefers 12 hours
  const resolved = new Intl.DateTimeFormat(undefined, {hour: 'numeric'}).resolvedOptions();
  return {timeZone: resolved.timeZone || 'UTC', browserLocale: resolved.locale, browserHour12: resolved.hour12};
}
