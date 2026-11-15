// tileList: the tiles of the Energy card and of Hilo's card, each a label, a figure with its small unit and a line under it when there is one.
// Pattern: template function (Lit docs, Templates), keyed by `repeat` on the label, so the two cards write the kit's `.tile` markup once.
// Must not: word a string (the model does), carry a style (the kit's tiles.css and each card's own rules do), or know which card calls it.
import {html, nothing, type TemplateResult} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import type {EnergyTile} from './model.ts';

/** The tiles' wells, to place inside a card's `.tiles` grid; a tile without a sub-line draws none. */
export function tileList(tiles: readonly EnergyTile[]): TemplateResult {
  return html`${repeat(
    tiles,
    tile => tile.label,
    tile =>
      html`<div class="tile">
        <div class="k">${tile.label}</div>
        <div class="v num">${tile.value}<small>${tile.unit}</small></div>
        ${tile.sub ? html`<div class="s">${tile.sub}</div>` : nothing}
      </div>`,
  )}`;
}
