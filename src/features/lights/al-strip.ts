// <hp-al-strip>: the Lights tab's card of Adaptive Lighting today: how many switches are on and the kelvin now, then the day's colour
// temperature as a gradient with the now mark, the sun's marks and the hours.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `StripView`: every position and colour is the layout's
// (`alStripLayout`); the pane draws it again each minute, so the now mark moves.
// Must not: read the clock, the store or an entity, hold a string the household reads, or compute a position.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {styleMap} from 'lit/directives/style-map.js';
import type {StripView} from './model.ts';
import stripOwn from './al-strip.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class AlStrip extends LitElement {
  static override properties = {
    strip: {attribute: false},
  };
  declare strip: StripView | undefined;

  // The element's own rules, its `:host` and what only its tree has, are in al-strip.element.css.
  static override styles = [common, unsafeCSS(forShadow(stripOwn))];

  constructor() {
    super();
    // `compact` and `glass` come from the shell as host attributes the card's rules test
    new AppearanceConsumer(this);
    this.strip = undefined;
  }

  protected override render() {
    const strip = this.strip;
    if (!strip) return nothing;
    const {now, kelvin, state} = strip.right;
    return html`<div class="alcard" id="albar">
      <div class="top">
        <span class="lbl">${strip.title}</span
        ><span class="right"
          >${kelvin ? html`${now} <b class="num" style="color:var(--fg)">${kelvin}</b> · ${state}` : state}</span
        >
      </div>
      <div class="alstrip">
        <div class="algrad" style=${styleMap({background: `linear-gradient(90deg,${strip.stops.join(',')})`})}></div>
        <i class="alnow" style=${styleMap({left: strip.now})}></i>
        ${strip.marks.map(m => html`<span class="almark" style=${styleMap({left: m.at})}><i></i>${m.text}</span>`)}
        ${strip.hours.map(h => html`<span class="alh" style=${styleMap({left: h.at})}>${h.label}</span>`)}
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-al-strip': AlStrip;
  }
}

if (!customElements.get('hp-al-strip')) customElements.define('hp-al-strip', AlStrip);
