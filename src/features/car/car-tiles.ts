// carTiles: the tiles of the Car detail's blocks, each a label, a figure with its small unit and the line under it when there is one.
// Pattern: template function (Lit docs, Templates), keyed by `repeat` on the label, so the four blocks that have tiles write the kit's `.tile` markup once; a figure that is a word is written in `.word`.
// Must not: word a string (the model does), carry a style (the kit's tiles.css and styles.css do), or know which block calls it.
import {html, nothing, type TemplateResult} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import type {CarTile} from './model.ts';

/** The tiles' wells, to place inside a block's `.tiles` grid; a tile without a sub-line draws none. */
export const carTiles = (tiles: readonly CarTile[]): TemplateResult =>
  html`${repeat(
    tiles,
    tile => tile.label,
    tile =>
      html`<div class="tile">
        <div class="k">${tile.label}</div>
        <div class="v num">
          ${tile.word ? html`<span class="word">${tile.value}</span>` : tile.value}<small>${tile.unit}</small>
        </div>
        ${tile.sub ? html`<div class="s">${tile.sub}</div>` : nothing}
      </div>`,
  )}`;
