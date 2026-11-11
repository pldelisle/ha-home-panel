// <hp-media-pane>: the Media tab: the header with the summary, then on a tablet the television's card and the speakers' card.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `mediaModel` runs in `willUpdate` with the panel's held
// values and the template places what it returns, the pods keyed by id (Lit docs, repeat); a store controller on `mediaIds` (ADR 0012),
// paused while the pane is hidden, and an optimistic controller (ADR 0023), so a tap in a box or a pod draws the pane again at once.
// On a phone it draws the header only: the guest's `#mtiles` is the tiles' one drawer until #218.
// Must not: call the API (its children do), read an entity itself (`readMedia` does), or hold a string the household reads.
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {mediaIds} from './ids.ts';
import {readMedia} from './inputs.ts';
import {mediaModel, type MediaViewModel} from './model.ts';
import type {Overlay} from './commands.ts';
import './speaker-pod.ts'; // defines <hp-speaker-pod>
import './tv-box.ts'; // defines <hp-tv-box>
import paneOwn from './media-pane.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {OptimisticController} from '../../ui/controllers/optimistic.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {lensLike} from '../../ui/lens.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class MediaPane extends LitElement {
  static override properties = {
    active: {type: Boolean, reflect: true},
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to no entity and keeps what it drew. */
  declare active: boolean;

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
  }

  // The pause and the resume sit in willUpdate: a resume asks for an update, and one asked for here is this one.
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
      ${compact ? nothing : this.renderCards(view)}${lensLike(this.getRootNode())}`;
  }

  // the cards are the tablet's: the television's when the house has one, and the speakers', with the hint when it has none
  private renderCards({tv, speakers, speakersLine, labels}: MediaViewModel) {
    return html`${
        tv
          ? html`<div class="mcard">
              <hp-tv-box .tv=${tv}></hp-tv-box>
              <p class="hint">${tv.hint}</p>
            </div>`
          : nothing
      }
      <div class="mcard">
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
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-media-pane': MediaPane;
  }
}

if (!customElements.get('hp-media-pane')) customElements.define('hp-media-pane', MediaPane);
