// tile: the kit's value tile as one template: a well (`div.tile`) that shows a value, or, given where it leads, the control (`button.tile.tilebtn`).
// Pattern: template function (Lit docs, Templates) over the kit's two surfaces (docs/design.md, "Three surfaces"): a tile that opens something is a
// button with a chevron (tiles.css) and a screen-reader description of where it leads (`aria-description`, so its name stays its figure); one
// that opens nothing is a flat `div` with no pointer. The Climate detail, Energy's totals and Air's readings each wrote this branch by hand.
// Must not: word a string (the caller hands the description), carry a style (tiles.css does), or know which pane calls it.
import {html, type TemplateResult} from 'lit';
import {classMap, type ClassInfo} from 'lit/directives/class-map.js';

/** Where a tile leads: the words a screen reader adds ("Opens the history", "Shows its chart") and what a tap does. */
export interface TileLeads {
  description: string;
  onTap: () => void;
}

/** What else a tile wears: classes the caller's own rules use (a range tile's span, a highlighted figure). */
export interface TileOptions {
  leads?: TileLeads;
  classes?: ClassInfo;
}

/** A tile around `body` (its label, figure and line): a button with a chevron when it `leads` somewhere, else a well. */
export function tile(body: TemplateResult, {leads, classes = {}}: TileOptions = {}): TemplateResult {
  if (!leads) return html`<div class=${classMap({tile: true, ...classes})}>${body}</div>`;
  const {description, onTap} = leads;
  return html`<button
    type="button"
    class=${classMap({tile: true, tilebtn: true, ...classes})}
    aria-description=${description}
    @click=${onTap}
  >
    ${body}
  </button>`;
}
