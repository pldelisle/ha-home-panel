// The French message catalog, Québec forms: the same keys as the English one, each with its ICU message.
// Pattern: `Record<MessageKey, string>`, so a missing key or an extra one fails `npm run typecheck`; the texts of the
// legacy rewrite map are the reference when a string moves here.
// An apostrophe right before `{` starts ICU quoting (`l'{name}` renders `l{name}`): write two (`l''{name}`); the ICU
// parity test catches a miss.
// Must not: hold a key the English catalog lacks, change an argument name or a plural category of the English message.
import type {MessageKey} from './en.ts';

export const fr: Record<MessageKey, string> = {
  'charts.failed': "La bibliothèque de graphiques n'a pas chargé",
};
