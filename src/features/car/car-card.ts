// <hp-car-card>: the Car card: the car's name and where it is, the charge with its range beside the photo (or the drawn car), the battery bar with the charge limit's mark, three tiles and the 30 days' charging as bars.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `card` view; its box is a button that asks the shell for the detail (ADR 0021). It keeps no state: the photo's failure is the pane's (`imageFailed`, handed down), the drawing
// replaces a photo that did not load for the pane's life, and a new picture address from Home Assistant does not try it again (the legacy panel's `imgFail`, per session).
// Must not: read an entity or the clock, word a string (the model does), place a bar itself (`barsGeometry` does), or open the sheet (it asks).
import {LitElement, html, nothing, svg, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {carArt} from './car-art.ts';
import {CarImageFailedEvent} from './events.ts';
import ownCss from './car-card.element.css?inline';
import type {Bar} from './bars-geometry.ts';
import type {CarCard, DailyBars} from './model.ts';
import {DETAIL_SHEET} from './sheets.ts';
import {socBar} from './soc-bar.ts';
import socBarCss from './soc-bar.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {SheetRequestEvent} from '../../ui/events.ts';
import {lens} from '../../ui/lens.ts';
import {common, hero, tiles} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** One bar: the series' colour where something was charged, the neutral ring where not, and the day and kWh a pointer or a screen reader finds in its title. */
const barOf = ({x, y, width, height, filled}: Bar, title: string) =>
  svg`<rect x=${x} y=${y} width=${width} height=${height} rx="2" fill=${filled ? 'var(--c-ev)' : 'var(--ring)'}><title>${title}</title></rect>`;

export class CarCardElement extends LitElement {
  static override properties = {view: {attribute: false}, error: {attribute: false}, imageFailed: {attribute: false}};
  /** The model's card: the name, the charge, the bar, the tiles and, once the history is in, the daily bars. */
  declare view: CarCard | undefined;
  /** Why the history did not load, in words ("History didn't load: ..."); null when it did, or has not been asked. */
  declare error: string | null;
  /** The photo did not load, which the pane keeps (for its life) and hands back: the drawing stands in for it. */
  declare imageFailed: boolean;

  // The kit's hero and tiles, the battery bar's rules (soc-bar.css, which the battery block adopts too), then the element's own: its `:host`, the box, the title line, the tiles' three columns and the bars (car-card.element.css).
  static override styles = [common, hero, tiles, unsafeCSS(forShadow(socBarCss)), unsafeCSS(forShadow(ownCss))];

  constructor() {
    super();
    this.view = undefined;
    this.error = null;
    this.imageFailed = false;
    // `glass` and `compact` come from the shell as host attributes the element's rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const card = this.view;
    if (!card) return nothing;
    const {soc, daily} = card;
    // The box is an inner element: the glass's lens is looked up from the root the rule's element is in, and a host is in the pane's.
    // lit-analyzer does not know `aria-description` (a screen reader reads it after the role and the name); the ignore covers this one tag
    return html`<!-- @ts-ignore -->
      <div
        class="box"
        role="button"
        tabindex="0"
        aria-description=${card.open}
        @click=${this.open}
        @keydown=${this.onKey}
      >
        <div class="ctop">
          <span class="clbl">${card.name}</span><span class="cright">${card.where}<span class="cgo">›</span></span>
        </div>
        <div class="hero chero">
          <div>
            <div class="v num">${card.charge}<small>%</small></div>
            <div class="muted cline">${card.line}</div>
          </div>
          ${this.renderArt(card)}
        </div>
        ${socBar(soc)}
        <div class="tiles ctiles">
          ${repeat(
            card.tiles,
            tile => tile.label,
            tile =>
              html`<div class="tile">
                <div class="k">${tile.label}</div>
                <div class="v num">
                  ${tile.word ? html`<span class="wrapv">${tile.value}</span>` : tile.value}<small>${tile.unit}</small>
                </div>
                ${tile.sub ? html`<div class="s">${tile.sub}</div>` : nothing}
              </div>`,
          )}
        </div>
        ${daily === null ? nothing : this.renderBars(daily)}
        ${this.error === null ? nothing : html`<p class="cerr">${this.error}</p>`}
      </div>
      ${lens}`;
  }

  // Ford's photo through the image proxy; the drawn car where there is none, or where the photo failed
  private renderArt(card: CarCard) {
    return carArt(card, this.imageFailed, this.onImageError);
  }

  // the bars the model's geometry places and its sentence under them; the colours are the frame's tokens, so a theme change redraws nothing
  private renderBars({geometry, label, titles, line}: DailyBars) {
    const {width, height, bars} = geometry;
    return html`<svg
        class="spark"
        viewBox="0 0 ${width} ${height}"
        preserveAspectRatio="none"
        role="img"
        aria-label=${label}
      >
        ${bars.map((bar, index) => barOf(bar, titles[index]))}
      </svg>
      <div class="muted cnote">${line}</div>`;
  }

  // arrow fields, so the template hands the same functions at every render
  private readonly open = (): void => {
    this.dispatchEvent(new SheetRequestEvent(DETAIL_SHEET));
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    this.open();
  };

  // the photo did not load: the pane is told, and from here on the drawing shows; a hass update that names a picture again does not bring it back
  private readonly onImageError = (): void => {
    this.dispatchEvent(new CarImageFailedEvent());
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-card': CarCardElement;
  }
}

if (!customElements.get('hp-car-card')) customElements.define('hp-car-card', CarCardElement);
