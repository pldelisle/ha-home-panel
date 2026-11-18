// <hp-security-card>: the Home tab's compact security card: the shield header that opens the Security tab, up to four camera
// thumbnails, and a row per door and motion sensor (or the hint); its box glows for 2.8 seconds when a door opens or motion starts.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `home` view; the glow is element state: it keeps the last
// reading and asks `newlyActive`, a pure rule, what turned on since. The Home pane composes it (#268).
// Must not: read an entity itself (`readSecurity` does), glow on its first draw, keep a timer past its disconnection, or open a sheet (it asks).
import {LitElement, html, nothing, svg, unsafeCSS} from 'lit';
import {classMap} from 'lit/directives/class-map.js';
import {repeat} from 'lit/directives/repeat.js';
import {newlyActive, type ActiveSnapshot} from './activity.ts';
import {securityIds} from './ids.ts';
import {readSecurity} from './inputs.ts';
import {SNAPSHOT_MS, securityModel, type CameraTile, type SecurityViewModel, type SensorRow} from './model.ts';
import {sensorStatus} from './sensor-status.ts';
import {CAMERA_SHEET, HISTORY_SHEET} from './sheets.ts';
import cardOwn from './security-card.element.css?inline';
import {registriesOf} from '../../core/registry.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {TickController} from '../../ui/controllers/tick.ts';
import {SheetRequestEvent, TabSelectEvent} from '../../ui/events.ts';
import {ico} from '../../ui/icons.ts';
import {lens} from '../../ui/lens.ts';
import {common, status} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** How long the card glows: the legacy panel's 2.8 seconds, a little past the 2.6 the animation runs. */
const GLOW_MS = 2800;

// the shield in sage with its tick in the card's colour, which the kit's outline `shield` icon is not
const SHIELD = svg`<svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
  <path d="M12 2.5l7.5 3.2v5.3c0 4.8-3.2 9-7.5 10.6-4.3-1.6-7.5-5.8-7.5-10.6V5.7z" fill="var(--m-sage)"/>
  <path d="M8.8 12.2l2.2 2.2 4.4-4.4" fill="none" stroke="var(--card)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

export class SecurityCard extends LitElement {
  // The element's own rules, its `:host` and the card's box and rows, are in security-card.element.css.
  static override styles = [common, status, unsafeCSS(forShadow(cardOwn))];

  private readonly storeController = new StoreController(this, {ids: store => securityIds(store)});
  private view: SecurityViewModel['home'] | undefined;
  /** The sensors' last reading, which the next one is compared with; undefined until the first draw, which never glows. */
  private previous: ActiveSnapshot | undefined;
  private glowing = false;
  private glowTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    // `glass` and `compact` come from the shell as host attributes the card's rules test
    new AppearanceConsumer(this);
    // a camera's snapshot is asked for again every ten seconds; a tick while the browser tab is hidden is skipped
    new TickController(this, SNAPSHOT_MS, () => !document.hidden);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.glowTimer);
    this.glowing = false;
  }

  protected override willUpdate(): void {
    const {store} = this.storeController;
    const {hass} = store;
    if (!hass) return;
    const {home} = securityModel(readSecurity(hass.states, registriesOf(hass), store.names), {
      now: Date.now(),
      t: store.t,
      fmt: store.fmt,
    });
    this.view = home;
    const before = this.previous;
    this.previous = home.active;
    if (before && newlyActive(before, home.active).length) this.glow();
  }

  // one timer: a second sensor turning on inside the 2.8 seconds starts the count again
  private glow(): void {
    this.glowing = true;
    clearTimeout(this.glowTimer);
    this.glowTimer = setTimeout(() => {
      this.glowing = false;
      this.requestUpdate();
    }, GLOW_MS);
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const {t} = this.storeController.store;
    // the box is an inner element: the glass's lens is looked up from the root the rule's element is in, and a host is in the shell's
    return html`<div class=${classMap({seccard: true, glow: this.glowing})}>
        <button type="button" class="hh" @click=${this.openTab}>
          <span class="hsecico">${SHIELD}</span><span class="lbl">${t('security.title')}</span
          ><span class="right">${view.line}</span><span class="chev" aria-hidden="true">›</span>
        </button>
        ${
          view.cameras.length
            ? html`<div class="hcams">
                ${repeat(
                  view.cameras,
                  tile => tile.id,
                  tile => this.renderCamera(tile),
                )}
              </div>`
            : nothing
        }
        ${
          view.rows.length
            ? html`<div class="hsens">
                ${repeat(
                  view.rows,
                  row => row.id,
                  row => this.renderSensor(row),
                )}
              </div>`
            : html`<p class="nosens">${view.hint}</p>`
        }
      </div>
      ${lens}`;
  }

  // The two buttons below carry `aria-description` (a screen reader reads it after the name), which lit-analyzer does not know:
  // the `@ts-ignore` comment inside each template covers that one tag.

  // a camera with no snapshot (it is offline, or has none) draws the camera's icon in its place
  private renderCamera(tile: CameraTile) {
    return html`<!-- @ts-ignore -->
      <button type="button" class="hcam" data-id=${tile.id} aria-description=${tile.label} @click=${this.openCamera}>
        ${
          tile.picture
            ? html`<img src=${tile.picture} alt="" loading="lazy" />`
            : html`<span class="camoff">${ico('cam', 24)}</span>`
        }<span class="hcn">${tile.name}${tile.tag ? html` <b>${tile.tag}</b>` : nothing}</span>
      </button>`;
  }

  // a sensor off the air has the tone `off`, which dims its line; a door that is open is `warn`, a motion sensor that sees it `act`
  private renderSensor(row: SensorRow) {
    return html`<!-- @ts-ignore -->
      <button type="button" class="hsen" data-id=${row.id} aria-description=${row.label} @click=${this.openHistory}>
        <span class="sic">${ico(row.kind === 'door' ? 'door' : 'walk', 20)}</span>
        <div>
          <b>${row.name}</b
          ><span class=${row.tone}>${sensorStatus(row)}${row.sub ? html` <small>· ${row.sub}</small>` : nothing}</span>
        </div>
      </button>`;
  }

  // arrow fields, so the template hands the same function at every render; the shell hears `TabSelectEvent` on its frame (ADR 0026)
  private readonly openTab = (): void => {
    this.dispatchEvent(new TabSelectEvent('cams'));
  };

  private readonly openCamera = (e: Event): void => {
    const id = (e.currentTarget as HTMLElement).dataset.id;
    if (id) this.dispatchEvent(new SheetRequestEvent(CAMERA_SHEET, {id}));
  };

  private readonly openHistory = (e: Event): void => {
    const id = (e.currentTarget as HTMLElement).dataset.id;
    if (id) this.dispatchEvent(new SheetRequestEvent(HISTORY_SHEET, {id}));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-security-card': SecurityCard;
  }
}

if (!customElements.get('hp-security-card')) customElements.define('hp-security-card', SecurityCard);
