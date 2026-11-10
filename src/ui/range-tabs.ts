// <hp-range-tabs>: the kit's range tabs (Day, Week, Month, Year): a pill of buttons with one chosen, in its own shadow root.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over data: `ranges` says which tabs and their words, `value` which one is
// chosen, and a tap is told upward as `range-change` (Lit docs, Events: properties down, events up); the markup is the legacy sheets' own.
// Must not: hold a range's span or a word (the tabs come from `RANGES` and the catalog, through the owner), fetch anything, or keep the choice itself.
import {LitElement, css, html} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {AppearanceConsumer} from './controllers/appearance-consumer.ts';
import type {Range} from './ranges.ts';
import {common, range as rangeStyles} from './styles/index.ts';

/** One tab: the range it chooses and its word, already in the panel's language. */
export interface RangeTab {
  range: Range;
  label: string;
}

/** What the tabs say when another is tapped: the range now chosen. */
export interface RangeChangeDetail {
  range: Range;
}

export class RangeTabs extends LitElement {
  static override properties = {
    ranges: {attribute: false},
    value: {reflect: true},
  };
  declare ranges: readonly RangeTab[];
  /** The range chosen; its tab is the one with `aria-selected`. */
  declare value: Range | undefined;

  // `display: contents`: the host has no box of its own, so the pill is a child of whatever lays it out (a sheet's header), as the
  // legacy tabs were; on a phone the pill takes the header's full width, as the sheet's rule gave it there
  static override styles = [
    common,
    rangeStyles,
    css`
      :host {
        display: contents;
      }
      :host([compact]) .tabs {
        width: 100%;
      }
    `,
  ];

  constructor() {
    super();
    // `compact` and `glass` come from the shell as host attributes the kit's rules test
    new AppearanceConsumer(this);
    this.ranges = [];
    this.value = undefined;
  }

  protected override render() {
    return html`<div class="tabs" role="tablist">
      ${repeat(
        this.ranges,
        ({range}) => range,
        ({range, label}) =>
          html`<button
            class="tab"
            type="button"
            role="tab"
            aria-selected=${range === this.value ? 'true' : 'false'}
            @click=${() => this.choose(range)}
          >
            ${label}
          </button>`,
      )}
    </div>`;
  }

  // a tap on the tab already chosen says nothing, as the legacy handler did
  private choose(range: Range): void {
    if (range === this.value) return;
    this.dispatchEvent(new CustomEvent<RangeChangeDetail>('range-change', {detail: {range}}));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-range-tabs': RangeTabs;
  }
  interface HTMLElementEventMap {
    'range-change': CustomEvent<RangeChangeDetail>;
  }
}

if (!customElements.get('hp-range-tabs')) customElements.define('hp-range-tabs', RangeTabs);
