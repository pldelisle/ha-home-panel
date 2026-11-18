// <hp-climate-list>: the tablet's list of the house, its rooms and the heat pump: one option each, the one shown selected.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over the model's `items`, keyed by id (Lit docs, repeat) so a new selection moves two `aria-selected`
// attributes; a listbox (WAI-ARIA Authoring Practices, Listbox) of buttons that tell the pane's choice upward as `select`, the selection being the pane's.
// Must not: choose what is shown (the pane does), read an entity, or word a string (the model and the pane do).
import {LitElement, html, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import listOwn from './climate-list.element.css?inline';
import type {ClimateItem} from './items.ts';
import type {ClimateSelection} from './model.ts';
import {AppearanceConsumer} from '../../ui/controllers/appearance-consumer.ts';
import {ico} from '../../ui/icons.ts';
import {lens} from '../../ui/lens.ts';
import {common} from '../../ui/styles/index.ts';
import {forShadow} from '../../ui/styles/host.ts';

/** What a tap on an item says: its id, `house`, `hp` or a room's key. */
export interface SelectDetail {
  sel: ClimateSelection;
}

export class ClimateList extends LitElement {
  static override properties = {
    items: {attribute: false},
    selection: {},
    label: {},
  };
  /** The model's items: the house, each room, then the heat pump. */
  declare items: readonly ClimateItem[];
  /** The id shown in the detail. */
  declare selection: ClimateSelection;
  /** The listbox's name for a screen reader. */
  declare label: string;

  // The element's own rules, the column and each item's box, icon and words, are in climate-list.element.css.
  static override styles = [common, unsafeCSS(forShadow(listOwn))];

  constructor() {
    super();
    // `glass` comes from the shell as a host attribute the element's rules test
    new AppearanceConsumer(this);
    this.items = [];
    this.selection = 'house';
    this.label = '';
  }

  protected override render() {
    return html`<div class="clist" role="listbox" aria-label=${this.label}>
        ${repeat(
          this.items,
          ({id}) => id,
          ({id, icon, name, sub, value, missing, tone}) =>
            html`<button
              class=${`citem ${tone}`}
              role="option"
              type="button"
              data-id=${id}
              aria-selected=${id === this.selection ? 'true' : 'false'}
              @click=${() => this.choose(id)}
            >
              <span class="ic">${ico(icon)}</span
              ><span class="tx"
                ><div class="nm">${name}</div>
                <div class="sb">${sub}</div></span
              ><span class=${missing ? 'na' : 'tv'}>${value}</span>
            </button>`,
        )}
      </div>
      ${lens}`;
  }

  // a tap on the item already shown is told as well: the pane keeps its choice and nothing changes
  private choose(sel: ClimateSelection): void {
    this.dispatchEvent(new CustomEvent<SelectDetail>('select', {detail: {sel}}));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-climate-list': ClimateList;
  }
}

if (!customElements.get('hp-climate-list')) customElements.define('hp-climate-list', ClimateList);
