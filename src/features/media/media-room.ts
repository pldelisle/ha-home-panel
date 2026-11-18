// <hp-media-room>: the Media part of a room view: the room's speakers and, when it sits there, the television, as the tiles of the Media tab.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over `mediaRoomTiles`, the Media model cut to one area (ADR 0039): the same
// `<hp-media-tile>`s, read by `readMedia`, that switch through the same commands the tab's tiles do. A tap on a tile asks for `CONTROLS_SHEET`,
// which the Media pane draws and stays in the page behind (`overSheets`), so the room view stays; a held tap (ADR 0023) draws this part at once.
// Must not: draw a sheet, call the API (the tile does), read an entity itself (`readMedia` does), or hold a string the household reads.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {mediaIds} from './ids.ts';
import {readMedia} from './inputs.ts';
import {mediaRoomTiles, type MediaTileView} from './model.ts';
import './media-tile.ts'; // defines <hp-media-tile>
import roomOwn from './media-room.element.css?inline';
import {registriesOf} from '../../core/registry.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import type {Overlay} from '../../ui/overlay-store.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class MediaRoom extends LitElement {
  static override properties = {
    areaId: {},
  };
  /** The area of the room shown, set by the room view. */
  declare areaId: string;

  // The element's own rules, its `:host` and what only its tree has, are in media-room.element.css.
  static override styles = [common, unsafeCSS(forShadow(roomOwn))];

  // the element exists only while its room is shown, so it listens only then
  private readonly storeController = new StoreController(this, {ids: store => mediaIds(store)});
  private readonly appearance = new AppearanceConsumer(this);
  private readonly optimistic = new OptimisticController(this);
  private readonly overlay: Overlay = (key, current) => this.optimistic.read(key, current);
  private tiles: MediaTileView[] = [];

  constructor() {
    super();
    this.areaId = '';
  }

  protected override willUpdate(): void {
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return;
    this.tiles = mediaRoomTiles(readMedia(hass.states, registriesOf(hass), store.names), this.areaId, {
      t: store.t,
      names: store.names,
      overlay: this.overlay,
    });
  }

  protected override render() {
    if (!this.tiles.length) return nothing;
    return html`<div class="mrtiles">
      ${repeat(
        this.tiles,
        tile => tile.key,
        tile => html`<hp-media-tile .tile=${tile}></hp-media-tile>`,
      )}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-media-room': MediaRoom;
  }
}

if (!customElements.get('hp-media-room')) customElements.define('hp-media-room', MediaRoom);
