// <hp-range-tabs>: the kit's range tabs (Day, Week, Month, Year, or a feature's own such as Energy's Today): a pill of buttons with one chosen, in its own shadow root.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over data: `ranges` says which tabs and their words, `value` which one is
// chosen, and a tap is told upward as `range-change` (Lit docs, Events: properties down, events up); the markup is the legacy sheets' own.
// Must not: hold a range's span or a word (the tabs come from `RANGES` and the catalog, through the owner), know a range's key beyond its being a string, fetch anything, or keep the choice itself.
// A known copy: `:host([compact]) .tabs` is written by hand here, because the legacy rule it follows (`.app.cp .sheet .ph .tabs`, sheet.css) cannot reach a slotted element's root; it goes with the legacy sheet.
import {LitElement, html, unsafeCSS} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {AppearanceConsumer} from './controllers/appearance-consumer.ts';
import type {Range} from './ranges.ts';
import {common, range as rangeStyles} from './styles/index.ts';
import rangeTabsOwn from './range-tabs.element.css?inline';
import {forShadow} from './styles/host.ts';

/** One tab: the range it chooses and its word, already in the panel's language. The key is the kit's `Range` unless the owner names its own. */
export interface RangeTab<R extends string = Range> {
  range: R;
  label: string;
}

/** What the tabs say when another is tapped: the range now chosen, of the owner's keys. */
export interface RangeChangeDetail<R extends string = Range> {
  range: R;
}

export class RangeTabs extends LitElement {
  static override properties = {
    ranges: {attribute: false},
    value: {},
  };
  declare ranges: readonly RangeTab<string>[];
  /** The range chosen; its tab is the one with `aria-selected`. */
  declare value: string | undefined;

  // `display: contents`: the host has no box of its own, so the pill is a child of whatever lays it out (a sheet's header), as the
  // legacy tabs were; on a phone the pill takes the header's full width, as the sheet's rule gave it there
  // The element's own rules, its `:host` and what only its tree has, are in range-tabs.element.css.
  static override styles = [common, rangeStyles, unsafeCSS(forShadow(rangeTabsOwn))];

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
  private choose(range: string): void {
    if (range === this.value) return;
    this.dispatchEvent(new CustomEvent<RangeChangeDetail<string>>('range-change', {detail: {range}}));
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
