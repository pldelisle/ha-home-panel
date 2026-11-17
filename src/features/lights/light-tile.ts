// <hp-light-tile>: one room of the Lights tab as an Apple Home tile: the bulb switches it, the rest of the tile opens the room's sheet.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `TileView`: it draws what it is given and says what was tapped,
// with events up (Lit docs, Events); the bulb's `role=switch` inside the tile's `role=button` is today's markup (#192 fixes the nesting).
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

/** The room's sheet, which the legacy panel still draws until #262 moves it to the feature. */
export const ROOM_SHEET = 'sh-light';

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
    return html`<div
      class="lcell${tile.on ? ' on' : ''}${tile.available ? '' : ' na'}"
      data-lsheet=${tile.key}
      role="button"
      tabindex="0"
      aria-label=${tile.label}
      style=${styleMap({'--lc': tile.tint || undefined})}
      @click=${this.onTap}
      @keydown=${this.onKey}
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
      <span class="tx"
        ><b>${tile.name}</b>
        <small
          >${tile.sub}${
            tile.linkedWith ? html` · <em class="lkd">${ico('link', 13)}${tile.linkedWith}</em>` : nothing
          }</small
        ></span
      ><span class="lchev" aria-hidden="true">${ico('chev', 18)}</span
      ><span class="lgrip" aria-hidden="true">${ico('grip', 20)}</span>
    </div>`;
  }

  private readonly onBulb = (e: Event): void => {
    e.stopPropagation();
    if (this.editing || !this.tile) return;
    this.dispatchEvent(new AreaToggleEvent(this.tile.key));
  };

  // a tap anywhere but the bulb opens the room, except while arranging
  private readonly onTap = (): void => {
    if (this.editing || !this.tile) return;
    this.dispatchEvent(new SheetRequestEvent(ROOM_SHEET, {key: this.tile.key}));
  };

  // Enter or Space on the tile itself opens the room, like a tap (the bulb is its own button)
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.target !== e.currentTarget || this.editing || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    this.onTap();
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
