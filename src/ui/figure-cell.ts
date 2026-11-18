// figureCell: the figure of a kit tile, a hero or a tire, drawn from a `Reading`.
// Pattern: template function (Lit docs, Templates), the element side of `reading.ts`: a figure is the `.v` with its small unit; the words
// for no reading are the kit's `.na` (common.css), in the line's style and without the figure's classes, so no figure size competes with them.
// Must not: format or word a string (the model does), carry a style, or be imported by a model (`reading.ts` is the pure half).
import {html, type TemplateResult} from 'lit';
import type {Reading} from './reading.ts';

/** `word`: the figure is a word ("Charging"), which the figure's own style writes smaller (Car's `.word`). */
export const figureCell = ({value, unit, missing, word}: Reading & {word?: boolean}): TemplateResult =>
  missing
    ? html`<div class="na">${value}</div>`
    : html`<div class="v num">${word ? html`<span class="word">${value}</span>` : value}<small>${unit}</small></div>`;
