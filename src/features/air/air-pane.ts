// <hp-air-pane>: the Air tab: on a phone the header with the summary and the card that opens the detail; on a tablet the header is there
// and not shown and the card is not drawn, since the detail panel the sheet host fills inline is the tab (#233 makes it an element).
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `airModel` runs in `willUpdate` and the template places what it
// returns; a store controller on `airIds` (ADR 0012), paused while the pane is off screen.
// Must not: read an entity itself (`readAir` does), hold a string the household reads, or open the sheet (the card asks).
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import {airIds} from './ids.ts';
import {readAir} from './inputs.ts';
import {airModel, type AirViewModel} from './model.ts';
import './air-card.ts'; // defines <hp-air-card>
import paneOwn from './air-pane.element.css?inline';
import {registriesOf} from '../../core/registry.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import type {Overlay} from '../../ui/overlay-store.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** No tap holds a value yet: the card says what the purifier reports. The detail's controls hold them (#233). */
const reported: Overlay = (_key, current) => current;

export class AirPane extends LitElement {
  static override properties = {
    active: {type: Boolean, reflect: true},
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to no entity and keeps what it drew. */
  declare active: boolean;

  // The element's own rules, its `:host` and the header's place, are in air-pane.element.css.
  static override styles = [common, unsafeCSS(forShadow(paneOwn))];

  private readonly storeController = new StoreController(this, {ids: store => airIds(store)});
  private readonly appearance = new AppearanceConsumer(this);
  private view: AirViewModel | undefined;

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
    this.view = airModel(readAir(hass.states, registriesOf(hass), store.names, store.config), {
      now: Date.now(),
      t: store.t,
      fmt: store.fmt,
      overlay: reported,
    });
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const {t} = this.storeController.store;
    const compact = this.appearance.value?.compact === true;
    return html`<hp-pane-header .icon=${'aq'} .color=${'var(--ok)'} .heading=${t('air.title')}>
        <div slot="sub">${view.summary}</div>
      </hp-pane-header>
      ${compact ? html`<hp-air-card .view=${view.card} .openLabel=${t('air.open')}></hp-air-card>` : nothing}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-air-pane': AirPane;
  }
}

if (!customElements.get('hp-air-pane')) customElements.define('hp-air-pane', AirPane);
