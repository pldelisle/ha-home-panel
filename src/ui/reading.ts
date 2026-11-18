// The reading: a figure and its unit, or the plain words for no reading and no unit, on every tile that shows one.
// Pattern: Special Case (Fowler, Patterns of Enterprise Application Architecture): the one place a missing value (`null`, which the
// formatters' figure forms give for `null`) becomes the kit's word ("No reading", `common.noReading`) flagged `missing`, so no
// feature writes a placeholder glyph beside a unit (Apple HIG: plain language, not placeholders). `figureCell` draws it.
// Must not: format a number (the formatters do), import Lit or the DOM (a model imports this; the elements import `figure-cell.ts`), or know which tile it is for.
import type {Translate} from '../core/i18n/messages.ts';

/** A figure and the unit written small after it; `missing` says `value` is the word for no reading, and `unit` is empty. */
export interface Reading {
  value: string;
  unit: string;
  missing?: true;
}

/** The text of a figure with its unit, or the word for no reading: `null` (the sensor said nothing) is the only way to say there is none. */
export const reading = (t: Translate, value: string | null, unit: string): Reading =>
  value === null ? {value: t('common.noReading'), unit: '', missing: true} : {value, unit};

/** A figure that carries its unit in its text (`4.2°`, `3.2 kW`), as a Home glance, a list item or a stat tile writes it: the text, or the words for no reading with `missing`. */
export const bareReading = (t: Translate, value: string | null): Pick<Reading, 'value' | 'missing'> => {
  const {value: text, missing} = reading(t, value, '');
  return missing ? {value: text, missing} : {value: text};
};
