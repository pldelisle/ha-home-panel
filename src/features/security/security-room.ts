// <hp-security-room>: the Security part of a room view: the room's cameras, then its door and motion sensors.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over `securityModel`, run on the inputs cut to one area (ADR 0039): the same
// `<hp-camera-card>` and `<hp-sensor-card>` the Security tab places, read by `readSecurity`. A tap asks for the camera's sheet or the
// sensor's history (`CAMERA_SHEET`, `HISTORY_SHEET`), which the Security pane draws and stays in the page behind (`overSheets`), so the room stays.
// It exists only while its room is shown, so it listens to nothing and asks for no snapshot otherwise; the live view is the camera sheet's, mounted only while it is open.
// Must not: draw a sheet, mount a stream, read an entity itself, or draw a card the room has nothing for (the empty cameras card is the tab's).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {securityIds} from './ids.ts';
import {readSecurity, securityInArea} from './inputs.ts';
import {SNAPSHOT_MS, securityModel, type SecurityViewModel} from './model.ts';
import './camera-card.ts'; // defines <hp-camera-card>
import './sensor-card.ts'; // defines <hp-sensor-card>
import roomOwn from './security-room.element.css?inline';
import {registriesOf} from '../../core/registry.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {TickController} from '../../ui/controllers/tick.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class SecurityRoom extends LitElement {
  static override properties = {
    areaId: {},
  };
  /** The area of the room shown, set by the room view. */
  declare areaId: string;

  // The element's own rules, its `:host` and the cards' column, are in security-room.element.css.
  static override styles = [common, unsafeCSS(forShadow(roomOwn))];

  private readonly storeController = new StoreController(this, {ids: store => securityIds(store)});
  private view: SecurityViewModel | undefined;

  constructor() {
    super();
    this.areaId = '';
    // `compact` comes from the shell as a host attribute the cards' rules test
    new AppearanceConsumer(this);
    // the snapshot's stamp moves every ten seconds, as on the tab; a tick while the browser tab is hidden is skipped
    new TickController(this, SNAPSHOT_MS, () => !document.hidden);
  }

  protected override willUpdate(): void {
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return;
    const registries = registriesOf(hass);
    this.view = securityModel(
      securityInArea(readSecurity(hass.states, registries, store.names), registries, this.areaId),
      {
        now: Date.now(),
        t: store.t,
        fmt: store.fmt,
      },
    );
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    return html`${view.cameras.empty ? nothing : html`<hp-camera-card .view=${view.cameras}></hp-camera-card>`}${
      view.sensors.hidden ? nothing : html`<hp-sensor-card .view=${view.sensors}></hp-sensor-card>`
    }`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-security-room': SecurityRoom;
  }
}

if (!customElements.get('hp-security-room')) customElements.define('hp-security-room', SecurityRoom);
