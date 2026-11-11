// <hp-media-pane>: the Media tab: the header with the summary, then on a tablet the television's card and the speakers' card, on a phone
// a tile per player and the sheet a tile opens, with the card it names.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `mediaModel` runs in `willUpdate` with the panel's held
// values and the template places what it returns, keyed by id (Lit docs, repeat); a store controller on `mediaIds` (ADR 0012), paused
// while the pane is off screen, and an optimistic controller (ADR 0023), so a tap in a box, a pod or a tile draws the pane again at once.
// Must not: call the API (its children do), read an entity itself (`readMedia` does), hold a string the household reads, or open a sheet (it asks).
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {mediaIds} from './ids.ts';
import {readMedia} from './inputs.ts';
import {mediaModel, type MediaTileView, type MediaViewModel, type TvView} from './model.ts';
import type {Overlay} from './commands.ts';
import {CONTROLS_SHEET} from './sheets.ts';
import './media-tile.ts'; // defines <hp-media-tile>
import './speaker-pod.ts'; // defines <hp-speaker-pod>
import './tv-box.ts'; // defines <hp-tv-box>
import paneOwn from './media-pane.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {SheetDismissEvent} from '../../ui/events.ts';
import {lensLike} from '../../ui/lens.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import '../../ui/sheet.ts'; // defines <hp-sheet>
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class MediaPane extends LitElement {
  static override properties = {
    active: {type: Boolean, reflect: true},
    controlsKey: {},
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to no entity and keeps what it drew. */
  declare active: boolean;
  /** Bound by the registry's template to the tile whose controls the sheet host has open (`tv`, or a speaker's id), or undefined. */
  declare controlsKey: string | undefined;

  // The element's own rules, its `:host` and what only its tree has, are in media-pane.element.css.
  static override styles = [common, unsafeCSS(forShadow(paneOwn))];

  private readonly storeController = new StoreController(this, {ids: store => mediaIds(store)});
  private readonly appearance = new AppearanceConsumer(this);
  private readonly optimistic = new OptimisticController(this);
  private readonly overlay: Overlay = (key, current) => this.optimistic.read(key, current);
  private view: MediaViewModel | undefined;

  constructor() {
    super();
    this.active = false;
    this.controlsKey = undefined;
  }

  // The pause and the resume sit in willUpdate: a resume asks for an update, and one asked for here is this one. A tile's sheet
  // opens from the tab and over it, so it is on screen only while the pane is.
  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('active')) {
      if (this.active) this.storeController.resume();
      else this.storeController.pause();
    }
    if (!this.active) return;
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return;
    const registries = {entities: hass.entities, devices: hass.devices, areas: hass.areas};
    this.view = mediaModel(readMedia(hass.states, registries, store.names), {
      t: store.t,
      names: store.names,
      overlay: this.overlay,
    });
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const {t} = this.storeController.store;
    const compact = this.appearance.value?.compact === true;
    return html`<hp-pane-header .icon=${'tv'} .color=${'var(--c-home)'} .heading=${t('media.title')}>
        <div slot="sub">${view.summary}</div>
      </hp-pane-header>
      ${compact ? html`${this.renderTiles(view)}${this.renderSheet(view)}` : this.renderCards(view)}${lensLike(
        this.getRootNode(),
      )}`;
  }

  // the cards are the tablet's: the television's when the house has one, and the speakers'
  private renderCards(view: MediaViewModel) {
    return html`${view.tv ? this.renderTvCard(view.tv) : nothing}${this.renderSpeakersCard(view)}`;
  }

  private renderTvCard(tv: TvView) {
    return html`<div class="mcard">
      <hp-tv-box .tv=${tv}></hp-tv-box>
      <p class="hint">${tv.hint}</p>
    </div>`;
  }

  // the speakers' line, and the pods or the hint when the house has none
  private renderSpeakersCard({speakers, speakersLine, labels}: MediaViewModel) {
    return html`<div class="mcard">
      <div class="top"><span class="lbl">${labels.speakers}</span><span class="right">${speakersLine}</span></div>
      ${
        speakers.length
          ? html`<div class="pods">
              ${repeat(
                speakers,
                speaker => speaker.id,
                speaker => html`<hp-speaker-pod .speaker=${speaker}></hp-speaker-pod>`,
              )}
            </div>`
          : html`<p class="hint">${labels.noSpeakers}</p>`
      }
    </div>`;
  }

  // the phone's list: a tile per player, or the hint when the house has none
  private renderTiles({tiles, labels}: MediaViewModel) {
    return html`<div class="mtiles">
      ${
        tiles.length
          ? repeat(
              tiles,
              tile => tile.key,
              tile => html`<hp-media-tile .tile=${tile}></hp-media-tile>`,
            )
          : html`<p class="hint">${labels.noDevices}</p>`
      }
    </div>`;
  }

  // The sheet a tile asked for, which the host opens: the television's card, or the speakers' card a speaker's tile opens. It holds
  // a card only while open, so a closed sheet holds no box and no pod.
  private renderSheet(view: MediaViewModel) {
    const {t} = this.storeController.store;
    const tile: MediaTileView | undefined = view.tiles.find(tile => tile.key === this.controlsKey);
    return html`<hp-sheet
      .open=${tile !== undefined}
      .icon=${tile?.icon ?? 'tv'}
      .color=${'var(--c-home)'}
      .heading=${tile?.sheetTitle ?? ''}
      .closeLabel=${t('media.close')}
      @sheet-close=${this.dismissControls}
    >
      ${tile ? this.sheetCard(tile, view) : nothing}
    </hp-sheet>`;
  }

  // what a tile's sheet holds: the television's card for its tile, the speakers' card for a speaker's
  private sheetCard(tile: MediaTileView, view: MediaViewModel) {
    return tile.kind === 'tv' && view.tv ? this.renderTvCard(view.tv) : this.renderSpeakersCard(view);
  }

  // the sheet's Close button, its backdrop and its swipe: the host closes it, the pane only says so
  private readonly dismissControls = (e: Event): void => {
    e.stopPropagation();
    this.dispatchEvent(new SheetDismissEvent(CONTROLS_SHEET));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-media-pane': MediaPane;
  }
}

if (!customElements.get('hp-media-pane')) customElements.define('hp-media-pane', MediaPane);
