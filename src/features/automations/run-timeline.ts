// <hp-run-timeline>: the Today card of the Automations tab: the day's line with a dot per run (several close together share one, each a 44 pt button
// round the drawn dot, the ones still to come hollow), the now line and the hour marks, the legend of the four marks a dot takes, then the tiles (ran today, next, and then when something follows).
// Pattern: humble object (Meszaros, xUnit Test Patterns): it places the `TodayView` the model laid out (`timelineLayout`) and tells
// its parent by an event (Lit docs, Events: properties down, events up) which run or automation a dot picks.
// Must not: lay the dots out, word anything, or select a run itself (the pane holds the selection).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import type {DotView, TodayView} from './model.ts';
import {SelectRunEvent} from './events.ts';
import shared from './styles.css?inline';
import own from './run-timeline.element.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {lens} from '../../ui/lens.ts';
import {common, status, tiles} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class RunTimeline extends LitElement {
  static override properties = {view: {attribute: false}};
  declare view: TodayView | undefined;

  static override styles = [common, status, tiles, unsafeCSS(forShadow(shared)), unsafeCSS(forShadow(own))];

  constructor() {
    super();
    new AppearanceConsumer(this);
    this.view = undefined;
  }

  protected override render() {
    const v = this.view;
    if (!v) return nothing;
    const now = `${v.nowPct.toFixed(2)}%`;
    return html`<section class="aubox autoday">
        <div class="auhead">
          <div>
            <h3>${v.title}</h3>
            <p>${v.caption}</p>
          </div>
          <span class="status">${v.status}</span>
        </div>
        <div class="autl">
          <div class="axis"></div>
          <div class="past" style="width:${now}"></div>
          <div class="nowl" style="left:${now}"></div>
          ${v.hours.map(h => html`<span class="hr" style="left:${h.pct}%">${h.label}</span>`)}
          ${repeat(
            v.dots,
            d => d.key,
            d => this.dot(d),
          )}
        </div>
        <div class="aulegend audots">
          ${v.legend.map(m => html`<span><i class=${m.mark} aria-hidden="true"></i>${m.label}</span>`)}
        </div>
        <div class="tiles" style="grid-template-columns:repeat(${v.tiles.length},minmax(0,1fr))">
          ${v.tiles.map(
            tile =>
              html`<div class="tile">
                <div class="k">${tile.label}</div>
                <div class="v num">${tile.value}<small></small></div>
                <div class="s">${tile.sub}</div>
              </div>`,
          )}
        </div>
      </section>
      ${lens}`;
  }

  private dot(d: DotView) {
    const left = `left:${d.x.toFixed(2)}%`;
    const tone = d.cls === 'now' ? ' now' : d.cls === 'skip' ? ' skip' : '';
    return html`<button
        type="button"
        class="aud ${d.cls}"
        style=${left}
        aria-label=${d.description}
        title=${d.description}
        @click=${() => this.dispatchEvent(new SelectRunEvent({item: d.item, run: d.run}))}
      >
        <span class="d">${d.n > 1 ? html`<span class="n">${d.n}</span>` : nothing}</span></button
      >${d.row >= 0 ? html`<span class="aul r${d.row}${tone}" style=${left}><b>${d.label}</b></span>` : nothing}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-run-timeline': RunTimeline;
  }
}

if (!customElements.get('hp-run-timeline')) customElements.define('hp-run-timeline', RunTimeline);
