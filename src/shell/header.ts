// <hp-header>: the panel's header: the sidebar button, the greeting with Who's home, the chips (weather, peak, the live pill), the gear,
// the clock, and the two popups the shell keeps open or shut (the Status checks under the pill, the settings under the gear).
// Pattern: a humble composition (Meszaros, xUnit Test Patterns), the composition root's child, drawn in light DOM (ADR 0033) so the legacy
// `.head` rules still lay out its row, as the Home pane is (ADR 0032); its own rules are header.css. It replaced the guest's header (#269).
// Must not: decide whether a popup is open (the shell does, from the events the gear, the pill and the popups send up), or read an entity.
import {LitElement, html, unsafeCSS} from 'lit';
import {keyed} from 'lit/directives/keyed.js';
import './clock-line.ts'; // defines <hp-clock-line>
import './greeting.ts'; // defines <hp-greeting>
import headerCss from './header.css?inline';
import './settings-popup.ts'; // defines <hp-settings-popup>
import '../features/live/index.ts'; // defines <hp-peak-chip>, <hp-live-pill> and <hp-status-popup>
import '../features/weather/index.ts'; // defines <hp-weather-chip>
import {ico} from '../ui/icons.ts';

/** The header's rules, joined after the legacy sheet in the shell's root, where the header draws (ADR 0033). */
export const headerStyles = unsafeCSS(headerCss);

/** The gear asks the shell to open or close the settings popup. */
export class SettingsToggleEvent extends Event {
  constructor() {
    super('settings-toggle', {bubbles: true, composed: true});
  }
}

export class Header extends LitElement {
  static override properties = {
    statusOpen: {type: Boolean},
    settingsOpen: {type: Boolean},
    live: {type: Boolean},
    liveKey: {type: Number},
    historyLoaded: {type: Boolean},
  };
  /** The Status checks are open under the pill. */
  declare statusOpen: boolean;
  /** The settings popup is open under the gear. */
  declare settingsOpen: boolean;
  /** A live activity shows in the pill: the weather chip slims beside it. */
  declare live: boolean;
  /** Counts the pill's changes: the weather chip is drawn anew at each, see `render`. */
  declare liveKey: number;
  /** The statistics cache has answered once, which the settings popup's version line says. */
  declare historyLoaded: boolean;

  constructor() {
    super();
    this.statusOpen = false;
    this.settingsOpen = false;
    this.live = false;
    this.liveKey = 0;
    this.historyLoaded = false;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  private readonly openSidebar = (): void => {
    this.dispatchEvent(new Event('hass-toggle-menu', {bubbles: true, composed: true}));
  };

  private readonly toggleSettings = (): void => {
    this.dispatchEvent(new SettingsToggleEvent());
  };

  // The weather chip is drawn anew whenever the pill changes, as the legacy header redrew it: the pill moves the chips, and Chromium
  // keeps a moved glass chip's old sub-pixel raster where a new one is drawn fresh.
  protected override render() {
    return html`<header class="head">
      <button class="icon menu" id="menu" type="button" aria-label="Open the sidebar" @click=${this.openSidebar}>
        ${ico('menu')}
      </button>
      <hp-greeting class="hello" id="hello"></hp-greeting>
      <div class="chips">
        <div id="chips">
          ${keyed(this.liveKey, html`<hp-weather-chip .slim=${this.live}></hp-weather-chip>`)}<hp-peak-chip
          ></hp-peak-chip>
          <hp-live-pill .open=${this.statusOpen}></hp-live-pill>
        </div>
        <button
          class="icon"
          id="gear"
          type="button"
          aria-label="Settings"
          aria-haspopup="dialog"
          aria-expanded=${this.settingsOpen}
          @click=${this.toggleSettings}
        >
          ${ico('gear', 20)}
        </button>
      </div>
      <hp-clock-line class="clock" id="clock"></hp-clock-line>
      <hp-status-popup
        class="pop"
        id="attpop"
        role="dialog"
        aria-label="Status checks"
        ?hidden=${!this.statusOpen}
        .open=${this.statusOpen}
      ></hp-status-popup>
      <div class="pop" id="setpop" ?hidden=${!this.settingsOpen} role="dialog" aria-label="Settings">
        <hp-settings-popup .version=${__VERSION__} .statistics=${this.historyLoaded}></hp-settings-popup>
      </div>
    </header>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-header': Header;
  }
  interface HTMLElementEventMap {
    'settings-toggle': SettingsToggleEvent;
  }
}

if (!customElements.get('hp-header')) customElements.define('hp-header', Header);
