// <hp-camera-sheet>: one camera's live view: a sheet with the camera's name, its state and motion line, and the stream.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model: `securityModel` words the line, `mountCameraStream` makes the
// view (Weather's radar is its model); it exists only while its sheet is open, so the stream starts when it is drawn and `destroy`s on disconnect.
// Must not: read an entity but the camera's raw state at the moment it mounts, keep that state across two openings, or open or close a sheet itself.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {securityIds} from './ids.ts';
import {readSecurity} from './inputs.ts';
import {securityModel, type CameraTile} from './model.ts';
import {mountCameraStream, type CameraStreamMount} from './camera-stream.ts';
import {CAMERA_SHEET} from './sheets.ts';
import sheetOwn from './camera-sheet.element.css?inline';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {SheetDismissEvent} from '../../ui/events.ts';
import {lensLike} from '../../ui/lens.ts';
import '../../ui/sheet.ts'; // defines <hp-sheet>
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class CameraSheet extends LitElement {
  static override properties = {
    cameraId: {},
  };
  /** Which camera: the id the tap asked for, bound by the pane from the sheet host's detail. */
  declare cameraId: string | undefined;

  // The host is a block with nothing of its own: the sheet it holds is fixed to the screen.
  // The element's own rules, its `:host` and the stream's box, are in camera-sheet.element.css.
  static override styles = [common, unsafeCSS(forShadow(sheetOwn))];

  private readonly storeController = new StoreController(this, {ids: store => securityIds(store)});
  /** The camera's tile in the model, made in `willUpdate`; undefined when Home Assistant does not list it. */
  private camera: CameraTile | undefined;
  private stream: CameraStreamMount | undefined;
  /** The camera the stream shows, so another id mounts again and a redraw for anything else leaves the stream alone. */
  private streamOf: string | undefined;

  constructor() {
    super();
    this.cameraId = undefined;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    // the stream is the sheet's: it ends with it, and the next opening reads the camera's state again
    this.stream?.destroy();
    this.stream = undefined;
    this.streamOf = undefined;
  }

  protected override willUpdate(): void {
    const {store} = this.storeController;
    const {hass} = store;
    if (!this.cameraId || !hass) {
      this.camera = undefined;
      return;
    }
    const view = securityModel(
      readSecurity(hass.states, {entities: hass.entities, devices: hass.devices, areas: hass.areas}, store.names),
      {now: Date.now(), t: store.t, fmt: store.fmt},
    );
    this.camera = view.cameras.tiles.find(tile => tile.id === this.cameraId);
  }

  protected override render() {
    const {camera} = this;
    if (!camera) return nothing;
    const {t} = this.storeController.store;
    // `.camlive` has no binding inside it: Lit never touches what the stream puts there
    return html`<hp-sheet
        .open=${true}
        .icon=${'cam'}
        .color=${'var(--c-home)'}
        .heading=${camera.name}
        .closeLabel=${t('security.close')}
        @sheet-close=${this.dismiss}
      >
        <div slot="sub">${camera.detail}</div>
        <div class="camlive"></div>
      </hp-sheet>
      ${lensLike(this.getRootNode())}`;
  }

  protected override updated(): void {
    const {camera, cameraId} = this;
    const {store} = this.storeController;
    const {hass, t} = store;
    // a camera Home Assistant no longer lists has no sheet to show: the host is asked to close it
    if (!camera) {
      if (cameraId && hass) this.dismiss();
      return;
    }
    const box = this.renderRoot.querySelector<HTMLElement>('.camlive');
    if (!box || this.streamOf === cameraId) return;
    this.stream?.destroy();
    this.streamOf = cameraId;
    this.stream = mountCameraStream(box, {
      hass,
      // the raw state is read now, as the sheet opens, and not kept from an earlier opening
      stateObj: hass?.states[camera.id],
      alt: t('security.liveView', {name: camera.name}),
      offline: t('security.cameraOffline'),
    });
  }

  // the sheet's Close button, its backdrop and its swipe: the host closes it, the element only says so
  private readonly dismiss = (event?: Event): void => {
    event?.stopPropagation();
    this.dispatchEvent(new SheetDismissEvent(CAMERA_SHEET));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-camera-sheet': CameraSheet;
  }
}

if (!customElements.get('hp-camera-sheet')) customElements.define('hp-camera-sheet', CameraSheet);
