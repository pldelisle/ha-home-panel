// <hp-air-area>: the Air part of a room view: the room's purifier cards, as the Air tab draws them, and a button to the whole detail.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over `roomDetailsIn`, the Air model cut to one area (ADR 0039): the same `<hp-air-room>` cards,
// read by `readAir`, and a card runs the same commands as on the Air tab. A tile's tap asks for its history (`air.history`) and the button for the
// detail (`air.detail`); the Air pane stays in the page behind them (`overSheets`, `detailSheet` over a room), so the room view stays.
// Must not: draw a sheet, call the API (the cards do, through their commands), read an entity itself, or hold a string the household reads.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import './room-card.ts'; // defines <hp-air-room>
import areaOwn from './air-area.element.css?inline';
import {airIds} from './ids.ts';
import {readAir} from './inputs.ts';
import {roomDetailsIn, type RoomDetail} from './model.ts';
import {DETAIL_SHEET} from './sheets.ts';
import {registriesOf} from '../../core/registry.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {SheetRequestEvent} from '../../ui/events.ts';
import type {Overlay} from '../../ui/overlay-store.ts';
import {button, common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class AirArea extends LitElement {
  static override properties = {
    areaId: {},
  };
  /** The area of the room shown, set by the room view. */
  declare areaId: string;

  // The kit's button; the element's own rules, its `:host` and the cards' column, are in air-area.element.css.
  static override styles = [common, button, unsafeCSS(forShadow(areaOwn))];

  private readonly storeController = new StoreController(this, {ids: store => airIds(store)});
  private readonly appearance = new AppearanceConsumer(this);
  // a held mode or speed shows in the card at once (ADR 0023), as on the Air tab
  private readonly optimistic = new OptimisticController(this);
  private readonly overlay: Overlay = (key, current) => this.optimistic.read(key, current);
  private rooms: RoomDetail[] = [];

  constructor() {
    super();
    this.areaId = '';
  }

  protected override willUpdate(): void {
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return;
    const inputs = readAir(hass.states, registriesOf(hass), store.names, store.config);
    this.rooms = roomDetailsIn(inputs, this.areaId, {
      now: Date.now(),
      t: store.t,
      fmt: store.fmt,
      overlay: this.overlay,
    });
  }

  protected override render() {
    if (!this.rooms.length) return nothing;
    return html`${repeat(
        this.rooms,
        room => room.id,
        room => html`<hp-air-room .room=${room}></hp-air-room>`,
      )}
      <button class="abtn" type="button" @click=${this.openDetail}>
        ${this.storeController.store.t('air.roomDetails')}
      </button>`;
  }

  // the whole detail, over the room view: the detail does not focus one room, so the button asks for it as Home's tile does
  private readonly openDetail = (): void => {
    this.dispatchEvent(new SheetRequestEvent(DETAIL_SHEET));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-air-area': AirArea;
  }
}

if (!customElements.get('hp-air-area')) customElements.define('hp-air-area', AirArea);
