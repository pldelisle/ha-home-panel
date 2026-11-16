// <hp-car-detail>: the Car detail: the battery with the status, the charger's and the comfort's cards (the legacy panel's, until #253), the charging history, Ford's messages and the last plug-in.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the view model the pane hands down, one element per block; a tablet shows it inline in the pane with its own header, a phone in the pane's
// sheet, which draws the header. The legacy cards are slotted (`controls`): the pane's light children, still in the guest's tree, which draws into them.
// Must not: read an entity or the clock (the model did), call the API client, open a sheet itself, or hold the history (the pane's controller does).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import './car-battery.ts'; // defines <hp-car-battery>
import detailOwn from './car-detail.element.css?inline';
import './car-ford.ts'; // defines <hp-car-ford>
import './car-last-plug.ts'; // defines <hp-car-last-plug>
import './car-sessions.ts'; // defines <hp-car-sessions>
import './car-status.ts'; // defines <hp-car-status>
import type {CarDetail} from './model.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import {common, inner} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class CarDetailElement extends LitElement {
  static override properties = {detail: {attribute: false}, error: {attribute: false}, imageFailed: {attribute: false}};
  /** The model's detail: the title and line, and the five blocks. */
  declare detail: CarDetail | undefined;
  /** Why the history did not load, in words; null when it did, or has not been asked. */
  declare error: string | null;
  /** Ford's photo did not load (the pane keeps this for its life): the battery block draws the car. */
  declare imageFailed: boolean;

  // The host is a block; its blocks are one column with the sixteen pixels between them the pane's `.panel` gave (fourteen on the phone, where the sheet's did).
  // The element's own rules are in car-detail.element.css.
  static override styles = [common, inner, unsafeCSS(forShadow(detailOwn))];

  private readonly appearance = new AppearanceConsumer(this);

  constructor() {
    super();
    this.detail = undefined;
    this.error = null;
    this.imageFailed = false;
  }

  protected override render() {
    const {detail} = this;
    if (!detail) return nothing;
    const compact = this.appearance.value?.compact === true;
    return html`<div
      class="blocks"
      role=${ifDefined(compact ? undefined : 'dialog')}
      aria-label=${ifDefined(compact ? undefined : detail.title)}
    >
      ${compact ? nothing : this.renderHeader(detail)}
      <div class="two">
        <hp-car-battery .view=${detail.battery} .imageFailed=${this.imageFailed}></hp-car-battery>
        <hp-car-status .view=${detail.status}></hp-car-status>
      </div>
      <div class="controls"><slot name="controls"></slot></div>
      <hp-car-sessions .view=${detail.sessions} .error=${this.error}></hp-car-sessions>
      <div class="two">
        <hp-car-ford .view=${detail.ford}></hp-car-ford>
        <hp-car-last-plug .view=${detail.last}></hp-car-last-plug>
      </div>
    </div>`;
  }

  // On a tablet the detail opens with its own header, the pane's being the phone's; on a phone the sheet draws it.
  private renderHeader({title, sub}: CarDetail) {
    return html`<hp-pane-header .icon=${'car'} .color=${'var(--c-ev)'} .heading=${title}>
      <div slot="sub">${sub}</div>
    </hp-pane-header>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-detail': CarDetailElement;
  }
}

if (!customElements.get('hp-car-detail')) customElements.define('hp-car-detail', CarDetailElement);
