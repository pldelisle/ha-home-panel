// <hp-more-sheet>: the phone's More sheet, the sections the bar does not hold, one summary tile each, in its own shadow root.
// Pattern: humble object (Meszaros, xUnit Test Patterns) drawn from the registry, composing the kit's <hp-sheet> for its chrome;
// properties down, events up (Lit docs, Events): a tile's `tile-open` becomes the kit's `TabSelectEvent`; the sheet's `sheet-close` passes through.
// Below the sections it lists the rooms, a Rooms heading and a row for each, since the phone has no sidebar (ADR 0039, #511): the kit's list rows (`.arow`).
// Must not: draw a sheet's chrome, choose the tab, listen for Escape or know which sheet is open (the shell and its host do), or import a feature.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {AppearanceConsumer} from '../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../ui/controllers/store-controller.ts';
import '../ui/sheet.ts';
import '../ui/stat-tile.ts';
import type {TileOpenDetail} from '../ui/stat-tile.ts';
import {ico} from '../ui/icons.ts';
import {common, list, more} from '../ui/styles/index.ts';
import type {FeatureDescriptor, FeatureKey} from '../ui/feature.ts';
import {TabSelectEvent} from '../ui/events.ts';
import {isFeatureKey} from './features.ts';
import {roomIcon, type Room} from './room.ts';
import moreSheetOwn from './more-sheet.element.css?inline';
import {forShadow} from '../ui/styles/host.ts';

export class MoreSheet extends LitElement {
  static override properties = {
    features: {attribute: false},
    shown: {attribute: false},
    rooms: {attribute: false},
    roomColor: {},
    summaries: {attribute: false},
    current: {},
    open: {type: Boolean, reflect: true},
  };
  /** The sections it lists: the registry's descriptors that the phone's bar does not hold. */
  declare features: readonly FeatureDescriptor[];
  /** Which tabs this house shows; a section it hides is not listed. */
  declare shown: Readonly<Partial<Record<FeatureKey, boolean>>>;
  /** The rooms of the house, from the shell (`roomList`): a row each under the sections. */
  declare rooms: readonly Room[];
  /** The colour token of the rooms' icons: Home's. */
  declare roomColor: string;
  /** The word under each section, in the panel's language; none for a section that has nothing to say. */
  declare summaries: Readonly<Partial<Record<FeatureKey, string | null>>>;
  /** The tab shown: its tile carries the ring. */
  declare current: FeatureKey;
  declare open: boolean;

  // `display: contents`: the sheet is `position: fixed`, so the host takes no room in the frame it sits in
  // The element's own rules, its `:host` and what only its tree has, are in more-sheet.element.css.
  static override styles = [common, more, list, unsafeCSS(forShadow(moreSheetOwn))];

  // the sheet's words are catalog messages, so it asks the store for `t`; it reads no entity
  private readonly store = new StoreController(this, {ids: () => []});
  // `compact` and `large-text` as host attributes, which the list's rule tests
  private readonly appearance = new AppearanceConsumer(this);

  constructor() {
    super();

    this.features = [];
    this.shown = {};
    this.rooms = [];
    this.roomColor = 'var(--c-grid)';
    this.summaries = {};
    this.current = 'home';
    this.open = false;
  }

  protected override render() {
    const {t} = this.store.store;
    return html`<hp-sheet
      .open=${this.open}
      .icon=${'more'}
      .color=${'var(--c-home)'}
      .heading=${t('more.title')}
      .closeLabel=${t('more.close')}
    >
      <div slot="sub">${t('more.sub')}</div>
      <div class="morelist" id="morelist">${this.open ? this.renderTiles() : nothing}</div>
      ${this.open ? this.renderRooms() : nothing}
    </hp-sheet>`;
  }

  // The tiles exist only while the sheet is open: a tablet never opens it, and a phone draws six tiles when it is asked to.
  private renderTiles() {
    const {t} = this.store.store;
    return repeat(
      this.features.filter(f => this.shown[f.key] !== false),
      f => f.key,
      f =>
        html`<hp-stat-tile
          .key=${f.key}
          .icon=${f.icon}
          .size=${22}
          .label=${t(f.title)}
          .sub=${this.summaries[f.key] ?? ''}
          .color=${f.color}
          .tone=${f.key === this.current ? 'list sel' : 'list'}
          @tile-open=${this.select}
        ></hp-stat-tile>`,
    );
  }

  // One row for each room, under a Rooms heading; a tap asks for the room as a tile asks for its section.
  private renderRooms() {
    if (!this.rooms.length) return nothing;
    const {t} = this.store.store;
    return html`<h3 class="roomshead" id="roomshead">${t('nav.rooms')}</h3>
      <div class="att morerooms" id="morerooms" role="group" aria-labelledby="roomshead">
        ${repeat(
          this.rooms,
          room => room.areaId,
          room =>
            html`<button
              type="button"
              class="arow"
              data-room=${room.areaId}
              @click=${() => this.selectRoom(room.areaId)}
            >
              <span class="ic acc" style="--acc: ${this.roomColor}">${ico(roomIcon(room.name), 20)}</span>
              <span class="at"><b>${room.name}</b></span>
            </button>`,
        )}
      </div>`;
  }

  private selectRoom(areaId: string): void {
    this.dispatchEvent(new TabSelectEvent({room: areaId}));
  }

  // A tile says which one was tapped; the shell decides what that does, so the sheet turns it into its own event.
  private readonly select = (e: CustomEvent<TileOpenDetail>): void => {
    e.stopPropagation();
    const {key} = e.detail;
    if (isFeatureKey(key)) this.dispatchEvent(new TabSelectEvent(key));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-more-sheet': MoreSheet;
  }
}

if (!customElements.get('hp-more-sheet')) customElements.define('hp-more-sheet', MoreSheet);
