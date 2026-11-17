// <hp-car-ford>: the Car detail's Ford block: the messages Ford sent (the first three), each a row of the kit's list; nothing when it sent none.
// Pattern: humble object (Meszaros, xUnit Test Patterns) placing the model's `FordBlock`; a row is the list's `.arow`, a tinted icon square beside a bold line and the line under it.
// Must not: read an entity, parse a date or word a string (the provider and the model did), or know the detail it is in.
import {LitElement, html, nothing, unsafeCSS} from 'lit';
import ownCss from './car-ford.element.css?inline';
import type {FordBlock, FordRow} from './model.ts';
import blockCss from './styles.css?inline';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {lensLike} from '../../ui/lens.ts';
import {common, inner, list} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

export class CarFord extends LitElement {
  static override properties = {view: {attribute: false}};
  /** The model's Ford block: Ford's own messages; null when it sent none, and the block draws nothing. */
  declare view: FordBlock | null | undefined;

  static override styles = [common, inner, list, unsafeCSS(forShadow(blockCss)), unsafeCSS(forShadow(ownCss))];

  constructor() {
    super();
    this.view = undefined;
    // `glass` and `compact` come from the shell as host attributes the rules test
    new AppearanceConsumer(this);
  }

  protected override render() {
    const block = this.view;
    if (!block) return nothing;
    return html`<div class="inner fill">
        <h3>${block.title}</h3>
        <p>${block.caption}</p>
        <div class="att">${block.rows.map(row => this.renderRow(row))}</div>
      </div>
      ${lensLike(this.getRootNode())}`;
  }

  // a message is flagged with a bang in the warning colour (the departure schedule is its own row since 2026-11)
  private renderRow({title, body}: FordRow) {
    return html`<div class="arow">
      <span class="ic acc" style="--acc:var(--warn)">!</span>
      <div><b>${title}</b><span>${body}</span></div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-car-ford': CarFord;
  }
}

if (!customElements.get('hp-car-ford')) customElements.define('hp-car-ford', CarFord);
