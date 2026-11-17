// <hp-energy-card>: the Energy card: the title line with the rate, the live power flow and four tiles, and a box that opens the detail.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `card` view, composing <hp-power-flow> (Gamma et al., Composite); written
// to be placed by any pane, the Home tab's later (spec 24). Its box is a button that asks the shell for the detail (ADR 0021).
// Must not: read an entity or the clock, word a string (the model does), or open the sheet (it asks).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import type {EnergyViewModel} from './model.ts';
import './power-flow.ts'; // defines <hp-power-flow>
import {DETAIL_SHEET} from './sheets.ts';
import cardOwn from './energy-card.element.css?inline';
import energyShared from './styles.css?inline';
import {tileList} from './tile-list.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {SheetRequestEvent} from '../../ui/events.ts';
import {lens} from '../../ui/lens.ts';
import {common, tiles} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class EnergyCard extends LitElement {
  static override properties = {view: {attribute: false}};
  /** The model's card: the title, the rate line, the flow's geometry, the four tiles and the history's error line. */
  declare view: EnergyViewModel['card'] | undefined;

  // The kit's tiles, the feature's box (styles.css), and the element's own rules, its `:host`, the tap's and the tiles' place, last (energy-card.element.css).
  static override styles = [common, tiles, unsafeCSS(forShadow(energyShared)), unsafeCSS(forShadow(cardOwn))];

  constructor() {
    super();
    this.view = undefined;
    // `glass` and `compact` come from the shell as host attributes the element's rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    // The box is an inner element: the glass's lens is looked up from the root the rule's element is in, and a host is in the pane's.
    // The words of the title line are children of `.eright`, as the legacy card wrote them: the flex gap is between each.
    // lit-analyzer does not know `aria-description` (a screen reader reads it after the role and the name); the ignore covers this one tag
    return html`<!-- @ts-ignore -->
      <div
        class="ebox tap"
        role="button"
        tabindex="0"
        aria-description=${view.open}
        @click=${this.open}
        @keydown=${this.onKey}
      >
        <div class="etop">
          <span class="elbl">${view.title}</span><span class="eright">${view.topRight}<span class="ego">›</span></span>
        </div>
        <hp-power-flow .geometry=${view.flow}></hp-power-flow>
        <div class="tiles ctiles">${tileList(view.tiles)}</div>
        ${view.error === null ? nothing : html`<p class="enote">${view.error}</p>`}
      </div>
      ${lens}`;
  }

  // arrow fields, so the template hands the same function at every render
  private readonly open = (): void => {
    this.dispatchEvent(new SheetRequestEvent(DETAIL_SHEET));
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    this.open();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-energy-card': EnergyCard;
  }
}

if (!customElements.get('hp-energy-card')) customElements.define('hp-energy-card', EnergyCard);
