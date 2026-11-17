// tileList: the tiles of the Energy card and of Hilo's card, each a label, a figure with its small unit and a line under it when there is one.
// Pattern: template function (Lit docs, Templates), keyed by `repeat` on the label, so the two cards write the kit's `.tile` markup once; a tile that
// carries a range, where the caller listens for it, is the kit's `.tilebtn` button with its chevron and hands that range to the caller.
// Must not: word a string (the model does), carry a style (the kit's tiles.css and each card's own rules do), or know which card calls it.
import {html, nothing, type TemplateResult} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import type {EnergyRange} from './charts.ts';
import type {EnergyTile} from './model.ts';

/**
 * The tiles' wells, to place inside a card's `.tiles` grid; a tile without a sub-line draws none. With `onRange` and `opens` (the words a screen
 * reader adds), a tile that carries a range is a button that calls `onRange` with it; the others stay plain wells.
 */
export function tileList(
  tiles: readonly EnergyTile[],
  target?: {onRange: (range: EnergyRange) => void; opens: string},
): TemplateResult {
  return html`${repeat(
    tiles,
    tile => tile.label,
    tile => {
      const body = html`<div class="k">${tile.label}</div>
        <div class="v num">${tile.value}<small>${tile.unit}</small></div>
        ${tile.sub ? html`<div class="s">${tile.sub}</div>` : nothing}`;
      const {range} = tile;
      if (!target || range === undefined) return html`<div class="tile">${body}</div>`;
      return html`<button
        type="button"
        class="tile tilebtn"
        aria-description=${target.opens}
        @click=${() => target.onRange(range)}
      >
        ${body}
      </button>`;
    },
  )}`;
}
