// t(key, values): the catalog message for the locale's language, compiled once per key and formatted with ICU.
// Pattern: ICU MessageFormat with CLDR plural rules through intl-messageformat, the FormatJS library Home Assistant's
// frontend uses; a lazy cache per key; English text when the language has no catalog.
// Must not: read the DOM, the clock or a global locale, or take a resolved display name as a key (names are values).
import {IntlMessageFormat} from 'intl-messageformat';
import {en, type MessageKey} from './en.ts';
import {fr} from './fr.ts';
import type {PanelLocaleSpec} from './locale.ts';

/** What a message's placeholders are filled with. */
export type MessageValues = Record<string, string | number | Date>;

/** One catalog per language, keyed by the bare language; a third language is a third file and a line here. */
export type Catalogs = Record<string, Record<MessageKey, string>>;

export interface Messages {
  readonly t: <K extends MessageKey>(key: K, values?: MessageValues) => string;
}

const shipped: Catalogs = {en, fr};

export function createMessages(
  locale: Pick<PanelLocaleSpec, 'language' | 'tag'>,
  catalogs: Catalogs = shipped,
): Messages {
  const catalog = catalogs[locale.language] ?? catalogs.en;
  const compiled = new Map<MessageKey, IntlMessageFormat<MessageValues>>();
  return {
    t(key, values) {
      let format = compiled.get(key);
      if (!format) {
        format = new IntlMessageFormat<MessageValues>(catalog[key], locale.tag);
        compiled.set(key, format);
      }
      return String(format.format(values));
    },
  };
}
