// The French message catalog, Québec forms: the same keys as the English one, each with its ICU message.
// Pattern: `Record<MessageKey, string>`, so a missing key or an extra one fails `npm run typecheck`; the texts of the
// legacy rewrite map are the reference when a string moves here.
// An apostrophe right before `{` starts ICU quoting (`l'{name}` renders `l{name}`): write two (`l''{name}`); the ICU
// parity test catches a miss.
// Must not: hold a key the English catalog lacks, change an argument name or a plural category of the English message.
import type {MessageKey} from './en.ts';

export const fr: Record<MessageKey, string> = {
  'charts.failed': "La bibliothèque de graphiques n'a pas chargé",
  'config.title': 'Vérifiez la configuration du panneau',
  'config.intro':
    "{n, plural, one {Un réglage n'a pas pu être utilisé et a été ignoré} other {# réglages n'ont pas pu être utilisés et ont été ignorés}} :",
  'config.unknownKey': '{path} : réglage inconnu.',
  'config.unknownKeyHint': '{path} : réglage inconnu. Vouliez-vous écrire {hint}?',
  'config.unknownEntity': "{path} : ce n'est pas une entité que le panneau lit. Voir l'exemple de configuration.",
  'config.wrongType': '{path} : attendu {expected}, reçu {got}.',
  'config.notOneOf': '{path} : {got} ne fait pas partie de {options}.',
  'config.notAPair': '{path} : un lien doit relier exactement deux cartes.',
  'config.notATime': "{path} : {got} n'est pas une heure comme 20:00.",
  'config.missingKey': '{path} : {missing} est obligatoire.',
  'config.footer': 'Corrigez configuration.yaml, puis redémarrez Home Assistant.',
};
