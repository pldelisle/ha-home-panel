// <hp-security-pane>: the Security tab: the header with the summary, the cameras' card and the doors-and-motion card.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `securityModel` runs in `willUpdate` and the template
// only places what it returns; a store controller on `securityIds` (ADR 0012), paused while the pane is off screen, and the kit's
// tick controller, which draws again every ten seconds: that is what asks a camera for a new snapshot.
// Must not: read an entity itself (`readSecurity` does), hold a string the household reads, or open a sheet (its cards ask).
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import {securityIds} from './ids.ts';
import {readSecurity} from './inputs.ts';
import {SNAPSHOT_MS, securityModel, type SecurityViewModel} from './model.ts';
import './camera-card.ts'; // defines <hp-camera-card>
import './sensor-card.ts'; // defines <hp-sensor-card>
import paneOwn from './security-pane.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {TickController} from '../../ui/controllers/tick.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class SecurityPane extends LitElement {
  static override properties = {
    active: {type: Boolean, reflect: true},
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to no entity, draws no snapshot and keeps what it drew. */
  declare active: boolean;

  // The element's own rules, its `:host` and the header's place, are in security-pane.element.css.
  static override styles = [common, unsafeCSS(forShadow(paneOwn))];

  private readonly storeController = new StoreController(this, {ids: store => securityIds(store)});
  private view: SecurityViewModel | undefined;

  constructor() {
    super();
    this.active = false;
    // `compact` comes from the shell as a host attribute the pane's rules test
    new AppearanceConsumer(this);
    // its timer starts when the pane connects and is cleared when it disconnects; a tick while the pane or the browser tab is hidden is skipped, as the legacy interval's was
    new TickController(this, SNAPSHOT_MS, () => this.active && !document.hidden);
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
    this.view = securityModel(readSecurity(hass.states, registries, store.names), {
      now: Date.now(),
      t: store.t,
      fmt: store.fmt,
    });
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const {t} = this.storeController.store;
    return html`<hp-pane-header .icon=${'shield'} .color=${'var(--m-purple)'} .heading=${t('security.title')}>
        <div slot="sub">${view.summary}</div>
      </hp-pane-header>
      <hp-camera-card .view=${view.cameras}></hp-camera-card>
      ${view.sensors.hidden ? nothing : html`<hp-sensor-card .view=${view.sensors}></hp-sensor-card>`}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-security-pane': SecurityPane;
  }
}

if (!customElements.get('hp-security-pane')) customElements.define('hp-security-pane', SecurityPane);
