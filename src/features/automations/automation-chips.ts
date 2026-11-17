// <hp-automation-chips>: the "Every automation" card of the Automations tab: a chip per automation, the latest to run first, with
// when it last ran (or that it is off, running or never ran); the selected one filled, an automation that is off greyed.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's chips, telling its parent by an event (Lit docs, Events)
// which automation was picked. Must not: order or word the chips (the model does), or hold the selection.
import {LitElement, html, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {SelectRunEvent} from './events.ts';
import type {ChipView} from './model.ts';
import shared from './styles.css?inline';
import own from './automation-chips.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {lensLike} from '../../ui/lens.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class AutomationChips extends LitElement {
  static override properties = {chips: {attribute: false}, heading: {}, caption: {}};
  declare chips: readonly ChipView[];
  declare heading: string;
  declare caption: string;

  static override styles = [common, unsafeCSS(forShadow(shared)), unsafeCSS(forShadow(own))];

  constructor() {
    super();
    new AppearanceConsumer(this);
    this.chips = [];
    this.heading = '';
    this.caption = '';
  }

  protected override render() {
    return html`<section class="aubox">
        <div class="auhead">
          <div>
            <h3>${this.heading}</h3>
            <p>${this.caption}</p>
          </div>
        </div>
        <div class="auchips">
          ${repeat(
            this.chips,
            c => c.item ?? `-${c.name}`,
            c =>
              html`<button
                type="button"
                class="chip auchip${c.off ? ' offa' : ''}${c.sel ? ' sel' : ''}"
                data-au=${c.item ?? ''}
                ?disabled=${!c.item}
                @click=${() => c.item && this.dispatchEvent(new SelectRunEvent({item: c.item}))}
              >
                ${c.name}<small>${c.sub}</small>
              </button>`,
          )}
        </div>
      </section>
      ${lensLike(this.getRootNode())}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-automation-chips': AutomationChips;
  }
}

if (!customElements.get('hp-automation-chips')) customElements.define('hp-automation-chips', AutomationChips);
