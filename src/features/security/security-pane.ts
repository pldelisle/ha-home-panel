// <hp-security-pane>: the Security tab: the header with the summary, the cameras' card and the doors-and-motion card, and over them
// the sheet of the camera or the sensor that is open.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a view model: `securityModel` runs in `willUpdate` and the template
// only places what it returns; a store controller on `securityIds` (ADR 0012), paused while the pane is off screen, and the kit's
// tick controller, which draws again every ten seconds: that is what asks a camera for a new snapshot. It owns the history cache and the range the history last showed.
// Must not: read an entity itself (`readSecurity` does), hold a string the household reads, or open a sheet (its cards ask).
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import {HISTORY_TTL_MS, type SheetRange} from './history.ts';
import {securityIds} from './ids.ts';
import {readSecurity} from './inputs.ts';
import {SNAPSHOT_MS, securityModel, type SecurityViewModel} from './model.ts';
import './camera-card.ts'; // defines <hp-camera-card>
import './camera-sheet.ts'; // defines <hp-camera-sheet>
import './sensor-card.ts'; // defines <hp-sensor-card>
import './sensor-history.ts'; // defines <hp-sensor-history>
import paneOwn from './security-pane.element.css?inline';
import {createStatisticsCache, type StatisticsCache} from '../../core/statistics-cache.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {apiContext} from '../../ui/contexts.ts';
import {TickController} from '../../ui/controllers/tick.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class SecurityPane extends LitElement {
  static override properties = {
    active: {type: Boolean, reflect: true},
    cameraId: {},
    historyId: {},
  };
  /** Set by the shell: this pane is the tab on screen. A hidden pane listens to no entity, draws no snapshot and keeps what it drew. */
  declare active: boolean;
  /** Bound by the registry's template to the camera whose sheet the sheet host has open, or undefined: a sheet over the screen, on any tab. */
  declare cameraId: string | undefined;
  /** Bound by the registry's template to the sensor whose history the sheet host has open, or undefined. */
  declare historyId: string | undefined;

  // The element's own rules, its `:host` and the header's place, are in security-pane.element.css.
  static override styles = [common, unsafeCSS(forShadow(paneOwn))];

  private readonly storeController = new StoreController(this, {ids: store => securityIds(store)});
  private view: SecurityViewModel | undefined;
  private historyCache: StatisticsCache | undefined;
  /** The range the history sheet last showed, kept for the panel's life and handed to each opening. */
  private historyRange: SheetRange = 'day';

  constructor() {
    super();
    this.active = false;
    this.cameraId = undefined;
    this.historyId = undefined;
    // the cache is the pane's: a sheet is drawn and dropped as it opens and closes, and a client never changes for a given tree
    new ContextConsumer(this, {
      context: apiContext,
      subscribe: false,
      callback: api => {
        this.historyCache = createStatisticsCache(api, {ttlMs: HISTORY_TTL_MS});
      },
    });
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
    const {store} = this.storeController;
    if (!this.active) return;
    const {hass} = store;
    if (!hass) return;
    const registries = {entities: hass.entities, devices: hass.devices, areas: hass.areas};
    this.view = securityModel(readSecurity(hass.states, registries, store.names), {
      now: Date.now(),
      t: store.t,
      fmt: store.fmt,
    });
  }

  // a sheet exists only while the sheet host has it open, so a closed one holds no stream and asks for nothing
  private renderSheets() {
    return html`${this.cameraId ? html`<hp-camera-sheet .cameraId=${this.cameraId}></hp-camera-sheet>` : nothing}${
      this.historyId
        ? html`<hp-sensor-history
            .sensorId=${this.historyId}
            .cache=${this.historyCache}
            .range=${this.historyRange}
            @range-chosen=${this.onHistoryRange}
          ></hp-sensor-history>`
        : nothing
    }`;
  }

  private readonly onHistoryRange = (event: CustomEvent<{range: SheetRange}>): void => {
    this.historyRange = event.detail.range;
  };

  protected override render() {
    // A sheet over another tab (the Home card opens it): the pane is behind it and draws nothing but it, so the tab stays.
    if (!this.active && (this.cameraId || this.historyId)) return this.renderSheets();
    const view = this.view;
    if (!view) return nothing;
    const {t} = this.storeController.store;
    return html`<hp-pane-header .icon=${'shield'} .color=${'var(--m-purple)'} .heading=${t('security.title')}>
        <div slot="sub">${view.summary}</div>
      </hp-pane-header>
      <hp-camera-card .view=${view.cameras}></hp-camera-card>
      ${view.sensors.hidden ? nothing : html`<hp-sensor-card .view=${view.sensors}></hp-sensor-card>`}${this.renderSheets()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-security-pane': SecurityPane;
  }
}

if (!customElements.get('hp-security-pane')) customElements.define('hp-security-pane', SecurityPane);
