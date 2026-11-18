// <hp-climate-room>: the Climate part of a room view: the room's thermostat as the Climate tab's phone tile draws it.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over `climateItemsIn`, the tab's own `climateItems` cut to one area (ADR 0039): the same tile
// (`climateTile`), worded by the same function, in the same grid. A tap asks for the tab's detail sheet on that room (`DETAIL_SHEET`), which the Climate
// pane draws over the screen and stays in the page behind (`over`), so the room view stays.
// Must not: draw a sheet, send a command (a room view only shows), read an entity itself (`readClimate` does), or import the shell or another feature.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import roomOwn from './climate-room.element.css?inline';
import tilesOwn from './climate-tiles.css?inline';
import {climateTile} from './climate-tiles.ts';
import {climateIds} from './ids.ts';
import {readClimate} from './inputs.ts';
import type {ClimateItem} from './items.ts';
import {climateItemsIn} from './room-items.ts';
import {DETAIL_SHEET} from './sheets.ts';
import {registriesOf} from '../../core/registry.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {SheetRequestEvent} from '../../ui/events.ts';
import type {TileOpenDetail} from '../../ui/stat-tile.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class ClimateRoom extends LitElement {
  static override properties = {
    areaId: {},
  };
  /** The area of the room shown, set by the room view. */
  declare areaId: string;

  // The element's own rules, its `:host`, are in climate-room.element.css; the grid is the tab's.
  static override styles = [common, unsafeCSS(forShadow(tilesOwn)), unsafeCSS(forShadow(roomOwn))];

  private readonly storeController = new StoreController(this, {ids: store => climateIds(store)});
  // `large-text` comes from the shell as a host attribute the grid's rules test
  private readonly appearance = new AppearanceConsumer(this);
  private items: ClimateItem[] = [];

  constructor() {
    super();
    this.areaId = '';
  }

  protected override willUpdate(): void {
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return;
    const registries = registriesOf(hass);
    this.items = climateItemsIn(readClimate(hass.states, registries, store.config), this.areaId, registries, {
      t: store.t,
      fmt: store.fmt,
      names: store.names,
      language: store.language,
    });
  }

  protected override render() {
    if (!this.items.length) return nothing;
    return html`<div class="ctiles2" @tile-open=${this.onTile}>
      ${repeat(
        this.items,
        ({id}) => id,
        item => climateTile(item),
      )}
    </div>`;
  }

  // a tile's tap: the tab's detail opens on that room, over the room view
  private readonly onTile = (e: CustomEvent<TileOpenDetail>): void => {
    e.stopPropagation();
    this.dispatchEvent(new SheetRequestEvent(DETAIL_SHEET, {sel: e.detail.key}));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-climate-room': ClimateRoom;
  }
}

if (!customElements.get('hp-climate-room')) customElements.define('hp-climate-room', ClimateRoom);
