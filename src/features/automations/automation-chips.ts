// <hp-automation-chips>: the "Every automation" card of the Automations tab: a plain list, a row per automation, the latest to run
// first: its name, when it last ran (or that it is off, running or never ran) and a chevron; the selected row filled with the
// neutral selection fill, an automation that is off greyed. (The name and the model's `ChipView` keep "chip", from the chips it was.)
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's rows, telling its parent by an event (Lit docs, Events)
// which automation was picked; a list of buttons, the selected one `aria-pressed` (HIG, Lists and tables; Buttons: 44 pt).
// Must not: order or word the rows (the model does), or hold the selection.
import {LitElement, html, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {SelectRunEvent} from './events.ts';
import type {ChipView} from './model.ts';
import shared from './styles.css?inline';
import own from './automation-chips.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {ico} from '../../ui/icons.ts';
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
        <ul class="aulist">
          ${repeat(
            this.chips,
            c => c.item ?? `-${c.name}`,
            c =>
              html`<li>
                <button
                  type="button"
                  class="aurow${c.off ? ' offa' : ''}${c.sel ? ' sel' : ''}"
                  data-au=${c.item ?? ''}
                  aria-pressed=${c.sel ? 'true' : 'false'}
                  ?disabled=${!c.item}
                  @click=${() => c.item && this.dispatchEvent(new SelectRunEvent({item: c.item}))}
                >
                  <span class="nm">${c.name}</span><small>${c.sub}</small>
                  <span class="chev" aria-hidden="true">${ico('chev', 18)}</span>
                </button>
              </li>`,
          )}
        </ul>
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
