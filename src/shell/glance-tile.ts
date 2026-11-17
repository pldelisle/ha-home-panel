// <hp-glance-tile>: one at-a-glance tile of the Home pane: the feature's icon and label, a big figure and a line, as the feature's
// `glance` reader worded them; a tap shows the feature's tab, or on a phone opens the sheet the tile names.
// Pattern: humble object (Meszaros, xUnit Test Patterns) over a `GlanceView` (spec 24): six readers, one tile, so the tiles stay alike;
// each tile subscribes to its own source's ids (ADR 0012), so a thermostat draws the Climate tile again and no other. Draws nothing where its reader says null.
// Must not: word anything (the reader does), load (the pane hands the history), or open a sheet or a tab itself (it asks, with an event).
import {LitElement, html, nothing, unsafeCSS, type PropertyValues} from 'lit';
import tileOwn from './glance-tile.element.css?inline';
import type {GlanceDeps, GlanceSource} from './home-tiles.ts';
import {AppearanceConsumer} from '../ui/controllers/appearance-consumer.ts';
import {StoreController} from '../ui/controllers/store-controller.ts';
import {SheetRequestEvent, TabSelectEvent} from '../ui/events.ts';
import type {GlanceView} from '../ui/glance.ts';
import {ico} from '../ui/icons.ts';
import {lensLike} from '../ui/lens.ts';
import {common} from '../ui/styles/index.ts';
import {forShadow} from '../ui/styles/host.ts';

export class GlanceTile extends LitElement {
  // The element's own rules, its `:host` and the tile with its parts, are in glance-tile.element.css.
  static override styles = [common, unsafeCSS(forShadow(tileOwn))];
  static override properties = {
    source: {attribute: false},
    deps: {attribute: false},
    active: {type: Boolean},
  };
  declare source: GlanceSource | undefined;
  /** The history the Energy and Water heater readers word, from the pane; the others ignore it. */
  declare deps: GlanceDeps;
  /** Set by the pane: the Home tab is on screen. A hidden tile listens to no entity and keeps what it drew. */
  declare active: boolean;

  private readonly storeController = new StoreController(this, {
    ids: store => this.source?.ids(store) ?? [],
  });
  private readonly appearance = new AppearanceConsumer(this);
  private view: GlanceView | null = null;

  constructor() {
    super();
    this.deps = {history: null, now: 0};
    this.active = false;
  }

  /** On a phone the tile opens its sheet straight away, where it names one; else it shows the tab. */
  private get phoneSheet(): string | undefined {
    return this.appearance.value?.compact ? this.view?.go.sheet : undefined;
  }

  private readonly onTap = (): void => {
    const view = this.view;
    if (!view) return;
    const sheet = this.phoneSheet;
    this.dispatchEvent(sheet ? new SheetRequestEvent(sheet) : new TabSelectEvent(view.go.tab));
  };

  protected override willUpdate(changed: PropertyValues<this>): void {
    if (changed.has('active')) {
      if (this.active) this.storeController.resume();
      else this.storeController.pause();
    }
    const {source} = this;
    if (source) this.dataset.key = source.key; // the tile's subject on its host, for a reader of the page
    this.view = source ? source.read(this.storeController.store, this.deps) : null;
  }

  protected override render() {
    const view = this.view;
    if (!view) return nothing;
    return html`<button
        type="button"
        class="htile${view.charging ? ' chg' : ''}"
        data-pane=${view.go.tab}
        data-opens=${this.phoneSheet ?? nothing}
        @click=${this.onTap}
      >
        <span class="hh"
          ><span style="color:${view.color}">${ico(view.icon, 22)}</span><span class="lbl">${view.label}</span
          ><span class="go">›</span></span
        ><span class="hv num">${view.value}</span><span class="hs">${view.line}</span>
      </button>
      ${lensLike(this.getRootNode())}`;
  }
}

if (!customElements.get('hp-glance-tile')) customElements.define('hp-glance-tile', GlanceTile);
