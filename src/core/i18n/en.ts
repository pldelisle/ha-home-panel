// The English message catalog: namespace.key to ICU MessageFormat message, and the source of every message key.
// Pattern: a const object whose keys are the type (`keyof typeof en`), so the French catalog is checked against it by
// the compiler; ICU MessageFormat over Unicode CLDR plural rules, as FormatJS and Home Assistant write messages.
// Must not: hold a message that is not here in French, build text from parts (one sentence, one message), or run code.
export const en = {
  'charts.failed': 'Charts library failed to load',
} as const;

/** Every message key; a key exists when it is written in `en`. */
export type MessageKey = keyof typeof en;
