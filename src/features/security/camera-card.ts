// <hp-camera-card>: the Security tab's cameras: a snapshot per camera with its name and motion line, or the empty state with its link.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `cameras` view, tiles keyed by id (Lit docs, repeat) so a
// new stamp on a snapshot's URL swaps the `src` and keeps the node; a tap asks the shell for the camera's sheet (ADR 0021).
// Must not: read an entity or the clock, word a string, or open the sheet (it asks).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import type {CameraTile, SecurityViewModel} from './model.ts';
import {CAMERA_SHEET} from './sheets.ts';
import cardOwn from './camera-card.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {SheetRequestEvent} from '../../ui/events.ts';
import {ico} from '../../ui/icons.ts';
import {lens} from '../../ui/lens.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** Where "Add UniFi Protect" leads: Home Assistant's own page for the integration, in the top window, not the panel's frame. */
const ADD_PROTECT_URL = '/config/integrations/dashboard/add?domain=unifiprotect';

export class CameraCard extends LitElement {
  static override properties = {
    view: {attribute: false},
  };
  /** The model's cameras: the title and count, the empty state's words, and the tiles. */
  declare view: SecurityViewModel['cameras'] | undefined;

  // The element's own rules, the card's chrome as the host's and what only its tree has, are in camera-card.element.css.
  static override styles = [common, unsafeCSS(forShadow(cardOwn))];

  constructor() {
    super();
    // `glass` and `compact` come from the shell as host attributes the element's rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    // the box is an inner element: the glass's lens is looked up from the root the rule's element is in, and a host is in the pane's
    return html`<div class="camcard">
        <div class="top"><span class="lbl">${view.title}</span><span class="right">${view.count}</span></div>
        ${view.empty ? this.renderEmpty(view.emptyText) : this.renderGrid(view.tiles)}
      </div>
      ${lens}`;
  }

  private renderEmpty({title, hint, link}: SecurityViewModel['cameras']['emptyText']) {
    return html`<div class="camempty">
      ${ico('cam', 34)}
      <div>
        <b>${title}</b><span>${hint}</span>
        <a class="more" href=${ADD_PROTECT_URL} target="_top">${link}</a>
      </div>
    </div>`;
  }

  private renderGrid(tiles: readonly CameraTile[]) {
    return html`<div class="camgrid">
      ${repeat(
        tiles,
        tile => tile.id,
        tile => this.renderTile(tile),
      )}
    </div>`;
  }

  // a tile with no snapshot (the camera is offline, or has none) draws the camera's icon in its place
  private renderTile(tile: CameraTile) {
    // lit-analyzer does not know `aria-description` (a screen reader reads it after the name); the ignore covers this one tag
    return html`<!-- @ts-ignore -->
      <button type="button" class="cam" data-id=${tile.id} aria-description=${tile.label} @click=${this.open}>
        ${
          tile.picture
            ? html`<img src=${tile.picture} alt="" loading="lazy" />`
            : html`<span class="camoff">${ico('cam', 26)}</span>`
        }<span class="camlbl"
          ><b>${tile.name}</b><small>${tile.moving ? html`<i class="mdot"></i>` : nothing}${tile.when}</small></span
        >
      </button>`;
  }

  // an arrow field, so the template hands the same function at every render
  private readonly open = (e: Event): void => {
    const id = (e.currentTarget as HTMLElement).dataset.id;
    if (id) this.dispatchEvent(new SheetRequestEvent(CAMERA_SHEET, {id}));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-camera-card': CameraCard;
  }
}

if (!customElements.get('hp-camera-card')) customElements.define('hp-camera-card', CameraCard);
