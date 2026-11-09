// The English message catalog: namespace.key to ICU MessageFormat message, and the source of every message key.
// Pattern: a const object whose keys are the type (`keyof typeof en`), so the French catalog is checked against it by
// the compiler; ICU MessageFormat over Unicode CLDR plural rules, as FormatJS and Home Assistant write messages.
// Must not: hold a message that is not here in French, build text from parts (one sentence, one message), or run code.
export const en = {
  'charts.failed': 'Charts library failed to load',
  // the ten subjects, in rail order: the rail's label, the pane's heading and the More list; `auto.short` is the fifth
  // slot of the phone's bar, where "Automations" does not fit
  'home.title': 'Home',
  'lights.title': 'Lights',
  'climate.title': 'Climate',
  'weather.title': 'Weather',
  'car.title': 'Car',
  'energy.title': 'Energy',
  'air.title': 'Air',
  'media.title': 'Media',
  'cams.title': 'Security',
  'auto.title': 'Automations',
  'auto.short': 'Rules',
  'nav.more': 'More',
  // the configuration card: a title, a lead line, one message per kind of problem (src/core/config.ts), a footer;
  // wrongType's {expected} and {got} are plain words (text, number, yesno, list, block, nothing), which the message words
  'config.title': "Check the panel's configuration",
  'config.intro':
    '{n, plural, one {One setting} other {# settings}} could not be used and {n, plural, one {was} other {were}} ignored:',
  'config.unknownKey': '{path}: unknown setting.',
  'config.unknownKeyHint': '{path}: unknown setting. Did you mean {hint}?',
  'config.unknownEntity': '{path}: not an entity the panel reads. See the example configuration.',
  'config.wrongType':
    '{path}: expected {expected, select, number {a number} text {text} list {a list} block {a block of settings} yesno {yes or no} nothing {nothing} other {a value}}, got {got, select, number {a number} text {text} list {a list} block {a block of settings} yesno {yes or no} nothing {nothing} other {a value}}.',
  'config.notOneOf': '{path}: {got} is not one of {options}.',
  'config.notAPair': '{path}: a link needs exactly two cards.',
  'config.notATime': '{path}: {got} is not a time like 20:00.',
  'config.missingKey': '{path}: {missing} is required.',
  'config.footer': 'Fix configuration.yaml and restart Home Assistant.',
} as const;

/** Every message key; a key exists when it is written in `en`. */
export type MessageKey = keyof typeof en;
