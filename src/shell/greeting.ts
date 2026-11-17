// <hp-greeting>: the header's greeting by the hour with the user's first name, the date line under it (on a phone with the inside and outside
// temperatures, which the Home pane's heading says on a tablet), then Who's home as chips.
// Pattern: a humble object (Meszaros, xUnit Test Patterns) over `homeLine`, drawn in light DOM (ADR 0033) so the legacy `.hello` rules still
// place its heading, its line and the chips; it is the shell's, as the header is (spec 14). It replaced the legacy `renderHeader`'s greeting (#269).
// Must not: read an entity `homeTemperatureIds` does not list, or word anything but through the catalog.
import {ContextConsumer} from '@lit/context';
import {LitElement, html, nothing} from 'lit';
import {firstName, greetingKey, homeLine, homeTemperatureIds, readHomeTemperatures} from './home-line.ts';
import '../features/people/index.ts'; // defines <hp-who-chips>
import {StoreController} from '../ui/controllers/store-controller.ts';
import {TickController} from '../ui/controllers/tick.ts';
import {appearanceContext} from '../ui/contexts.ts';

export class Greeting extends LitElement {
  private readonly appearance = new ContextConsumer(this, {context: appearanceContext, subscribe: true});
  // the temperatures only on a phone; the user's name and the language come with every hass
  private readonly storeController = new StoreController(this, {
    ids: store => (this.compact ? homeTemperatureIds(store.config) : []),
  });

  constructor() {
    super();
    // the greeting follows the hour and the line the day, as the legacy header redrew them every twenty seconds
    new TickController(this, 20_000);
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  private get compact(): boolean {
    return this.appearance.value?.compact ?? false;
  }

  protected override render() {
    const {hass, config, t, fmt} = this.storeController.store;
    if (!hass) return nothing;
    const now = Date.now();
    const name = firstName(hass.user?.name);
    const line = homeLine({now, ...(this.compact ? readHomeTemperatures(hass.states, config) : {})}, {t, fmt});
    return html`<h1>
        ${t(greetingKey(fmt.hourNow(now)))}${name ? html`, <span style="white-space:nowrap">${name}</span>` : nothing}
      </h1>
      <div>${line}</div>
      <hp-who-chips .place=${'header'}></hp-who-chips>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-greeting': Greeting;
  }
}

if (!customElements.get('hp-greeting')) customElements.define('hp-greeting', Greeting);
