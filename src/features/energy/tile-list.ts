// tileList: the tiles of Hilo's card, each a label, a figure with its small unit and a line under it when there is one.
// Pattern: template function (Lit docs, Templates), keyed by `repeat` on the label, so the card writes the kit's tile (`src/ui/tile.ts`) once.
// Must not: word a string (the model does), carry a style (the kit's tiles.css and each card's own rules do), or know which card calls it.
import {html, nothing, type TemplateResult} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import type {EnergyTile} from './model.ts';
import {figureCell} from '../../ui/figure-cell.ts';
import {tile as kitTile} from '../../ui/tile.ts';

/** The tiles' wells, to place inside a card's `.tiles` grid; a tile without a sub-line draws none. */
export function tileList(tiles: readonly EnergyTile[]): TemplateResult {
  return html`${repeat(
    tiles,
    tile => tile.label,
    tile =>
      kitTile(
        html`<div class="k">${tile.label}</div>
          ${figureCell(tile)} ${tile.sub ? html`<div class="s">${tile.sub}</div>` : nothing}`,
      ),
  )}`;
}
