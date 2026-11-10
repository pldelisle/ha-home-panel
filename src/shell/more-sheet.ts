// <hp-more-sheet>: the phone's More sheet, the sections the bar does not hold, one summary tile each, in its own shadow root.
// Pattern: humble object (Meszaros, xUnit Test Patterns) drawn from the registry; properties down, events up (Lit docs,
// Events): a tile's `tile-open` becomes `tab-select`, the Close button, Escape and the backdrop become `sheet-close`.
// Must not: choose the tab or know which sheet is open (the shell does), import a feature, or work out the word under a section.
import {LitElement, css, html, nothing, type PropertyValues} from 'lit';
import {repeat} from 'lit/directives/repeat.js';
import {AppearanceConsumer} from '../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../ui/controllers/store-controller.ts';
import {SwipeToClose} from '../ui/controllers/swipe-to-close.ts';
import {ico} from '../ui/icons.ts';
import '../ui/stat-tile.ts';
import type {TileOpenDetail} from '../ui/stat-tile.ts';
import {common, more, motion, sheet} from '../ui/styles/index.ts';
import type {FeatureDescriptor, FeatureKey} from './feature.ts';
import {isFeatureKey} from './features.ts';

/** What the sheet says when a tile is tapped: the section to show. */
export interface TabSelectDetail {
  key: FeatureKey;
}

export class MoreSheet extends LitElement {
  static override properties = {
    features: {attribute: false},
    shown: {attribute: false},
    summaries: {attribute: false},
    current: {},
    open: {type: Boolean, reflect: true},
  };
  /** The sections it lists: the registry's descriptors that the phone's bar does not hold. */
  declare features: readonly FeatureDescriptor[];
  /** Which tabs this house shows; a section it hides is not listed. */
  declare shown: Readonly<Partial<Record<FeatureKey, boolean>>>;
  /** The word under each section, in the panel's language; none for a section that has nothing to say. */
  declare summaries: Readonly<Partial<Record<FeatureKey, string | null>>>;
  /** The tab shown: its tile carries the ring. */
  declare current: FeatureKey;
  declare open: boolean;

  // `display: contents`: the sheet is `position: fixed`, so the host takes no room in the frame it sits in
  static override styles = [
    common,
    motion,
    sheet,
    more,
    css`
      :host {
        display: contents;
      }
    `,
  ];

  // the sheet's words are catalog messages, so it asks the store for `t`; it reads no entity
  private readonly store = new StoreController(this, {ids: () => []});
  private readonly appearance = new AppearanceConsumer(this);
  // on a phone, dragged down by its grabber or its title to close, as the legacy sheets are
  private readonly swipe = new SwipeToClose(this, {
    enabled: () => this.appearance.value?.compact === true,
    close: () => this.close(),
    handle: '.grab, .ph>.badge, .ph>.grow',
  });

  constructor() {
    super();
    this.features = [];
    this.shown = {};
    this.summaries = {};
    this.current = 'home';
    this.open = false;
  }

  protected override render() {
    const {t} = this.store.store;
    return html`<div class="sheet" ?hidden=${!this.open} @click=${this.onBackdrop}>
      <div
        class="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="moreh"
        @pointerdown=${this.swipe.onPointerDown}
        @pointermove=${this.swipe.onPointerMove}
        @pointerup=${this.swipe.onPointerEnd}
        @pointercancel=${this.swipe.onPointerEnd}
      >
        <div class="grab" aria-hidden="true"></div>
        <div class="ph">
          <span class="badge" style="--acc:var(--c-home)">${ico('more', 26)}</span>
          <div class="grow">
            <h2 id="moreh">${t('more.title')}</h2>
            <div class="sub">${t('more.sub')}</div>
          </div>
          <button class="icon close" type="button" aria-label=${t('more.close')} @click=${this.close}>✕</button>
        </div>
        <div class="morelist" id="morelist">${this.open ? this.renderTiles() : nothing}</div>
      </div>
    </div>`;
  }

  // The tiles exist only while the sheet is open: a tablet never opens it, and a phone draws six tiles when it is asked to.
  private renderTiles() {
    const {t} = this.store.store;
    return repeat(
      this.features.filter(f => this.shown[f.key] !== false),
      f => f.key,
      f =>
        html`<hp-stat-tile
          .key=${f.key}
          .icon=${f.icon}
          .size=${22}
          .label=${t(f.title)}
          .sub=${this.summaries[f.key] ?? ''}
          .color=${f.color}
          .tone=${f.key === this.current ? 'list sel' : 'list'}
          @tile-open=${this.select}
        ></hp-stat-tile>`,
    );
  }

  // A tile says which one was tapped; the shell decides what that does, so the sheet turns it into its own event.
  private readonly select = (e: CustomEvent<TileOpenDetail>): void => {
    e.stopPropagation();
    const {key} = e.detail;
    if (isFeatureKey(key))
      this.dispatchEvent(
        new CustomEvent<TabSelectDetail>('tab-select', {bubbles: true, composed: true, detail: {key}}),
      );
  };

  private readonly close = (): void => {
    this.dispatchEvent(new CustomEvent('sheet-close', {bubbles: true, composed: true}));
  };

  // a tap on the backdrop, not on the panel
  private readonly onBackdrop = (e: Event): void => {
    if (e.target === e.currentTarget) this.close();
  };

  // Escape is caught on the window while the sheet is open: a redraw can drop focus out of the sheet, so the sheet would miss the key
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.close();
  };

  protected override updated(changed: PropertyValues<this>): void {
    if (!changed.has('open')) return;
    if (this.open) {
      window.addEventListener('keydown', this.onKey);
      // the Close button takes focus, as the legacy sheet's did, so a keyboard or a switch is inside the sheet at once
      this.renderRoot.querySelector<HTMLElement>('.close')?.focus();
    } else window.removeEventListener('keydown', this.onKey);
  }

  // a sheet that is open when its element is moved is still open: the listener comes back with it
  override connectedCallback(): void {
    super.connectedCallback();
    if (this.open) window.addEventListener('keydown', this.onKey);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.onKey);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'hp-more-sheet': MoreSheet;
  }
  interface HTMLElementEventMap {
    'tab-select': CustomEvent<TabSelectDetail>;
    'sheet-close': CustomEvent<void>;
  }
}

if (!customElements.get('hp-more-sheet')) customElements.define('hp-more-sheet', MoreSheet);
