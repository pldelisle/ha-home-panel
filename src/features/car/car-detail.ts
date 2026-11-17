// <hp-car-detail>: the Car detail, in the order people use it (docs/apple-hig-audit-car-2026-11-17.md): the summary and the actions row, the charger, the departure and the charging history's rows,
// the status and Ford's messages; two columns on a tablet, one on a phone.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the view model the pane hands down, one element per block; a tablet shows it inline in the pane with its own header, a phone in the pane's
// sheet, which draws the header. The actions, the charger and the departure take the inputs, not a view: each builds its own, since each holds state a model must not (the dialogs, the departure draft).
// Must not: read an entity or the clock (the model did), call the API client, open a sheet itself, or hold the history (the pane's controller does).
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import {ifDefined} from 'lit/directives/if-defined.js';
import './car-actions.ts'; // defines <hp-car-actions>
import './car-departure.ts'; // defines <hp-car-departure>
import detailOwn from './car-detail.element.css?inline';
import './car-ford.ts'; // defines <hp-car-ford>
import './car-history.ts'; // defines <hp-car-history>
import './car-status.ts'; // defines <hp-car-status>
import './car-summary.ts'; // defines <hp-car-summary>
import './charger-controls.ts'; // defines <hp-charger-controls>
import type {CarFeatureInputs} from './inputs.ts';
import type {CarDetail} from './model.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import '../../ui/pane-header.ts'; // defines <hp-pane-header>
import {common, inner} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class CarDetailElement extends LitElement {
  static override properties = {
    detail: {attribute: false},
    inputs: {attribute: false},
    error: {attribute: false},
    imageFailed: {attribute: false},
  };
  /** The model's detail: the title and line, the summary, the status, the history and Ford's messages. */
  declare detail: CarDetail | undefined;
  /** What the pane read, which the charger's and comfort's cards build their own views from. */
  declare inputs: CarFeatureInputs | undefined;
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
    this.inputs = undefined;
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
      ${
        compact
          ? html`<div class="col">
              ${this.summary(detail)}${this.actions()}${this.charger()}${this.rows(detail)}${this.status(detail)}${this.ford(detail)}
            </div>`
          : html`<div class="cols">
              <div class="col">${this.summary(detail)}${this.actions()}${this.status(detail)}</div>
              <div class="col">${this.charger()}${this.rows(detail)}${this.ford(detail)}</div>
            </div>`
      }
    </div>`;
  }

  private summary({summary}: CarDetail) {
    return html`<hp-car-summary .view=${summary} .imageFailed=${this.imageFailed}></hp-car-summary>`;
  }

  private actions() {
    return html`<hp-car-actions .inputs=${this.inputs}></hp-car-actions>`;
  }

  private charger() {
    return html`<hp-charger-controls .inputs=${this.inputs}></hp-charger-controls>`;
  }

  // the departure and the charging history: two rows of one card, each opening its sheet
  private rows({history}: CarDetail) {
    return html`<div class="inner rows">
      <div class="list">
        <hp-car-departure .inputs=${this.inputs}></hp-car-departure>
        <hp-car-history .view=${history} .error=${this.error}></hp-car-history>
      </div>
    </div>`;
  }

  private status({status}: CarDetail) {
    return html`<hp-car-status .view=${status}></hp-car-status>`;
  }

  private ford({ford}: CarDetail) {
    return ford ? html`<hp-car-ford .view=${ford}></hp-car-ford>` : nothing;
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
