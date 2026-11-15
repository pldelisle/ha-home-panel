// <hp-hilo-card>: Hilo's card: the rate in cents per kilowatt hour with its tier, the challenge line, and three tiles (medium, reward, rewards).
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `hilo` view; on a tablet beside the detail, on a phone inside the sheet its
// tile opens (`framed`).
// Must not: read an entity or word a string (the model does), choose the tier's colour from a text (the model says `ok`), or open anything.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import type {EnergyViewModel} from './model.ts';
import ownCss from './hilo-card.element.css?inline';
import energyShared from './styles.css?inline';
import {tileList} from './tile-list.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {lensLike} from '../../ui/lens.ts';
import {common, hero, tiles} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class HiloCard extends LitElement {
  static override properties = {
    view: {attribute: false},
    framed: {type: Boolean, reflect: true},
  };
  /** The model's Hilo section: its title, the challenge line, the rate, the tier and the three tiles. */
  declare view: EnergyViewModel['hilo'] | undefined;
  /** Drawn inside a sheet, where the box is a little tighter, as the legacy card sheet drew a card. */
  declare framed: boolean;

  // The kit's hero and tiles, the feature's box (styles.css), and the element's own rules, its `:host`, the tiles' three columns and the dot, last (hilo-card.element.css).
  static override styles = [common, hero, tiles, unsafeCSS(forShadow(energyShared)), unsafeCSS(forShadow(ownCss))];

  constructor() {
    super();
    this.view = undefined;
    this.framed = false;
    // `glass` and `compact` come from the shell as host attributes the element's rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    const {rate, tier} = view;
    // the inner box carries the glass: see <hp-energy-card>
    return html`<div class="ebox">
        <div class="etop"><span class="elbl">${view.title}</span><span class="eright">${view.challenge}</span></div>
        <div class="hero">
          <div class="v num">${rate.value}<small>${rate.unit}</small></div>
          <span class="state"><i class=${tier.ok ? 'ok' : 'warn'}></i>${tier.text}</span>
        </div>
        <div class="tiles">${tileList(view.tiles)}</div>
      </div>
      ${lensLike(this.getRootNode())}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-hilo-card': HiloCard;
  }
}

if (!customElements.get('hp-hilo-card')) customElements.define('hp-hilo-card', HiloCard);
