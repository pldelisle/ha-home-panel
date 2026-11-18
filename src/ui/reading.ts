// The reading: a figure and its unit, or the plain words for no reading and no unit, on every tile that shows one.
// Pattern: Special Case (Fowler, Patterns of Enterprise Application Architecture): the one place a missing value (`null`) becomes the
// kit's word ("No reading", `common.noReading`) flagged `missing`, so no feature writes a placeholder glyph, and `figureCell`
// draws either case in the kit's `.tile .v`, so a tile is never a dash beside a unit (Apple HIG: plain language, not placeholders).
// Must not: format a number (the formatters do), know which tile it is for, or carry a style (the kit's tiles.css does).
import {html, type TemplateResult} from 'lit';
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

/** The `.v` of a kit tile: the figure with its small unit, or the words for no reading in the line's style. */
export const figureCell = ({value, unit, missing}: Reading): TemplateResult =>
  missing ? html`<div class="v na">${value}</div>` : html`<div class="v num">${value}<small>${unit}</small></div>`;
