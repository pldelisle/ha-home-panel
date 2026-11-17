// <hp-light-tile>: one room of the Lights tab as an Apple Home tile: the bulb switches it, the rest of the tile opens the room's sheet.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `TileView`: it draws what it is given and says what was tapped,
// with events up (Lit docs, Events); the tile is two sibling buttons, the row that opens the room and the bulb that switches it, never one
// inside the other (Apple HIG, Lists and tables: an accessory sits beside the row's own action).
// Must not: run a service call (the pane does), read the store or an entity, hold a string the household reads, or open a sheet itself.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {styleMap} from 'lit/directives/style-map.js';
import type {TileView} from './model.ts';
import tileOwn from './light-tile.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {SheetRequestEvent} from '../../ui/events.ts';
import {ico} from '../../ui/icons.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';
import {ROOM_SHEET} from './sheets.ts';

/** The tile's bulb was tapped: the pane switches the room (and its partner) on or off. */
export class AreaToggleEvent extends CustomEvent<{key: string}> {
  constructor(key: string) {
    super('area-toggle', {bubbles: true, composed: true, detail: {key}});
  }
}

export class LightTile extends LitElement {
  static override properties = {
    tile: {attribute: false},
    editing: {type: Boolean, reflect: true},
  };
  declare tile: TileView | undefined;
  /** Arrange is on: the grip shows, the chevron hides, and a tap neither switches nor opens. */
  declare editing: boolean;

  // The element's own rules, its `:host` and what only its tree has, are in light-tile.element.css.
  static override styles = [common, unsafeCSS(forShadow(tileOwn))];

  constructor() {
    super();
    // `compact` and `glass` come from the shell as host attributes the tile's rules test
    new AppearanceConsumer(this);
    this.tile = undefined;
    this.editing = false;
  }

  // Whitespace between the parts draws nothing: the tile and its text are flex boxes.
  protected override render() {
    const tile = this.tile;
    if (!tile) return nothing;
    // two siblings: the row (name, level, chevron) opens the room, the bulb switches it. The row fills the tile and the bulb
    // sits over its left padding, so the whole tile is still one tap.
    return html`<div
      class="lcell${tile.on ? ' on' : ''}${tile.available ? '' : ' na'}"
      data-lsheet=${tile.key}
      style=${styleMap({'--lc': tile.tint || undefined})}
    >
      <button
        type="button"
        class="lbulb"
        role="switch"
        aria-checked=${tile.on ? 'true' : 'false'}
        aria-label=${tile.bulbLabel}
        data-a=${tile.key}
        ?disabled=${!tile.available}
        @click=${this.onBulb}
      >
        ${ico('bulb', 22)}
      </button>
      <button type="button" class="lrow" data-lsheet=${tile.key} aria-label=${tile.label} @click=${this.onTap}>
        <span class="tx"
          ><b>${tile.name}</b>
          <small
            >${tile.sub}${
              tile.linkedWith ? html` · <em class="lkd">${ico('link', 13)}${tile.linkedWith}</em>` : nothing
            }</small
          ></span
        ><span class="lchev" aria-hidden="true">${ico('chev', 18)}</span
        ><span class="lgrip" aria-hidden="true">${ico('grip', 20)}</span>
      </button>
    </div>`;
  }

  private readonly onBulb = (e: Event): void => {
    e.stopPropagation();
    if (this.editing || !this.tile) return;
    this.dispatchEvent(new AreaToggleEvent(this.tile.key));
  };

  // a tap on the row opens the room, except while arranging (Enter and Space on it are taps: it is a button)
  private readonly onTap = (): void => {
    if (this.editing || !this.tile) return;
    this.dispatchEvent(new SheetRequestEvent(ROOM_SHEET, {key: this.tile.key}));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-light-tile': LightTile;
  }
  interface HTMLElementEventMap {
    'area-toggle': AreaToggleEvent;
  }
}

if (!customElements.get('hp-light-tile')) customElements.define('hp-light-tile', LightTile);
