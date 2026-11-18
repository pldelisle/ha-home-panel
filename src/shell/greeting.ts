// <hp-greeting>: Home's one title: the greeting by the hour with the user's first name, and the line under it, the date, the inside and
// outside temperatures and the Status checks that need attention (#426; the Home pane's own heading, which said them on a tablet, is gone).
// Pattern: a humble object (Meszaros, xUnit Test Patterns) over `homeLine`, drawn in light DOM (ADR 0033) so the legacy `.hello` rules still
// place its heading and its line; it is the shell's, as the header is (spec 14). It replaced the legacy `renderHeader`'s greeting (#269).
// Must not: show Who's home (the Home card does, once), read an entity `homeTemperatureIds` does not list, or word anything but through the catalog.
import {LitElement, html, nothing} from 'lit';
import {firstName, greetingKey, homeLine} from './home-line.ts';
import {homeTemperatureIds, readHomeTemperatures} from '../providers/home-temperatures.ts';
import {StoreController} from '../ui/controllers/store-controller.ts';
import {TickController} from '../ui/controllers/tick.ts';

export class Greeting extends LitElement {
  static override properties = {attention: {type: Number}};
  /** How many Status checks need attention, which the line says; the header hands it down. */
  declare attention: number;

  // the temperatures the line says; the user's name and the language come with every hass
  private readonly storeController = new StoreController(this, {ids: store => homeTemperatureIds(store.config)});

  constructor() {
    super();
    this.attention = 0;
    // the greeting follows the hour and the line the day, as the legacy header redrew them every twenty seconds
    new TickController(this, 20_000);
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  protected override render() {
    const {hass, config, t, fmt} = this.storeController.store;
    if (!hass) return nothing;
    const now = Date.now();
    const name = firstName(hass.user?.name);
    const line = homeLine({now, ...readHomeTemperatures(hass.states, config), attention: this.attention}, {t, fmt});
    return html`<h1>
        ${t(greetingKey(fmt.hourNow(now)))}${name ? html`, <span style="white-space:nowrap">${name}</span>` : nothing}
      </h1>
      <div>${line}</div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-greeting': Greeting;
  }
}

if (!customElements.get('hp-greeting')) customElements.define('hp-greeting', Greeting);
