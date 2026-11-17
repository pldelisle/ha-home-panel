// <hp-stack-card mode="home" | "idle">: one card of the smart stack, its title row, its body's parts in order and its footer line; a tap
// asks for what the card is about (a tab, a sheet, or a sensor's history).
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a `StackCard` view model the rules made: every word and figure arrives
// formatted, and the element places each body part with the legacy `scard`'s classes, so the legacy rules moved here unchanged.
// Must not: compute or word anything (the rules do), read the store or the clock, stop a tap's propagation (the idle clock wakes on it),
// or open a sheet or a tab itself (it asks, and the shell answers).
import {LitElement, html, nothing, svg, unsafeCSS, type TemplateResult} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import {styleMap} from 'lit/directives/style-map.js';
import type {BodyPart, Go, StackCard} from './cards.ts';
import cardOwn from './stack-card.element.css?inline';
import {DASH} from '../../core/figures.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {SheetRequestEvent, TabSelectEvent} from '../../ui/events.ts';
import type {FeatureKey} from '../../ui/feature.ts';
import {ico, weatherIcon} from '../../ui/icons.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** The sheet a door card opens: Security's history of that sensor, named here because a feature never imports another. */
const SENSOR_HISTORY_SHEET = 'security.history';

/** The charge ring's circle in its 124 by 124 box, and the stroke of its arc and of the limit's tick. */
const RING_R = 52;
const RING_AROUND = 2 * Math.PI * RING_R;

/** A big figure; its unit follows after a space, as the legacy `big` wrote it. */
const big = (value: string, unit: string) =>
  html`<div class="sbig num">${value}${unit ? html`<small> ${unit}</small>` : nothing}</div>`;

/** The legacy `sring`: the track, the arc to the charge and, when there is one, the limit's tick, around the charge in figures. */
function ring(percent: number | null, limit: number | null, color: string, size: number): TemplateResult {
  const arc = (RING_AROUND * Math.max(0, Math.min(100, percent ?? 0))) / 100;
  return html`<span class="sring" style=${styleMap({width: `${size}px`, height: `${size}px`})}
    ><svg width=${size} height=${size} viewBox="0 0 124 124" aria-hidden="true">
      ${svg`<circle cx="62" cy="62" r=${RING_R} fill="none" stroke="currentColor" stroke-opacity=".14" stroke-width="11"></circle><circle cx="62" cy="62" r=${RING_R} fill="none" stroke=${color} stroke-width="11" stroke-linecap="round" stroke-dasharray="${arc.toFixed(1)} ${RING_AROUND.toFixed(1)}" transform="rotate(-90 62 62)"></circle>${
        limit
          ? svg`<circle cx="62" cy="62" r=${RING_R} fill="none" stroke="currentColor" stroke-opacity=".6" stroke-width="11" stroke-dasharray="1.6 ${RING_AROUND.toFixed(1)}" stroke-dashoffset=${((-RING_AROUND * limit) / 100).toFixed(1)} transform="rotate(-90 62 62)"></circle>`
          : nothing
      }`}</svg
    ><b class="num">${percent === null ? DASH : Math.round(percent)}<small>%</small></b></span
  >`;
}

function part(p: BodyPart): TemplateResult {
  switch (p.kind) {
    case 'big':
      return big(p.value, p.unit);
    case 'mid':
      return html`<div class="smid">${p.text}</div>`;
    case 'chips':
      return html`<div class="schips">
        ${p.names.map(name => html`<span>${name}</span>`)}${p.more ? html`<span>+${p.more}</span>` : nothing}
      </div>`;
    case 'ring':
      return html`<div class="srow">
        ${ring(p.percent, p.limit, p.color, p.size)}
        <div class="skv">
          ${p.rows.map(row => html`<div><small>${row.label}</small><b class="num">${row.value}</b></div>`)}
        </div>
      </div>`;
    case 'people':
      return html`<div class="spl">
        ${p.people.map(
          person =>
            html`<div class="sp">
              <span class=${person.home ? 'sav' : 'sav away'}>${person.initial}</span>
              <div><b>${person.name}</b><small>${person.line}</small></div>
              <span class=${person.home ? 'stag ok' : 'stag'}>${person.tag}</span>
            </div>`,
        )}
      </div>`;
    case 'events':
      return html`${p.events.map(
        event =>
          html`<div class="sev">
            <i style=${styleMap({background: event.color})}></i>
            <div><b>${event.title}</b><small class="num">${event.time}</small></div>
          </div>`,
      )}`;
    case 'nowPlaying':
      return html`<div class="snp">
        ${p.picture ? html`<img src=${p.picture} alt="" />` : html`<span class="sart"></span>`}
        <div><b>${p.title}</b><small>${p.artist}</small></div>
      </div>`;
    case 'bar':
      return html`<div class="sbar">
        ${p.parts.map(bar => html`<i style=${styleMap({flex: bar.share.toFixed(1), background: bar.color})}></i>`)}
      </div>`;
    case 'weather':
      return html`<div class="swx">
        ${weatherIcon(p.condition, 76, true, p.label)}
        <div>
          ${big(p.value, p.unit)}
          <div class="smid">${p.text}</div>
        </div>
      </div>`;
  }
}

/** The legacy `data-go` of a card, kept so its rule (`.sc[data-go]`, the pointer) reads as it did. */
function goAttribute(go: Go | null): string | undefined {
  if (!go) return undefined;
  if ('tab' in go) return `tab:${go.tab}`;
  if ('sheet' in go) return go.sheet;
  return `sens:${go.sensorHistory}`;
}

export class StackCardElement extends LitElement {
  static override properties = {card: {attribute: false}, mode: {reflect: true}};
  declare card: StackCard | undefined;
  /** Where the card sits: the Home card's slot, or beside the idle clock. */
  declare mode: 'home' | 'idle';

  // The element's own rules, its `:host`, the card's box and every part's, in both places, are in stack-card.element.css.
  static override styles = [common, unsafeCSS(forShadow(cardOwn))];

  constructor() {
    super();
    this.card = undefined;
    this.mode = 'idle';
    // `glass` comes from the shell as a host attribute the Home card's rule tests
    new AppearanceConsumer(this);
  }

  protected override render() {
    const card = this.card;
    if (!card) return nothing;
    // `data-k` is the rule's kind, the key before its `:` (a door's id, a room's name), as the legacy `scard` wrote it
    return html`<div
      class=${card.tone ? `sc ${card.tone}` : 'sc'}
      data-k=${card.key.split(':')[0]}
      data-go=${ifDefined(goAttribute(card.go))}
      @click=${this.onTap}
    >
      <div class="sh">
        <span class="si" style=${styleMap({background: card.color})}>${ico(card.icon, 16)}</span><b>${card.label}</b>${
          card.right ? html`<em>${card.right}</em>` : nothing
        }
      </div>
      ${card.body.map(part)}${card.foot ? html`<div class="sft">${card.foot}</div>` : nothing}
    </div>`;
  }

  // the tap travels on: beside the idle clock it is the one that wakes the panel, and the card's request is answered after
  private readonly onTap = (): void => {
    const go = this.card?.go;
    if (!go) return;
    if ('tab' in go) this.dispatchEvent(new TabSelectEvent(go.tab as FeatureKey));
    else if ('sheet' in go) this.dispatchEvent(new SheetRequestEvent(go.sheet, go.detail));
    else this.dispatchEvent(new SheetRequestEvent(SENSOR_HISTORY_SHEET, {id: go.sensorHistory}));
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-stack-card': StackCardElement;
  }
}

if (!customElements.get('hp-stack-card')) customElements.define('hp-stack-card', StackCardElement);
