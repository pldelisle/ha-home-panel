// <hp-clock>: the idle clock: the condition's icon beside the time, the long date, the temperatures and the next sunrise or sunset.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over `readClock` and `clockModel`; a store controller on `clockIds` (ADR 0012)
// and a twenty-second `TickController` for the minute, which ticks only while the idle screen says the clock shows (`active`).
// Must not: read an entity but through `readClock`, word anything (the model does), place itself or drift (the shell's idle screen does).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import clockOwn from './clock.element.css?inline';
import {clockIds} from './ids.ts';
import {readClock} from './inputs.ts';
import {clockModel, type ClockViewModel} from './model.ts';
import {StoreController} from '../../ui/controllers/store-controller.ts';
import {TickController} from '../../ui/controllers/tick.ts';
import {weatherIcon} from '../../ui/icons.ts';
import {common} from '../../ui/styles/index.ts';

/** How often the clock redraws while it shows, as the legacy 20-second interval did. */
export const CLOCK_TICK_MS = 20_000;

export class HpClock extends LitElement {
  static override properties = {
    active: {type: Boolean},
    beside: {type: Boolean, reflect: true},
  };
  /** The idle screen shows: the clock reads and ticks only then. */
  declare active: boolean;
  /** A stack card sits beside the clock: the time and the icon are a size down (the legacy `.ss` rules). */
  declare beside: boolean;

  // The element's own rules, its `:host` and the clock's parts, are in clock.element.css.
  static override styles = [common, unsafeCSS(clockOwn)];

  private readonly storeController = new StoreController(this, {ids: store => (this.active ? clockIds(store) : [])});
  private view: ClockViewModel | null = null;

  constructor() {
    super();
    this.active = false;
    this.beside = false;
    new TickController(this, CLOCK_TICK_MS, () => this.active);
  }

  protected override willUpdate(): void {
    const {hass, config, t, fmt, isFrench} = this.storeController.store;
    this.view =
      this.active && hass
        ? clockModel(readClock(hass.states, config, hass.config, {now: Date.now(), isoDay: at => fmt.isoDay(at)}), {
            t,
            fmt,
            isFrench,
          })
        : null;
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const clock = html`<div class="iclock num">${view.time.main}<small>${view.time.suffix}</small></div>`;
    const {icon} = view;
    return html`${
        icon
          ? html`<div class="iclk2">
              <span class="iwx">${weatherIcon(icon.condition, 120, icon.day, icon.label)}</span>${clock}
            </div>`
          : clock
      }
      <div class="idate">${view.date}</div>
      ${view.temps ? html`<div class="itemps">${view.temps}</div>` : nothing}
      ${view.nextSun ? html`<div class="isun">${view.nextSun}</div>` : nothing}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-clock': HpClock;
  }
}

if (!customElements.get('hp-clock')) customElements.define('hp-clock', HpClock);
