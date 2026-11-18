// renderUnit: one block of the Lights tiles as the Lights pane and a room view both draw it: a tile, or a linked pair side by side.
// Pattern: one template function two elements share (ADR 0019's one-source rule, as `sheet-rows.css` is for the sheet's rows): the grid it sits in is
// `unit-rows.css`, which both elements adopt through `forShadow`.
// Must not: read the store, send a command, or know whether it is in the pane or a room: Arrange's `lifted` and `editing` come in as arguments.
import {html} from 'lit';
import {styleMap} from 'lit/directives/style-map.js';
import type {Unit} from './model.ts';
import './light-tile.ts'; // defines <hp-light-tile>

/** `lifted` is Arrange's unit under the finger (its class), `editing` that Arrange is on; a room view has neither. */
export interface UnitState {
  lifted?: boolean;
  editing?: boolean;
}

export function renderUnit({key, tiles}: Unit, {lifted = false, editing = false}: UnitState = {}) {
  const lift = lifted ? 'lifted' : '';
  if (tiles.length === 1)
    return html`<hp-light-tile class=${lift} data-unit=${key} .tile=${tiles[0]} .editing=${editing}></hp-light-tile>`;
  return html`<div
    class="llink on ${lift}"
    data-unit=${key}
    style=${styleMap({'--lc': tiles[0].pairTint || undefined})}
  >
    <hp-light-tile .tile=${tiles[0]} .editing=${editing}></hp-light-tile
    ><hp-light-tile .tile=${tiles[1]} .editing=${editing}></hp-light-tile>
  </div>`;
}
